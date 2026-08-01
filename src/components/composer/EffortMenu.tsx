import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Gauge } from "lucide-react";
import { EFFORT_LEVELS, supportsEffort, type EffortLevel } from "../../lib/models";

const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const EFFORT_DESCRIPTIONS: Record<EffortLevel, string> = {
  low: "Fastest, least reasoning",
  medium: "Balanced speed and depth",
  high: "Slowest, most thorough reasoning",
};

const EFFORT_DOT_CLASS: Record<EffortLevel, string> = {
  low: "bg-foreground-muted",
  medium: "bg-accent-warning",
  high: "bg-accent-orange",
};

export function EffortMenu({
  effort,
  onEffortChange,
  model,
}: {
  effort: EffortLevel;
  onEffortChange: (effort: EffortLevel) => void;
  model: string;
}) {
  const [open, setOpen] = useState(false);
  const [justChanged, setJustChanged] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = supportsEffort(model);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setJustChanged(true);
    const timer = setTimeout(() => setJustChanged(false), 600);
    return () => clearTimeout(timer);
  }, [effort]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Reasoning effort: ${EFFORT_LABELS[effort]}${active ? "" : " (current model ignores this)"}`}
        aria-label="Reasoning effort"
        className={`flex items-center gap-1 text-[12px] transition-colors shrink-0 rounded px-1 -mx-1 ${
          justChanged
            ? "text-foreground bg-accent-primary/15"
            : "text-foreground-muted hover:text-foreground"
        }`}
      >
        <Gauge className="w-3.5 h-3.5" />
        {active && (
          <span
            className={`w-1.5 h-1.5 rounded-full ${EFFORT_DOT_CLASS[effort]} ${
              justChanged ? "scale-150" : ""
            } transition-transform`}
          />
        )}
        <span className={justChanged ? "font-medium" : ""}>{EFFORT_LABELS[effort]}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg border border-border bg-card shadow-lg py-1 px-0.5 z-10">
          {EFFORT_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => {
                onEffortChange(level);
                setOpen(false);
              }}
              className="w-[calc(100%-2px)] mx-px flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-background-tertiary rounded-md"
            >
              <span className="flex items-center gap-2">
                <Gauge className="w-3.5 h-3.5 text-foreground-muted" />
                <span>
                  <span className="block text-[13px] text-foreground font-medium leading-tight">
                    {EFFORT_LABELS[level]}
                  </span>
                  <span className="block text-[11px] text-foreground-muted leading-tight">
                    {EFFORT_DESCRIPTIONS[level]}
                  </span>
                </span>
              </span>
              {effort === level && <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
