import { X, Plus, PanelRight, MessageSquare, Rewind } from "lucide-react";
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
      {!sidebarOpen && (
        <button
          type="button"
          onClick={onNew}
          title="New chat"
          className="flex items-center justify-center w-9 h-11 shrink-0 text-foreground-muted hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
      <div className="flex items-center h-full overflow-x-auto min-w-0 px-1 gap-0.5">
        {tabs.map((t) => {
          const active = t.id === activeId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              className={`group relative flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 text-[13px] rounded-md max-w-[200px] shrink-0 transition-colors my-auto ${
                active
                  ? "bg-background-tertiary text-foreground"
                  : "text-foreground-secondary hover:bg-background-tertiary/50 hover:text-foreground"
              }`}
            >
              <MessageSquare className="w-3 h-3 shrink-0 text-foreground-muted" />
              <span className="truncate">{t.title}</span>
              {t.status === "running" && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse shrink-0" />
              )}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
                className="shrink-0 opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-background-tertiary transition-opacity"
              >
                <X className="w-3 h-3" />
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onNew}
          title="New agent tab"
          className="flex items-center justify-center w-7 h-7 rounded-md shrink-0 text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onOpenHistory}
        title="Change history"
        className="flex items-center justify-center w-7 h-7 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
      >
        <Rewind className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onToggleFilesPanel}
        title="Changed files"
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
