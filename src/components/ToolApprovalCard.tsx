export function ToolApprovalCard({
  summary,
  onApprove,
  onReject,
}: {
  summary: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="max-w-[720px] mx-auto w-full px-6 pb-3 shrink-0">
      <div className="rounded-lg border border-border bg-card shadow-lg p-4 animate-[modalIn_180ms_ease-out]">
        <div className="text-[13px] font-medium text-foreground">{summary}</div>
        <div className="text-[12px] text-foreground-muted mt-1 mb-3">
          The agent wants to do this. Allow it?
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onReject}
            className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
