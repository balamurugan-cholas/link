import React from 'react';

export interface Block {
  id: string;
  // Added 'column_group' and 'column' to types
  type: 
    | 'text' 
    | 'h1' 
    | 'h2' 
    | 'h3' 
    | 'list' 
    | 'numbered' 
    | 'checklist' 
    | 'quote' 
    | 'divider' 
    | 'code' 
    | 'table'
    | 'column_group' 
    | 'column'
    | 'image'  
    | 'page_link'; 
  content: string;
  checked?: boolean;
  
  // Nested blocks for columns or toggles
  children?: Block[]; 
  
  // Metadata for layout (e.g., "50%" or "33.3%")
  width?: string;
  refId?: string; 
  
  // Optional: tracking parent relationships for easier tree traversal
  parentId?: string | null; 
}

export interface SlashCommand {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
}
