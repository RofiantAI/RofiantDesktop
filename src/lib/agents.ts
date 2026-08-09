export interface Agent {
  id: string;
  name: string;
  systemPrompt: string;
}

export type ChatMode = "ask" | "approve-for-me" | "full-access";
