export interface Agent {
  id: string;
  name: string;
  systemPrompt: string;
}

export type ChatMode = "ask" | "plan";

export const PLAN_MODE_INSTRUCTION =
  "Plan mode: do not perform the task yet. Respond only with a numbered, step-by-step plan " +
  "describing how you would approach it, and stop. Wait for the user to approve or adjust the " +
  "plan before doing any actual work.";
