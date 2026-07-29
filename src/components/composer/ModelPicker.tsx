import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Cloud, HardDrive, Lock, Server, TriangleAlert } from "lucide-react";
import { ALL_MODELS, isLogfareModel, isProModel } from "../../lib/models";
import { customModelId, DMC_MODELS, isDmcProvider, type CustomProvider } from "../../lib/providers";
import { getKiroAutoModel } from "../../lib/groq";
import { EASY_LOCAL_MODELS, OLLAMA_BASE_URL, listInstalledOllamaModels } from "../../lib/ollama";

// Space the custom titlebar (32px tall, no clipping ancestor) needs kept
// clear above any upward-opening menu or flyout, plus a small buffer.
const TITLEBAR_HEIGHT = 32;
const TOP_GAP = 16;
const FLYOUT_WIDTH = 288; // w-72

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

// A category row in the top-level menu (e.g. "Local models") that reveals
// its actual model list in a flyout on hover, rather than dumping every
// model into one flat scrolling list — with many local/DMC/cloud models
// installed, that flat list could grow taller than the window itself and
// spill out past the top of the app, over the custom titlebar.
function GroupMenuItem({
  icon: Icon,
  label,
  activeLabel,
  children,
}: {
  icon: typeof Cloud;
  label: string;
  activeLabel?: string;
  children: ReactNode;
}) {
  const [flyout, setFlyout] = useState<{ maxHeight: number; side: "left" | "right" } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  function open() {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;
    setFlyout({
      maxHeight: Math.max(160, rect.bottom - TITLEBAR_HEIGHT - TOP_GAP),
      side: rect.right + FLYOUT_WIDTH > window.innerWidth ? "left" : "right",
    });
  }

  return (
    <div ref={rowRef} className="relative" onMouseEnter={open} onMouseLeave={() => setFlyout(null)}>
      <button
        type="button"
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-background-tertiary/60 transition-colors"
      >
        <Icon className="w-3.5 h-3.5 shrink-0 text-foreground-muted" />
        <span className="flex-1 text-[13px] text-foreground font-medium truncate">{label}</span>
        {activeLabel && (
          <span className="text-[11px] text-foreground-muted truncate max-w-[6.5rem]">{activeLabel}</span>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
      </button>
      {flyout && (
        <div
          className={`absolute bottom-0 ${
            flyout.side === "right" ? "left-full ml-1" : "right-full mr-1"
          } w-72 overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1 z-20`}
          style={{ maxHeight: flyout.maxHeight }}
        >
          {children}
        </div>
      )}
    </div>
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

  // DMC is a built-in gateway, not a user-added one — it gets its own
  // group, ordered to match DMC_MODELS rather than array/insertion order.
  const dmcRows = DMC_MODELS.map((m) => customProviders.find((p) => isDmcProvider(p) && p.model === m.id)).filter(
    (p): p is CustomProvider => p != null,
  );

  // Arbitrary OpenAI-compatible endpoints the user pointed at manually in
  // Settings → Providers — distinct from local Ollama models above, so they
  // get their own group instead of blending into "local".
  const remoteCustomProviders = customProviders.filter(
    (p) => p.baseUrl !== OLLAMA_BASE_URL && !isDmcProvider(p),
  );

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
        <div className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border border-border bg-card shadow-lg py-1 z-10">
          {localRows.length > 0 && (
            <GroupMenuItem icon={HardDrive} label="Local models" activeLabel={localRows.find((r) => r.active)?.name}>
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
            </GroupMenuItem>
          )}
          {dmcRows.length > 0 && (
            <>
              {localRows.length > 0 && <div className="my-1 border-t border-border" />}
              <GroupMenuItem
                icon={Cloud}
                label="DMC"
                activeLabel={dmcRows.find((p) => model === customModelId(p.id))?.model}
              >
                {dmcRows.map((p) => {
                  const id = customModelId(p.id);
                  return (
                    <PickerRow
                      key={p.id}
                      icon={Cloud}
                      name={p.model}
                      subtitle="via DMC Gateway"
                      active={model === id}
                      onClick={() => {
                        onSelectModel(id);
                        setModelOpen(false);
                      }}
                    />
                  );
                })}
              </GroupMenuItem>
            </>
          )}
          {remoteCustomProviders.length > 0 && (
            <>
              {(localRows.length > 0 || dmcRows.length > 0) && <div className="my-1 border-t border-border" />}
              <GroupMenuItem
                icon={Server}
                label="Custom providers"
                activeLabel={remoteCustomProviders.find((p) => model === customModelId(p.id))?.name}
              >
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
              </GroupMenuItem>
            </>
          )}
          {(localRows.length > 0 || dmcRows.length > 0 || remoteCustomProviders.length > 0) && (
            <div className="my-1 border-t border-border" />
          )}
          <GroupMenuItem
            icon={Cloud}
            label="Cloud models"
            activeLabel={ALL_MODELS.find((m) => (isPro || !isProModel(m.id)) && model === m.id)?.name}
          >
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
          </GroupMenuItem>
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
