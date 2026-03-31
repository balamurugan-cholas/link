import React, { useState, useEffect } from 'react';

interface Page {
  id: string;
  title: string;
  parentTitle?: string;
}

interface PagePickerProps {
  position: { x: number; y: number };
  pages: Page[];
  onSelect: (page: Page) => void;
  onClose: () => void;
}

export const PagePicker = ({ position, pages, onSelect, onClose }: PagePickerProps) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [resolvedPosition, setResolvedPosition] = useState(position);
  const pickerRef = React.useRef<HTMLDivElement>(null);

  // Filter pages based on search query
  const filteredPages = pages.filter(p => 
    p.title.toLowerCase().includes(query.toLowerCase()) || 
    p.parentTitle?.toLowerCase().includes(query.toLowerCase())
  );

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const updatePosition = () => {
      if (!pickerRef.current) return;

      const padding = 12;
      const gap = 8;
      const rect = pickerRef.current.getBoundingClientRect();

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
  }, [position, filteredPages.length, query]);

  // Keyboard Navigation Logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredPages.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredPages.length) % filteredPages.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredPages[selectedIndex]) {
          onSelect(filteredPages[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredPages, selectedIndex, onSelect, onClose]);

  return (
    <div 
      ref={pickerRef}
      className="fixed z-50 bg-popover border border-border shadow-xl rounded-lg p-2 min-w-[260px] animate-in fade-in zoom-in duration-100 flex flex-col"
      style={{ top: resolvedPosition.y, left: resolvedPosition.x }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-2 pt-1 pb-2">
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-2">
          Link to page
        </div>
        <input
          autoFocus
          type="text"
          placeholder="Search pages..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-muted/50 border border-border rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/50 transition-all"
        />
      </div>
      
      <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-0.5">
        {filteredPages.length > 0 ? (
          filteredPages.map((p, index) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full text-left px-2 py-2 rounded-md transition-colors group flex items-start gap-2 ${
                selectedIndex === index ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              }`}
            >
              <span className={`mt-0.5 shrink-0 ${selectedIndex === index ? 'text-primary' : 'text-muted-foreground'}`}>
                📄
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate leading-none mb-1">
                  {p.title || "Untitled"}
                </span>
                {p.parentTitle && (
                  <div className="flex items-center gap-1 opacity-60">
                    <span className="text-[10px] uppercase font-bold tracking-tighter">in</span>
                    <span className="text-[10px] truncate font-medium">
                      {p.parentTitle}
                    </span>
                  </div>
                )}
              </div>
            </button>
          ))
        ) : (
          <div className="px-2 py-6 text-xs text-center text-muted-foreground italic">
            {query ? "No results found" : "No pages available"}
          </div>
        )}
      </div>
      
      <div className="mt-2 pt-2 border-t border-border flex justify-between items-center px-2">
        <span className="text-[9px] text-muted-foreground uppercase font-medium">↑↓ to navigate · ↵ to select</span>
        <button 
          onClick={onClose}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};
