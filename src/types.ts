export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
  imageDataUrl?: string;
  createdAt: number;
}

export type AgentStatus = "idle" | "running" | "done";

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  pinned?: boolean;
  status: AgentStatus;
  remoteId?: string;
}

export interface FileChange {
  id: string;
  conversationId: string;
  path: string;
  oldContent: string | null;
  newContent: string;
  createdAt: number;
}
