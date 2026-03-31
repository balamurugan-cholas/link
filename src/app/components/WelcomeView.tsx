import React, { useState } from 'react'
import {
  ArrowRight,
  Bot,
  CheckSquare2,
  Keyboard,
  NotebookPen,
  Puzzle,
  Sparkles,
} from 'lucide-react'
import { welcomeShortcutCards } from '../lib/keyboardShortcuts'

interface WelcomeViewProps {
  hasPages: boolean
  onCreateFirstPage: () => Promise<void> | void
  onOpenTodoList: () => void
  onDismiss: () => void
}

const featureCards = [
  {
    title: 'Write without friction',
    description: 'Nested blocks, page linking, tabs, and persistent block history keep writing fluid.',
    icon: NotebookPen,
  },
  {
    title: 'Local-first AI',
    description: 'Ghost text, inline editing, and voice transcription stay inside your desktop workflow.',
    icon: Bot,
  },
  {
    title: 'Plugin-ready workflow',
    description: 'Install, enable, disable, and update plugins from the built-in store.',
    icon: Puzzle,
  },
]

export function WelcomeView({
  hasPages,
  onCreateFirstPage,
  onOpenTodoList,
  onDismiss,
}: WelcomeViewProps) {
  const [isCreatingPage, setIsCreatingPage] = useState(false)

  const handleCreateFirstPage = async () => {
    if (isCreatingPage) {
      return
    }

    setIsCreatingPage(true)

    try {
      await onCreateFirstPage()
    } finally {
      setIsCreatingPage(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="flex min-h-full w-full flex-col gap-6 px-6 py-8 md:px-8 xl:px-10">
        <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card/80 p-6 shadow-[0_24px_90px_rgba(15,23,42,0.08)] backdrop-blur md:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-14 top-0 h-44 w-44 rounded-full bg-foreground/6 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-muted blur-3xl" />
          </div>

          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Welcome to Link</span>
              </div>

              <div className="max-w-2xl space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                  A calmer desktop workspace for writing, planning, and AI-assisted editing.
                </h1>
                <p className="max-w-xl text-sm leading-7 text-muted-foreground md:text-base">
                  Link is set up like a real desktop app now: cleaner text selection, persistent history,
                  plugins, local AI, and a focused workspace that opens ready to work.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={hasPages ? onDismiss : handleCreateFirstPage}
                  disabled={isCreatingPage}
                  className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-70"
                >
                  <span>
                    {hasPages
                      ? 'Enter workspace'
                      : isCreatingPage
                        ? 'Creating first page...'
                        : 'Create first page'}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={onOpenTodoList}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <CheckSquare2 className="h-4 w-4" />
                  <span>Open to-do list</span>
                </button>

                <button
                  type="button"
                  onClick={onDismiss}
                  className="inline-flex items-center rounded-full border border-transparent px-5 py-3 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/70 hover:text-foreground"
                >
                  Skip for now
                </button>
              </div>
            </div>

            <div className="grid gap-3">
              {featureCards.map((feature) => {
                const Icon = feature.icon

                return (
                  <div
                    key={feature.title}
                    className="rounded-2xl border border-border/70 bg-background/70 p-4 backdrop-blur"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <h2 className="text-sm font-medium text-foreground">{feature.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="rounded-2xl border border-border/70 bg-card/70 p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                <Keyboard className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-medium text-foreground">Quick start</h2>
                <p className="text-sm text-muted-foreground">The fastest way to feel at home in the app.</p>
              </div>
            </div>

            <div className="grid gap-3">
              {welcomeShortcutCards.map((shortcut) => (
                <div
                  key={shortcut.combo}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-background/60 px-4 py-3"
                >
                  <span className="text-sm text-foreground">{shortcut.label}</span>
                  <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {shortcut.combo}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/70 p-6">
            <p className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground">What is ready</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                <p className="text-sm font-medium text-foreground">Persistent block undo/redo</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Your block history survives restarts, so editing feels safer and more native.
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                <p className="text-sm font-medium text-foreground">Desktop-style interaction</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Text selection is limited to actual editable areas instead of the whole interface.
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                <p className="text-sm font-medium text-foreground">Separate to-do workspace</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Tasks stay independent from pages and include their own weekly activity view and trash.
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                <p className="text-sm font-medium text-foreground">Plugin store controls</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Install, enable, disable, delete, and update plugins without restarting into dev mode.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
