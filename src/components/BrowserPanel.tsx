import { useRef, useState } from "react";
import { RotateCw, ArrowRight, Globe } from "lucide-react";

const URL_KEY = "rofiant_browser_panel_url";
const DEFAULT_URL = "http://localhost:3000";
const QUICK_PORTS = [3000, 5173, 8080, 4200];

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (
    /^localhost(:\d+)?/i.test(trimmed) ||
    /^127\.0\.0\.1(:\d+)?/i.test(trimmed)
  ) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

export function BrowserPanel() {
  const [input, setInput] = useState(
    () => localStorage.getItem(URL_KEY) || DEFAULT_URL,
  );
  const [src, setSrc] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  function go(raw: string) {
    const normalized = normalizeUrl(raw);
    if (!normalized) return;
    setInput(normalized);
    localStorage.setItem(URL_KEY, normalized);
    if (normalized === src) {
      setReloadTick((n) => n + 1);
    } else {
      setSrc(normalized);
    }
  }

  function navigate() {
    go(input);
  }

  return (
    <div className="w-full h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border shrink-0">
        <button
          type="button"
          onClick={() => setReloadTick((n) => n + 1)}
          title="Reload"
          aria-label="Reload"
          className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors shrink-0"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate();
          }}
          spellCheck={false}
          placeholder="localhost:3000"
          className="flex-1 min-w-0 text-[12px] font-mono bg-background-tertiary rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-accent-primary"
        />
        <button
          type="button"
          onClick={navigate}
          title="Go"
          aria-label="Go"
          className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors shrink-0"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 bg-white">
        {src ? (
          <iframe
            ref={iframeRef}
            key={reloadTick}
            src={src}
            title="Browser preview"
            className="w-full h-full border-0"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-storage-access-by-user-activation"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center px-6 bg-background-secondary">
            <Globe className="w-6 h-6 text-foreground-muted opacity-50" />
            <div>
              <p className="text-[13px] text-foreground">No page loaded</p>
              <p className="text-[11px] text-foreground-muted mt-0.5">
                Enter a URL above, or jump to a local dev server:
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {QUICK_PORTS.map((port) => (
                <button
                  key={port}
                  type="button"
                  onClick={() => go(`localhost:${port}`)}
                  className="text-[11px] font-mono px-2 py-1 rounded-md bg-background-tertiary text-foreground-muted hover:text-foreground hover:bg-border transition-colors"
                >
                  :{port}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
