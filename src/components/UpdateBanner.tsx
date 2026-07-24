import { useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { Download, X } from "lucide-react";
import { installUpdate } from "../lib/updater";

export function UpdateBanner({ update, onDismiss }: { update: Update; onDismiss: () => void }) {
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    try {
      await installUpdate(update, (downloaded, total) => {
        if (total) setProgress(Math.round((downloaded / total) * 100));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setInstalling(false);
    }
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-border-light bg-background-secondary shadow-lg"
      style={{ animation: "toastIn 200ms ease-out" }}
    >
      <div className="flex items-start justify-between gap-2 px-3.5 pt-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Download className="w-3.5 h-3.5 text-accent-primary" />
          Update available
        </div>
        {!installing && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="flex items-center justify-center w-5 h-5 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="px-3.5 pt-1 pb-3 text-xs text-foreground-muted">
        {error
          ? `Update failed: ${error}`
          : installing
            ? `Downloading${progress ? ` (${progress}%)` : ""}...`
            : `Version ${update.version} is ready to install.`}
      </div>
      {!installing && (
        <div className="px-3.5 pb-3">
          <button
            type="button"
            onClick={handleInstall}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-accent-primary text-white text-sm hover:opacity-90 transition-opacity"
          >
            <Download className="w-3.5 h-3.5" />
            Update & Restart
          </button>
        </div>
      )}
      {installing && (
        <div className="px-3.5 pb-3">
          <div className="h-1 rounded-full bg-background-tertiary overflow-hidden">
            <div
              className="h-full bg-accent-primary transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
