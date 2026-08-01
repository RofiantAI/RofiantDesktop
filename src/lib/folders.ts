import type { Folder } from "../types";

const KEY = "rofiant_folders";

export function loadFolders(): Folder[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveFolders(folders: Folder[]) {
  localStorage.setItem(KEY, JSON.stringify(folders));
}
