import { useEffect, useState } from "react";
import { ArrowLeft, FileText, History, Trash2 } from "lucide-react";
import type { FileChange } from "../types";
import { DiffView, fileName } from "./FileChangesPanel";
import { useConfirmDialog } from "./ConfirmDialog";

export function ChangeHistoryPage({
  changes,
  onClose,
  onClear,
}: {
  changes: FileChange[];
  onClose: () => void;
  onClear: () => void;
}) {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [selectedId, setSelectedId] = useState<string | null>(changes.at(-1)?.id ?? null);

  // Re-select the newest change only when the count changes (an item was
  // added/removed) — not on every `changes` reference change, which would
  // reset the user's selection while they're reviewing an older entry.
  useEffect(() => {
    setSelectedId(changes.at(-1)?.id ?? null);
  }, [changes.length]); // oxlint-disable-line react-hooks/exhaustive-deps

  const selected = changes.find((c) => c.id === selectedId) ?? changes.at(-1) ?? null;

  return (
    <div className="flex h-full">
      {confirmDialog}
      <div className="w-[320px] shrink-0 flex flex-col border-r border-border bg-background-secondary h-full">
        <div className="flex items-center gap-2 h-11 px-3 border-b border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            title="Back"
            className="flex items-center justify-center w-7 h-7 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 text-[13px] text-foreground">
            <History className="w-3.5 h-3.5 text-foreground-muted" />
            Change history
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={async () => {
              if (changes.length === 0) return;
              const ok = await confirm({
                title: "Clear the file change history for this agent?",
                description: "This can't be undone.",
                confirmLabel: "Clear",
                danger: true,
              });
              if (ok) onClear();
            }}
            title="Clear history"
            disabled={changes.length === 0}
            className="flex items-center justify-center w-7 h-7 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {changes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <p className="text-[12px] text-foreground-muted">
              Files the agent creates or edits in this conversation will show up here.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {changes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors ${
                  selected?.id === c.id ? "bg-background-tertiary" : "hover:bg-background-tertiary/60"
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0 text-foreground-muted" />
                <span className="flex-1 min-w-0 truncate text-[12px] text-foreground font-mono">
                  {fileName(c.path)}
                </span>
                <span className="text-[10px] text-foreground-muted shrink-0">
                  {c.oldContent === null ? "new" : "edit"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-w-0">
        {selected ? (
          <DiffView change={selected} />
        ) : (
          <div className="flex items-center justify-center h-full text-[12px] text-foreground-muted">
            Select a file to view its changes.
          </div>
        )}
      </div>
    </div>
  );
}
