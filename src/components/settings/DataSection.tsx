import { Download, RotateCcw, Trash2 } from "lucide-react";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import type { AppSettings } from "../../lib/settings";
import type { ConfirmFn } from "../ConfirmDialog";
import { Card, CardRow, SectionLabel } from "./shared";

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

      <SectionLabel>General</SectionLabel>
      <Card>
        <CardRow
          label="Export data"
          description="Download all conversations as a JSON file"
          icon={<Download className="w-3.5 h-3.5 text-foreground-muted" />}
        >
          <button
            type="button"
            onClick={onExportData}
            className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
          >
            Export
          </button>
        </CardRow>
        <CardRow
          label="Reset settings to defaults"
          description="Restore theme, font size, shortcuts behavior, etc. Conversations are kept."
          icon={<RotateCcw className="w-3.5 h-3.5 text-foreground-muted" />}
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
        </CardRow>
      </Card>

      <SectionLabel>Danger zone</SectionLabel>
      <Card>
        <CardRow
          label="Clear all chats"
          description="Permanently delete every conversation on this device"
          icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
        >
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
            className="h-8 px-3 rounded-lg bg-red-600 text-[13px] text-white hover:bg-red-700 transition-colors shrink-0"
          >
            Clear
          </button>
        </CardRow>
      </Card>
    </div>
  );
}
