import { supabase } from "./supabase";

const APP_VERSION = "0.0.1";
const ANON_ID_KEY = "rofiant_telemetry_anon_id";

let enabled = true;
let userId: string | null = null;

export function setTelemetryEnabled(v: boolean) {
  enabled = v;
}

export function setTelemetryUserId(id: string | null) {
  userId = id;
}

function getAnonId(): string {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Mac")) return "macos";
  if (ua.includes("Win")) return "windows";
  if (ua.includes("Linux")) return "linux";
  return "unknown";
}

export function track(event: string, properties: Record<string, unknown> = {}): void {
  if (!enabled) return;
  void supabase
    .from("telemetry_events")
    .insert({
      anon_id: getAnonId(),
      user_id: userId,
      event,
      properties,
      app_version: APP_VERSION,
      platform: detectPlatform(),
    })
    .then(({ error }) => {
      if (error) console.error("telemetry: failed to send event", event, error);
    });
}
