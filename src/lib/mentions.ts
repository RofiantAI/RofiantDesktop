import { invoke } from "@tauri-apps/api/core";
import type { Agent } from "./agents";
import type { Conversation } from "../types";

export type MentionKind = "agent" | "conversation" | "file";

export interface MentionItem {
  kind: MentionKind;
  id: string;
  label: string;
  sublabel?: string;
  /** Absolute path, only set for kind "file". */
  path?: string;
  isDir?: boolean;
}

export interface MentionMatch {
  /** Index in the textarea value where the "@" trigger starts. */
  start: number;
  /** Text typed after "@", used for filtering. */
  query: string;
}

/**
 * Finds an active "@mention" trigger ending at the cursor, e.g. typing
 * "hey @jo" with the cursor at the end matches { start: 4, query: "jo" }.
 * Mirrors the slash-command detection but the trigger can appear mid-string.
 */
export function findMentionTrigger(
  value: string,
  cursor: number,
): MentionMatch | null {
  const upToCursor = value.slice(0, cursor);
  const at = upToCursor.lastIndexOf("@");
  if (at === -1) return null;
  const between = upToCursor.slice(at + 1);
  if (/\s/.test(between)) return null;
  if (at > 0 && !/\s/.test(value[at - 1])) return null;
  return { start: at, query: between };
}

export function matchAgents(agents: Agent[], query: string): MentionItem[] {
  const q = query.toLowerCase();
  return agents
    .filter((a) => a.name.toLowerCase().includes(q))
    .map((a) => ({ kind: "agent", id: a.id, label: a.name, sublabel: "Agent" }));
}

export function matchConversations(
  conversations: Conversation[],
  query: string,
  excludeId?: string,
): MentionItem[] {
  const q = query.toLowerCase();
  return conversations
    .filter((c) => c.id !== excludeId && c.title.toLowerCase().includes(q))
    .slice(0, 20)
    .map((c) => ({
      kind: "conversation",
      id: c.id,
      label: c.title || "Untitled",
      sublabel: "Conversation",
    }));
}

/**
 * Lists entries under `dirPath` (relative to the user's home directory, or
 * absolute). `dirPath` undefined/empty lists the home directory itself.
 */
export async function listMentionFiles(dirPath?: string): Promise<MentionItem[]> {
  try {
    const entries = await invoke<{ name: string; is_dir: boolean }[]>(
      "list_dir_entries",
      { path: dirPath || undefined },
    );
    return entries.map((e) => ({
      kind: "file",
      id: dirPath ? `${dirPath}/${e.name}` : e.name,
      label: e.name,
      sublabel: e.is_dir ? "Folder" : "File",
      path: dirPath ? `${dirPath}/${e.name}` : e.name,
      isDir: e.is_dir,
    }));
  } catch {
    return [];
  }
}

export function filterFilesByName(files: MentionItem[], query: string): MentionItem[] {
  if (!query) return files;
  const q = query.toLowerCase();
  return files.filter((f) => f.label.toLowerCase().includes(q));
}

export async function readMentionFile(path: string): Promise<string> {
  return invoke<string>("read_file_for_mention", { path });
}

/** Renders a resolved mention back into inline "@Label" text in the textarea. */
export function mentionToken(item: MentionItem): string {
  return `@${item.label}`;
}
