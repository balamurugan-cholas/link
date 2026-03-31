import React, { useState, useRef, useEffect, useMemo } from 'react';
import { slashCommands } from './constants';

interface SlashCommandMenuProps {
  position: { x: number; y: number };
  onSelect: (id: string) => void;
  onClose: () => void;
  query: string;
}

export function SlashCommandMenu({ position, onSelect, onClose, query }: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [resolvedPosition, setResolvedPosition] = useState(position);
  const menuRef = useRef<HTMLDivElement>(null);

  // Clean the query to remove the '/' and any trailing spaces
  const filteredCommands = useMemo(() => {
    const search = query.toLowerCase().replace('/', '').trim();
    if (!search) return slashCommands;
    
    return slashCommands.filter((cmd) =>
      cmd.label.toLowerCase().includes(search) || 
      cmd.description.toLowerCase().includes(search)
    );
  }, [query]);

  // Handle auto-scrolling
  useEffect(() => {
    if (menuRef.current) {
      const selectedElement = menuRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'instant' // Faster than 'smooth' for keyboard nav
        });
      }
    }
  }, [selectedIndex]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  useEffect(() => {
    const updatePosition = () => {
      if (!menuRef.current) return;

      const padding = 12;
      const gap = 8;
      const rect = menuRef.current.getBoundingClientRect();

      let left = position.x;
      let top = position.y;

      if (left + rect.width > window.innerWidth - padding) {
        left = window.innerWidth - rect.width - padding;
      }
      if (left < padding) {
        left = padding;
      }

      if (top + rect.height > window.innerHeight - padding) {
        top = position.y - rect.height - gap;
      }
      if (top < padding) {
        top = padding;
      }

      setResolvedPosition({ x: left, y: top });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [position, filteredCommands.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          onSelect(filteredCommands[selectedIndex].id);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, selectedIndex, onSelect, onClose]);

  // Close when clicking anywhere else
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (filteredCommands.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-72 max-h-[320px] overflow-y-auto bg-white dark:bg-zinc-900 border border-border rounded-lg shadow-xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
      style={{ top: resolvedPosition.y, left: resolvedPosition.x }}
    >
      <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-50">
        {query.length > 1 ? 'Results' : 'Basic Blocks'}
      </div>
      
      {filteredCommands.map((command, index) => (
        <button
          key={command.id}
          data-index={index}
          onClick={() => onSelect(command.id)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={`w-full flex items-center gap-3 px-3 py-1.5 transition-colors text-left ${
            index === selectedIndex ? 'bg-accent text-accent-foreground' : 'text-foreground'
          }`}
        >
          <div className={`flex items-center justify-center w-8 h-8 rounded border ${
            index === selectedIndex ? 'bg-white text-black border-zinc-200' : 'bg-zinc-100 dark:bg-zinc-800 border-transparent'
          }`}>
            {command.icon}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="text-sm font-medium leading-none mb-1">{command.label}</div>
            <div className="text-[11px] text-muted-foreground line-clamp-1">{command.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
