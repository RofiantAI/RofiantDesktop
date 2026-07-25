import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";

interface NewsItem {
  id: string;
  title: string;
  description: string;
}

const NEWS_ITEMS: NewsItem[] = [
  {
    id: "tool-call-approval",
    title: "Approve tool calls",
    description: "Review and approve tool calls before they run, right from the chat.",
  },
  {
    id: "model-failover",
    title: "Automatic model failover",
    description: "If a model errors out, Rofiant retries with a backup model automatically.",
  },
];

const STORAGE_KEY = "rofiant_dismissed_news";

function loadDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function SidebarNews() {
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  function dismiss(id: string) {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const items = NEWS_ITEMS.filter((item) => !dismissed.includes(item.id)).slice(0, 1);
  if (items.length === 0) return null;

  return (
    <div className="px-2 pb-2 pt-1 space-y-1.5 shrink-0">
      {items.map((item) => (
        <div
          key={item.id}
          className="relative rounded-lg border border-border bg-background-tertiary/50 px-2.5 py-2 pr-6"
        >
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
            <Sparkles className="w-3 h-3 text-accent-primary shrink-0" />
            {item.title}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-foreground-muted">{item.description}</p>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            title="Dismiss"
            className="absolute top-1.5 right-1.5 flex items-center justify-center w-4 h-4 rounded text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
