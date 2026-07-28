import { useState } from "react";
import { Plus, Users, Check, Trash2, X } from "lucide-react";
import type { Agent } from "../../lib/agents";
import type { AppSettings } from "../../lib/settings";
import type { ConfirmFn } from "../ConfirmDialog";

export function AgentsSection({
  settings,
  onChange,
  confirm,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  confirm: ConfirmFn;
}) {
  const [newAgent, setNewAgent] = useState({ name: "", systemPrompt: "" });
  const [addAgentOpen, setAddAgentOpen] = useState(false);

  function addAgent() {
    const name = newAgent.name.trim();
    const systemPrompt = newAgent.systemPrompt.trim();
    if (!name || !systemPrompt) return;
    const agent: Agent = { id: crypto.randomUUID(), name, systemPrompt };
    onChange({ agents: [...settings.agents, agent], activeAgentId: agent.id });
    setNewAgent({ name: "", systemPrompt: "" });
    setAddAgentOpen(false);
  }

  function removeAgentById(id: string) {
    const remaining = settings.agents.filter((a) => a.id !== id);
    const patch: Partial<AppSettings> = { agents: remaining };
    if (settings.activeAgentId === id) patch.activeAgentId = null;
    onChange(patch);
  }

  async function removeAgent(a: Agent) {
    const ok = await confirm({
      title: `Remove agent "${a.name}"?`,
      description: "This can't be undone.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) removeAgentById(a.id);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[18px] font-bold mb-2">Agents</h1>
          <p className="text-[13px] text-foreground-muted">
            Save custom system prompts as agents and switch between them without retyping instructions
            each time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddAgentOpen(true)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add agent
        </button>
      </div>

      {settings.agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-border py-8 mb-6">
          <Users className="w-5 h-5 text-foreground-muted mb-2" />
          <div className="text-[13px] text-foreground-secondary">No agents yet</div>
          <div className="text-[12px] text-foreground-muted mt-0.5">
            Add one to give the model a reusable persona or task-specific instructions.
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 mb-6">
          {settings.agents.map((a) => {
            const active = settings.activeAgentId === a.id;
            return (
              <div
                key={a.id}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${
                  active ? "border-accent-primary/40 bg-accent-primary/10" : "border-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onChange({ activeAgentId: active ? null : a.id, chatMode: "ask" })}
                  className="min-w-0 text-left flex-1"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm text-foreground font-medium truncate">{a.name}</span>
                    {active && <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
                  </span>
                  <span className="block text-xs text-foreground-muted truncate">{a.systemPrompt}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void removeAgent(a)}
                  title="Remove agent"
                  aria-label={`Remove agent "${a.name}"`}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-foreground-muted hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {addAgentOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 animate-[fadeIn_150ms_ease-out]"
          onClick={() => setAddAgentOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-border bg-background shadow-xl p-4 space-y-2.5 animate-[modalIn_180ms_ease-out]"
          >
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[13px] font-medium text-foreground">Add agent</div>
              <button
                type="button"
                onClick={() => setAddAgentOpen(false)}
                title="Close"
                aria-label="Close add agent dialog"
                className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              autoFocus
              value={newAgent.name}
              onChange={(e) => setNewAgent((s) => ({ ...s, name: e.target.value }))}
              placeholder="Name (e.g. Code reviewer)"
              className="w-full h-8 px-2.5 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light"
            />
            <textarea
              value={newAgent.systemPrompt}
              onChange={(e) => setNewAgent((s) => ({ ...s, systemPrompt: e.target.value }))}
              placeholder="System prompt (e.g. Review code for bugs and style issues. Be concise.)"
              rows={5}
              className="w-full px-2.5 py-2 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light resize-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAddAgentOpen(false)}
                className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addAgent}
                disabled={!newAgent.name.trim() || !newAgent.systemPrompt.trim()}
                className="h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                Add agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
