import { DEFAULT_SETTINGS } from "../../lib/settings";
import type { AppSettings } from "../../lib/settings";
import type { ConfirmFn } from "../ConfirmDialog";
import { Row } from "./shared";

export function DataSection({
  settings,
  onChange,
  onClearConversations,
  onExportData,
  confirm,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClearConversations: () => void;
  onExportData: () => void;
  confirm: ConfirmFn;
}) {
  return (
    <div>
      <h1 className="text-[18px] font-medium mb-6">Data</h1>
      <Row label="Export data" description="Download all conversations as a JSON file">
        <button
          type="button"
          onClick={onExportData}
          className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
        >
          Export
        </button>
      </Row>
      <Row
        label="Reset settings to defaults"
        description="Restore theme, font size, shortcuts behavior, etc. Conversations are kept."
      >
        <button
          type="button"
          onClick={async () => {
            const ok = await confirm({
              title: "Reset all settings to their defaults?",
              description: "Conversations are not affected.",
              confirmLabel: "Reset",
            });
            if (ok) {
              onChange({
                ...DEFAULT_SETTINGS,
                customProviders: settings.customProviders,
                model: settings.model,
                agents: settings.agents,
                activeAgentId: settings.activeAgentId,
              });
            }
          }}
          className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
        >
          Reset
        </button>
      </Row>
      <Row label="Clear all chats" description="Permanently delete every conversation on this device">
        <button
          type="button"
          onClick={async () => {
            const ok = await confirm({
              title: "Delete every conversation on this device?",
              description: "This can't be undone.",
              confirmLabel: "Delete",
              danger: true,
            });
            if (ok) onClearConversations();
          }}
          className="h-8 px-3 rounded-lg border border-red-200 text-[13px] text-red-600 hover:bg-red-50 transition-colors shrink-0"
        >
          Clear
        </button>
      </Row>
    </div>
  );
}
