import type { Conversation } from "../types";

const KEY = "rofiant_conversations";

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]) {
  localStorage.setItem(KEY, JSON.stringify(conversations));
}

const TABS_KEY = "rofiant_open_tabs";
const ACTIVE_KEY = "rofiant_active_id";

export function loadOpenTabIds(): string[] {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveOpenTabIds(ids: string[]) {
  localStorage.setItem(TABS_KEY, JSON.stringify(ids));
}

export function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function saveActiveId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}
