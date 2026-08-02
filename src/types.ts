export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
  imageDataUrl?: string;
  createdAt: number;
  durationMs?: number;
}

export type AgentStatus = "idle" | "running" | "done";

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  pinned?: boolean;
  status: AgentStatus;
  folderId?: string;
  // Prompt/completion token counts from the most recent response — the
  // closest available proxy for how full the model's context window
  // currently is (the next turn's prompt will be at least this big).
  lastUsage?: { inputTokens: number; outputTokens: number };
  // Git repo root the user attached this conversation to, and the dedicated
  // worktree/branch created for it — see git_worktree_attach in lib.rs. All
  // optional: conversations without a project behave exactly as before.
  projectPath?: string;
  worktreePath?: string;
  branch?: string;
}

export interface FileChange {
  id: string;
  conversationId: string;
  path: string;
  oldContent: string | null;
  newContent: string;
  createdAt: number;
}
