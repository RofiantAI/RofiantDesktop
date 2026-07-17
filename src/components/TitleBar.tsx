import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Minus,
  Square,
  Copy,
  X,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";

const appWindow = getCurrentWindow();

export function TitleBar({
  sidebarOpen,
  onToggleSidebar,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="h-[32px] shrink-0 flex items-center bg-background-secondary border-b border-border select-none">
      <div
        data-tauri-drag-region
        className="flex-1 h-full flex items-center px-3 gap-2"
      >
        <img
          src="/beta.svg"
          alt="Rofiant"
          className="h-5 w-auto object-contain pointer-events-none"
        />
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          className="flex items-center justify-center w-5 h-5 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors"
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-3.5 h-3.5" />
          ) : (
            <PanelLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      <div className="flex items-center h-full shrink-0">
        <button
          type="button"
          onClick={() => appWindow.minimize()}
          aria-label="Minimize"
          className="flex items-center justify-center w-10 h-full text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => appWindow.toggleMaximize()}
          aria-label={maximized ? "Restore" : "Maximize"}
          className="flex items-center justify-center w-10 h-full text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors"
        >
          {maximized ? (
            <Copy className="w-3 h-3" />
          ) : (
            <Square className="w-3 h-3" />
          )}
        </button>
        <button
          type="button"
          onClick={() => appWindow.close()}
          aria-label="Close"
          className="flex items-center justify-center w-10 h-full text-foreground-muted hover:bg-red-500 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
