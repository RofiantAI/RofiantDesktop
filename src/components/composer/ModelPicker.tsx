import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Cloud, HardDrive, Lock, TriangleAlert } from "lucide-react";
import { ALL_MODELS, DMC_MODELS, isLogfareModel, isProModel } from "../../lib/models";
import { customModelId, type CustomProvider } from "../../lib/providers";
import { EASY_LOCAL_MODELS, listInstalledOllamaModels, OLLAMA_BASE_URL } from "../../lib/ollama";
import { getKiroAutoModel } from "../../lib/groq";

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-foreground-muted">{children}</div>
  );
}

function PickerRow({
  icon: Icon,
  name,
  subtitle,
  active,
  disabled,
  badge,
  onClick,
}: {
  icon: typeof Cloud;
  name: string;
  subtitle: string;
  active: boolean;
  disabled?: boolean;
  badge?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-start gap-2.5 px-3 py-2 text-left border-l-2 transition-colors ${
        disabled
          ? "opacity-60 cursor-not-allowed border-transparent"
          : active
            ? "bg-background-tertiary border-accent-primary"
            : "border-transparent hover:bg-background-tertiary/60"
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 text-foreground-muted mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] text-foreground font-medium truncate">{name}</span>
          {badge}
        </span>
        <span className="block text-[11px] text-foreground-muted truncate">{subtitle}</span>
      </span>
      {active && <Check className="w-3.5 h-3.5 text-accent-primary shrink-0 mt-0.5" />}
    </button>
  );
}

export function ModelPicker({
  model,
  isPro,
  customProviders,
  source,
  onSelectModel,
  onSelectLocalModel,
}: {
  model: string;
  isPro: boolean;
  customProviders: CustomProvider[];
  source: "cloud" | "local";
  onSelectModel: (id: string) => void;
  onSelectLocalModel: (id: string, name: string) => void;
}) {
  const [modelOpen, setModelOpen] = useState(false);
  const [logfareTooltipRect, setLogfareTooltipRect] = useState<DOMRect | null>(null);
  const [kiroAutoModel, setKiroAutoModel] = useState<string | null>(null);
  const [installedLocalModels, setInstalledLocalModels] = useState<string[] | null>(null);
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

  useEffect(() => {
    if (!modelOpen || source !== "local") return;
    listInstalledOllamaModels()
      .then(setInstalledLocalModels)
      .catch(() => setInstalledLocalModels(null));
  }, [modelOpen, source]);

  const activeModel = ALL_MODELS.find((m) => m.id === model) ?? DMC_MODELS.find((m) => m.id === model);
  const activeCustomProvider = customProviders.find((p) => customModelId(p.id) === model);

  return (
    <div className="relative min-w-0" ref={modelRef}>
      <button
        type="button"
        onClick={() => setModelOpen((v) => !v)}
        className="flex items-center gap-1 min-w-0 max-w-full text-[12px] text-foreground-muted hover:text-foreground transition-colors"
      >
        <span className="truncate">
          {activeModel?.name ?? activeCustomProvider?.name ?? "Select model"}
        </span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </button>
      {modelOpen && source === "cloud" && (
        <div className="absolute bottom-full left-0 mb-2 w-72 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1 z-10">
          {DMC_MODELS.length > 0 && (
            <>
              <SectionLabel>DMC</SectionLabel>
              {DMC_MODELS.map((m) => (
                <PickerRow
                  key={m.id}
                  icon={Cloud}
                  name={m.name}
                  subtitle="via DMC Gateway"
                  active={model === m.id}
                  onClick={() => {
                    onSelectModel(m.id);
                    setModelOpen(false);
                  }}
                />
              ))}
              <div className="my-1 border-t border-border" />
            </>
          )}
          <SectionLabel>Cloud models</SectionLabel>
          {ALL_MODELS.map((m) => {
            const locked = !isPro && isProModel(m.id);
            return (
              <PickerRow
                key={m.id}
                icon={Cloud}
                name={m.name}
                subtitle={
                  isLogfareModel(m.id) && kiroAutoModel ? `Currently routing to ${kiroAutoModel}` : m.desc
                }
                active={!locked && model === m.id}
                disabled={locked}
                onClick={() => {
                  onSelectModel(m.id);
                  setModelOpen(false);
                }}
                badge={
                  <>
                    {locked && (
                      <span className="flex items-center gap-0.5 text-[10px] font-medium text-foreground-muted bg-background-tertiary border border-border rounded px-1 py-0.5">
                        <Lock className="w-2.5 h-2.5" />
                        Pro
                      </span>
                    )}
                    {isLogfareModel(m.id) && (
                      <span
                        title="Free community-run inference. Uptime isn't guaranteed and requests may fail."
                        onMouseEnter={(e) => setLogfareTooltipRect(e.currentTarget.getBoundingClientRect())}
                        onMouseLeave={() => setLogfareTooltipRect(null)}
                        className="flex items-center gap-0.5 text-[10px] font-medium text-accent-warning bg-accent-warning/10 border border-accent-warning/30 rounded px-1 py-0.5"
                      >
                        <TriangleAlert className="w-2.5 h-2.5" />
                        Unstable
                      </span>
                    )}
                  </>
                }
              />
            );
          })}
        </div>
      )}
      {modelOpen && source === "local" && (
        <div className="absolute bottom-full left-0 mb-2 w-72 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1 z-10">
          <SectionLabel>Local models</SectionLabel>
          {installedLocalModels === null ? (
            <div className="px-3 py-2 text-[12px] text-foreground-muted">
              Can't reach Ollama. Is it running?
            </div>
          ) : installedLocalModels.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-foreground-muted">
              No local models installed. Add one in Settings → Models.
            </div>
          ) : (
            installedLocalModels.map((modelId) => {
              const name = EASY_LOCAL_MODELS.find((m) => m.id === modelId)?.name ?? modelId;
              const provider = customProviders.find(
                (p) => p.baseUrl === OLLAMA_BASE_URL && p.model === modelId,
              );
              const active = provider ? model === customModelId(provider.id) : false;
              return (
                <PickerRow
                  key={modelId}
                  icon={HardDrive}
                  name={name}
                  subtitle={modelId}
                  active={active}
                  onClick={() => {
                    onSelectLocalModel(modelId, name);
                    setModelOpen(false);
                  }}
                />
              );
            })
          )}
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
