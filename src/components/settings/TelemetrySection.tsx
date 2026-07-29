import { Check, X, BarChart3 } from "lucide-react";
import type { AppSettings } from "../../lib/settings";
import { Card, CardRow, Toggle } from "./shared";

const SENT = [
  "App events: launches, new chats, messages sent, model changes",
  "A random device ID (not tied to your name or email)",
  "App version and OS",
];

const NEVER_SENT = ["Conversation content or message text", "API keys or provider credentials", "File contents or file paths"];

export function TelemetrySection({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <div>
      <h1 className="text-[18px] font-medium mb-6">Telemetry</h1>
      <Card>
        <CardRow
          label="Share anonymous usage data"
          description="Helps us understand which features are used and fix bugs faster. On by default. Turn it off any time and no more data is sent."
          icon={<BarChart3 className="w-3.5 h-3.5 text-foreground-muted" />}
        >
          <Toggle checked={settings.telemetryEnabled} onChange={(v) => onChange({ telemetryEnabled: v })} />
        </CardRow>
      </Card>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[12px] font-medium text-foreground-secondary mb-2.5">What's sent</div>
          <ul className="space-y-2">
            {SENT.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[12px] text-foreground-muted leading-relaxed">
                <Check className="w-3.5 h-3.5 text-accent-success shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[12px] font-medium text-foreground-secondary mb-2.5">What's never sent</div>
          <ul className="space-y-2">
            {NEVER_SENT.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[12px] text-foreground-muted leading-relaxed">
                <X className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
