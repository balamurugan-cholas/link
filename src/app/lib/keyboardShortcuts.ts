import { formatPrimaryShortcut, getPrimaryModifierLabel } from './platform'

export interface ShortcutItem {
  combo: string
  label: string
  context?: string
}

export interface ShortcutSection {
  title: string
  description: string
  shortcuts: ShortcutItem[]
}

const primary = getPrimaryModifierLabel()
export const welcomeShortcutCards: ShortcutItem[] = [
  { combo: formatPrimaryShortcut('P'), label: 'Search pages quickly' },
  { combo: formatPrimaryShortcut('L'), label: 'Open inline AI on the focused block' },
  { combo: formatPrimaryShortcut('Space'), label: 'Generate ghost text inside a text block' },
  { combo: formatPrimaryShortcut('J'), label: 'Start voice capture on the focused block' },
]

export const settingsShortcutSections: ShortcutSection[] = [
  {
    title: 'Workspace',
    description: 'Move around the app and recover edits quickly.',
    shortcuts: [
      { combo: formatPrimaryShortcut('P'), label: 'Open page search' },
      { combo: formatPrimaryShortcut('Z'), label: 'Undo block history', context: 'Focused editor block' },
      { combo: `${primary} + Shift + Z`, label: 'Redo block history', context: 'Focused editor block' },
    ],
  },
  {
    title: 'Writing',
    description: 'Create and continue blocks without leaving the keyboard.',
    shortcuts: [
      { combo: formatPrimaryShortcut('Enter'), label: 'Append a new block to the end of the page' },
      { combo: 'Shift + Enter', label: 'Insert a new plain text block after the current block' },
      { combo: '/', label: 'Open the slash command menu', context: 'Type inside a block' },
    ],
  },
  {
    title: 'AI Writing',
    description: 'Use local AI directly from the currently focused block.',
    shortcuts: [
      { combo: formatPrimaryShortcut('L'), label: 'Open inline AI' },
      { combo: 'Enter', label: 'Run the inline AI prompt', context: 'Inside the AI input' },
      { combo: 'Esc', label: 'Close inline AI and refocus the block', context: 'Inside the AI input' },
      { combo: formatPrimaryShortcut('Space'), label: 'Request ghost text', context: 'Text, heading, quote, or code block' },
      { combo: 'Tab', label: 'Accept the full ghost text suggestion' },
      { combo: formatPrimaryShortcut('Right Arrow'), label: 'Accept the next ghost text word' },
    ],
  },
  {
    title: 'Voice Capture',
    description: 'Control local transcription without switching views.',
    shortcuts: [
      { combo: formatPrimaryShortcut('J'), label: 'Open voice capture on the focused block' },
      { combo: 'Enter', label: 'Start or stop recording', context: 'Inside the voice recorder' },
      { combo: 'Esc', label: 'Close voice capture and refocus the block', context: 'Inside the voice recorder' },
    ],
  },
]
