import React from 'react'

interface InlineAgentComposerProps {
  value: string
  isRunning: boolean
  error: string | null
  inputRef: React.RefObject<HTMLInputElement>
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
  onClose: () => void
}

export function InlineAgentComposer({
  value,
  isRunning,
  error,
  inputRef,
  onChange,
  onSubmit,
  onCancel,
  onClose,
}: InlineAgentComposerProps) {
  return (
    <div className="mt-2 rounded-xl border border-border/70 bg-background/95 px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="inline-flex shrink-0 rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          AI
        </span>

        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
              return
            }

            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
          }}
          disabled={isRunning}
          placeholder="Ask AI to write, rewrite, or code in this block..."
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-wait"
        />

        {isRunning ? (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim()}
            className="shrink-0 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Run
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Esc
        </button>
      </div>

      {(error || isRunning) && (
        <p className={`mt-2 text-[11px] ${error ? 'text-red-500' : 'text-muted-foreground'}`}>
          {error || 'Writing into the current block...'}
        </p>
      )}
    </div>
  )
}
