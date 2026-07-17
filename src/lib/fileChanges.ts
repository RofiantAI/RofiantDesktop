import type { FileChange } from "../types";

const KEY = "rofiant_file_changes";
const MAX_ENTRIES = 500;

export function loadFileChanges(): FileChange[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveFileChanges(changes: FileChange[]) {
  localStorage.setItem(KEY, JSON.stringify(changes.slice(-MAX_ENTRIES)));
}
