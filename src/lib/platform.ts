export const isWindows = navigator.userAgent.includes("Windows");
export const isMac = navigator.userAgent.includes("Mac");
export const isLinux = navigator.userAgent.includes("Linux") && !navigator.userAgent.includes("Android");

// Renders ⌘/⇧ combos as native Ctrl+/Shift+ text on non-mac platforms,
// since there's no Cmd key on Windows/Linux to show the symbol for.
export function modShortcut(combo: string): string {
  if (isMac) return combo;
  return combo.replace(/⌘/g, "Ctrl+").replace(/⇧/g, "Shift+");
}
