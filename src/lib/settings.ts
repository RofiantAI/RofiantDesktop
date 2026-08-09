import type { CustomProvider } from "./providers";
import type { Agent, ChatMode } from "./agents";
import type { McpServerConfig } from "./mcp";
import { DEFAULT_EFFORT, DEFAULT_MODEL, type EffortLevel } from "./models";

export type Theme = "light" | "dark" | "system";
export type UiStyle = "default" | "clay" | "glass";
export type FontSize = "sm" | "md" | "lg";
export type Density = "compact" | "comfortable";
export type UiScale = "80" | "90" | "100" | "110" | "125" | "150";
export type SendKey = "enter" | "mod-enter";

export interface AppSettings {
  model: string;
  reasoningEffort: EffortLevel;
  customProviders: CustomProvider[];
  customInstructions: string;
  contextLimit: number;
  theme: Theme;
  uiStyle: UiStyle;
  fontSize: FontSize;
  density: Density;
  uiScale: UiScale;
  showTimestamps: boolean;
  responseSound: boolean;
  notifyOnResponse: boolean;
  spellcheck: boolean;
  reduceMotion: boolean;
  sendKey: SendKey;
  chatMode: ChatMode;
  agents: Agent[];
  activeAgentId: string | null;
  telemetryEnabled: boolean;
  mcpServers: McpServerConfig[];
  minimizeToTray: boolean;
  widgetEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  model: DEFAULT_MODEL,
  reasoningEffort: DEFAULT_EFFORT,
  customProviders: [],
  customInstructions: "",
  contextLimit: 20,
  theme: "dark",
  uiStyle: "default",
  fontSize: "md",
  density: "comfortable",
  uiScale: "100",
  showTimestamps: false,
  responseSound: false,
  notifyOnResponse: false,
  spellcheck: false,
  reduceMotion: false,
  sendKey: "enter",
  chatMode: "ask",
  agents: [],
  activeAgentId: null,
  telemetryEnabled: true,
  mcpServers: [],
  minimizeToTray: false,
  widgetEnabled: true,
};

const KEY = "rofiant_settings";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    // "dark-classic" was folded into "dark" — migrate anyone who had it
    // explicitly selected so they don't silently fall back to light.
    if ((merged.theme as string) === "dark-classic") merged.theme = "dark";
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export function playDoneSound() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.3);
  } catch {
    // audio unsupported in this context; skip
  }
}

export async function notifyResponse(title: string, body: string) {
  if (document.hasFocus()) return;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title, body });
  } catch (err) {
    console.error("notifyResponse failed:", err);
  }
}
