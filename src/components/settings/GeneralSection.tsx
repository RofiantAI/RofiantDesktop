import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import type { Update } from "@tauri-apps/plugin-updater";
import { ExternalLink, Zap, RefreshCw } from "lucide-react";
import type { AppSettings, SendKey } from "../../lib/settings";
import { modShortcut } from "../../lib/platform";
import { Card, CardRow, SectionLabel, SegmentedControl, Toggle } from "./shared";

export function GeneralSection({
  settings,
  onChange,
  userEmail,
  isPro,
  onSignIn,
  onSignOut,
  onCheckForUpdate,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  userEmail: string | null;
  isPro: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onCheckForUpdate: () => Promise<Update | null>;
}) {
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "latest" | "available" | "error">(
    "idle",
  );

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch((err) => console.error("Failed to read app version:", err));
  }, []);

  async function handleCheckForUpdate() {
    setUpdateStatus("checking");
    try {
      const update = await onCheckForUpdate();
      setUpdateStatus(update ? "available" : "latest");
    } catch (err) {
      console.error("Update check failed:", err);
      setUpdateStatus("error");
    }
  }

  return (
    <div>
      <h1 className="text-[18px] font-bold mb-6">General</h1>

      <Card>
        <CardRow label="Rofiant Account" description={"Manage your account and billing"}>
          {userEmail ? (
            <button
              type="button"
              onClick={() => void openUrl("https://rofiant.ca/account")}
              className="flex items-center gap-1.5 h-7 px-3 rounded-md border border-border text-[12px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors"
            >
              Open
              <ExternalLink className="w-3 h-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="h-7 px-3 rounded-md bg-foreground text-background text-[12px] font-medium hover:opacity-90 transition-opacity"
            >
              Sign in
            </button>
          )}
        </CardRow>
        {!isPro && (
          <CardRow label="Upgrade to Pro" description="Entry-level plan with access to premium models and more">
            <button
              type="button"
              onClick={() => void openUrl("https://rofiant.ca/pricing")}
              className="flex items-center gap-1 h-7 px-3 rounded-md bg-accent-primary text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
            >
              <Zap className="w-3 h-3" />
              Upgrade
            </button>
          </CardRow>
        )}
      </Card>

      <SectionLabel>Updates</SectionLabel>
      <Card>
        <CardRow
          label={appVersion ? `Rofiant Desktop v${appVersion}` : "Rofiant Desktop"}
          description={
            updateStatus === "checking"
              ? "Checking for updates…"
              : updateStatus === "latest"
                ? "You're on the latest version."
                : updateStatus === "available"
                  ? "An update is available — see the banner above to install."
                  : updateStatus === "error"
                    ? "Couldn't check for updates. Try again later."
                    : "Check if a newer version is available"
          }
        >
          <button
            type="button"
            onClick={handleCheckForUpdate}
            disabled={updateStatus === "checking"}
            className="flex items-center gap-1.5 h-7 px-3 rounded-md border border-border text-[12px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
          >
            <RefreshCw className={`w-3 h-3 ${updateStatus === "checking" ? "animate-spin" : ""}`} />
            {updateStatus === "checking" ? "Checking…" : "Check for updates"}
          </button>
        </CardRow>
      </Card>

      <SectionLabel>Custom instructions</SectionLabel>
      <textarea
        value={settings.customInstructions}
        onChange={(e) => onChange({ customInstructions: e.target.value })}
        placeholder="e.g. Answer concisely. Prefer code over prose."
        rows={4}
        className="w-full px-3 py-2 rounded-lg bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light resize-none"
      />

      <SectionLabel>Messages</SectionLabel>
      <Card>
        <CardRow label="Context window" description={`Send the last ${settings.contextLimit} messages as context`}>
          <input
            type="range"
            min={4}
            max={50}
            step={2}
            value={settings.contextLimit}
            onChange={(e) => onChange({ contextLimit: Number(e.target.value) })}
            className="w-32 accent-foreground"
          />
        </CardRow>
        <CardRow
          label="Send message with"
          description={
            settings.sendKey === "mod-enter"
              ? "⌘/Ctrl+Enter sends, Enter adds a line break"
              : "Enter sends, Shift+Enter adds a line break"
          }
        >
          <SegmentedControl<SendKey>
            value={settings.sendKey}
            onChange={(v) => onChange({ sendKey: v })}
            options={[
              { value: "enter", label: "Enter" },
              { value: "mod-enter", label: modShortcut("⌘Enter") },
            ]}
          />
        </CardRow>
        <CardRow label="Spellcheck" description="Underline misspelled words while typing">
          <Toggle checked={settings.spellcheck} onChange={(v) => onChange({ spellcheck: v })} />
        </CardRow>
      </Card>

      <SectionLabel>Notifications</SectionLabel>
      <Card>
        <CardRow label="Sound on response" description="Play a tone when a reply finishes">
          <Toggle checked={settings.responseSound} onChange={(v) => onChange({ responseSound: v })} />
        </CardRow>
        <CardRow
          label="Desktop notifications"
          description="Notify when a reply finishes while the window is unfocused"
        >
          <Toggle checked={settings.notifyOnResponse} onChange={(v) => onChange({ notifyOnResponse: v })} />
        </CardRow>
      </Card>

      <SectionLabel>Window</SectionLabel>
      <Card>
        <CardRow
          label="Minimize to tray"
          description="Closing the window hides it to the system tray instead of quitting"
        >
          <Toggle checked={settings.minimizeToTray} onChange={(v) => onChange({ minimizeToTray: v })} />
        </CardRow>
      </Card>

      {userEmail && (
        <button
          type="button"
          onClick={onSignOut}
          className="mt-6 h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors"
        >
          Log Out
        </button>
      )}
    </div>
  );
}
