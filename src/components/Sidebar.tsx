import { useMemo, useState, useRef, useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Plus,
  Home,
  MessageSquare,
  Search,
  X,
  Settings,
  LogIn,
  LogOut,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  BookOpen,
  MessageCircle,
} from "lucide-react";
import type { Conversation } from "../types";
import { ConversationListSkeleton } from "./Skeleton";

export interface SidebarUser {
  email: string;
  avatarUrl: string | null;
}

export function Avatar({
  email,
  avatarUrl,
  size,
}: {
  email: string;
  avatarUrl: string | null;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  if (avatarUrl && !failed) {
    return (
      <img
        key={avatarUrl}
        src={avatarUrl}
        alt=""
        style={style}
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full object-cover border border-border"
      />
    );
  }

  return (
    <div
      style={style}
      className="shrink-0 rounded-full bg-foreground/90 flex items-center justify-center text-[11px] font-medium text-background"
    >
      {email.slice(0, 2).toUpperCase()}
    </div>
  );
}

function groupByDate(conversations: Conversation[]) {
  const pinned = conversations.filter((c) => c.pinned);
  const unpinned = conversations.filter((c) => !c.pinned);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const week = new Date(today.getTime() - 7 * 86400000);

  const groups: Record<string, Conversation[]> = {
    Pinned: pinned,
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };

  for (const c of unpinned) {
    const d = new Date(c.updatedAt);
    if (d >= today) groups["Today"].push(c);
    else if (d >= yesterday) groups["Yesterday"].push(c);
    else if (d >= week) groups["Previous 7 days"].push(c);
    else groups["Older"].push(c);
  }

  return groups;
}

export function Sidebar({
  conversations,
  loading = false,
  activeId,
  onSelect,
  onNew,
  onHome,
  onOpenSettings,
  onRename,
  onTogglePin,
  onDelete,
  searchTrigger,
  user,
  plan,
  onSignIn,
  onSignOut,
}: {
  conversations: Conversation[];
  loading?: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onHome: () => void;
  onOpenSettings: () => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  searchTrigger?: number;
  user: SidebarUser | null;
  plan: string;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (searchTrigger) setSearching(true);
  }, [searchTrigger]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (
        rowMenuRef.current &&
        !rowMenuRef.current.contains(e.target as Node)
      ) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function startRename(c: Conversation) {
    setOpenMenuId(null);
    setRenamingId(c.id);
    setRenameValue(c.title);
  }

  function commitRename(c: Conversation) {
    const value = renameValue.trim();
    setRenamingId(null);
    if (value && value !== c.title) onRename(c.id, value);
  }

  const trimmed = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!trimmed) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(trimmed));
  }, [conversations, trimmed]);

  const groups = trimmed ? { Results: filtered } : groupByDate(filtered);

  return (
    <aside className="w-[272px] shrink-0 flex flex-col border-r border-border bg-background-secondary h-full">
      <div className="flex items-center justify-between h-11 px-3 shrink-0">
        {searching ? (
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted pointer-events-none" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => !query && setSearching(false)}
              placeholder="Search chats"
              className="w-full h-7 pl-8 pr-7 rounded-md bg-background-tertiary text-sm text-foreground placeholder:text-foreground-muted outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSearching(false);
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-foreground-muted hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearching(true)}
            title="Search"
            className="flex items-center gap-2 w-full h-7 px-2.5 rounded-md bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="text-sm">Search chats</span>
          </button>
        )}
      </div>

      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={onHome}
          className={`flex items-center gap-2.5 w-full h-8 px-2 rounded-md text-sm transition-colors ${
            activeId === null
              ? "bg-background-tertiary text-foreground"
              : "text-foreground hover:bg-background-tertiary"
          }`}
        >
          <Home className="w-4 h-4 text-foreground-muted" />
          <span className="flex-1 text-left">Home</span>
        </button>
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-2.5 w-full h-8 px-2 rounded-md text-sm text-foreground hover:bg-background-tertiary transition-colors"
        >
          <Plus className="w-4 h-4 text-foreground-muted" />
          <span className="flex-1 text-left">New Chat</span>
          <kbd className="text-[13px] text-foreground-muted">⌘N</kbd>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto pb-2">
        {loading ? (
          <ConversationListSkeleton />
        ) : (
          <>
        {Object.entries(groups).map(([label, items]) => {
          if (!items.length) return null;
          return (
            <div key={label} className="mb-0.5">
              <div className="px-4 pt-3 pb-1 text-[11px] text-foreground-muted">
                {label}
              </div>
              {items.map((c) => {
                const active = c.id === activeId;
                const renaming = renamingId === c.id;
                return (
                  <div key={c.id} className="px-2 relative">
                    <div
                      className={`flex w-full items-center gap-2 h-8 px-2 rounded-md text-[13px] transition-colors ${
                        active
                          ? "bg-background-tertiary text-foreground"
                          : "text-foreground-secondary hover:bg-background-tertiary/60 hover:text-foreground"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => !renaming && onSelect(c.id)}
                        className="flex flex-1 min-w-0 items-center gap-2 text-left"
                      >
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 text-foreground-muted" />
                        {renaming ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={(e) => e.target.select()}
                            onBlur={() => commitRename(c)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitRename(c);
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                setRenamingId(null);
                              }
                            }}
                            className="flex-1 min-w-0 bg-transparent text-foreground outline-none border-b border-foreground-muted/40"
                          />
                        ) : (
                          <span className="flex-1 min-w-0 truncate">
                            {c.title}
                          </span>
                        )}
                      </button>
                      {c.status === "running" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse shrink-0" />
                      )}
                      {!renaming && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId((prev) =>
                              prev === c.id ? null : c.id,
                            );
                          }}
                          aria-label="Conversation options"
                          className="flex items-center justify-center w-5 h-5 rounded shrink-0 text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {openMenuId === c.id && (
                      <div
                        ref={rowMenuRef}
                        className="absolute right-2 top-8 z-10 w-36 rounded-lg bg-card border border-border shadow-lg py-1 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => startRename(c)}
                          className="flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            onTogglePin(c.id);
                          }}
                          className="flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors"
                        >
                          {c.pinned ? (
                            <PinOff className="w-3.5 h-3.5" />
                          ) : (
                            <Pin className="w-3.5 h-3.5" />
                          )}
                          {c.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            onDelete(c.id);
                          }}
                          className="flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] text-red-400 hover:bg-background-tertiary transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-5 py-8 text-center">
            <MessageSquare className="w-8 h-8 text-foreground-muted/30 mx-auto mb-2" />
            <p className="text-xs text-foreground-muted">
              {trimmed ? "No chats match your search" : "No chats yet"}
            </p>
          </div>
        )}
          </>
        )}
      </nav>

      <div
        className="border-t border-border px-3 py-2.5 flex items-center gap-2 relative"
        ref={menuRef}
      >
        {user ? (
          <>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 flex-1 min-w-0 rounded-md hover:bg-background-tertiary transition-colors -mx-1 px-1 py-0.5"
            >
              <Avatar email={user.email} avatarUrl={user.avatarUrl} size={28} />
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[13px] text-foreground truncate leading-tight">
                  {user.email.split("@")[0]}
                </div>
                <div className="text-[11px] text-foreground-muted truncate leading-tight capitalize">
                  {plan}
                </div>
              </div>
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-3 right-3 mb-1.5 rounded-lg bg-card border border-border shadow-lg py-1 px-0.5 overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void openUrl("https://rofiant.ca/resources/documentation");
                  }}
                  className="flex items-center gap-2.5 w-[calc(100%-2px)] mx-px px-3 py-1 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors rounded-md"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Docs
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void openUrl("https://rofiant.ca/company/contact");
                  }}
                  className="flex items-center gap-2.5 w-[calc(100%-2px)] mx-px px-3 py-1 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors rounded-md"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Contact Us
                </button>
                <div className="h-px bg-border my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                  className="flex items-center gap-2.5 w-[calc(100%-2px)] mx-px px-3 py-1 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors rounded-md"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="flex items-center gap-2.5 flex-1 min-w-0 rounded-md hover:bg-background-tertiary transition-colors -mx-1 px-1 py-1"
          >
            <div className="w-7 h-7 shrink-0 rounded-full border border-border flex items-center justify-center text-foreground-muted">
              <LogIn className="w-3.5 h-3.5" />
            </div>
            <span className="text-[13px] text-foreground-secondary">
              Sign in
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors shrink-0"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
