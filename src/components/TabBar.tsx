import { X, Plus, PanelRight, MessageSquare, RotateCcw, Loader2 } from "lucide-react";
import type { Conversation } from "../types";

export function TabBar({
  tabs,
  activeId,
  sidebarOpen,
  onSelect,
  onClose,
  onNew,
  filesPanelOpen,
  onToggleFilesPanel,
  changedFilesCount,
  onOpenHistory,
}: {
  tabs: Conversation[];
  activeId: string | null;
  sidebarOpen: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  filesPanelOpen: boolean;
  onToggleFilesPanel: () => void;
  changedFilesCount: number;
  onOpenHistory: () => void;
}) {
  return (
    <div className="flex items-center h-11 shrink-0 border-b border-border bg-background pr-2">
      {!sidebarOpen && tabs.length > 0 && (
        <button
          type="button"
          onClick={onNew}
          title="New chat"
          aria-label="New chat"
          className="flex items-center justify-center w-9 h-11 shrink-0 text-foreground-muted hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
      <div className="flex items-center h-full overflow-x-auto min-w-0 px-1">
        {tabs.map((t) => {
          const active = t.id === activeId;
          return (
            <div
              key={t.id}
              className={`group relative flex items-center gap-1.5 h-full px-3 text-[13px] max-w-[200px] shrink-0 transition-colors border-b-2 ${
                active
                  ? "text-foreground border-foreground/70"
                  : "text-foreground-muted border-transparent hover:text-foreground-secondary"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                className="flex flex-1 items-center gap-1.5 min-w-0"
              >
                {t.status === "running" ? (
                  <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                ) : (
                  <MessageSquare className="w-3 h-3 shrink-0" />
                )}
                <span className="truncate">{t.title}</span>
              </button>
              <button
                type="button"
                aria-label={`Close ${t.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
                className="shrink-0 opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-background-tertiary transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={onNew}
          title="New chat tab"
          aria-label="New chat tab"
          className="flex items-center justify-center w-7 h-7 rounded-md shrink-0 ml-1 text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onOpenHistory}
        title="Change history"
        aria-label="Change history"
        className="flex items-center justify-center w-7 h-7 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onToggleFilesPanel}
        title="Changed files"
        aria-label="Changed files"
        className={`relative flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
          filesPanelOpen
            ? "bg-background-tertiary text-foreground"
            : "text-foreground-muted hover:text-foreground hover:bg-background-tertiary"
        }`}
      >
        <PanelRight className="w-3.5 h-3.5" />
        {changedFilesCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-accent-primary text-background text-[9px] font-medium flex items-center justify-center">
            {changedFilesCount}
          </span>
        )}
      </button>
    </div>
  );
}
