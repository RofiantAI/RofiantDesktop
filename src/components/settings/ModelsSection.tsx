import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Box, Search, X, Check, Download, Loader2, Trash2 } from "lucide-react";
import { customModelId } from "../../lib/providers";
import type { AppSettings } from "../../lib/settings";
import {
  EASY_LOCAL_MODELS,
  OLLAMA_BASE_URL,
  deleteOllamaModel,
  installOllama,
  listInstalledOllamaModels,
  pullOllamaModel,
  upsertLocalModelProvider,
  type LocalModelDef,
} from "../../lib/ollama";
import type { ConfirmFn } from "../ConfirmDialog";
import { Dropdown, removeProviderFromSettings } from "./shared";

type SortKey = "recommended" | "name" | "size-asc" | "size-desc";

function sizeGb(size: string): number {
  const n = parseFloat(size);
  return Number.isFinite(n) ? n : 0;
}

export function ModelsSection({
  settings,
  onChange,
  confirm,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  confirm: ConfirmFn;
}) {
  const [installedLocalModels, setInstalledLocalModels] = useState<string[] | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [ollamaUnreachable, setOllamaUnreachable] = useState(false);
  const [installState, setInstallState] = useState<"idle" | "installing" | "launched" | "error">("idle");
  const [installError, setInstallError] = useState<string | null>(null);
  const [pullingModels, setPullingModels] = useState<Record<string, { status: string; pct: number | null }>>(
    {},
  );
  const [modelSearch, setModelSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("recommended");

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listInstalledOllamaModels()
      .then((names) => {
        if (cancelled) return;
        setInstalledLocalModels(names);
        setOllamaUnreachable(false);
      })
      .catch(() => {
        if (cancelled) return;
        setInstalledLocalModels(null);
        setOllamaUnreachable(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function findLocalProvider(m: LocalModelDef) {
    return settings.customProviders.find((p) => p.baseUrl === OLLAMA_BASE_URL && p.model === m.id);
  }

  async function downloadLocalModel(m: LocalModelDef) {
    setPullingModels((prev) => ({ ...prev, [m.id]: { status: "starting", pct: null } }));
    try {
      await pullOllamaModel(m.id, (progress) => {
        const pct =
          progress.total && progress.completed
            ? Math.round((progress.completed / progress.total) * 100)
            : null;
        setPullingModels((prev) => ({ ...prev, [m.id]: { status: progress.status, pct } }));
      });
      setInstalledLocalModels((prev) => [...(prev ?? []), m.id]);
    } catch (err) {
      setOllamaUnreachable(true);
      console.error("Ollama pull failed:", err);
    } finally {
      setPullingModels((prev) => {
        const next = { ...prev };
        delete next[m.id];
        return next;
      });
    }
  }

  async function handleInstallOllama() {
    setInstallState("installing");
    setInstallError(null);
    try {
      await installOllama();
      if (!mountedRef.current) return;
      setInstallState("launched");
    } catch (err) {
      if (!mountedRef.current) return;
      setInstallError(err instanceof Error ? err.message : String(err));
      setInstallState("error");
    }
  }

  function selectLocalModel(m: LocalModelDef) {
    const { customProviders, providerId } = upsertLocalModelProvider(settings.customProviders, m.id, m.name);
    onChange({ customProviders, model: customModelId(providerId) });
  }

  async function removeLocalModel(m: LocalModelDef) {
    if (deletingModelId) return;
    const ok = await confirm({
      title: `Delete "${m.name}" from disk?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setDeletingModelId(m.id);
    try {
      await deleteOllamaModel(m.id);
      setInstalledLocalModels((prev) => (prev ?? []).filter((n) => n !== m.id));
      const provider = findLocalProvider(m);
      if (provider) removeProviderFromSettings(settings, onChange, provider.id);
    } catch (err) {
      console.error("Ollama delete failed:", err);
    } finally {
      setDeletingModelId(null);
    }
  }

  const q = modelSearch.trim().toLowerCase();
  const filtered = q
    ? EASY_LOCAL_MODELS.filter(
        (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q),
      )
    : EASY_LOCAL_MODELS;
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return a.name.localeCompare(b.name);
      case "size-asc":
        return sizeGb(a.size) - sizeGb(b.size);
      case "size-desc":
        return sizeGb(b.size) - sizeGb(a.size);
      default:
        return 0;
    }
  });

  return (
    <div>
      <h1 className="text-[18px] font-bold mb-2">Models</h1>
      <p className="text-[13px] text-foreground-muted mb-6">
        Download small open models to run locally through{" "}
        <button
          type="button"
          onClick={() => void openUrl("https://ollama.com")}
          className="underline hover:text-foreground"
        >
          Ollama
        </button>
        . Nothing leaves your machine and no API key is needed.
      </p>

      {ollamaUnreachable && (
        <div className="flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-border py-8 mb-6 px-6">
          <Box className="w-5 h-5 text-foreground-muted mb-2" />
          <div className="text-[13px] text-foreground-secondary">Can't reach Ollama</div>

          {installState === "launched" ? (
            <div className="text-[12px] text-foreground-muted mt-0.5 max-w-xs">
              Installer opened. Finish the steps there, then reopen this tab.
            </div>
          ) : (
            <>
              <div className="text-[12px] text-foreground-muted mt-0.5 max-w-xs">
                Ollama isn't installed, or isn't running.
              </div>
              <button
                type="button"
                onClick={() => void handleInstallOllama()}
                disabled={installState === "installing"}
                className="flex items-center gap-1.5 h-8 px-3 mt-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {installState === "installing" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {installState === "installing" ? "Downloading installer…" : "Install Ollama"}
              </button>
              {installState === "error" && (
                <div className="text-[12px] text-red-500 mt-2 max-w-xs">{installError}</div>
              )}
              <button
                type="button"
                onClick={() => void openUrl("https://ollama.com")}
                className="text-[12px] text-foreground-muted underline hover:text-foreground mt-2"
              >
                or download it manually
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
          <input
            type="text"
            value={modelSearch}
            onChange={(e) => setModelSearch(e.target.value)}
            placeholder="Search models…"
            className="w-full h-8 pl-8 pr-8 rounded-lg border border-border bg-background-secondary text-[13px] text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-accent-primary/50"
          />
          {modelSearch && (
            <button
              type="button"
              onClick={() => setModelSearch("")}
              title="Clear search"
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4 text-foreground-muted hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Dropdown<SortKey>
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: "recommended", label: "Recommended" },
            { value: "name", label: "Name (A–Z)" },
            { value: "size-asc", label: "Size (small first)" },
            { value: "size-desc", label: "Size (large first)" },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-[13px] text-foreground-muted py-8">
          No models match "{modelSearch}"
        </div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((m) => {
            const installed = installedLocalModels?.includes(m.id) ?? false;
            const localProvider = findLocalProvider(m);
            const active = localProvider ? customModelId(localProvider.id) === settings.model : false;
            const progress = pullingModels[m.id];
            return (
              <div
                key={m.id}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border ${
                  active ? "border-accent-primary/40 bg-accent-primary/10" : "border-border"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-foreground font-medium">{m.name}</span>
                    <span className="text-[11px] text-foreground-muted">{m.size}</span>
                    {active && <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
                  </div>
                  <div className="text-xs text-foreground-muted">{m.desc}</div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {progress ? (
                    <span className="text-[12px] text-foreground-muted w-16 text-right">
                      {progress.pct != null ? `${progress.pct}%` : progress.status}
                    </span>
                  ) : installed ? (
                    <>
                      {!active && (
                        <button
                          type="button"
                          onClick={() => selectLocalModel(m)}
                          className="h-7 px-2.5 rounded-md bg-foreground text-background text-[12px] font-medium hover:opacity-90 transition-opacity"
                        >
                          Use
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void removeLocalModel(m)}
                        disabled={deletingModelId !== null}
                        title="Delete from disk"
                        aria-label={`Delete "${m.name}" from disk`}
                        className="flex items-center justify-center w-7 h-7 rounded-md text-foreground-muted hover:text-red-600 hover:bg-red-500/10 transition-colors shrink-0 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {deletingModelId === m.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void downloadLocalModel(m)}
                      disabled={installedLocalModels === null}
                      className="flex items-center gap-1 h-7 px-2.5 rounded-md border border-border text-[12px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
