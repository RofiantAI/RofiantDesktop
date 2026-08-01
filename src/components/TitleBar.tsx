import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {
  Minus,
  Square,
  Copy,
  X,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { isWindows, isMac } from "../lib/platform";

const appWindow = getCurrentWindow();

// Lets Windows 11 show its native Snap Layout flyout when hovering our
// custom-drawn maximize button, same as it would for a system caption
// button. No-ops (and is denied by capabilities) on non-Windows platforms.
function showSnapOverlay() {
  if (!isWindows) return;
  invoke("plugin:decorum|show_snap_overlay").catch(() => {});
}

// decorations:false suppresses native chrome on every OS, including
// macOS's traffic lights — without this, mac users would get the
// Windows-style caption buttons below instead of anything native-looking.
function MacTrafficLights() {
  return (
    <div className="flex items-center gap-2 pl-3 pr-1 h-full shrink-0 group/lights">
      <button
        type="button"
        onClick={() => appWindow.close()}
        aria-label="Close"
        className="w-3 h-3 rounded-full bg-[#ff5f57] flex items-center justify-center"
      >
        <X
          className="w-2 h-2 text-black/60 opacity-0 group-hover/lights:opacity-100"
          strokeWidth={3}
        />
      </button>
      <button
        type="button"
        onClick={() => appWindow.minimize()}
        aria-label="Minimize"
        className="w-3 h-3 rounded-full bg-[#febc2e] flex items-center justify-center"
      >
        <Minus
          className="w-2 h-2 text-black/60 opacity-0 group-hover/lights:opacity-100"
          strokeWidth={3}
        />
      </button>
      <button
        type="button"
        onClick={() => appWindow.toggleMaximize()}
        aria-label="Maximize"
        className="w-3 h-3 rounded-full bg-[#28c840] flex items-center justify-center"
      >
        <Square
          className="w-1.5 h-1.5 text-black/60 opacity-0 group-hover/lights:opacity-100"
          strokeWidth={3}
        />
      </button>
    </div>
  );
}

export function TitleBar({
  sidebarOpen,
  onToggleSidebar,
  maximized,
  rounded,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  maximized: boolean;
  rounded: boolean;
}) {
  return (
    <div
      // tauri-plugin-decorum's Windows overlay-titlebar script looks for this
      // marker on page load; without it, it assumes we have no titlebar of
      // our own and silently injects a full-width, fixed, z-index:100
      // invisible drag region on top of the whole bar — swallowing every
      // click on our minimize/maximize/close buttons before it reaches them.
      data-tauri-decorum-tb
      className={`h-[32px] shrink-0 flex items-center bg-background-secondary border-b border-border select-none overflow-hidden ${
        rounded ? "rounded-t-lg" : ""
      }`}
    >
      {isMac && <MacTrafficLights />}
      <div
        data-tauri-drag-region
        className="flex-1 h-full flex items-center px-3 gap-3"
      >
        <div className="flex items-center gap-1.5">
          <img
            src="/app-icon.svg"
            alt=""
            className="h-4 w-4 rounded-[5px] shrink-0 pointer-events-none"
          />
          <span className="text-[13px] font-medium text-foreground tracking-tight pointer-events-none">
            Rofiant
          </span>
          {/* <span className="px-1 py-px rounded text-[9px] font-semibold uppercase tracking-wider leading-none text-foreground-muted bg-background-tertiary border border-border pointer-events-none">
            Beta
          </span> */}
        </div>
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          className="flex items-center justify-center w-5 h-5 rounded-md text-foreground-muted hover:bg-background-tertiary hover:text-foreground transition-colors"
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-3.5 h-3.5" />
          ) : (
            <PanelLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      {!isMac && (
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
            onMouseEnter={showSnapOverlay}
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
      )}
    </div>
  );
}
