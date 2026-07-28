import type { AppSettings } from "../../lib/settings";
import { modShortcut } from "../../lib/platform";
import { Row } from "./shared";

function ShortcutGroup({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <>
      <div className="text-[11px] font-medium text-foreground-secondary uppercase tracking-wide mt-2 mb-1">
        {title}
      </div>
      <div className="mb-4">
        {rows.map(([label, keys]) => (
          <Row key={label} label={label}>
            <kbd className="px-2 py-1 rounded-md bg-background-tertiary border border-border text-[12px] text-foreground-secondary">
              {keys}
            </kbd>
          </Row>
        ))}
      </div>
    </>
  );
}

export function ShortcutsSection({ settings }: { settings: AppSettings }) {
  return (
    <div>
      <h1 className="text-[18px] font-bold mb-2">Shortcuts</h1>
      <ShortcutGroup
        title="Navigation"
        rows={[
          ["New chat", modShortcut("⌘N")],
          ["Go home", modShortcut("⌘H")],
          ["Command palette", modShortcut("⌘P")],
          ["Search chats", modShortcut("⌘K")],
          ["Toggle sidebar", modShortcut("⌘B")],
          ["Settings", modShortcut("⌘,")],
          ["View changed files", modShortcut("⌘Y")],
        ]}
      />
      <ShortcutGroup
        title="Tabs"
        rows={[
          ["Close tab", modShortcut("⌘W")],
          ["Next tab", modShortcut("⌘⇧]")],
          ["Previous tab", modShortcut("⌘⇧[")],
          ["Jump to tab 1-9", `${modShortcut("⌘1")} … ${modShortcut("⌘9")}`],
        ]}
      />
      <ShortcutGroup
        title="Messages"
        rows={[
          ["Send message", settings.sendKey === "mod-enter" ? modShortcut("⌘⏎") : "⏎"],
          ["New line", settings.sendKey === "mod-enter" ? "⏎" : "⇧⏎"],
          ["Stop generating / close dialog", "Esc"],
        ]}
      />
    </div>
  );
}
