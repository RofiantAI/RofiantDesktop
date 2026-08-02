import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  imageDataUrl?: string;
}

interface ChatChunkPayload {
  request_id: string;
  delta: string;
  replace: boolean;
}
interface ChatDonePayload {
  request_id: string;
}
interface ChatErrorPayload {
  request_id: string;
  message: string;
}
interface ChatUsagePayload {
  request_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}
interface ToolApprovalRequestPayload {
  requestId: string;
  approvalId: string;
  tool: string;
  summary: string;
}

export interface ToolApprovalRequest {
  approvalId: string;
  tool: string;
  summary: string;
}

export interface ChatUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
}

export async function generateTitle(text: string, accessToken: string): Promise<string | null> {
  try {
    const title = await invoke<string>("generate_title", { text, accessToken });
    return title.trim() || null;
  } catch (err) {
    console.error("generateTitle failed", err);
    return null;
  }
}

export function stopChatMessage(requestId: string): Promise<void> {
  return invoke("stop_chat", { requestId });
}

export function getKiroAutoModel(): Promise<string> {
  return invoke<string>("get_kiro_auto_model");
}

export function respondToolApproval(approvalId: string, approved: boolean): Promise<void> {
  return invoke("respond_tool_approval", { approvalId, approved });
}

export async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
  accessToken: string,
): Promise<string> {
  return invoke<string>("transcribe_audio", { audioBase64, mimeType, accessToken });
}

export async function sendChatMessage(
  messages: ChatMessage[],
  model: string,
  conversationId: string,
  accessToken: string,
  onDelta: (delta: string, replace?: boolean) => void,
  onUsage?: (usage: ChatUsage) => void,
  onRequestId?: (requestId: string) => void,
  provider?: ProviderConfig | null,
  onToolApproval?: (req: ToolApprovalRequest) => void,
  effort?: string | null,
  cwd?: string | null,
  isPro?: boolean,
): Promise<void> {
  const requestId = crypto.randomUUID();
  onRequestId?.(requestId);

  return new Promise((resolve, reject) => {
    const unlisten: Array<() => void> = [];
    const cleanup = () => unlisten.forEach((fn) => fn());

    Promise.all([
      listen<ChatChunkPayload>("chat-chunk", (event) => {
        if (event.payload.request_id === requestId) onDelta(event.payload.delta, event.payload.replace);
      }),
      listen<ChatDonePayload>("chat-done", (event) => {
        if (event.payload.request_id === requestId) {
          cleanup();
          resolve();
        }
      }),
      listen<ChatErrorPayload>("chat-error", (event) => {
        if (event.payload.request_id === requestId) {
          cleanup();
          reject(new Error(event.payload.message));
        }
      }),
      listen<ChatUsagePayload>("chat-usage", (event) => {
        if (event.payload.request_id === requestId) {
          onUsage?.({
            model: event.payload.model,
            inputTokens: event.payload.input_tokens,
            outputTokens: event.payload.output_tokens,
          });
        }
      }),
      listen<ToolApprovalRequestPayload>("tool-approval-request", (event) => {
        if (event.payload.requestId === requestId) {
          onToolApproval?.({
            approvalId: event.payload.approvalId,
            tool: event.payload.tool,
            summary: event.payload.summary,
          });
        }
      }),
    ]).then((fns) => {
      unlisten.push(...fns);
      invoke("send_chat", {
        requestId,
        conversationId,
        messages,
        model,
        accessToken,
        provider: provider ?? null,
        effort: effort ?? null,
        cwd: cwd ?? null,
        isPro: isPro ?? false,
      }).catch((err) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  });
}
