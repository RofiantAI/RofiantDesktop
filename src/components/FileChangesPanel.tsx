import { useEffect, useRef, useState } from "react";
import { diffLines } from "diff";
import { FileText, FilePenLine, Pencil, X, TerminalSquare, Globe } from "lucide-react";
import type { FileChange } from "../types";
import { TerminalPanel } from "./TerminalPanel";
import { BrowserPanel } from "./BrowserPanel";

const WIDTH_KEY = "rofiant_file_changes_panel_width";
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 360;

function loadWidth() {
  const raw = Number(localStorage.getItem(WIDTH_KEY));
  if (Number.isFinite(raw) && raw >= MIN_WIDTH && raw <= MAX_WIDTH) return raw;
  return DEFAULT_WIDTH;
}

type PanelTab = "files" | "browser" | "terminal";
const TAB_KEY = "rofiant_file_changes_panel_tab";

function loadTab(): PanelTab {
  const raw = localStorage.getItem(TAB_KEY);
  return raw === "browser" || raw === "terminal" || raw === "files" ? raw : "files";
}

export function shortPath(path: string) {
  const home = path.match(/^\/home\/[^/]+/)?.[0];
  return home ? path.replace(home, "~") : path;
}

export function fileName(path: string) {
  return path.split("/").pop() ?? path;
}

export function DiffView({
  change,
  onSave,
}: {
  change: FileChange;
  onSave?: (content: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(change.newContent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(change.newContent);
    setEditing(false);
    setError(null);
  }, [change.id, change.newContent]);

  const parts = diffLines(change.oldContent ?? "", change.newContent);
  const added = parts.filter((p) => p.added).reduce((n, p) => n + (p.count ?? 0), 0);
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + (p.count ?? 0), 0);

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2">
        <div className="min-w-0">
          <div className="text-[12px] text-foreground truncate font-mono">{shortPath(change.path)}</div>
          <div className="text-[11px] text-foreground-muted mt-0.5">
            {error ? (
              <span className="text-red-500">{error}</span>
            ) : change.oldContent === null ? (
              "new file"
            ) : (
              <>
                <span className="text-accent-success">+{added}</span>{" "}
                <span className="text-red-500">-{removed}</span>
              </>
            )}
          </div>
        </div>
        {onSave && (
          <div className="flex items-center gap-1 shrink-0">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(change.newContent);
                    setEditing(false);
                    setError(null);
                  }}
                  disabled={saving}
                  className="text-[11px] px-2 py-1 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || draft === change.newContent}
                  className="text-[11px] px-2 py-1 rounded-md bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="Edit file"
                aria-label="Edit file"
                className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="w-full text-[12px] font-mono leading-relaxed p-3 bg-transparent text-foreground resize-none focus:outline-none"
          style={{ minHeight: "200px", height: "60vh" }}
        />
      ) : (
        <pre className="text-[12px] font-mono leading-relaxed overflow-x-auto">
          {parts.map((part, i) => {
            const lines = part.value.replace(/\n$/, "").split("\n");
            const bg = part.added
              ? "bg-accent-success/10 text-accent-success"
              : part.removed
                ? "bg-red-500/10 text-red-500"
                : "text-foreground-secondary";
            const prefix = part.added ? "+" : part.removed ? "-" : " ";
            return lines.map((line, j) => (
              <div key={`${i}-${j}`} className={`px-3 ${bg}`}>
                <span className="select-none opacity-50 mr-2">{prefix}</span>
                {line || " "}
              </div>
            ));
          })}
        </pre>
      )}
    </div>
  );
}

export function FileChangesPanel({
  changes,
  open,
  onClose,
  onSaveChange,
  terminalCwd,
}: {
  changes: FileChange[];
  open: boolean;
  onClose: () => void;
  onSaveChange?: (change: FileChange, content: string) => Promise<void>;
  terminalCwd?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(changes.at(-1)?.id ?? null);
  const [width, setWidth] = useState(loadWidth);
  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);
  const [tab, setTab] = useState<PanelTab>(loadTab);
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  // Re-select the newest change only when the count changes — see the same
  // pattern (and rationale) in ChangeHistoryPage.
  useEffect(() => {
    setSelectedId(changes.at(-1)?.id ?? null);
  }, [changes.length]); // oxlint-disable-line react-hooks/exhaustive-deps

  // Pointer capture (not document-level mouse listeners) so the drag
  // survives the cursor crossing into the terminal or the browser-preview
  // iframe — those own their own mouse events, so a document listener would
  // never see the move/up and the resize would get stuck "on".
  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setIsDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }
  function handleResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
    setWidth(next);
  }
  function handleResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    e.currentTarget.releasePointerCapture(e.pointerId);
    setWidth((w) => {
      localStorage.setItem(WIDTH_KEY, String(w));
      return w;
    });
  }

  const selected = changes.find((c) => c.id === selectedId) ?? changes.at(-1) ?? null;

  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{
        width: open ? width : 0,
        transition: isDragging ? "none" : "width 220ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <aside
        ref={asideRef}
        className="shrink-0 flex flex-col border-l border-border bg-background-secondary h-full relative"
        style={{ width }}
      >
        <div
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          className="absolute left-0 top-0 bottom-0 w-1.5 -translate-x-1/2 cursor-col-resize z-10 hover:bg-accent-primary/30 transition-colors"
        />
        {isDragging && (
          // Pointer capture keeps the handle receiving events even when the
          // cursor moves over the terminal, but it can't reach across a
          // cross-document iframe boundary — the browser preview swallows
          // the pointer once it's physically over it. This overlay sits
          // above the iframe so the pointer never actually enters it while
          // dragging.
          <div className="absolute inset-0 z-20" style={{ cursor: "col-resize" }} />
        )}
        <div className="flex items-center justify-between h-11 px-1.5 border-b border-border shrink-0">
          <div className="flex items-center gap-0.5">
            {(
              [
                { id: "files", label: "Files", icon: FilePenLine, badge: changes.length || null },
                { id: "browser", label: "Browser", icon: Globe, badge: null },
                { id: "terminal", label: "Terminal", icon: TerminalSquare, badge: null },
              ] as const
            ).map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                title={label}
                aria-label={label}
                aria-pressed={tab === id}
                className={`flex items-center gap-1.5 px-2 h-7 rounded-md text-[12px] font-medium transition-colors ${
                  tab === id
                    ? "bg-background-tertiary text-foreground"
                    : "text-foreground-muted hover:bg-background-tertiary/60 hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {badge !== null && (
                  <span className="text-[10px] text-foreground-muted font-normal">{badge}</span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close panel"
            className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className={`flex-1 min-h-0 flex-col ${tab === "files" ? "flex" : "hidden"}`}>
          {changes.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
              <FilePenLine className="w-5 h-5 text-foreground-muted opacity-50" />
              <p className="text-[12px] text-foreground-muted">
                Files the agent creates or edits in this conversation will show up here.
              </p>
            </div>
          ) : (
            <>
              <div className="max-h-40 overflow-y-auto border-b border-border shrink-0">
                {changes.map((c) => {
                  const isNew = c.oldContent === null;
                  const isSelected = selected?.id === c.id;
                  const parts = diffLines(c.oldContent ?? "", c.newContent);
                  const added = parts.filter((p) => p.added).reduce((n, p) => n + (p.count ?? 0), 0);
                  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + (p.count ?? 0), 0);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      title={shortPath(c.path)}
                      className={`flex items-center gap-2 w-full px-3 py-2 text-left border-l-2 transition-colors ${
                        isSelected
                          ? "bg-background-tertiary border-accent-primary"
                          : "border-transparent hover:bg-background-tertiary/60"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0 text-foreground-muted" />
                      <span className="flex-1 min-w-0 truncate text-[12px] text-foreground font-mono">
                        {fileName(c.path)}
                      </span>
                      {!isNew && (added > 0 || removed > 0) && (
                        <span className="text-[10px] font-mono shrink-0 space-x-1">
                          {added > 0 && <span className="text-accent-success">+{added}</span>}
                          {removed > 0 && <span className="text-red-500">-{removed}</span>}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded ${
                          isNew
                            ? "bg-accent-success/10 text-accent-success"
                            : "bg-accent-primary/10 text-accent-primary"
                        }`}
                      >
                        {isNew ? "new" : "edit"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex-1 overflow-y-auto">
                {selected && (
                  <DiffView
                    change={selected}
                    onSave={onSaveChange ? (content) => onSaveChange(selected, content) : undefined}
                  />
                )}
              </div>
            </>
          )}
        </div>

        <div className={`flex-1 min-h-0 ${tab === "browser" ? "flex" : "hidden"}`}>
          <BrowserPanel />
        </div>

        {/* Kept mounted (just hidden) across tab switches so the shell stays
            alive instead of getting killed and respawned every time the user
            flips to Files or Browser and back. */}
        <div className={`flex-1 min-h-0 ${tab === "terminal" ? "flex" : "hidden"}`}>
          <TerminalPanel key={terminalCwd ?? "home"} cwd={terminalCwd} />
        </div>
      </aside>
    </div>
  );
}
