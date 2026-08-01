import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Update } from "@tauri-apps/plugin-updater";
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
  MessageCircle,
  User,
  Zap,
  RefreshCw,
  Contrast,
  HelpCircle,
  ChevronRight,
  Check,
  Loader2,
  FolderPlus,
  Folder as FolderIcon,
  FolderInput,
} from "lucide-react";
import type { Conversation, Folder } from "../types";
import type { Theme } from "../lib/settings";
import { isProPlan } from "../lib/plan";
import { ConversationListSkeleton } from "./Skeleton";
import { SidebarNews } from "./SidebarNews";
import { modShortcut } from "../lib/platform";

const menuItemClass =
  "flex items-center gap-2.5 w-[calc(100%-2px)] mx-px px-3 py-1 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors rounded-md";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export interface SidebarUser {
  email: string;
  avatarUrl: string | null;
  displayName: string | null;
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

function formatRelativeTime(ts: number): string {
  const minutes = Math.floor((Date.now() - ts) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
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
  folders,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveToFolder,
  onNewInFolder,
  searchTrigger,
  user,
  plan,
  onSignIn,
  onSignOut,
  theme,
  onThemeChange,
  onCheckForUpdate,
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
  folders: Folder[];
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveToFolder: (conversationId: string, folderId: string | null) => void;
  onNewInFolder: (folderId: string) => void;
  searchTrigger?: number;
  user: SidebarUser | null;
  plan: string;
  onSignIn: () => void;
  onSignOut: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onCheckForUpdate: () => Promise<Update | null>;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [submenu, setSubmenu] = useState<"appearance" | "help" | null>(null);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "latest" | "available">(
    "idle",
  );
  const isPro = isProPlan(plan);
  const menuRef = useRef<HTMLDivElement>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState("");
  const [moveSubmenuOpen, setMoveSubmenuOpen] = useState(false);

  useEffect(() => {
    if (searchTrigger) setSearching(true);
  }, [searchTrigger]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setSubmenu(null);
      }
      if (
        rowMenuRef.current &&
        !rowMenuRef.current.contains(e.target as Node)
      ) {
        setOpenMenuId(null);
        setMoveSubmenuOpen(false);
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

  async function handleCheckForUpdate() {
    setUpdateStatus("checking");
    try {
      const update = await onCheckForUpdate();
      setUpdateStatus(update ? "available" : "latest");
    } catch (err) {
      console.error("Update check failed:", err);
      setUpdateStatus("idle");
    }
  }

  function commitRename(c: Conversation) {
    const value = renameValue.trim();
    setRenamingId(null);
    if (value && value !== c.title) onRename(c.id, value);
  }

  function toggleFolderCollapsed(id: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function commitCreateFolder() {
    const name = newFolderName.trim();
    setCreatingFolder(false);
    setNewFolderName("");
    if (name) onCreateFolder(name);
  }

  function commitFolderRename(folder: Folder) {
    const value = folderRenameValue.trim();
    setRenamingFolderId(null);
    if (value && value !== folder.name) onRenameFolder(folder.id, value);
  }

  function renderConversationRow(c: Conversation, nested = false) {
    const active = c.id === activeId;
    const renaming = renamingId === c.id;
    return (
      <div key={c.id} className={`${nested ? "pl-6 pr-2" : "px-2"} relative`}>
        <div
          className={`flex w-full items-start gap-2 py-1.5 px-2 rounded-md text-[13px] transition-colors ${
            active
              ? "bg-background-tertiary text-foreground"
              : "text-foreground-secondary hover:bg-background-tertiary/60 hover:text-foreground"
          }`}
        >
          <button
            type="button"
            onClick={() => !renaming && onSelect(c.id)}
            className="flex flex-1 min-w-0 items-start gap-2 text-left"
          >
            {c.status === "running" ? (
              <Loader2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-foreground-muted animate-spin" />
            ) : (
              <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 text-foreground-muted" />
            )}
            <div className="flex-1 min-w-0">
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
                  className="w-full bg-transparent text-foreground outline-none border-b border-foreground-muted/40"
                />
              ) : (
                <>
                  <div className="truncate">{c.title}</div>
                  <div className="text-[11px] text-foreground-muted/80 truncate mt-0.5">
                    {formatRelativeTime(c.updatedAt)}
                  </div>
                </>
              )}
            </div>
          </button>
          {!renaming && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (openMenuId === c.id) {
                  setOpenMenuId(null);
                  return;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                const menuWidth = 176; // w-44
                setRowMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - menuWidth) });
                setOpenMenuId(c.id);
              }}
              aria-label="Conversation options"
              className="flex items-center justify-center w-5 h-5 rounded shrink-0 mt-0.5 text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {openMenuId === c.id &&
          rowMenuPos &&
          createPortal(
            <div
              ref={rowMenuRef}
              style={{ position: "fixed", top: rowMenuPos.top, left: rowMenuPos.left }}
              className="w-44 rounded-lg bg-card border border-border shadow-lg py-1 z-50"
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
              {folders.length > 0 && (
                <div
                  className="relative"
                  onMouseEnter={() => setMoveSubmenuOpen(true)}
                  onMouseLeave={() => setMoveSubmenuOpen(false)}
                >
                  <button
                    type="button"
                    className="flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors"
                  >
                    <FolderInput className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 text-left whitespace-nowrap">Move to folder</span>
                    <ChevronRight className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
                  </button>
                  {moveSubmenuOpen && (
                    <div className="absolute left-full top-0 w-44 max-h-56 overflow-y-auto rounded-lg bg-card border border-border shadow-lg py-1 px-0.5 z-50">
                      {c.folderId && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            setMoveSubmenuOpen(false);
                            onMoveToFolder(c.id, null);
                          }}
                          className={menuItemClass}
                        >
                          No folder
                        </button>
                      )}
                      {folders.map((folder) => (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            setMoveSubmenuOpen(false);
                            onMoveToFolder(c.id, folder.id);
                          }}
                          className={`${menuItemClass} justify-between`}
                        >
                          <span className="truncate">{folder.name}</span>
                          {c.folderId === folder.id && (
                            <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
            </div>,
            document.body,
          )}
      </div>
    );
  }

  const trimmed = query.trim().toLowerCase();

  // Hide conversations with no messages yet — e.g. a freshly opened "New
  // Chat" tab nobody has typed into — so the history list only ever shows
  // chats that actually have content.
  const visibleConversations = useMemo(
    () => conversations.filter((c) => c.messages.length > 0),
    [conversations],
  );

  const filtered = useMemo(() => {
    if (!trimmed) return visibleConversations;
    return visibleConversations.filter((c) => c.title.toLowerCase().includes(trimmed));
  }, [visibleConversations, trimmed]);

  // Conversations already organized into a folder get their own section
  // below, so exclude them from the date-grouped list to avoid duplicates.
  const ungrouped = useMemo(() => filtered.filter((c) => !c.folderId), [filtered]);
  const groups = trimmed ? { Results: filtered } : groupByDate(ungrouped);

  return (
    <aside className="w-[272px] shrink-0 flex flex-col border-r border-border bg-background-secondary h-full">
      <div className="flex items-center justify-between h-11 px-2 shrink-0">
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

      <div className="px-2 pb-1 space-y-1">
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
          <kbd className="text-[13px] text-foreground-muted">
            {modShortcut("⌘N")}
          </kbd>
        </button>
        {creatingFolder ? (
          <div className="flex items-center gap-2.5 w-full h-8 px-2 rounded-md text-sm">
            <FolderPlus className="w-4 h-4 text-foreground-muted shrink-0" />
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={commitCreateFolder}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitCreateFolder();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setCreatingFolder(false);
                  setNewFolderName("");
                }
              }}
              placeholder="Folder name"
              className="flex-1 min-w-0 bg-transparent text-foreground outline-none border-b border-foreground-muted/40"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreatingFolder(true)}
            className="flex items-center gap-2.5 w-full h-8 px-2 rounded-md text-sm text-foreground hover:bg-background-tertiary transition-colors"
          >
            <FolderPlus className="w-4 h-4 text-foreground-muted" />
            <span className="flex-1 text-left">New Folder</span>
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto pb-2">
        {loading ? (
          <ConversationListSkeleton />
        ) : (
          <>
            {!trimmed && folders.length > 0 && (
              <div className="px-4 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-foreground-muted/70">
                Folders
              </div>
            )}
            {!trimmed &&
              folders.map((folder) => {
                const folderConversations = filtered.filter((c) => c.folderId === folder.id);
                const collapsed = collapsedFolders.has(folder.id);
                const renamingFolder = renamingFolderId === folder.id;
                return (
                  <div key={folder.id} className="mb-0.5">
                    <div className="group flex items-center gap-1 px-2 relative">
                      <button
                        type="button"
                        onClick={() => toggleFolderCollapsed(folder.id)}
                        className="flex flex-1 min-w-0 items-center gap-1.5 h-7 px-1.5 rounded-md text-[13px] font-medium text-foreground-secondary hover:bg-background-tertiary/60 hover:text-foreground transition-colors"
                      >
                        <ChevronRight
                          className={`w-3 h-3 shrink-0 text-foreground-muted transition-transform ${collapsed ? "" : "rotate-90"}`}
                        />
                        <FolderIcon className="w-3.5 h-3.5 shrink-0 text-foreground-muted" />
                        {renamingFolder ? (
                          <input
                            autoFocus
                            value={folderRenameValue}
                            onChange={(e) => setFolderRenameValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={(e) => e.target.select()}
                            onBlur={() => commitFolderRename(folder)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitFolderRename(folder);
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                setRenamingFolderId(null);
                              }
                            }}
                            className="flex-1 min-w-0 bg-transparent text-foreground outline-none border-b border-foreground-muted/40"
                          />
                        ) : (
                          <span className="flex-1 min-w-0 truncate text-left">{folder.name}</span>
                        )}
                      </button>
                      {!renamingFolder && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNewInFolder(folder.id);
                            }}
                            title="New chat in this folder"
                            aria-label={`New chat in ${folder.name}`}
                            className="flex items-center justify-center w-5 h-5 rounded shrink-0 opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const id = `folder:${folder.id}`;
                              setOpenMenuId((prev) => (prev === id ? null : id));
                            }}
                            aria-label="Folder options"
                            className="flex items-center justify-center w-5 h-5 rounded shrink-0 opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {openMenuId === `folder:${folder.id}` && (
                        <div
                          ref={rowMenuRef}
                          className="absolute right-2 top-7 z-10 w-36 rounded-lg bg-card border border-border shadow-lg py-1 overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              setRenamingFolderId(folder.id);
                              setFolderRenameValue(folder.name);
                            }}
                            className="flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              onDeleteFolder(folder.id);
                            }}
                            className="flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] text-red-400 hover:bg-background-tertiary transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                    {!collapsed && folderConversations.map((c) => renderConversationRow(c, true))}
                  </div>
                );
              })}
            {Object.entries(groups).map(([label, items]) => {
              if (!items.length) return null;
              return (
                <div key={label} className="mb-0.5">
                  <div className="px-4 pt-3 pb-1 text-[11px] text-foreground-muted">
                    {label}
                  </div>
                  {items.map((c) => renderConversationRow(c))}
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

      <SidebarNews />

      <div
        className="border-t border-border px-3 py-2.5 flex items-center gap-2 relative"
        ref={menuRef}
      >
        {user ? (
          <>
            <button
              type="button"
              onClick={() => {
                setMenuOpen((v) => !v);
                setSubmenu(null);
              }}
              className="flex items-center gap-2 flex-1 min-w-0 rounded-md hover:bg-background-tertiary transition-colors -mx-1 px-1 py-0.5"
            >
              <Avatar email={user.email} avatarUrl={user.avatarUrl} size={28} />
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[13px] text-foreground truncate leading-tight">
                  {user.displayName || user.email.split("@")[0]}
                </div>
                <div className="text-[11px] text-foreground-muted truncate leading-tight capitalize">
                  {plan}
                </div>
              </div>
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-3 right-3 mb-1.5 rounded-lg bg-card border border-border shadow-lg py-1 px-0.5 overflow-visible z-20">
                <div className="px-3 pt-1.5 pb-1">
                  <div className="text-[13px] text-foreground truncate leading-tight">
                    {user.displayName || user.email.split("@")[0]}
                  </div>
                  <div className="text-[11px] text-foreground-muted truncate leading-tight">
                    {user.email}
                  </div>
                </div>
                {!isPro && (
                  <div className="px-2 pb-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void openUrl("https://rofiant.ca/pricing");
                      }}
                      className="flex items-center justify-center gap-1.5 w-full h-7 rounded-md border border-border text-[12px] font-medium text-foreground hover:bg-background-tertiary transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Upgrade to Pro
                    </button>
                  </div>
                )}
                <div className="h-px bg-border my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void openUrl("https://www.rofiant.ca/dashboard");
                  }}
                  className={menuItemClass}
                >
                  <User className="w-3.5 h-3.5" />
                  Profile
                </button>
                <button
                  type="button"
                  onClick={() => void handleCheckForUpdate()}
                  className={menuItemClass}
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${updateStatus === "checking" ? "animate-spin" : ""}`}
                  />
                  {updateStatus === "checking"
                    ? "Checking…"
                    : updateStatus === "latest"
                      ? "Up to date"
                      : updateStatus === "available"
                        ? "Update available"
                        : "Check for Updates"}
                </button>
                <div
                  className="relative pr-1"
                  onMouseEnter={() => setSubmenu("appearance")}
                  onMouseLeave={() => setSubmenu(null)}
                >
                  <button type="button" className={menuItemClass}>
                    <Contrast className="w-3.5 h-3.5" />
                    <span className="flex-1 text-left">Appearance</span>
                    <span className="text-foreground-muted capitalize">{theme}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-foreground-muted" />
                  </button>
                  {submenu === "appearance" && (
                    <div className="absolute left-full top-0 w-32 rounded-lg bg-card border border-border shadow-lg py-1 px-0.5 overflow-hidden z-20">
                      {THEME_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onThemeChange(opt.value);
                            setMenuOpen(false);
                            setSubmenu(null);
                          }}
                          className={`${menuItemClass} justify-between`}
                        >
                          {opt.label}
                          {theme === opt.value && (
                            <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className="relative pr-1"
                  onMouseEnter={() => setSubmenu("help")}
                  onMouseLeave={() => setSubmenu(null)}
                >
                  <button type="button" className={menuItemClass}>
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span className="flex-1 text-left">Help</span>
                    <ChevronRight className="w-3.5 h-3.5 text-foreground-muted" />
                  </button>
                  {submenu === "help" && (
                    <div className="absolute left-full top-0 w-40 rounded-lg bg-card border border-border shadow-lg py-1 px-0.5 overflow-hidden z-20">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setSubmenu(null);
                          void openUrl("https://rofiant.ca/company/contact");
                        }}
                        className={menuItemClass}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Contact Us
                      </button>
                    </div>
                  )}
                </div>
                <div className="h-px bg-border my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                  className={menuItemClass}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Log Out
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
          aria-label="Settings"
          className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors shrink-0"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
