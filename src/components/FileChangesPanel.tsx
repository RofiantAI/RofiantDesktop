import { useEffect, useRef, useState } from "react";
import { diffLines } from "diff";
import { FileText, FilePenLine, X } from "lucide-react";
import type { FileChange } from "../types";

const WIDTH_KEY = "rofiant_file_changes_panel_width";
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 360;

function loadWidth() {
  const raw = Number(localStorage.getItem(WIDTH_KEY));
  if (Number.isFinite(raw) && raw >= MIN_WIDTH && raw <= MAX_WIDTH) return raw;
  return DEFAULT_WIDTH;
}

export function shortPath(path: string) {
  const home = path.match(/^\/home\/[^/]+/)?.[0];
  return home ? path.replace(home, "~") : path;
}

export function fileName(path: string) {
  return path.split("/").pop() ?? path;
}

export function DiffView({ change }: { change: FileChange }) {
  const parts = diffLines(change.oldContent ?? "", change.newContent);
  const added = parts.filter((p) => p.added).reduce((n, p) => n + (p.count ?? 0), 0);
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + (p.count ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="min-w-0">
          <div className="text-[12px] text-foreground truncate font-mono">{shortPath(change.path)}</div>
          <div className="text-[11px] text-foreground-muted mt-0.5">
            {change.oldContent === null ? (
              "new file"
            ) : (
              <>
                <span className="text-accent-success">+{added}</span>{" "}
                <span className="text-red-500">-{removed}</span>
              </>
            )}
          </div>
        </div>
      </div>
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
    </div>
  );
}

export function FileChangesPanel({
  changes,
  open,
  onClose,
}: {
  changes: FileChange[];
  open: boolean;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(changes.at(-1)?.id ?? null);
  const [width, setWidth] = useState(loadWidth);
  const draggingRef = useRef(false);

  // Re-select the newest change only when the count changes — see the same
  // pattern (and rationale) in ChangeHistoryPage.
  useEffect(() => {
    setSelectedId(changes.at(-1)?.id ?? null);
  }, [changes.length]); // oxlint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
      setWidth(next);
    }
    function onMouseUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidth((w) => {
        localStorage.setItem(WIDTH_KEY, String(w));
        return w;
      });
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const selected = changes.find((c) => c.id === selectedId) ?? changes.at(-1) ?? null;

  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{
        width: open ? width : 0,
        transition: "width 220ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <aside
        className="shrink-0 flex flex-col border-l border-border bg-background-secondary h-full relative"
        style={{ width }}
      >
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            draggingRef.current = true;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
          className="absolute left-0 top-0 bottom-0 w-1.5 -translate-x-1/2 cursor-col-resize z-10 hover:bg-accent-primary/30 transition-colors"
        />
        <div className="flex items-center justify-between h-11 px-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 text-[13px] text-foreground">
            <FilePenLine className="w-3.5 h-3.5 text-foreground-muted" />
            Changed files
            {changes.length > 0 && (
              <span className="text-[11px] text-foreground-muted font-normal">{changes.length}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close changed files panel"
            className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

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
            <div className="flex-1 overflow-y-auto">{selected && <DiffView change={selected} />}</div>
          </>
        )}
      </aside>
    </div>
  );
}
