import React, { useMemo, useState } from 'react'
import { Calendar, Check, ChevronDown, ChevronRight, Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { Task } from './DatabaseView'

interface TodoListViewProps {
  tasks: Task[]
  deletedTasks: Task[]
  onAddTask: (status?: Task['status'], seed?: Partial<Task>) => void
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onDeleteTask: (id: string) => void
  onRestoreTask: (id: string) => void
  onDeleteTaskPermanently: (id: string) => void
}

const formatDate = (value?: string | null) => {
  if (!value) return null

  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

const formatTimestamp = (value?: number | null) => {
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

const isSameDay = (left: Date, right: Date) => {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

const getStartOfWeek = (value: Date) => {
  const start = new Date(value)
  start.setHours(0, 0, 0, 0)

  const day = start.getDay()
  const offset = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + offset)

  return start
}

function TodoRow({
  task,
  onUpdateTask,
  onDeleteTask,
}: {
  task: Task
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onDeleteTask: (id: string) => void
}) {
  const [draftTitle, setDraftTitle] = useState(task.title)

  React.useEffect(() => {
    setDraftTitle(task.title)
  }, [task.title])

  const isDone = task.status === 'done'
  const formattedDate = formatDate(task.date)

  return (
    <div className="group flex items-start gap-3 rounded-2xl border border-border/70 bg-background/90 px-4 py-3 shadow-sm transition-colors hover:border-border">
      <button
        type="button"
        onClick={() => onUpdateTask(task.id, { status: isDone ? 'todo' : 'done' })}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          isDone
            ? 'border-foreground bg-foreground text-background'
            : 'border-border/80 text-transparent hover:border-foreground/40'
        }`}
        title={isDone ? 'Mark as not done' : 'Mark as done'}
      >
        <Check className="h-3 w-3" />
      </button>

      <div className="min-w-0 flex-1">
        <input
          type="text"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={() =>
            onUpdateTask(task.id, {
              title: draftTitle.trim() || 'Untitled task',
            })
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
          className={`w-full bg-transparent text-sm outline-none transition-colors ${
            isDone ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {task.status === 'in-progress' ? (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
              In progress
            </span>
          ) : null}

          {formattedDate ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formattedDate}
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDeleteTask(task.id)}
        className="rounded-full p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-destructive group-hover:opacity-100"
        title="Move to trash"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function DeletedTaskRow({
  task,
  onRestoreTask,
  onDeleteTaskPermanently,
}: {
  task: Task
  onRestoreTask: (id: string) => void
  onDeleteTaskPermanently: (id: string) => void
}) {
  const deletedLabel = formatTimestamp(task.deletedAt)

  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-foreground">{task.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {deletedLabel ? `Deleted ${deletedLabel}` : 'Recently deleted'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onRestoreTask(task.id)}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Restore task"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onDeleteTaskPermanently(task.id)}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          title="Delete forever"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export function TodoListView({
  tasks,
  deletedTasks,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onRestoreTask,
  onDeleteTaskPermanently,
}: TodoListViewProps) {
  const [draftTitle, setDraftTitle] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)

  const incompleteTasks = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.status !== 'done')
        .sort((left, right) => {
          if (left.date && right.date) {
            return left.date.localeCompare(right.date)
          }

          if (left.date) return -1
          if (right.date) return 1
          return left.title.localeCompare(right.title)
        }),
    [tasks]
  )
  const completedTasks = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.status === 'done')
        .sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0)),
    [tasks]
  )
  const deletedTaskItems = useMemo(
    () => [...deletedTasks].sort((left, right) => (right.deletedAt ?? 0) - (left.deletedAt ?? 0)),
    [deletedTasks]
  )
  const weeklyActivity = useMemo(() => {
    const today = new Date()
    const start = getStartOfWeek(today)
    const sourceTasks = [...tasks, ...deletedTasks]

    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start)
      day.setDate(start.getDate() + index)

      const nextDay = new Date(day)
      nextDay.setDate(day.getDate() + 1)

      const count = sourceTasks.filter((task) => {
        if (task.completedAt == null) {
          return false
        }

        return task.completedAt >= day.getTime() && task.completedAt < nextDay.getTime()
      }).length

      return {
        key: day.toISOString(),
        label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(day),
        dateLabel: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(day),
        count,
        isToday: isSameDay(day, today),
      }
    })
  }, [deletedTasks, tasks])
  const completedThisWeek = useMemo(
    () => weeklyActivity.reduce((sum, day) => sum + day.count, 0),
    [weeklyActivity]
  )
  const maxDailyCompletions = useMemo(
    () => Math.max(...weeklyActivity.map((day) => day.count), 1),
    [weeklyActivity]
  )

  const handleCreateTask = () => {
    const trimmedTitle = draftTitle.trim()
    onAddTask('todo', trimmedTitle ? { title: trimmedTitle } : {})
    setDraftTitle('')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex min-h-full w-full flex-col px-6 py-8 md:px-10">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_340px]">
            <section className="min-w-0">
              <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                    Standalone Tasks
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                    To-do List
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {incompleteTasks.length} remaining
                    {completedTasks.length ? `, ${completedTasks.length} completed` : ''}
                  </p>
                </div>

                <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                  This list stays separate from workspace pages.
                </div>
              </div>

              <div className="mb-8 rounded-3xl border border-border/70 bg-card/70 p-3 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleCreateTask()
                      }
                    }}
                    placeholder="Add a task..."
                    className="flex-1 bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                  />

                  <button
                    type="button"
                    onClick={handleCreateTask}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" />
                    Add Task
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {incompleteTasks.length > 0 ? (
                  incompleteTasks.map((task) => (
                    <TodoRow
                      key={task.id}
                      task={task}
                      onUpdateTask={onUpdateTask}
                      onDeleteTask={onDeleteTask}
                    />
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-border/70 px-6 py-12 text-center text-sm text-muted-foreground">
                    Nothing on the list right now. Add a task to get started.
                  </div>
                )}
              </div>

              {completedTasks.length > 0 ? (
                <div className="mt-8">
                  <button
                    type="button"
                    onClick={() => setShowCompleted((current) => !current)}
                    className="flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showCompleted ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    Completed
                    <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] normal-case tracking-normal">
                      {completedTasks.length}
                    </span>
                  </button>

                  {showCompleted ? (
                    <div className="mt-3 space-y-3">
                      {completedTasks.map((task) => (
                        <TodoRow
                          key={task.id}
                          task={task}
                          onUpdateTask={onUpdateTask}
                          onDeleteTask={onDeleteTask}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <aside className="space-y-6 xl:sticky xl:top-0 xl:self-start">
              <div className="rounded-3xl border border-border/70 bg-card/80 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                      Weekly Activity
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-foreground">Finished this week</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {completedThisWeek} task{completedThisWeek === 1 ? '' : 's'} completed
                    </p>
                  </div>

                  <div className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
                    Peak {maxDailyCompletions}/day
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-7 gap-2">
                  {weeklyActivity.map((day) => {
                    const height = day.count
                      ? `${Math.max(16, (day.count / maxDailyCompletions) * 100)}%`
                      : '10%'

                    return (
                      <div key={day.key} className="flex flex-col items-center gap-2">
                        <div
                          className={`flex h-28 w-full items-end rounded-2xl border px-2 py-2 ${
                            day.isToday
                              ? 'border-foreground/20 bg-foreground/5'
                              : 'border-border/70 bg-muted/20'
                          }`}
                          title={`${day.label}, ${day.dateLabel}: ${day.count} completed`}
                        >
                          <div
                            className={`w-full rounded-xl transition-all ${
                              day.count ? 'bg-foreground/85' : 'bg-border/70'
                            }`}
                            style={{ height }}
                          />
                        </div>

                        <div className="text-center">
                          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            {day.label}
                          </p>
                          <p className="mt-1 text-xs font-medium text-foreground">{day.count}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-border/70 bg-card/80 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                      Task Trash
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-foreground">Recently removed</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Restore tasks or remove them forever.
                    </p>
                  </div>

                  <div className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
                    {deletedTaskItems.length}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {deletedTaskItems.length > 0 ? (
                    deletedTaskItems.map((task) => (
                      <DeletedTaskRow
                        key={task.id}
                        task={task}
                        onRestoreTask={onRestoreTask}
                        onDeleteTaskPermanently={onDeleteTaskPermanently}
                      />
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                      Deleted tasks will show up here.
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
