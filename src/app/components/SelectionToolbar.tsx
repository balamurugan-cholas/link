import React from 'react';
import { Bold, Italic, Code, Link as LinkIcon } from 'lucide-react';

interface SelectionToolbarProps {
  visible: boolean;
  position: { x: number; y: number };
  onFormat: (type: string) => void;
}

export function SelectionToolbar({ visible, position, onFormat }: SelectionToolbarProps) {
  if (!visible) return null;

  return (
    <div
      className="fixed z-50 bg-primary text-primary-foreground rounded-lg shadow-lg flex items-center gap-1 p-1"
      style={{ top: position.y - 50, left: position.x }}
    >
      <button
        onClick={() => onFormat('bold')}
        className="p-2 rounded hover:bg-primary-foreground/10 transition-colors"
      >
        <Bold className="w-4 h-4" />
      </button>
      <button
        onClick={() => onFormat('italic')}
        className="p-2 rounded hover:bg-primary-foreground/10 transition-colors"
      >
        <Italic className="w-4 h-4" />
      </button>
      <button
        onClick={() => onFormat('code')}
        className="p-2 rounded hover:bg-primary-foreground/10 transition-colors"
      >
        <Code className="w-4 h-4" />
      </button>
      <div className="w-px h-4 bg-primary-foreground/20 mx-1" />
      <button
        onClick={() => onFormat('link')}
        className="p-2 rounded hover:bg-primary-foreground/10 transition-colors"
      >
        <LinkIcon className="w-4 h-4" />
      </button>
    </div>
  );
}