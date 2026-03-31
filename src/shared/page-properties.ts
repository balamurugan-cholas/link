export interface PageProperties {
  status: string | null;
  tags: string[];
  date: string | null;
}

export interface PagePropertyOption {
  value: string;
  label: string;
  tone: string;
}

export type TaskStatusValue = 'todo' | 'in-progress' | 'done';

export const DEFAULT_PAGE_PROPERTIES: PageProperties = {
  status: null,
  tags: [],
  date: null,
};

export const PAGE_STATUS_OPTIONS: PagePropertyOption[] = [
  { value: 'Todo', label: 'Todo', tone: 'border-slate-200 bg-slate-100 text-slate-700' },
  { value: 'In Progress', label: 'In Progress', tone: 'border-blue-200 bg-blue-100 text-blue-700' },
  { value: 'Done', label: 'Done', tone: 'border-emerald-200 bg-emerald-100 text-emerald-700' },
];

export const PAGE_TAG_OPTIONS: PagePropertyOption[] = [
  { value: 'Work', label: 'Work', tone: 'border-violet-200 bg-violet-100 text-violet-700' },
  { value: 'Personal', label: 'Personal', tone: 'border-amber-200 bg-amber-100 text-amber-700' },
  { value: 'Tech', label: 'Tech', tone: 'border-cyan-200 bg-cyan-100 text-cyan-700' },
];

const TASK_STATUS_TO_PAGE_STATUS: Record<TaskStatusValue, string> = {
  todo: 'Todo',
  'in-progress': 'In Progress',
  done: 'Done',
};

const PAGE_STATUS_TO_TASK_STATUS: Record<string, TaskStatusValue> = {
  Todo: 'todo',
  'In Progress': 'in-progress',
  Done: 'done',
};

export const normalizeStringArray = (value: unknown): string[] => {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)))
    : [];
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const normalizePageProperties = (value: unknown): PageProperties => {
  if (!isRecord(value)) {
    return { ...DEFAULT_PAGE_PROPERTIES };
  }

  const status = typeof value.status === 'string' && value.status.trim()
    ? value.status
    : null;
  const tags = normalizeStringArray(value.tags);
  const date = typeof value.date === 'string' && value.date.trim()
    ? value.date
    : null;

  return {
    status,
    tags,
    date,
  };
};

export const parsePageProperties = (value: unknown): PageProperties => {
  if (typeof value === 'string' && value.trim()) {
    try {
      return normalizePageProperties(JSON.parse(value));
    } catch {
      return { ...DEFAULT_PAGE_PROPERTIES };
    }
  }

  return normalizePageProperties(value);
};

export const serializePageProperties = (value: unknown): string => {
  return JSON.stringify(normalizePageProperties(value));
};

export const taskStatusToPageStatus = (value: TaskStatusValue): string => {
  return TASK_STATUS_TO_PAGE_STATUS[value];
};

export const pageStatusToTaskStatus = (value: string | null | undefined): TaskStatusValue => {
  return (value && PAGE_STATUS_TO_TASK_STATUS[value]) || 'todo';
};
