import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Plus,
  Table as TableIcon,
  Trash2,
} from 'lucide-react';
import {
  PAGE_STATUS_OPTIONS,
  PAGE_TAG_OPTIONS,
  type PageProperties as PagePropertiesValue,
  taskStatusToPageStatus,
} from '../../shared/page-properties';
import { PageProperties } from './PageProperties';

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  scope?: 'todo' | 'project';
  assignee?: string;
  tags: string[];
  date?: string | null;
  isDeleted?: boolean;
  completedAt?: number | null;
  deletedAt?: number | null;
}

interface DatabaseViewProps {
  tasks: Task[];
  currentPage: {
    id: string;
    title: string;
    properties: PagePropertiesValue;
  } | null;
  onAddTask: (status?: Task['status'], seed?: Partial<Task>) => void;
  onAddUpcoming: () => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
  onPagePropertiesChange: (properties: PagePropertiesValue) => void;
}

const columns: Array<{ id: Task['status']; label: string; dot: string }> = [
  { id: 'todo', label: 'To Do', dot: 'bg-slate-400' },
  { id: 'in-progress', label: 'In Progress', dot: 'bg-blue-500' },
  { id: 'done', label: 'Done', dot: 'bg-emerald-500' },
];

const statusLabels: Record<Task['status'], string> = {
  todo: 'Todo',
  'in-progress': 'In Progress',
  done: 'Done',
};

const priorityTones: Record<Task['priority'], string> = {
  low: 'border-slate-200 bg-slate-100 text-slate-700',
  medium: 'border-amber-200 bg-amber-100 text-amber-700',
  high: 'border-rose-200 bg-rose-100 text-rose-700',
};

const formatDate = (value?: string | null) => {
  if (!value) return 'No date';

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'No date';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
};

const getStatusTone = (status: Task['status']) => {
  const option = PAGE_STATUS_OPTIONS.find(
    (entry) => entry.value === taskStatusToPageStatus(status)
  );

  return option?.tone || 'border-slate-200 bg-slate-100 text-slate-700';
};

const getTagTone = (tag: string) => {
  return (
    PAGE_TAG_OPTIONS.find((option) => option.value === tag)?.tone ||
    'border-slate-200 bg-slate-100 text-slate-700'
  );
};

const getTaskEditorRows = (value: string, minRows = 3, maxRows = 10) => {
  const lineCount = value.split('\n').length + 1;
  return Math.min(maxRows, Math.max(minRows, lineCount));
};

const isTaskPreviewLong = (value: string) => value.includes('\n') || value.trim().length > 110;

function PanelToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
        active
          ? 'border-border bg-background text-foreground shadow-sm'
          : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-background/80 hover:text-foreground'
      }`}
    >
      <span>{label}</span>
      <ChevronUp className={`h-3.5 w-3.5 transition-transform ${active ? 'rotate-180' : ''}`} />
    </button>
  );
}

function TagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PAGE_TAG_OPTIONS.map((option) => {
        const isSelected = value.includes(option.value);

        return (
          <button
            key={option.value}
            type="button"
            onClick={() =>
              onChange(
                isSelected
                  ? value.filter((tag) => tag !== option.value)
                  : [...value, option.value]
              )
            }
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              isSelected
                ? option.tone
                : 'border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-background hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  onUpdate,
  onDelete,
  allowQuickDone,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  onUpdate: (updates: Partial<Task>) => void;
  onDelete: () => void;
  allowQuickDone: boolean;
  isDragging: boolean;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [isChecking, setIsChecking] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const ignoreNextBlurRef = useRef(false);

  useEffect(() => {
    setEditTitle(task.title);
  }, [task.title]);

  const startEditing = () => {
    setEditTitle(task.title);
    setIsExpanded(true);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (ignoreNextBlurRef.current) {
      ignoreNextBlurRef.current = false;
      return;
    }

    onUpdate({ title: editTitle.trim() || 'Untitled task' });
    setIsEditing(false);
  };

  const commitFromKeyboard = () => {
    ignoreNextBlurRef.current = true;
    onUpdate({ title: editTitle.trim() || 'Untitled task' });
    setIsEditing(false);
  };

  const handleCancel = () => {
    ignoreNextBlurRef.current = true;
    setEditTitle(task.title);
    setIsEditing(false);
  };

  const handleQuickDone = () => {
    if (!allowQuickDone) return;

    setIsChecking(true);
    window.setTimeout(() => {
      onUpdate({ status: 'done' });
      setIsChecking(false);
    }, 180);
  };

  return (
    <div
      draggable={!isEditing}
      onDragStart={(event) => {
        if (isEditing) {
          event.preventDefault();
          return;
        }

        onDragStart(event);
      }}
      onDragEnd={onDragEnd}
      className={`group mb-3 rounded-2xl border border-border/70 bg-background/90 p-3.5 shadow-sm transition-all hover:border-border hover:shadow-md ${
        isChecking || isDragging ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {allowQuickDone ? (
          <button
            type="button"
            onClick={handleQuickDone}
            className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-border/80 text-muted-foreground transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          >
            {isChecking ? <Check className="h-3 w-3" /> : null}
          </button>
        ) : (
          <span
            className={`mt-1 h-2.5 w-2.5 rounded-full ${
              columns.find((column) => column.id === task.status)?.dot || 'bg-slate-400'
            }`}
          />
        )}

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <textarea
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              onBlur={handleSave}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  commitFromKeyboard();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  handleCancel();
                }
              }}
              autoFocus
              rows={getTaskEditorRows(editTitle)}
              className="w-full resize-none rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm font-medium leading-6 text-foreground outline-none transition-colors focus:border-border"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsExpanded((current) => !current)}
              onDoubleClick={(event) => {
                event.preventDefault();
                startEditing();
              }}
              title="Click to expand. Double-click to edit."
              className="block w-full rounded-xl px-1 py-1 text-left transition-colors hover:bg-muted/30"
            >
              <p
                className={`break-words whitespace-pre-wrap text-sm font-medium leading-6 text-foreground ${
                  isExpanded ? '' : 'line-clamp-3'
                }`}
              >
                {task.title || 'Untitled task'}
              </p>
              {!isExpanded && isTaskPreviewLong(task.title) ? (
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Click to expand
                </span>
              ) : null}
            </button>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusTone(task.status)}`}
            >
              {statusLabels[task.status]}
            </span>

            <select
              value={task.priority}
              onChange={(event) =>
                onUpdate({ priority: event.target.value as Task['priority'] })
              }
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium outline-none transition-colors hover:border-border focus:border-border ${priorityTones[task.priority]}`}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>

            {task.date ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatDate(task.date)}
              </span>
            ) : null}

            {task.tags.map((tag) => (
              <span
                key={tag}
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${getTagTone(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {task.assignee ? (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
              {task.assignee[0]?.toUpperCase()}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function UpcomingTaskItem({
  task,
  onUpdateTask,
}: {
  task: Task;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [isExpanded, setIsExpanded] = useState(false);
  const ignoreNextBlurRef = useRef(false);

  useEffect(() => {
    setDraftTitle(task.title);
  }, [task.title]);

  const handleSave = () => {
    if (ignoreNextBlurRef.current) {
      ignoreNextBlurRef.current = false;
      return;
    }

    onUpdateTask(task.id, { title: draftTitle.trim() || 'Untitled task' });
    setIsEditing(false);
  };

  const commitFromKeyboard = () => {
    ignoreNextBlurRef.current = true;
    onUpdateTask(task.id, { title: draftTitle.trim() || 'Untitled task' });
    setIsEditing(false);
  };

  const handleCancel = () => {
    ignoreNextBlurRef.current = true;
    setDraftTitle(task.title);
    setIsEditing(false);
  };

  const startEditing = () => {
    setDraftTitle(task.title);
    setIsExpanded(true);
    setIsEditing(true);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <textarea
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={handleSave}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  commitFromKeyboard();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  handleCancel();
                }
              }}
              autoFocus
              rows={getTaskEditorRows(draftTitle, 2, 8)}
              className="w-full resize-none rounded-xl border border-border/70 bg-background px-3 py-2 text-sm font-medium leading-6 text-foreground outline-none transition-colors focus:border-border"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsExpanded((current) => !current)}
              onDoubleClick={(event) => {
                event.preventDefault();
                startEditing();
              }}
              title="Click to expand. Double-click to rename."
              className="block w-full rounded-xl px-1 py-1 text-left transition-colors hover:bg-background/60"
            >
              <p
                className={`break-words whitespace-pre-wrap text-sm font-medium leading-6 text-foreground ${
                  isExpanded ? '' : 'line-clamp-3'
                }`}
              >
                {task.title || 'Untitled task'}
              </p>
              {!isExpanded && isTaskPreviewLong(task.title) ? (
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Click to expand
                </span>
              ) : null}
            </button>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusTone(task.status)}`}
            >
              {statusLabels[task.status]}
            </span>
          </div>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {formatDate(task.date)}
        </span>
      </div>
    </div>
  );
}

function KanbanView({
  tasks,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
}: {
  tasks: Task[];
  onAddTask: (status: Task['status']) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
}) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<Task['status'] | null>(null);

  return (
    <div className="grid h-full min-h-0 grid-cols-3 gap-4 overflow-x-auto custom-scrollbar">
      {columns.map((column) => (
        <div
          key={column.id}
          className={`flex min-h-0 min-w-[280px] flex-col rounded-2xl border border-transparent px-2 pt-2 transition-colors ${
            dragOverColumn === column.id ? 'border-border bg-muted/25' : ''
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOverColumn(column.id);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDragOverColumn((current) => (current === column.id ? null : current));
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            const taskId = event.dataTransfer.getData('text/task-id') || draggedTaskId;

            if (taskId) {
              onUpdateTask(taskId, { status: column.id });
            }

            setDraggedTaskId(null);
            setDragOverColumn(null);
          }}
        >
          <div className="mb-3 flex items-center justify-between border-b border-border/70 pb-2">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${column.dot}`} />
              <h3 className="text-sm font-medium">{column.label}</h3>
              <span className="text-xs text-muted-foreground">
                {tasks.filter((task) => task.status === column.id).length}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onAddTask(column.id)}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {tasks
              .filter((task) => task.status === column.id)
              .map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onUpdate={(updates) => onUpdateTask(task.id, updates)}
                  onDelete={() => onDeleteTask(task.id)}
                  allowQuickDone={column.id === 'todo'}
                  isDragging={draggedTaskId === task.id}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/task-id', task.id);
                    event.dataTransfer.effectAllowed = 'move';
                    setDraggedTaskId(task.id);
                  }}
                  onDragEnd={() => {
                    setDraggedTaskId(null);
                    setDragOverColumn(null);
                  }}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableView({
  tasks,
  onUpdateTask,
  onDeleteTask,
}: {
  tasks: Task[];
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
}) {
  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar">
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <th className="px-4 py-3 font-medium">Task</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="px-4 py-3 font-medium">Tags</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Assignee</th>
            <th className="w-12 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              className="group rounded-2xl bg-transparent transition-colors hover:bg-muted/30"
            >
              <td className="border-t border-border/60 px-4 py-3 align-top">
                <textarea
                  value={task.title}
                  onChange={(event) => onUpdateTask(task.id, { title: event.target.value })}
                  rows={getTaskEditorRows(task.title, 2, 8)}
                  className="w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm leading-6 outline-none transition-colors hover:border-border/70 focus:border-border"
                />
              </td>

              <td className="border-t border-border/60 px-4 py-3 align-top">
                <select
                  value={task.status}
                  onChange={(event) =>
                    onUpdateTask(task.id, { status: event.target.value as Task['status'] })
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium outline-none transition-colors hover:border-border focus:border-border ${getStatusTone(task.status)}`}
                >
                  <option value="todo">Todo</option>
                  <option value="in-progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </td>

              <td className="border-t border-border/60 px-4 py-3 align-top">
                <select
                  value={task.priority}
                  onChange={(event) =>
                    onUpdateTask(task.id, {
                      priority: event.target.value as Task['priority'],
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium outline-none transition-colors hover:border-border focus:border-border ${priorityTones[task.priority]}`}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </td>

              <td className="border-t border-border/60 px-4 py-3 align-top">
                <div className="min-w-[180px]">
                  <TagPicker
                    value={task.tags}
                    onChange={(nextTags) => onUpdateTask(task.id, { tags: nextTags })}
                  />
                </div>
              </td>

              <td className="border-t border-border/60 px-4 py-3 align-top">
                <input
                  type="date"
                  value={task.date || ''}
                  onChange={(event) =>
                    onUpdateTask(task.id, { date: event.target.value || null })
                  }
                  className="rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none transition-colors hover:border-border/70 focus:border-border"
                />
              </td>

              <td className="border-t border-border/60 px-4 py-3 align-top">
                <input
                  type="text"
                  value={task.assignee || ''}
                  onChange={(event) => onUpdateTask(task.id, { assignee: event.target.value })}
                  placeholder="Add name"
                  className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none transition-colors hover:border-border/70 focus:border-border"
                />
              </td>

              <td className="border-t border-border/60 px-4 py-3 align-top">
                <button
                  type="button"
                  onClick={() => onDeleteTask(task.id)}
                  className="rounded-full p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProgressPanel({
  tasks,
  onClose,
  onAddUpcoming,
  onUpdateTask,
}: {
  tasks: Task[];
  onClose: () => void;
  onAddUpcoming: () => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
}) {
  const completedCount = tasks.filter((task) => task.status === 'done').length;
  const progressValue = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const scheduledCount = tasks.filter((task) => task.date).length;
  const upcomingTasks = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.date)
        .sort((left, right) => (left.date || '').localeCompare(right.date || '')),
    [tasks]
  );

  return (
    <div className="flex h-[58vh] min-h-0 flex-col gap-4 p-4">
      <div className="rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Progress
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {completedCount} of {tasks.length} tasks finished
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-sm font-medium text-muted-foreground">
              {progressValue}%
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border/70 bg-background p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Hide progress"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground/80 transition-all"
            style={{ width: `${progressValue}%` }}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {columns.map((column) => (
          <div
            key={column.id}
            className="rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${column.dot}`} />
              <span className="text-sm font-medium text-foreground">{column.label}</span>
            </div>
            <p className="mt-3 text-2xl font-semibold text-foreground">
              {tasks.filter((task) => task.status === column.id).length}
            </p>
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Upcoming
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {scheduledCount ? `${scheduledCount} scheduled` : 'No due dates'}
            </span>
            <button
              type="button"
              onClick={onAddUpcoming}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Upcoming
            </button>
          </div>
        </div>

        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
          {upcomingTasks.length > 0 ? (
            upcomingTasks.map((task) => (
              <UpcomingTaskItem
                key={task.id}
                task={task}
                onUpdateTask={onUpdateTask}
              />
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-sm text-muted-foreground">
              Add a date to any task and it will show up here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DatabaseView({
  tasks,
  currentPage,
  onAddTask,
  onAddUpcoming,
  onUpdateTask,
  onDeleteTask,
  onPagePropertiesChange,
}: DatabaseViewProps) {
  const [viewType, setViewType] = useState<'kanban' | 'table'>('kanban');
  const [activePanel, setActivePanel] = useState<'tasks' | 'progress' | null>(null);
  const [lastOpenPanel, setLastOpenPanel] = useState<'tasks' | 'progress'>('tasks');

  const completedCount = tasks.filter((task) => task.status === 'done').length;
  const visiblePanel = activePanel || lastOpenPanel;

  useEffect(() => {
    if (activePanel) {
      setLastOpenPanel(activePanel);
    }
  }, [activePanel]);

  const togglePanel = (panel: 'tasks' | 'progress') => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  return (
    <div className="shrink-0 border-t border-border bg-background/90 backdrop-blur-sm">
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
          activePanel ? 'max-h-[58vh] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
        }`}
      >
        <div className="min-h-0 overflow-hidden border-b border-border/60">
          {visiblePanel === 'tasks' ? (
            <div className="flex h-[58vh] min-h-0 flex-col p-4">
              {currentPage ? (
                <div className="mb-4 rounded-2xl border border-border/70 bg-background/95 px-4 py-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                        Page Properties
                      </p>
                      <p className="truncate text-sm font-medium text-foreground">
                        {currentPage.title || 'Untitled'}
                      </p>
                    </div>
                  </div>
                  <PageProperties
                    value={currentPage.properties}
                    onChange={onPagePropertiesChange}
                    className="max-w-none"
                  />
                </div>
              ) : null}

              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                    {tasks.length} tasks
                  </div>

                  <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background p-1">
                    <button
                      type="button"
                      onClick={() => setViewType('kanban')}
                      className={`rounded-full px-3 py-1.5 transition-colors ${
                        viewType === 'kanban'
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewType('table')}
                      className={`rounded-full px-3 py-1.5 transition-colors ${
                        viewType === 'table'
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <TableIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onAddTask('todo')}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                  New Task
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {viewType === 'kanban' ? (
                  <KanbanView
                    tasks={tasks}
                    onAddTask={(status) => onAddTask(status)}
                    onUpdateTask={onUpdateTask}
                    onDeleteTask={onDeleteTask}
                  />
                ) : (
                  <TableView
                    tasks={tasks}
                    onUpdateTask={onUpdateTask}
                    onDeleteTask={onDeleteTask}
                  />
                )}
              </div>
            </div>
          ) : (
            <ProgressPanel
              tasks={tasks}
              onClose={() => setActivePanel(null)}
              onAddUpcoming={onAddUpcoming}
              onUpdateTask={onUpdateTask}
            />
          )}
        </div>
      </div>

      <div className="flex h-12 items-center justify-between gap-4 px-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Project Space
          </p>
          <p className="truncate text-sm text-foreground/80">
            {tasks.length
              ? `${completedCount} of ${tasks.length} tasks complete`
              : 'Standalone tasks stay separate from workspace pages.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PanelToggle
            label="Progress"
            active={activePanel === 'progress'}
            onClick={() => togglePanel('progress')}
          />
          <PanelToggle
            label="Tasks"
            active={activePanel === 'tasks'}
            onClick={() => togglePanel('tasks')}
          />
        </div>
      </div>
    </div>
  );
}
