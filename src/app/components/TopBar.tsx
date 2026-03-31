import React, { useState, useEffect, useRef } from 'react';
import { Search, Minus, Square, X, FileText, ChevronRight, Settings2, Puzzle, Sparkles } from 'lucide-react';
import { isMacOS } from '../lib/platform';

interface Page { 
  id: string; 
  title: string; 
  children?: Page[]; 
}

interface TopBarProps {
  pages: Page[];
  activePageId: string;
  onSelectPage: (id: string) => void;
  openTabs: string[];
  onCloseTab: (id: string) => void;
  isSettingsOpen: boolean;
  isPluginsOpen: boolean;
  isTodoView: boolean;
  isWelcomeOpen: boolean;
  onToggleSettings: () => void;
  onTogglePlugins: () => void;
}

export function TopBar({
  pages,
  activePageId,
  onSelectPage,
  openTabs,
  onCloseTab,
  isSettingsOpen,
  isPluginsOpen,
  isTodoView,
  isWelcomeOpen,
  onToggleSettings,
  onTogglePlugins,
}: TopBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isMac = isMacOS();

  const findPagePath = (nodes: Page[], targetId: string, path: Page[] = []): Page[] | null => {
    for (const node of nodes) {
      if (node.id === targetId) return [...path, node];
      if (node.children) {
        const found = findPagePath(node.children, targetId, [...path, node]);
        if (found) return found;
      }
    }
    return null;
  };

  const breadcrumbs = findPagePath(pages, activePageId) || [];

  const flattenPages = (nodes: Page[]): { id: string; title: string }[] => {
    let flat: { id: string; title: string }[] = [];
    nodes.forEach(node => {
      flat.push({ id: node.id, title: node.title });
      if (node.children) flat = [...flat, ...flattenPages(node.children)];
    });
    return flat;
  };

  const allPages = flattenPages(pages);
  const getPageTitle = (id: string) => allPages.find((page) => page.id === id)?.title || 'Untitled';
  const results = query 
    ? allPages.filter(p => p.title.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleControl = (action: 'minimize' | 'maximize' | 'close') => {
    if (window.electron && window.electron.windowControl) {
      window.electron.windowControl(action);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!searchOpen || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedPage = results[selectedIndex];
      if (selectedPage) {
        onSelectPage(selectedPage.id);
        setSearchOpen(false);
        setQuery('');
      }
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isSettingsOpen || isPluginsOpen) {
        if (e.key === 'Escape') setSearchOpen(false);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPluginsOpen, isSettingsOpen]);

  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 0);
    else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [searchOpen]);

  useEffect(() => {
    if (isSettingsOpen || isPluginsOpen) {
      setSearchOpen(false);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isPluginsOpen, isSettingsOpen]);

  return (
    <div className={`h-10 bg-card border-b border-border flex items-center justify-between pr-4 select-none drag-region relative ${isMac ? 'pl-[84px]' : 'px-4'}`}>
      <div className="flex items-center gap-1 flex-1 max-w-2xl">
        {isSettingsOpen ? (
          <div className="flex items-center gap-2 no-drag">
            <div className="flex h-7 items-center rounded-full border border-border/70 bg-muted/60 px-3 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Settings
            </div>
          </div>
        ) : isPluginsOpen ? (
          <div className="flex items-center gap-2 no-drag">
            <div className="flex h-7 items-center gap-2 rounded-full border border-border/70 bg-muted/60 px-3 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              <Puzzle className="h-3.5 w-3.5" />
              Plugin Store
            </div>
          </div>
        ) : isWelcomeOpen ? (
          <div className="flex items-center gap-2 no-drag">
            <div className="flex h-7 items-center gap-2 rounded-full border border-border/70 bg-muted/60 px-3 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Welcome
            </div>
          </div>
        ) : (
          <>
            <div className={`relative group transition-all duration-200 ${searchOpen ? 'w-64' : 'w-auto'}`}>
              <div className="flex items-center gap-2 py-1 no-drag">
                <Search 
                  className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                    searchOpen ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground/70'
                  }`} 
                />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={handleKeyDown}
                  placeholder={searchOpen ? "Search pages..." : ""}
                  className={`bg-transparent outline-none border-none ring-0 shadow-none text-xs text-foreground placeholder:text-muted-foreground/40 transition-all duration-200 ${
                    searchOpen ? 'w-full px-1' : 'w-0'
                  }`}
                />
              </div>

              {searchOpen && query && (
                <div className="absolute top-9 left-0 w-64 bg-card/95 backdrop-blur-sm border border-border/50 rounded-md shadow-lg z-[200] py-1 overflow-hidden no-drag">
                  {results.length > 0 ? (
                    results.map((page, index) => (
                      <button
                        key={page.id}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => {
                          onSelectPage(page.id);
                          setSearchOpen(false);
                          setQuery('');
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                          index === selectedIndex 
                            ? 'bg-primary/10 text-primary' 
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <FileText className={`w-3 h-3 ${index === selectedIndex ? 'opacity-100' : 'opacity-60'}`} />
                        <span className="truncate">{page.title || "Untitled"}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-[10px] uppercase tracking-wide font-medium text-muted-foreground/50 text-center">
                      No results
                    </div>
                  )}
                </div>
              )}
            </div>

        {!searchOpen && (
          <div className="flex items-center gap-1 no-drag overflow-hidden animate-in fade-in duration-300">
            <div className="h-3 w-[1px] bg-border/60 mr-1.5" /> 
            {isTodoView ? (
              <div className="flex items-center gap-2">
                <div className="flex h-6 items-center rounded-full border border-border/70 bg-muted/50 px-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  To-do List
                </div>
              </div>
            ) : (
              breadcrumbs.map((page, index) => (
                <React.Fragment key={page.id}>
                  <button
                    onClick={() => onSelectPage(page.id)}
                    className={`text-[11px] transition-colors truncate max-w-[120px] ${
                      index === breadcrumbs.length - 1 
                        ? 'text-foreground font-medium' 
                        : 'text-muted-foreground/60 hover:text-foreground'
                    }`}
                  >
                    {page.title || "Untitled"}
                  </button>
                  {index < breadcrumbs.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                  )}
                </React.Fragment>
              ))
            )}
          </div>
        )}
          </>
        )}
      </div>

      {/* Right Side: Window Controls */}
      <div className="flex items-center no-drag h-full min-w-0">
        {!isSettingsOpen && !isPluginsOpen && !isTodoView && openTabs.length > 0 && (
          <div className="flex items-center gap-1 mr-2 max-w-[420px] overflow-x-auto custom-scrollbar py-1">
            {openTabs.map((tabId) => {
              const isActiveTab = tabId === activePageId;

              return (
                <button
                  key={tabId}
                  onClick={() => onSelectPage(tabId)}
                  className={`group flex items-center gap-1.5 min-w-0 h-7 rounded-md border px-2 transition-colors ${
                    isActiveTab
                      ? 'border-border bg-muted text-foreground'
                      : 'border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/60 hover:text-foreground'
                  }`}
                >
                  <span className="truncate text-[11px] max-w-[110px]">{getPageTitle(tabId)}</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tabId);
                    }}
                    className="flex items-center justify-center w-4 h-4 rounded-sm text-muted-foreground/70 hover:bg-background/70 hover:text-foreground transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className={`flex items-center h-full ${isMac ? '' : '-mr-4'}`}>
        <button
          onClick={onTogglePlugins}
          className={`h-full px-3 hover:bg-muted transition-colors flex items-center justify-center group ${
            isPluginsOpen ? 'bg-muted/80' : ''
          }`}
        >
          <Puzzle className={`w-3.5 h-3.5 ${isPluginsOpen ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`} />
        </button>
        <button
          onClick={onToggleSettings}
          className={`h-full px-3 hover:bg-muted transition-colors flex items-center justify-center group ${
            isSettingsOpen ? 'bg-muted/80' : ''
          }`}
        >
          <Settings2 className={`w-3.5 h-3.5 ${isSettingsOpen ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`} />
        </button>
        {!isMac && (
          <>
            <button onClick={() => handleControl('minimize')} className="h-full px-4 hover:bg-muted transition-colors flex items-center justify-center group">
              <Minus className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
            </button>
            <button onClick={() => handleControl('maximize')} className="h-full px-4 hover:bg-muted transition-colors flex items-center justify-center group">
              <Square className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
            </button>
            <button onClick={() => handleControl('close')} className="h-full px-4 hover:bg-destructive hover:text-destructive-foreground transition-colors flex items-center justify-center group">
              <X className="w-4 h-4 text-muted-foreground group-hover:text-destructive-foreground" />
            </button>
          </>
        )}
        </div>
      </div>

      {/* Click-away overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-[150] no-drag" onClick={() => setSearchOpen(false)} />
      )}
    </div>
  );
}
