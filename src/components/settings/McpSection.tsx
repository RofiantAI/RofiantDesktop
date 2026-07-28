import { useEffect, useState } from "react";
import { Plus, Cable, Loader2, CircleCheck, CircleAlert, Trash2, X } from "lucide-react";
import { connectMcpServer, disconnectMcpServer, type McpServerConfig, type McpToolInfo } from "../../lib/mcp";
import type { AppSettings } from "../../lib/settings";
import type { ConfirmFn } from "../ConfirmDialog";
import { Toggle } from "./shared";

type McpStatus =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "connected"; tools: McpToolInfo[] }
  | { status: "error"; error: string };

export function McpSection({
  settings,
  onChange,
  confirm,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  confirm: ConfirmFn;
}) {
  const [mcpStatus, setMcpStatus] = useState<Record<string, McpStatus>>({});
  const [addMcpOpen, setAddMcpOpen] = useState(false);
  const [newMcpServer, setNewMcpServer] = useState({ name: "", commandLine: "", envText: "" });

  async function connectMcp(server: McpServerConfig) {
    setMcpStatus((s) => ({ ...s, [server.id]: { status: "connecting" } }));
    try {
      const tools = await connectMcpServer(server);
      setMcpStatus((s) => ({ ...s, [server.id]: { status: "connected", tools } }));
    } catch (err) {
      setMcpStatus((s) => ({
        ...s,
        [server.id]: { status: "error", error: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  function toggleMcpServer(server: McpServerConfig) {
    const enabled = !server.enabled;
    const next = settings.mcpServers.map((s) => (s.id === server.id ? { ...s, enabled } : s));
    onChange({ mcpServers: next });
    if (enabled) {
      void connectMcp({ ...server, enabled });
    } else {
      void disconnectMcpServer(server.id);
      setMcpStatus((s) => ({ ...s, [server.id]: { status: "idle" } }));
    }
  }

  useEffect(() => {
    for (const server of settings.mcpServers) {
      if (server.enabled && !mcpStatus[server.id]) void connectMcp(server);
    }
    // Only re-run when the server list changes, not on every mcpStatus
    // update — a fresh "connecting" write would immediately re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mcpServers]);

  async function removeMcpServer(server: McpServerConfig) {
    const ok = await confirm({
      title: `Remove MCP server "${server.name}"?`,
      description: "This can't be undone.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    if (server.enabled) void disconnectMcpServer(server.id);
    onChange({ mcpServers: settings.mcpServers.filter((s) => s.id !== server.id) });
    setMcpStatus((s) => {
      const next = { ...s };
      delete next[server.id];
      return next;
    });
  }

  function addMcpServer() {
    const name = newMcpServer.name.trim();
    const parts = newMcpServer.commandLine.trim().split(/\s+/).filter(Boolean);
    if (!name || parts.length === 0) return;
    const [command, ...args] = parts;
    const env: Record<string, string> = {};
    for (const line of newMcpServer.envText.split("\n")) {
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    const server: McpServerConfig = { id: crypto.randomUUID(), name, command, args, env, enabled: true };
    onChange({ mcpServers: [...settings.mcpServers, server] });
    void connectMcp(server);
    setNewMcpServer({ name: "", commandLine: "", envText: "" });
    setAddMcpOpen(false);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[18px] font-bold mb-2">MCP Servers</h1>
          <p className="text-[13px] text-foreground-muted">
            Connect Model Context Protocol servers to give the assistant more tools (a filesystem,
            database, or Git server, etc). Each one runs locally as a command you provide — never touches
            Rofiant's servers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddMcpOpen(true)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add server
        </button>
      </div>

      {settings.mcpServers.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-border py-8 mb-6">
          <Cable className="w-5 h-5 text-foreground-muted mb-2" />
          <div className="text-[13px] text-foreground-secondary">No MCP servers yet</div>
          <div className="text-[12px] text-foreground-muted mt-0.5">
            Add one to give the assistant extra tools.
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 mb-6">
          {settings.mcpServers.map((server) => {
            const status = mcpStatus[server.id] ?? { status: "idle" as const };
            return (
              <div key={server.id} className="w-full rounded-lg border border-border px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-foreground font-medium truncate">{server.name}</span>
                      {server.enabled && status.status === "connecting" && (
                        <Loader2 className="w-3 h-3 text-foreground-muted animate-spin shrink-0" />
                      )}
                      {server.enabled && status.status === "connected" && (
                        <span className="flex items-center gap-1 text-[11px] text-accent-success shrink-0">
                          <CircleCheck className="w-3 h-3" />
                          {status.tools.length} tool{status.tools.length === 1 ? "" : "s"}
                        </span>
                      )}
                      {server.enabled && status.status === "error" && (
                        <span
                          title={status.error}
                          className="flex items-center gap-1 text-[11px] text-red-500 shrink-0"
                        >
                          <CircleAlert className="w-3 h-3" />
                          Failed to connect
                        </span>
                      )}
                    </div>
                    <span className="block text-xs text-foreground-muted truncate">
                      {server.command} {server.args.join(" ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Toggle checked={server.enabled} onChange={() => toggleMcpServer(server)} />
                    <button
                      type="button"
                      onClick={() => removeMcpServer(server)}
                      title="Remove server"
                      aria-label={`Remove server "${server.name}"`}
                      className="flex items-center justify-center w-7 h-7 rounded-md text-foreground-muted hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {addMcpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 animate-[fadeIn_150ms_ease-out]"
          onClick={() => setAddMcpOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-border bg-background shadow-xl p-4 space-y-2.5 animate-[modalIn_180ms_ease-out]"
          >
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[13px] font-medium text-foreground">Add MCP server</div>
              <button
                type="button"
                onClick={() => setAddMcpOpen(false)}
                title="Close"
                aria-label="Close add MCP server dialog"
                className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              autoFocus
              value={newMcpServer.name}
              onChange={(e) => setNewMcpServer((s) => ({ ...s, name: e.target.value }))}
              placeholder="Name (e.g. Filesystem)"
              className="w-full h-8 px-2.5 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light"
            />
            <input
              value={newMcpServer.commandLine}
              onChange={(e) => setNewMcpServer((s) => ({ ...s, commandLine: e.target.value }))}
              placeholder="Command (e.g. npx -y @modelcontextprotocol/server-filesystem ~/Desktop)"
              className="w-full h-8 px-2.5 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light"
            />
            <textarea
              value={newMcpServer.envText}
              onChange={(e) => setNewMcpServer((s) => ({ ...s, envText: e.target.value }))}
              placeholder={"Environment variables, one per line (optional)\nKEY=value"}
              rows={3}
              className="w-full px-2.5 py-1.5 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light resize-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAddMcpOpen(false)}
                className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addMcpServer}
                disabled={!newMcpServer.name.trim() || !newMcpServer.commandLine.trim()}
                className="h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                Add server
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
