import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Cloud, HardDrive, Lock, Server, TriangleAlert } from "lucide-react";
import { ALL_MODELS, isLogfareModel, isProModel } from "../../lib/models";
import { customModelId, type CustomProvider } from "../../lib/providers";
import { getKiroAutoModel } from "../../lib/groq";
import { EASY_LOCAL_MODELS, OLLAMA_BASE_URL, listInstalledOllamaModels } from "../../lib/ollama";

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
  onSelectModel,
  onSelectLocalModel,
}: {
  model: string;
  isPro: boolean;
  customProviders: CustomProvider[];
  onSelectModel: (id: string) => void;
  onSelectLocalModel: (modelId: string) => void;
}) {
  const [modelOpen, setModelOpen] = useState(false);
  const [logfareTooltipRect, setLogfareTooltipRect] = useState<DOMRect | null>(null);
  const [kiroAutoModel, setKiroAutoModel] = useState<string | null>(null);
  const [installedLocalModels, setInstalledLocalModels] = useState<string[]>([]);
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
    listInstalledOllamaModels()
      .then(setInstalledLocalModels)
      .catch(() => setInstalledLocalModels([]));
  }, [modelOpen]);

  const activeModel = ALL_MODELS.find((m) => m.id === model);
  const activeCustomProvider = customProviders.find((p) => customModelId(p.id) === model);

  // Models pulled through Ollama (either via the Models settings tab or
  // outside the app entirely) don't need a saved CustomProvider to show up
  // here — only to actually be selected, which onSelectLocalModel handles.
  // Merge both into one "Local models" list rather than splitting them by
  // an implementation detail (whether they've been picked before) the user
  // has no reason to care about.
  const addedLocalProviders = customProviders.filter((p) => p.baseUrl === OLLAMA_BASE_URL);
  const addedLocalModelIds = new Set(addedLocalProviders.map((p) => p.model));
  const localRows = [
    ...addedLocalProviders.map((p) => ({
      key: p.id,
      name: p.name,
      subtitle: p.model,
      active: model === customModelId(p.id),
      onClick: () => onSelectModel(customModelId(p.id)),
    })),
    ...installedLocalModels
      .filter((id) => !addedLocalModelIds.has(id))
      .map((id) => ({
        key: id,
        name: EASY_LOCAL_MODELS.find((m) => m.id === id)?.name ?? id,
        subtitle: id,
        active: false,
        onClick: () => onSelectLocalModel(id),
      })),
  ];

  // Arbitrary OpenAI-compatible endpoints the user pointed at manually in
  // Settings → Providers — distinct from local Ollama models above, so they
  // get their own group instead of blending into "local".
  const remoteCustomProviders = customProviders.filter((p) => p.baseUrl !== OLLAMA_BASE_URL);

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
        <div className="absolute bottom-full left-0 mb-2 w-72 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1 z-10">
          {localRows.length > 0 && (
            <div>
              <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium text-foreground-muted uppercase tracking-wide">
                Local models
              </div>
              <div className="max-h-40 overflow-y-auto">
                {localRows.map((row) => (
                  <PickerRow
                    key={row.key}
                    icon={HardDrive}
                    name={row.name}
                    subtitle={row.subtitle}
                    active={row.active}
                    onClick={() => {
                      row.onClick();
                      setModelOpen(false);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {remoteCustomProviders.length > 0 && (
            <div>
              {localRows.length > 0 && <div className="my-1 border-t border-border" />}
              <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium text-foreground-muted uppercase tracking-wide">
                Custom providers
              </div>
              <div className="max-h-40 overflow-y-auto">
                {remoteCustomProviders.map((p) => {
                  const id = customModelId(p.id);
                  return (
                    <PickerRow
                      key={p.id}
                      icon={Server}
                      name={p.name}
                      subtitle={p.model}
                      active={model === id}
                      onClick={() => {
                        onSelectModel(id);
                        setModelOpen(false);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}
          <div>
            {(localRows.length > 0 || remoteCustomProviders.length > 0) && (
              <div className="my-1 border-t border-border" />
            )}
            <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium text-foreground-muted uppercase tracking-wide">
              Cloud models
            </div>
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
                          title="Free community-run inference — uptime isn't guaranteed and requests may fail"
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
