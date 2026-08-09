// Some reasoning models (e.g. local/open models) emit literal <think>...</think>
// blocks in-band instead of a separate reasoning channel. Strip them so raw tags
// never reach the UI, clipboard, or get resent as conversation history.
export function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/^\s+/, "");
}
