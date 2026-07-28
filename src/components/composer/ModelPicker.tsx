import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Lock, TriangleAlert } from "lucide-react";
import { ALL_MODELS, isLogfareModel, isProModel } from "../../lib/models";
import { customModelId, type CustomProvider } from "../../lib/providers";
import { getKiroAutoModel } from "../../lib/groq";

export function ModelPicker({
  model,
  isPro,
  customProviders,
  onSelectModel,
}: {
  model: string;
  isPro: boolean;
  customProviders: CustomProvider[];
  onSelectModel: (id: string) => void;
}) {
  const [modelOpen, setModelOpen] = useState(false);
  const [logfareTooltipRect, setLogfareTooltipRect] = useState<DOMRect | null>(null);
  const [kiroAutoModel, setKiroAutoModel] = useState<string | null>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelOpen) return;
    function handleClick(e: MouseEvent) {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modelOpen]);

  useEffect(() => {
    if (!modelOpen) {
      setLogfareTooltipRect(null);
      return;
    }
    getKiroAutoModel()
      .then(setKiroAutoModel)
      .catch(() => setKiroAutoModel(null));
  }, [modelOpen]);

  const activeModel = ALL_MODELS.find((m) => m.id === model);
  const activeCustomProvider = customProviders.find((p) => customModelId(p.id) === model);

  return (
    <div className="relative" ref={modelRef}>
      <button
        type="button"
        onClick={() => setModelOpen((v) => !v)}
        className="flex items-center gap-1 text-[12px] text-foreground-muted hover:text-foreground transition-colors"
      >
        {activeModel?.name ?? activeCustomProvider?.name ?? "Select model"}
        <ChevronDown className="w-3 h-3" />
      </button>
      {modelOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1 z-10">
          {customProviders.length > 0 && (
            <div className="max-h-40 overflow-y-auto">
              {customProviders.map((p) => {
                const id = customModelId(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelectModel(id);
                      setModelOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-background-tertiary"
                  >
                    <span>
                      <span className="text-[13px] text-foreground font-medium">{p.name}</span>
                      <span className="block text-[11px] text-foreground-muted">{p.model}</span>
                    </span>
                    {model === id && <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
                  </button>
                );
              })}
              <div className="my-1 border-t border-border" />
            </div>
          )}
          {ALL_MODELS.map((m) => {
            const locked = !isPro && isProModel(m.id);
            return (
              <button
                key={m.id}
                type="button"
                disabled={locked}
                onClick={() => {
                  onSelectModel(m.id);
                  setModelOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
                  locked ? "opacity-60 cursor-not-allowed" : "hover:bg-background-tertiary"
                }`}
              >
                <span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] text-foreground font-medium">{m.name}</span>
                    {locked && (
                      <span className="flex items-center gap-0.5 text-[10px] font-medium text-foreground-muted bg-background-tertiary border border-border rounded px-1 py-0.5">
                        <Lock className="w-2.5 h-2.5" />
                        Pro
                      </span>
                    )}
                    {isLogfareModel(m.id) && (
                      <span
                        title="Free community-run inference — uptime isn't guaranteed and requests may fail"
                        onMouseEnter={(e) => setLogfareTooltipRect(e.currentTarget.getBoundingClientRect())}
                        onMouseLeave={() => setLogfareTooltipRect(null)}
                        className="flex items-center gap-0.5 text-[10px] font-medium text-accent-warning bg-accent-warning/10 border border-accent-warning/30 rounded px-1 py-0.5"
                      >
                        <TriangleAlert className="w-2.5 h-2.5" />
                        Unstable
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-foreground-muted">
                    {isLogfareModel(m.id) && kiroAutoModel ? `Currently routing to ${kiroAutoModel}` : m.desc}
                  </span>
                </span>
                {!locked && model === m.id && <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
      {logfareTooltipRect && (
        <div
          role="tooltip"
          style={{
            position: "fixed",
            top: logfareTooltipRect.top - 8,
            left: logfareTooltipRect.left + logfareTooltipRect.width / 2,
            transform: "translate(-50%, -100%)",
          }}
          className="z-50 w-56 pointer-events-none rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-normal normal-case leading-snug text-foreground-secondary shadow-lg"
        >
          Free, community-run inference with no uptime guarantee — this model can be slow, rate-limited,
          or fail outright.
        </div>
      )}
    </div>
  );
}
