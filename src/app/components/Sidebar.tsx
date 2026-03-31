import React, { useState, useEffect } from 'react';
import {
  ChevronRight, ChevronDown, FileText, Plus, Clock,
  PanelLeftClose, PanelLeft, Play, Pause, RotateCcw, Trash2, Settings2,
  Star, Pin, ListTodo, MoreHorizontal, ExternalLink
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface Page { 
  id: string; 
  title: string; 
  isFavourite?: boolean; 
  isPinned?: boolean; 
  children?: Page[]; 
}

interface ArchivedPage {
  id: string;
  title: string;
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  pages: Page[];
  onAddPage: (parentId?: string) => void;
  onSelectPage: (id: string) => void;
  activePage: string | null;
  onDeletePage: (id: string) => void;
  onMovePage: (draggedId: string, targetParentId: string | null) => void;
  onTogglePin: (id: string) => void;
  onToggleFavourite: (id: string) => void;
  onOpenInNewTab: (id: string) => void;
  archivedPages: ArchivedPage[];
  onRestorePage: (id: string) => void;
  onDeletePagePermanently: (id: string) => void;
  onSelectTodoView: () => void;
  isTodoView: boolean;
}

const isDescendant = (pages: Page[], parentId: string, childId: string): boolean => {
  for (const page of pages) {
    if (page.id === parentId) {
      const checkChildren = (children?: Page[]): boolean => {
        if (!children) return false;
        for (const child of children) {
          if (child.id === childId) return true;
          if (checkChildren(child.children)) return true;
        }
        return false;
      };
      return checkChildren(page.children);
    }
    if (page.children && isDescendant(page.children, parentId, childId)) return true;
  }
  return false;
};

function PageItem({
  page, level = 0, onAddChild, onSelect, isActive, onDelete, onMovePage, allPages, activePageId, onTogglePin, onToggleFavourite, onOpenInNewTab
}: {
  page: Page; level?: number;
  onAddChild: (id: string) => void;
  onSelect: (id: string) => void;
  isActive: boolean;
  onDelete: (id: string) => void;
  onMovePage: (draggedId: string, targetParentId: string | null) => void;
  allPages: Page[];
  activePageId: string | null;
  onTogglePin: (id: string) => void;
  onToggleFavourite: (id: string) => void;
  onOpenInNewTab: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const hasChildren = page.children && page.children.length > 0;

  return (
    <div onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }} 
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
        const draggedId = e.dataTransfer.getData("draggedPageId");
        if (draggedId === page.id || isDescendant(allPages, draggedId, page.id)) return;
        onMovePage(draggedId, page.id);
        setIsOpen(true);
      }}
      className={`rounded-lg transition-all ${isDragOver ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}>
      <div className="group relative flex items-center gap-1" draggable onDragStart={(e) => { e.dataTransfer.setData("draggedPageId", page.id); e.stopPropagation(); }}>
        <button
          onClick={() => { if (hasChildren) setIsOpen(!isOpen); onSelect(page.id); }}
          className={`min-w-0 flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
            isActive ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {hasChildren ? (
            <div className="w-4 h-4 flex items-center justify-center">
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </div>
          ) : <div className="w-4" />}
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="flex-1 text-left text-sidebar-foreground truncate">{page.title}</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                isActive ? 'opacity-100' : 'opacity-45 group-hover:opacity-100 group-focus-within:opacity-100'
              }`}
              title="Page actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            side="bottom"
            sideOffset={6}
            className="w-44 rounded-xl border-border/70 bg-background/95 p-1 shadow-lg backdrop-blur"
          >
            <DropdownMenuItem
              onSelect={() => onOpenInNewTab(page.id)}
              className="rounded-lg"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Open in new tab</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={() => onAddChild(page.id)}
              className="rounded-lg"
            >
              <Plus className="h-4 w-4" />
              <span>New subpage</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={() => onTogglePin(page.id)}
              className="rounded-lg"
            >
              <Pin className="h-4 w-4" fill={page.isPinned ? "currentColor" : "none"} />
              <span>{page.isPinned ? 'Unpin page' : 'Pin page'}</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={() => onToggleFavourite(page.id)}
              className="rounded-lg"
            >
              <Star className="h-4 w-4" fill={page.isFavourite ? "currentColor" : "none"} />
              <span>{page.isFavourite ? 'Remove favourite' : 'Add favourite'}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={() => onDelete(page.id)}
              variant="destructive"
              className="rounded-lg"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete page</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {hasChildren && isOpen && (
        <div className="mt-0.5">
          {page.children!.map((child) => (
            <PageItem key={child.id} page={child} level={level + 1} onAddChild={onAddChild} onSelect={onSelect}
              isActive={activePageId === child.id} onDelete={onDelete} onMovePage={onMovePage} allPages={allPages}
              activePageId={activePageId} onTogglePin={onTogglePin} onToggleFavourite={onToggleFavourite} onOpenInNewTab={onOpenInNewTab} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrashItem({
  page,
  onRestore,
  onDeletePermanently,
}: {
  page: ArchivedPage;
  onRestore: (id: string) => void;
  onDeletePermanently: (id: string) => void;
}) {
  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent">
      <Trash2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sidebar-foreground">{page.title}</span>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onRestore(page.id)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Restore page"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDeletePermanently(page.id)}
          className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Delete permanently"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function Sidebar({
  collapsed, onToggle, pages, onAddPage, onSelectPage, activePage, onDeletePage, onMovePage, onTogglePin, onToggleFavourite, onOpenInNewTab, archivedPages, onRestorePage, onDeletePagePermanently, onSelectTodoView, isTodoView
}: SidebarProps) {
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [scratchpadText, setScratchpadText] = useState(() => localStorage.getItem('scratchpad-text') || '');
  const [time, setTime] = useState(() => Number(localStorage.getItem('pomodoro-time')) || 25 * 60);
  const [duration, setDuration] = useState(() => Number(localStorage.getItem('pomodoro-duration')) || 25 * 60);
  const [isRunning, setIsRunning] = useState(localStorage.getItem('pomodoro-running') === 'true');
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editMinutes, setEditMinutes] = useState('25');
  const [showFinishModal, setShowFinishModal] = useState(false);

  // Minimalistic dropdown states
  const [isPinnedOpen, setIsPinnedOpen] = useState(true);
  const [isFavOpen, setIsFavOpen] = useState(true);
  const [isPrivateOpen, setIsPrivateOpen] = useState(true);
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  // Filter pinned and favourites from the flat list (needs App to provide flat or logic)
  // For now, we'll assume we find them in the provided tree
  const findSpecialPages = (nodes: Page[], type: 'pinned' | 'fav'): Page[] => {
    let results: Page[] = [];
    nodes.forEach(node => {
      if (type === 'pinned' && node.isPinned) results.push(node);
      if (type === 'fav' && node.isFavourite) results.push(node);
      if (node.children) results = [...results, ...findSpecialPages(node.children, type)];
    });
    return results;
  };

  const pinnedPages = findSpecialPages(pages, 'pinned');
  const favPages = findSpecialPages(pages, 'fav');

  const openTimeEditor = () => {
    setEditMinutes(String(Math.max(1, Math.floor(duration / 60))));
    setIsEditingTime(true);
  };

  const commitEditedTime = () => {
    const nextMinutes = Math.max(1, parseInt(editMinutes, 10) || 25);
    const nextDuration = nextMinutes * 60;
    setEditMinutes(String(nextMinutes));
    setDuration(nextDuration);
    setTime(nextDuration);
    setIsRunning(false);
    setIsEditingTime(false);
  };

  useEffect(() => localStorage.setItem('scratchpad-text', scratchpadText), [scratchpadText]);
  useEffect(() => localStorage.setItem('pomodoro-time', time.toString()), [time]);
  useEffect(() => localStorage.setItem('pomodoro-duration', duration.toString()), [duration]);
  useEffect(() => localStorage.setItem('pomodoro-running', isRunning.toString()), [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setTime((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          setShowFinishModal(true);
          try { new Audio('/timer.mp3').play().catch(() => {}); } catch (e) {}
          return duration;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, duration]);

  if (collapsed) {
    return (
      <div className="w-12 bg-sidebar border-r flex flex-col items-center py-4 gap-4">
        <button onClick={onToggle} className="p-2 hover:bg-sidebar-accent rounded-lg"><PanelLeft className="w-5 h-5" /></button>
        <button onClick={() => onAddPage()} className="p-2 hover:bg-sidebar-accent rounded-lg"><Plus className="w-5 h-5" /></button>
        <div className="mt-auto flex flex-col items-center gap-4">
          <button
            onClick={onSelectTodoView}
            className={`p-2 rounded-lg transition-colors ${isTodoView ? 'bg-sidebar-accent text-foreground' : 'hover:bg-sidebar-accent'}`}
            title="To-do List"
          >
            <ListTodo className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              setIsToolsOpen(true);
              setIsTrashOpen(false);
              onToggle();
            }}
            className="p-2 rounded-lg transition-colors hover:bg-sidebar-accent"
            title="Tools"
          >
            <Settings2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              setIsTrashOpen(true);
              setIsToolsOpen(false);
              onToggle();
            }}
            className="p-2 rounded-lg transition-colors hover:bg-sidebar-accent"
            title="Trash"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          {isRunning && <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />}
        </div>
      </div>
    );
  }

  return (
  <div className="w-64 bg-sidebar border-r flex flex-col h-full shrink-0 relative">
    {showFinishModal && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-card border border-border w-full max-w-[280px] p-6 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Clock className="w-6 h-6 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">Time's Up!</h3>
              <p className="text-sm text-muted-foreground">Session complete. Take a break!</p>
            </div>
            <button 
              onClick={() => setShowFinishModal(false)} 
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    )}

    <div className="p-4 flex items-center justify-between">
      <span className="font-semibold text-sm">Workspace</span>
      <button onClick={onToggle} className="p-1 hover:bg-sidebar-accent rounded-lg">
        <PanelLeftClose className="w-4 h-4" />
      </button>
    </div>

    <div className="px-4 pb-3">
      <button 
        onClick={() => onAddPage()} 
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-sidebar-accent rounded-lg text-sm font-medium transition-colors"
      >
        <Plus className="w-4 h-4 text-primary" />
        <span>New Page</span>
      </button>
    </div>

    {/* DROPPABLE CONTAINER: Drop here to move a page to the top level */}
    <div 
      className="flex-1 overflow-y-auto px-2 space-y-4"
      onDragOver={(e) => e.preventDefault()} 
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("draggedPageId");
        if (id) onMovePage(id, null); // Moves the note to root (parentId = null)
      }}
    >
      {/* Pinned Section */}
      {pinnedPages.length > 0 && (
        <div className="space-y-1">
          <button 
            onClick={() => setIsPinnedOpen(!isPinnedOpen)}
            className="flex items-center gap-1 w-full px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors group"
          >
            {isPinnedOpen ? <ChevronDown className="w-3 h-3 opacity-70 group-hover:opacity-100" /> : <ChevronRight className="w-3 h-3 opacity-70 group-hover:opacity-100" />}
            Pinned
          </button>
          {isPinnedOpen && pinnedPages.map(page => (
            <PageItem key={`pinned-${page.id}`} page={page} onAddChild={onAddPage} onSelect={onSelectPage}
              isActive={activePage === page.id} onDelete={onDeletePage} onMovePage={onMovePage} allPages={pages}
              activePageId={activePage} onTogglePin={onTogglePin} onToggleFavourite={onToggleFavourite} onOpenInNewTab={onOpenInNewTab} />
          ))}
        </div>
      )}

      {/* Favourites Section */}
      {favPages.length > 0 && (
        <div className="space-y-1">
          <button 
            onClick={() => setIsFavOpen(!isFavOpen)}
            className="flex items-center gap-1 w-full px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors group"
          >
            {isFavOpen ? <ChevronDown className="w-3 h-3 opacity-70 group-hover:opacity-100" /> : <ChevronRight className="w-3 h-3 opacity-70 group-hover:opacity-100" />}
            Favourites
          </button>
          {isFavOpen && favPages.map(page => (
            <PageItem key={`fav-${page.id}`} page={page} onAddChild={onAddPage} onSelect={onSelectPage}
              isActive={activePage === page.id} onDelete={onDeletePage} onMovePage={onMovePage} allPages={pages}
              activePageId={activePage} onTogglePin={onTogglePin} onToggleFavourite={onToggleFavourite} onOpenInNewTab={onOpenInNewTab} />
          ))}
        </div>
      )}

      {/* All Pages (Private) Section */}
      <div className="space-y-1">
        <button 
          onClick={() => setIsPrivateOpen(!isPrivateOpen)}
          className="flex items-center gap-1 w-full px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors group"
        >
          {isPrivateOpen ? <ChevronDown className="w-3 h-3 opacity-70 group-hover:opacity-100" /> : <ChevronRight className="w-3 h-3 opacity-70 group-hover:opacity-100" />}
          Private
        </button>
        {isPrivateOpen && pages.map((page) => (
          <PageItem key={page.id} page={page} onAddChild={onAddPage} onSelect={onSelectPage}
            isActive={activePage === page.id} onDelete={onDeletePage} onMovePage={onMovePage} allPages={pages}
            activePageId={activePage} onTogglePin={onTogglePin} onToggleFavourite={onToggleFavourite} onOpenInNewTab={onOpenInNewTab} />
        ))}
        {/* Invisible target area at the bottom of the list */}
        <div className="h-20" /> 
      </div>
    </div>

    <div className="p-2 border-t space-y-1">
      <div className="px-1">
        <button
          onClick={onSelectTodoView}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
            isTodoView ? 'bg-sidebar-accent text-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent'
          }`}
        >
          <ListTodo className="w-4 h-4 text-muted-foreground" />
          <span className="flex-1 text-left">To-do List</span>
        </button>
      </div>

      <div className="px-1">
        <button
          onClick={() => setIsToolsOpen(!isToolsOpen)}
          className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-sidebar-accent rounded-lg text-sm text-muted-foreground transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          <span className="flex-1 text-left">Tools</span>
          <div className="flex items-center gap-2">
            {isRunning && !isToolsOpen && <span className="text-[10px] font-mono bg-primary/20 text-primary px-1.5 rounded-full">{Math.floor(time / 60)}m</span>}
            {isToolsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>
        </button>

        {isToolsOpen && (
          <div className="mt-2 space-y-3 px-1 pb-2">
            <div className="p-2 bg-muted/50 rounded-lg space-y-2 text-center">
              <div onDoubleClick={openTimeEditor} className="text-xl font-mono tabular-nums">
                {isEditingTime ? (
                  <input 
                    type="number" 
                    value={editMinutes} 
                    autoFocus 
                    min="1"
                    onChange={(e) => setEditMinutes(e.target.value)} 
                    onBlur={commitEditedTime}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitEditedTime();
                      }
                    }}
                    className="w-16 bg-transparent text-center border-b" 
                  />
                ) : (
                  `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setIsRunning(!isRunning)} className="flex-1 py-1 bg-primary text-primary-foreground rounded text-xs">
                  {isRunning ? <Pause className="w-3 h-3 mx-auto" /> : <Play className="w-3 h-3 mx-auto" />}
                </button>
                <button onClick={() => { setTime(duration); setIsRunning(false); }} className="p-1 bg-background border rounded">
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>
            <textarea 
              value={scratchpadText} 
              onChange={(e) => setScratchpadText(e.target.value)} 
              placeholder="Quick thoughts..." 
              className="w-full h-24 p-2 text-xs bg-muted/30 border rounded-lg resize-none" 
            />
          </div>
        )}
      </div>

      <div className="px-1">
        <button
          onClick={() => setIsTrashOpen(!isTrashOpen)}
          className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-sidebar-accent rounded-lg text-sm text-muted-foreground transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span className="flex-1 text-left">Trash</span>
          <div className="flex items-center gap-2">
            {archivedPages.length > 0 && (
              <span className="text-[10px] font-medium bg-muted text-muted-foreground px-1.5 rounded-full">
                {archivedPages.length}
              </span>
            )}
            {isTrashOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>
        </button>

        {isTrashOpen && (
          <div className="mt-2 space-y-1 px-1 pb-2">
            {archivedPages.length > 0 ? (
              archivedPages.map((page) => (
                <TrashItem
                  key={`trash-${page.id}`}
                  page={page}
                  onRestore={onRestorePage}
                  onDeletePermanently={onDeletePagePermanently}
                />
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
                Deleted pages will appear here until you restore them or remove them forever.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);

}
