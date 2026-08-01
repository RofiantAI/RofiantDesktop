import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

interface PtyOutputPayload {
  id: string;
  data: string;
}

interface PtyExitPayload {
  id: string;
}

function readThemeVar(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function xtermTheme() {
  return {
    background: readThemeVar("--background-secondary", "#181818"),
    foreground: readThemeVar("--foreground", "#f5f5f4"),
    cursor: readThemeVar("--accent-primary", "#6b8afd"),
    selectionBackground: readThemeVar("--border-light", "#3f3f46"),
  };
}

export function TerminalPanel({ cwd }: { cwd?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const id = crypto.randomUUID();
    const term = new XTerm({
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      cursorBlink: true,
      theme: xtermTheme(),
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    invoke("pty_spawn", { id, cols: term.cols, rows: term.rows, cwd }).catch((e) => {
      term.writeln(`Failed to start terminal: ${e instanceof Error ? e.message : String(e)}`);
    });

    const dataDisposable = term.onData((data) => {
      invoke("pty_write", { id, data }).catch(() => {});
    });

    const unlistenOutput = listen<PtyOutputPayload>("pty-output", (event) => {
      if (event.payload.id === id) term.write(event.payload.data);
    });
    const unlistenExit = listen<PtyExitPayload>("pty-exit", (event) => {
      if (event.payload.id === id) term.write("\r\n[process exited]\r\n");
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      invoke("pty_resize", { id, cols: term.cols, rows: term.rows }).catch(() => {});
    });
    resizeObserver.observe(container);

    const themeObserver = new MutationObserver(() => {
      term.options.theme = xtermTheme();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      dataDisposable.dispose();
      unlistenOutput.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      invoke("pty_kill", { id }).catch(() => {});
      term.dispose();
    };
    // `cwd` is intentionally excluded: it should only ever apply to the shell
    // spawned on mount. The parent remounts this component (via a `key` tied
    // to cwd) when the active conversation's project changes, rather than
    // this effect re-running and orphaning the previous shell mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="w-full h-full min-h-0 px-2 py-1.5" />;
}
