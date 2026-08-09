export interface SlashCommandSpec {
  cmd: string;
  desc: string;
}

export const SLASH_COMMANDS: SlashCommandSpec[] = [
  { cmd: "/clear", desc: "Clear the current conversation" },
  { cmd: "/rule create", desc: "Add a rule for the AI to follow" },
  { cmd: "/rule list", desc: "List saved rules" },
  { cmd: "/rule remove", desc: "Remove a rule by number" },
  { cmd: "/help", desc: "List available commands" },
  { cmd: "/new", desc: "Start a new chat" },
  { cmd: "/rename", desc: "Rename the current chat" },
  { cmd: "/export", desc: "Export all conversations as JSON" },
];

export type SlashCommand =
  | { type: "clear" }
  | { type: "rule-create"; text: string }
  | { type: "rule-list" }
  | { type: "rule-remove"; target: string }
  | { type: "help" }
  | { type: "new" }
  | { type: "rename"; title: string }
  | { type: "export" }
  | { type: "unknown"; raw: string };

export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const body = trimmed.slice(1);
  const firstSpace = body.indexOf(" ");
  const cmd = firstSpace === -1 ? body : body.slice(0, firstSpace);
  const rest = firstSpace === -1 ? "" : body.slice(firstSpace + 1).trim();

  if (cmd === "clear") return { type: "clear" };
  if (cmd === "help") return { type: "help" };
  if (cmd === "new") return { type: "new" };
  if (cmd === "rename") return { type: "rename", title: rest };
  if (cmd === "export") return { type: "export" };

  if (cmd === "rule") {
    const secondSpace = rest.indexOf(" ");
    const sub = secondSpace === -1 ? rest : rest.slice(0, secondSpace);
    const subArg = secondSpace === -1 ? "" : rest.slice(secondSpace + 1).trim();
    if (sub === "create") return { type: "rule-create", text: subArg };
    if (sub === "list") return { type: "rule-list" };
    if (sub === "remove" || sub === "delete") return { type: "rule-remove", target: subArg };
    return { type: "unknown", raw: trimmed };
  }

  return { type: "unknown", raw: trimmed };
}
