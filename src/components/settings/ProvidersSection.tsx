import { useState } from "react";
import { Plug, Plus, Check, Trash2, X, Eye, EyeOff } from "lucide-react";
import { customModelId, type CustomProvider } from "../../lib/providers";
import type { AppSettings } from "../../lib/settings";
import type { ConfirmFn } from "../ConfirmDialog";
import { removeProviderFromSettings } from "./shared";

export function ProvidersSection({
  settings,
  onChange,
  confirm,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  confirm: ConfirmFn;
}) {
  const [newProvider, setNewProvider] = useState({ name: "", baseUrl: "", model: "", apiKey: "" });
  const [showApiKey, setShowApiKey] = useState(false);
  const [addProviderOpen, setAddProviderOpen] = useState(false);

  function addProvider() {
    const name = newProvider.name.trim();
    const baseUrl = newProvider.baseUrl.trim().replace(/\/+$/, "");
    const model = newProvider.model.trim();
    const apiKey = newProvider.apiKey.trim();
    if (!name || !baseUrl || !model || !apiKey || !/^https?:\/\//.test(baseUrl)) return;
    const provider: CustomProvider = { id: crypto.randomUUID(), name, baseUrl, model, apiKey };
    onChange({ customProviders: [...settings.customProviders, provider], model: customModelId(provider.id) });
    setNewProvider({ name: "", baseUrl: "", model: "", apiKey: "" });
    setShowApiKey(false);
    setAddProviderOpen(false);
  }

  async function removeProvider(id: string, name: string) {
    const ok = await confirm({
      title: `Remove provider "${name}"?`,
      description: "This can't be undone.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) removeProviderFromSettings(settings, onChange, id);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[18px] font-bold mb-2">Providers</h1>
          <p className="text-[13px] text-foreground-muted">
            Connect your own AI provider using an OpenAI-compatible API (OpenAI, OpenRouter, Together, a
            local Ollama server, etc). Your API key is sent directly to that provider and never touches
            Rofiant's servers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddProviderOpen(true)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add provider
        </button>
      </div>

      {settings.customProviders.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-border py-8 mb-6">
          <Plug className="w-5 h-5 text-foreground-muted mb-2" />
          <div className="text-[13px] text-foreground-secondary">No providers yet</div>
          <div className="text-[12px] text-foreground-muted mt-0.5">
            Add one to start chatting through your own API key.
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 mb-6">
          {settings.customProviders.map((p) => {
            const id = customModelId(p.id);
            const active = settings.model === id;
            return (
              <div
                key={p.id}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${
                  active ? "border-accent-primary/40 bg-accent-primary/10" : "border-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onChange({ model: id })}
                  className="min-w-0 text-left flex-1"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm text-foreground font-medium truncate">{p.name}</span>
                    {active && <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
                  </span>
                  <span className="block text-xs text-foreground-muted truncate">
                    {p.model} · {p.baseUrl}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void removeProvider(p.id, p.name)}
                  title="Remove provider"
                  aria-label={`Remove provider "${p.name}"`}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-foreground-muted hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {addProviderOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 animate-[fadeIn_150ms_ease-out]"
          onClick={() => setAddProviderOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-border bg-background shadow-xl p-4 space-y-2.5 animate-[modalIn_180ms_ease-out]"
          >
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[13px] font-medium text-foreground">Add provider</div>
              <button
                type="button"
                onClick={() => setAddProviderOpen(false)}
                title="Close"
                aria-label="Close add provider dialog"
                className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              autoFocus
              value={newProvider.name}
              onChange={(e) => setNewProvider((s) => ({ ...s, name: e.target.value }))}
              placeholder="Name (e.g. OpenAI)"
              className="w-full h-8 px-2.5 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light"
            />
            <input
              value={newProvider.baseUrl}
              onChange={(e) => setNewProvider((s) => ({ ...s, baseUrl: e.target.value }))}
              placeholder="Base URL (e.g. https://api.openai.com/v1)"
              className="w-full h-8 px-2.5 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light"
            />
            <input
              value={newProvider.model}
              onChange={(e) => setNewProvider((s) => ({ ...s, model: e.target.value }))}
              placeholder="Model (e.g. gpt-4o-mini)"
              className="w-full h-8 px-2.5 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light"
            />
            <div className="relative">
              <input
                value={newProvider.apiKey}
                onChange={(e) => setNewProvider((s) => ({ ...s, apiKey: e.target.value }))}
                placeholder="API key"
                type={showApiKey ? "text" : "password"}
                className="w-full h-8 pl-2.5 pr-8 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                title={showApiKey ? "Hide API key" : "Show API key"}
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground transition-colors"
              >
                {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAddProviderOpen(false)}
                className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addProvider}
                disabled={
                  !newProvider.name.trim() ||
                  !/^https?:\/\//.test(newProvider.baseUrl.trim()) ||
                  !newProvider.model.trim() ||
                  !newProvider.apiKey.trim()
                }
                className="h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                Add provider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
