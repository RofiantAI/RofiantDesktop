import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

export interface CommandItem {
  id: string;
  label: string;
  subtitle?: string;
  icon?: typeof Search;
  shortcut?: string;
  onRun: () => void;
}

export function CommandPalette({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) || item.subtitle?.toLowerCase().includes(q),
    );
  }, [items, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  function run(item: CommandItem) {
    onClose();
    item.onRun();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) run(item);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[560px] max-w-[90vw] rounded-xl bg-card border border-border shadow-2xl overflow-hidden"
        onKeyDown={onKeyDown}
      >
        <div className="relative border-b border-border">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted pointer-events-none" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="w-full h-12 pl-10 pr-4 bg-transparent text-sm text-foreground placeholder:text-foreground-muted outline-none"
          />
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-foreground-muted">
              No matching commands
            </div>
          ) : (
            filtered.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-index={i}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => run(item)}
                  className={`flex items-center gap-2.5 w-full h-9 px-3 text-left text-sm transition-colors ${
                    i === activeIndex
                      ? "bg-background-tertiary text-foreground"
                      : "text-foreground-secondary"
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5 shrink-0 text-foreground-muted" />}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.subtitle && (
                    <span className="text-xs text-foreground-muted truncate">{item.subtitle}</span>
                  )}
                  {item.shortcut && (
                    <kbd className="text-[12px] text-foreground-muted shrink-0">{item.shortcut}</kbd>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
