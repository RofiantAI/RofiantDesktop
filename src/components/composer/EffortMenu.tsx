import { useEffect, useRef, useState } from "react";
import { ChevronDown, Gauge } from "lucide-react";
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
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-lg border border-border bg-card shadow-lg p-3 z-10">
          <div className="text-[13px] text-foreground font-medium leading-tight mb-0.5">
            {EFFORT_LABELS[effort]}
          </div>
          <div className="text-[11px] text-foreground-muted leading-tight mb-2.5">
            {EFFORT_DESCRIPTIONS[effort]}
          </div>
          <input
            type="range"
            min={0}
            max={EFFORT_LEVELS.length - 1}
            step={1}
            value={EFFORT_LEVELS.indexOf(effort)}
            onChange={(e) => onEffortChange(EFFORT_LEVELS[Number(e.target.value)])}
            className="w-full accent-accent-primary cursor-pointer"
          />
          <div className="flex justify-between mt-1">
            {EFFORT_LEVELS.map((level) => (
              <span
                key={level}
                className={`text-[10px] ${
                  effort === level ? "text-foreground font-medium" : "text-foreground-muted"
                }`}
              >
                {EFFORT_LABELS[level]}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
