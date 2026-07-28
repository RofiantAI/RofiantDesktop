import type { AppSettings } from "../../lib/settings";
import { Row, Toggle } from "./shared";

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
      <Row
        label="Share anonymous usage data"
        description="Helps us understand which features are used and fix bugs faster. On by default — turn off any time and no more data is sent."
      >
        <Toggle checked={settings.telemetryEnabled} onChange={(v) => onChange({ telemetryEnabled: v })} />
      </Row>
      <div className="mt-4 text-[12px] text-foreground-muted leading-relaxed">
        <div className="font-medium text-foreground-secondary mb-1">What's sent</div>
        <ul className="list-disc list-inside space-y-0.5">
          <li>App events: launches, new chats, messages sent, model changes</li>
          <li>A random device ID (not tied to your name or email)</li>
          <li>App version and OS</li>
        </ul>
        <div className="font-medium text-foreground-secondary mt-3 mb-1">What's never sent</div>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Conversation content or message text</li>
          <li>API keys or provider credentials</li>
          <li>File contents or file paths</li>
        </ul>
      </div>
    </div>
  );
}
