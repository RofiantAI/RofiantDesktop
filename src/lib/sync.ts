import { supabase } from "./supabase";
import type { Conversation, Message, Role } from "../types";

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

interface RemoteMessageRow {
  role: string;
  content: string;
  created_at: string;
  image_data_url: string | null;
}

interface RemoteConversationRow {
  id: string;
  title: string;
  updated_at: string;
  pinned: boolean | null;
  messages: RemoteMessageRow[];
}

export async function fetchRemoteConversations(userId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, updated_at, pinned, messages(role, content, created_at, image_data_url)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("sync: failed to fetch remote conversations", error);
    return [];
  }

  return (data as unknown as RemoteConversationRow[]).map((row) => {
    const messages: Message[] = [...row.messages]
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .map((m) => ({
        id: makeId(),
        role: m.role as Role,
        content: m.content,
        imageDataUrl: m.image_data_url ?? undefined,
        createdAt: Date.parse(m.created_at),
      }));

    return {
      id: row.id,
      remoteId: row.id,
      title: row.title,
      messages,
      updatedAt: Date.parse(row.updated_at),
      pinned: row.pinned ?? false,
      status: "idle",
    };
  });
}

export async function ensureRemoteConversation(
  userId: string,
  title: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title })
    .select("id")
    .single();

  if (error) {
    console.error("sync: failed to create remote conversation", error);
    return null;
  }
  return data.id as string;
}

export async function touchRemoteConversation(remoteId: string, title?: string): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title) patch.title = title;
  const { error } = await supabase.from("conversations").update(patch).eq("id", remoteId);
  if (error) console.error("sync: failed to update remote conversation", error);
}

export async function setRemotePinned(remoteId: string, pinned: boolean): Promise<void> {
  const { error } = await supabase.from("conversations").update({ pinned }).eq("id", remoteId);
  if (error) console.error("sync: failed to update pinned state", error);
}

export async function deleteRemoteConversation(remoteId: string): Promise<void> {
  const { error } = await supabase.from("conversations").delete().eq("id", remoteId);
  if (error) console.error("sync: failed to delete remote conversation", error);
}

export async function clearRemoteConversations(userId: string): Promise<void> {
  const { error } = await supabase.from("conversations").delete().eq("user_id", userId);
  if (error) console.error("sync: failed to clear remote conversations", error);
}

export async function insertRemoteMessage(
  remoteConversationId: string,
  role: "user" | "assistant",
  content: string,
  imageDataUrl?: string,
): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: remoteConversationId, role, content, image_data_url: imageDataUrl ?? null });
  if (error) console.error("sync: failed to insert remote message", error);
}

export async function insertUsageEvent(
  userId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const { error } = await supabase.from("usage_events").insert({
    user_id: userId,
    source: "desktop",
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  });
  if (error) console.error("sync: failed to insert usage event", error);
}
