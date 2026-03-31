import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, X } from 'lucide-react';
import {
  normalizePageProperties,
  PAGE_STATUS_OPTIONS,
  PAGE_TAG_OPTIONS,
  type PagePropertyOption,
  type PageProperties as PagePropertiesValue,
} from '../../shared/page-properties';

interface PagePropertiesProps {
  value: PagePropertiesValue;
  onChange: (value: PagePropertiesValue) => void;
  className?: string;
}

const getOption = (value: string | null, options: PagePropertyOption[]) => {
  return options.find((option) => option.value === value);
};

const getTagTone = (tag: string) => {
  return getOption(tag, PAGE_TAG_OPTIONS)?.tone || 'border-slate-200 bg-slate-100 text-slate-700';
};

const formatDate = (value: string | null) => {
  if (!value) return 'Add date';

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Add date';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
};

export function PageProperties({ value, onChange, className = '' }: PagePropertiesProps) {
  const [openMenu, setOpenMenu] = useState<'status' | 'tags' | 'date' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const properties = useMemo(() => normalizePageProperties(value), [value]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const updateProperties = (patch: Partial<PagePropertiesValue>) => {
    onChange(normalizePageProperties({ ...properties, ...patch }));
  };

  const propertyButtonClass = (isOpen: boolean) =>
    `w-full min-h-9 rounded-md border px-2.5 py-1.5 text-left transition-all ${
      isOpen
        ? 'border-border bg-background shadow-sm'
        : 'border-transparent bg-transparent group-hover:border-border/70 group-hover:bg-background/80'
    }`;

  return (
    <div ref={containerRef} className={`max-w-2xl space-y-1 ${className}`.trim()}>
      <div className="group grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/25">
        <span className="text-[11px] font-medium text-muted-foreground">Status</span>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'status' ? null : 'status')}
            className={propertyButtonClass(openMenu === 'status')}
          >
            <div className="flex items-center justify-between gap-2">
              {properties.status ? (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getOption(properties.status, PAGE_STATUS_OPTIONS)?.tone || 'border-slate-200 bg-slate-100 text-slate-700'}`}>
                  {properties.status}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">Select status</span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </button>

          {openMenu === 'status' && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 w-full rounded-xl border border-border bg-popover p-1 shadow-xl">
              {PAGE_STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    updateProperties({ status: option.value });
                    setOpenMenu(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                >
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${option.tone}`}>
                    {option.label}
                  </span>
                  {properties.status === option.value && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  updateProperties({ status: null });
                  setOpenMenu(null);
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="group grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/25">
        <span className="text-[11px] font-medium text-muted-foreground">Tags</span>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'tags' ? null : 'tags')}
            className={propertyButtonClass(openMenu === 'tags')}
          >
            <div className="flex items-center justify-between gap-2">
              {properties.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {properties.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getTagTone(tag)}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Add tags</span>
              )}
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </div>
          </button>

          {openMenu === 'tags' && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 w-full rounded-xl border border-border bg-popover p-1 shadow-xl">
              {PAGE_TAG_OPTIONS.map((option) => {
                const isSelected = properties.tags.includes(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      const nextTags = isSelected
                        ? properties.tags.filter((tag) => tag !== option.value)
                        : [...properties.tags, option.value];
                      updateProperties({ tags: nextTags });
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                  >
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${option.tone}`}>
                      {option.label}
                    </span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  updateProperties({ tags: [] });
                  setOpenMenu(null);
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60"
              >
                <X className="h-3.5 w-3.5" />
                Clear tags
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="group grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/25">
        <span className="text-[11px] font-medium text-muted-foreground">Date</span>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'date' ? null : 'date')}
            className={propertyButtonClass(openMenu === 'date')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex items-center gap-2 text-sm ${properties.date ? 'text-foreground' : 'text-muted-foreground'}`}>
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(properties.date)}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </button>

          {openMenu === 'date' && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 w-full rounded-xl border border-border bg-popover p-3 shadow-xl">
              <input
                type="date"
                value={properties.date || ''}
                onChange={(event) => updateProperties({ date: event.target.value || null })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
              />
              <button
                type="button"
                onClick={() => {
                  updateProperties({ date: null });
                  setOpenMenu(null);
                }}
                className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60"
              >
                <X className="h-3.5 w-3.5" />
                Clear date
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
