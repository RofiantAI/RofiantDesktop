import { debug, error, warn } from "@tauri-apps/plugin-log";

function stringify(args: unknown[]) {
  return args
    .map((a) => (a instanceof Error ? (a.stack ?? a.message) : typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ");
}

// Mirrors console output into the Rust-side log plugin so it lands in the
// persisted log file (see tauri_plugin_log setup in src-tauri/src/lib.rs),
// without having to touch every console.* call site across the app.
export function initFileLogging() {
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args: unknown[]) => {
    original.log(...args);
    void debug(stringify(args));
  };
  console.warn = (...args: unknown[]) => {
    original.warn(...args);
    void warn(stringify(args));
  };
  console.error = (...args: unknown[]) => {
    original.error(...args);
    void error(stringify(args));
  };

  window.addEventListener("error", (e) => {
    void error(`Uncaught error: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason instanceof Error ? (e.reason.stack ?? e.reason.message) : String(e.reason);
    void error(`Unhandled promise rejection: ${reason}`);
  });
}
