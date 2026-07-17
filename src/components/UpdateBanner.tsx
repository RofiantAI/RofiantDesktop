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
    <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-accent/10 border-b border-accent/30 text-sm">
      <span className="text-foreground">
        {error
          ? `Update failed: ${error}`
          : installing
            ? `Downloading update${progress ? ` (${progress}%)` : ""}...`
            : `Version ${update.version} is available.`}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {!installing && (
          <button
            type="button"
            onClick={handleInstall}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
          >
            <Download className="w-3.5 h-3.5" />
            Update & Restart
          </button>
        )}
        {!installing && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
