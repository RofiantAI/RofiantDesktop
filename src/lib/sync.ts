import { supabase } from "./supabase";

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
