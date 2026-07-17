import type { CustomProvider } from "./providers";
import type { Agent, ChatMode } from "./agents";

export type Theme = "light" | "dark" | "system";
export type FontSize = "sm" | "md" | "lg";
export type Density = "compact" | "comfortable";
export type UiScale = "80" | "90" | "100" | "110" | "125" | "150";
export type SendKey = "enter" | "mod-enter";

export interface AppSettings {
  model: string;
  customProviders: CustomProvider[];
  customInstructions: string;
  contextLimit: number;
  theme: Theme;
  fontSize: FontSize;
  density: Density;
  uiScale: UiScale;
  showTimestamps: boolean;
  responseSound: boolean;
  notifyOnResponse: boolean;
  spellcheck: boolean;
  reduceMotion: boolean;
  websiteSync: boolean;
  sendKey: SendKey;
  chatMode: ChatMode;
  agents: Agent[];
  activeAgentId: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  model: "openai/gpt-oss-120b",
  customProviders: [],
  customInstructions: "",
  contextLimit: 20,
  theme: "light",
  fontSize: "md",
  density: "comfortable",
  uiScale: "100",
  showTimestamps: false,
  responseSound: false,
  notifyOnResponse: false,
  spellcheck: false,
  reduceMotion: false,
  websiteSync: true,
  sendKey: "enter",
  chatMode: "ask",
  agents: [],
  activeAgentId: null,
};

const KEY = "rofiant_settings";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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
