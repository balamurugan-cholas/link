import React from 'react';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  Bold,
  Code,
  Quote,
  ListOrdered,
  Minus,
  Image as ImageIcon, // Renamed to avoid conflict with HTML Image tags
  FileText,
} from 'lucide-react';
import { SlashCommand } from './types';

export const slashCommands: SlashCommand[] = [
  {
    id: 'text',
    label: 'Text',
    icon: <Bold className="w-4 h-4" />,
    description: 'Plain text paragraph',
  },
  {
    id: 'h1',
    label: 'Heading 1',
    icon: <Heading1 className="w-4 h-4" />,
    description: 'Large section heading',
  },
  {
    id: 'h2',
    label: 'Heading 2',
    icon: <Heading2 className="w-4 h-4" />,
    description: 'Medium section heading',
  },
  {
    id: 'h3',
    label: 'Heading 3',
    icon: <Heading3 className="w-4 h-4" />,
    description: 'Small section heading',
  },
  {
    id: 'list',
    label: 'Bulleted List',
    icon: <List className="w-4 h-4" />,
    description: 'Create a simple bulleted list',
  },
  {
    id: 'numbered',
    label: 'Numbered List',
    icon: <ListOrdered className="w-4 h-4" />,
    description: 'Create a numbered list',
  },
  {
    id: 'checklist',
    label: 'Checklist',
    icon: <ListChecks className="w-4 h-4" />,
    description: 'Track tasks with a to-do list',
  },
  {
    id: 'quote',
    label: 'Quote',
    icon: <Quote className="w-4 h-4" />,
    description: 'Capture a quote or callout',
  },
  {
    id: 'divider',
    label: 'Divider',
    icon: <Minus className="w-4 h-4" />,
    description: 'Visually divide blocks',
  },
  {
    id: 'code',
    label: 'Code Block',
    icon: <Code className="w-4 h-4" />,
    description: 'Capture code snippet',
  },
  {
    id: 'image',
    label: 'Image',
    icon: <ImageIcon className="w-4 h-4" />,
    description: 'Embed an image via URL',
  },
  {
    id: 'page_link',
    label: 'Page Link',
    icon: <FileText className="w-4 h-4" />,
    description: 'Link to an internal page',
  },
];