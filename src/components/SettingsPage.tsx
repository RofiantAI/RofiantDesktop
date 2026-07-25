import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Box,
  Settings,
  Zap,
  Palette,
  CircleUser,
  Users,
  Database,
  Keyboard,
  Plug,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  X,
  Search,
  BarChart3,
  RefreshCw,
  Cable,
  Loader2,
  CircleCheck,
  CircleAlert,
  BookOpen,
  Upload,
  FileText,
} from "lucide-react";
import { customModelId, customProviderIdFromModel, type CustomProvider } from "../lib/providers";
import { DEFAULT_SETTINGS } from "../lib/settings";
import type { AppSettings, Density, FontSize, SendKey, Theme, UiScale } from "../lib/settings";
import type { Agent } from "../lib/agents";
import {
  EASY_LOCAL_MODELS,
  OLLAMA_BASE_URL,
  deleteOllamaModel,
  listInstalledOllamaModels,
  pullOllamaModel,
  type LocalModelDef,
} from "../lib/ollama";
import { Avatar } from "./Sidebar";
import { useConfirmDialog } from "./ConfirmDialog";
import { connectMcpServer, disconnectMcpServer, type McpServerConfig, type McpToolInfo } from "../lib/mcp";
import { modShortcut } from "../lib/platform";
import { supabase } from "../lib/supabase";
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  getKnowledgeBase,
  listKnowledgeBases,
  removeDocumentFromKnowledgeBase,
  uploadDocumentToKnowledgeBase,
  type KnowledgeBase,
  type KnowledgeBaseDetail,
} from "../lib/knowledgeBases";

type Section =
  | "general"
  | "providers"
  | "models"
  | "agents"
  | "mcp"
  | "knowledgeBases"
  | "appearance"
  | "profile"
  | "shortcuts"
  | "data"
  | "telemetry";

const SECTION_GROUPS: { label: string; items: { id: Section; label: string; icon: typeof Settings }[] }[] = [
  {
    label: "Workspace",
    items: [
      { id: "general", label: "General", icon: Settings },
      { id: "providers", label: "Providers", icon: Plug },
      { id: "models", label: "Models", icon: Box },
      { id: "agents", label: "Agents", icon: Users },
      { id: "mcp", label: "MCP Servers", icon: Cable },
      { id: "knowledgeBases", label: "Knowledge Bases", icon: BookOpen },
    ],
  },
  {
    label: "Preferences",
    items: [
      { id: "appearance", label: "Appearance", icon: Palette },
      { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
    ],
  },
  {
    label: "Account",
    items: [
      { id: "profile", label: "Profile", icon: CircleUser },
      { id: "data", label: "Data", icon: Database },
      { id: "telemetry", label: "Telemetry", icon: BarChart3 },
    ],
  },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full shrink-0 cursor-pointer ring-1 ring-inset transition-colors duration-150 ${
        checked
          ? "bg-accent-success ring-accent-success"
          : "bg-background-tertiary ring-border hover:ring-border-light"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13px] text-foreground">{label}</div>
        {description && <div className="text-[12px] text-foreground-muted mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] text-foreground-secondary mt-6 mb-2 first:mt-0">{children}</div>;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
      {children}
    </div>
  );
}

function CardRow({
  label,
  description,
  icon,
  children,
}: {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
          {icon}
          {label}
        </div>
        {description && (
          <div className="text-[12px] text-foreground-muted mt-0.5 leading-relaxed">{description}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-background-tertiary border border-border">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2.5 h-6 rounded-md text-[12px] transition-colors ${
            value === opt.value
              ? "bg-card text-foreground shadow-sm"
              : "text-foreground-muted hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Dropdown<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-7 pl-2 pr-6 rounded-md text-[12px] bg-background-tertiary border border-border text-foreground outline-none cursor-pointer appearance-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-background-tertiary text-foreground">
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 text-foreground-muted absolute right-2 pointer-events-none" />
    </div>
  );
}

export function SettingsPage({
  settings,
  onChange,
  onClose,
  sidebarOpen,
  userEmail,
  userAvatarUrl,
  userDisplayName,
  userId,
  accessToken,
  plan,
  isPro,
  onSignIn,
  onSignOut,
  onClearConversations,
  onExportData,
  onCheckForUpdate,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
  sidebarOpen: boolean;
  userEmail: string | null;
  userAvatarUrl: string | null;
  userDisplayName: string | null;
  userId: string | null;
  accessToken: string | null;
  plan: string;
  isPro: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onClearConversations: () => void;
  onExportData: () => void;
  onCheckForUpdate: () => Promise<Update | null>;
}) {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [section, setSection] = useState<Section>(SECTION_GROUPS[0].items[0].id);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "latest" | "available" | "error">(
    "idle",
  );

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch((err) => console.error("Failed to read app version:", err));
  }, []);

  const [displayName, setDisplayName] = useState(userDisplayName ?? "");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [displayNameSaved, setDisplayNameSaved] = useState(false);

  useEffect(() => {
    setDisplayName(userDisplayName ?? "");
  }, [userDisplayName]);

  async function saveDisplayName() {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === userDisplayName) return;
    setDisplayNameSaving(true);
    try {
      await supabase.auth.updateUser({ data: { display_name: trimmed } });
      setDisplayNameSaved(true);
      setTimeout(() => setDisplayNameSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save display name:", err);
    } finally {
      setDisplayNameSaving(false);
    }
  }

  async function handleCheckForUpdate() {
    setUpdateStatus("checking");
    try {
      const update = await onCheckForUpdate();
      setUpdateStatus(update ? "available" : "latest");
    } catch (err) {
      console.error("Update check failed:", err);
      setUpdateStatus("error");
    }
  }
  const [newProvider, setNewProvider] = useState({ name: "", baseUrl: "", model: "", apiKey: "" });
  const [showApiKey, setShowApiKey] = useState(false);
  const [addProviderOpen, setAddProviderOpen] = useState(false);

  useEffect(() => {
    if (!addProviderOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAddProviderOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addProviderOpen]);

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

  function removeProvider(id: string) {
    const remaining = settings.customProviders.filter((p) => p.id !== id);
    const patch: Partial<AppSettings> = { customProviders: remaining };
    if (customProviderIdFromModel(settings.model) === id) {
      patch.model = "openai/gpt-oss-20b";
    }
    onChange(patch);
  }

  type McpStatus =
    | { status: "idle" }
    | { status: "connecting" }
    | { status: "connected"; tools: McpToolInfo[] }
    | { status: "error"; error: string };

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
    if (section !== "mcp") return;
    for (const server of settings.mcpServers) {
      if (server.enabled && !mcpStatus[server.id]) void connectMcp(server);
    }
    // Only re-run when entering the section or the server list changes —
    // not on every mcpStatus update, or a fresh "connecting" write would
    // immediately re-trigger this loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, settings.mcpServers]);

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

  const [installedLocalModels, setInstalledLocalModels] = useState<string[] | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [ollamaUnreachable, setOllamaUnreachable] = useState(false);
  const [pullingModels, setPullingModels] = useState<
    Record<string, { status: string; pct: number | null }>
  >({});
  const [modelSearch, setModelSearch] = useState("");

  useEffect(() => {
    if (section !== "models") return;
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
  }, [section]);

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

  function selectLocalModel(m: LocalModelDef) {
    const existing = findLocalProvider(m);
    if (existing) {
      onChange({ model: customModelId(existing.id) });
      return;
    }
    const provider: CustomProvider = {
      id: crypto.randomUUID(),
      name: m.name,
      baseUrl: OLLAMA_BASE_URL,
      model: m.id,
      apiKey: "ollama",
    };
    onChange({ customProviders: [...settings.customProviders, provider], model: customModelId(provider.id) });
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
      if (provider) removeProvider(provider.id);
    } catch (err) {
      console.error("Ollama delete failed:", err);
    } finally {
      setDeletingModelId(null);
    }
  }

  const [newAgent, setNewAgent] = useState({ name: "", systemPrompt: "" });
  const [addAgentOpen, setAddAgentOpen] = useState(false);

  useEffect(() => {
    if (!addAgentOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAddAgentOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addAgentOpen]);

  function addAgent() {
    const name = newAgent.name.trim();
    const systemPrompt = newAgent.systemPrompt.trim();
    if (!name || !systemPrompt) return;
    const agent: Agent = { id: crypto.randomUUID(), name, systemPrompt };
    onChange({ agents: [...settings.agents, agent], activeAgentId: agent.id });
    setNewAgent({ name: "", systemPrompt: "" });
    setAddAgentOpen(false);
  }

  function removeAgent(id: string) {
    const remaining = settings.agents.filter((a) => a.id !== id);
    const patch: Partial<AppSettings> = { agents: remaining };
    if (settings.activeAgentId === id) patch.activeAgentId = null;
    onChange(patch);
  }

  const [kbList, setKbList] = useState<KnowledgeBase[] | null>(null);
  const [kbListError, setKbListError] = useState<string | null>(null);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [kbDetail, setKbDetail] = useState<KnowledgeBaseDetail | null>(null);
  const [kbDetailError, setKbDetailError] = useState<string | null>(null);
  const [addKbOpen, setAddKbOpen] = useState(false);
  const [newKb, setNewKb] = useState({ name: "", description: "" });
  const [creatingKb, setCreatingKb] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const kbFileInputRef = useRef<HTMLInputElement | null>(null);

  function refreshKbList() {
    if (!accessToken) return;
    setKbListError(null);
    listKnowledgeBases(accessToken)
      .then(setKbList)
      .catch((err) => setKbListError(err instanceof Error ? err.message : String(err)));
  }

  function refreshKbDetail(id: string) {
    if (!accessToken) return;
    setKbDetailError(null);
    getKnowledgeBase(id, accessToken)
      .then(setKbDetail)
      .catch((err) => setKbDetailError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => {
    if (section !== "knowledgeBases" || !isPro || !accessToken) return;
    refreshKbList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, isPro, accessToken]);

  useEffect(() => {
    if (!selectedKbId || !accessToken) return;
    refreshKbDetail(selectedKbId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKbId, accessToken]);

  async function handleCreateKb() {
    if (!accessToken || !newKb.name.trim() || creatingKb) return;
    setCreatingKb(true);
    try {
      await createKnowledgeBase(newKb.name.trim(), newKb.description.trim(), accessToken);
      setNewKb({ name: "", description: "" });
      setAddKbOpen(false);
      refreshKbList();
    } catch (err) {
      setKbListError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingKb(false);
    }
  }

  async function handleDeleteKb(kb: KnowledgeBase) {
    if (!accessToken) return;
    const ok = await confirm({
      title: `Delete "${kb.name}"?`,
      description: "This removes the knowledge base. The documents in it stay in your library.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteKnowledgeBase(kb.id, accessToken);
      if (selectedKbId === kb.id) setSelectedKbId(null);
      refreshKbList();
    } catch (err) {
      setKbListError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleUploadFiles(files: FileList | null) {
    if (!files || !accessToken || !userId || !selectedKbId) return;
    setUploadingDoc(true);
    try {
      for (const file of Array.from(files)) {
        await uploadDocumentToKnowledgeBase(selectedKbId, file, userId, accessToken);
      }
      refreshKbDetail(selectedKbId);
      refreshKbList();
    } catch (err) {
      setKbDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleRemoveDocument(documentId: string) {
    if (!accessToken || !selectedKbId) return;
    try {
      await removeDocumentFromKnowledgeBase(selectedKbId, documentId, accessToken);
      refreshKbDetail(selectedKbId);
      refreshKbList();
    } catch (err) {
      setKbDetailError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground">
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: sidebarOpen ? 220 : 0,
          transition: "width 220ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <aside className="w-[220px] h-full border-r border-border bg-background-secondary flex flex-col">
          <div className="h-11 flex items-center px-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 text-[13px] text-foreground-secondary hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>
          <nav className="px-2 py-2 overflow-y-auto">
            {SECTION_GROUPS.map((group) => (
              <div key={group.label} className="mb-3 last:mb-0">
                <div className="px-2 mb-1 text-[11px] font-medium text-foreground-muted uppercase tracking-wide">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((s) => {
                    const Icon = s.icon;
                    const active = section === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSection(s.id)}
                        className={`flex items-center gap-2.5 w-full h-8 px-2 rounded-md text-[13px] transition-colors text-left ${
                          active
                            ? "bg-background-tertiary text-foreground"
                            : "text-foreground-secondary hover:bg-background-tertiary/60 hover:text-foreground"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-8 py-10">
          {section === "general" && (
            <div>
              <h1 className="text-[18px] font-bold mb-6">General</h1>

              <Card>
                <CardRow
                  label="Rofiant Account"
                  description={"Manage your account and billing"}
                >
                  {userEmail ? (
                    <button
                      type="button"
                      onClick={() => void openUrl("https://rofiant.ca/account")}
                      className="flex items-center gap-1.5 h-7 px-3 rounded-md border border-border text-[12px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors"
                    >
                      Open
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="h-7 px-3 rounded-md bg-foreground text-background text-[12px] font-medium hover:opacity-90 transition-opacity"
                    >
                      Sign in
                    </button>
                  )}
                </CardRow>
                {!isPro && (
                  <CardRow
                    label="Upgrade to Pro"
                    description="Entry-level plan with access to premium models and more"
                  >
                    <button
                      type="button"
                      onClick={() => void openUrl("https://rofiant.ca/pricing")}
                      className="flex items-center gap-1 h-7 px-3 rounded-md bg-accent-primary text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                    >
                      <Zap className="w-3 h-3" />
                      Upgrade
                    </button>
                  </CardRow>
                )}
              </Card>

              <SectionLabel>Updates</SectionLabel>
              <Card>
                <CardRow
                  label={appVersion ? `Rofiant Desktop v${appVersion}` : "Rofiant Desktop"}
                  description={
                    updateStatus === "checking"
                      ? "Checking for updates…"
                      : updateStatus === "latest"
                        ? "You're on the latest version."
                        : updateStatus === "available"
                          ? "An update is available — see the banner above to install."
                          : updateStatus === "error"
                            ? "Couldn't check for updates. Try again later."
                            : "Check if a newer version is available"
                  }
                >
                  <button
                    type="button"
                    onClick={handleCheckForUpdate}
                    disabled={updateStatus === "checking"}
                    className="flex items-center gap-1.5 h-7 px-3 rounded-md border border-border text-[12px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                  >
                    <RefreshCw className={`w-3 h-3 ${updateStatus === "checking" ? "animate-spin" : ""}`} />
                    {updateStatus === "checking" ? "Checking…" : "Check for updates"}
                  </button>
                </CardRow>
              </Card>

              <SectionLabel>Custom instructions</SectionLabel>
              <textarea
                value={settings.customInstructions}
                onChange={(e) => onChange({ customInstructions: e.target.value })}
                placeholder="e.g. Answer concisely. Prefer code over prose."
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light resize-none"
              />

              <SectionLabel>Messages</SectionLabel>
              <Card>
                <CardRow
                  label="Context window"
                  description={`Send the last ${settings.contextLimit} messages as context`}
                >
                  <input
                    type="range"
                    min={4}
                    max={50}
                    step={2}
                    value={settings.contextLimit}
                    onChange={(e) => onChange({ contextLimit: Number(e.target.value) })}
                    className="w-32 accent-foreground"
                  />
                </CardRow>
                <CardRow
                  label="Send message with"
                  description={
                    settings.sendKey === "mod-enter"
                      ? "⌘/Ctrl+Enter sends, Enter adds a line break"
                      : "Enter sends, Shift+Enter adds a line break"
                  }
                >
                  <SegmentedControl<SendKey>
                    value={settings.sendKey}
                    onChange={(v) => onChange({ sendKey: v })}
                    options={[
                      { value: "enter", label: "Enter" },
                      { value: "mod-enter", label: modShortcut("⌘Enter") },
                    ]}
                  />
                </CardRow>
                <CardRow label="Spellcheck" description="Underline misspelled words while typing">
                  <Toggle
                    checked={settings.spellcheck}
                    onChange={(v) => onChange({ spellcheck: v })}
                  />
                </CardRow>
              </Card>

              <SectionLabel>Notifications</SectionLabel>
              <Card>
                <CardRow label="Sound on response" description="Play a tone when a reply finishes">
                  <Toggle
                    checked={settings.responseSound}
                    onChange={(v) => onChange({ responseSound: v })}
                  />
                </CardRow>
                <CardRow
                  label="Desktop notifications"
                  description="Notify when a reply finishes while the window is unfocused"
                >
                  <Toggle
                    checked={settings.notifyOnResponse}
                    onChange={(v) => onChange({ notifyOnResponse: v })}
                  />
                </CardRow>
              </Card>

              <SectionLabel>Window</SectionLabel>
              <Card>
                <CardRow
                  label="Minimize to tray"
                  description="Closing the window hides it to the system tray instead of quitting"
                >
                  <Toggle
                    checked={settings.minimizeToTray}
                    onChange={(v) => onChange({ minimizeToTray: v })}
                  />
                </CardRow>
              </Card>

              {userEmail && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="mt-6 h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors"
                >
                  Log Out
                </button>
              )}
            </div>
          )}

          {section === "providers" && (
            <div>
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-[18px] font-bold mb-2">Providers</h1>
                  <p className="text-[13px] text-foreground-muted">
                    Connect your own AI provider using an OpenAI-compatible API (OpenAI, OpenRouter,
                    Together, a local Ollama server, etc). Your API key is sent directly to that
                    provider and never touches Rofiant's servers.
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
                            <span className="text-sm text-foreground font-medium truncate">
                              {p.name}
                            </span>
                            {active && <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
                          </span>
                          <span className="block text-xs text-foreground-muted truncate">
                            {p.model} · {p.baseUrl}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Remove provider "${p.name}"?`,
                              description: "This can't be undone.",
                              confirmLabel: "Remove",
                              danger: true,
                            });
                            if (ok) removeProvider(p.id);
                          }}
                          title="Remove provider"
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
          )}

          {section === "mcp" && (
            <div>
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-[18px] font-bold mb-2">MCP Servers</h1>
                  <p className="text-[13px] text-foreground-muted">
                    Connect Model Context Protocol servers to give the assistant more tools (a
                    filesystem, database, or Git server, etc). Each one runs locally as a command
                    you provide — never touches Rofiant's servers.
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
                      <div
                        key={server.id}
                        className="w-full rounded-lg border border-border px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-foreground font-medium truncate">
                                {server.name}
                              </span>
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
          )}

          {section === "knowledgeBases" && (
            <div>
              {!accessToken ? (
                <div>
                  <h1 className="text-[18px] font-bold mb-2">Knowledge Bases</h1>
                  <p className="text-[13px] text-foreground-muted mb-6">
                    Sign in to create a knowledge base and reference your documents from chat.
                  </p>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
                  >
                    Sign in
                  </button>
                </div>
              ) : !isPro ? (
                <div>
                  <h1 className="text-[18px] font-bold mb-2">Knowledge Bases</h1>
                  <p className="text-[13px] text-foreground-muted mb-6">
                    Upload documents into a named knowledge base and Rofiant can search them from
                    any chat. Requires Pro or Ultra.
                  </p>
                  <button
                    type="button"
                    onClick={() => void openUrl("https://rofiant.ca/pricing")}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent-primary text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Upgrade to Pro
                  </button>
                </div>
              ) : selectedKbId ? (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedKbId(null);
                      setKbDetail(null);
                    }}
                    className="flex items-center gap-1.5 text-[13px] text-foreground-secondary hover:text-foreground transition-colors mb-4"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Knowledge Bases
                  </button>

                  {kbDetail && kbDetail.id === selectedKbId ? (
                    <>
                      <div className="flex items-start justify-between gap-4 mb-6">
                        <div className="min-w-0">
                          <h1 className="text-[18px] font-bold mb-1 truncate">{kbDetail.name}</h1>
                          {kbDetail.description && (
                            <p className="text-[13px] text-foreground-muted">{kbDetail.description}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => kbFileInputRef.current?.click()}
                          disabled={uploadingDoc || !userId}
                          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shrink-0"
                        >
                          {uploadingDoc ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          {uploadingDoc ? "Uploading…" : "Add file"}
                        </button>
                        <input
                          ref={kbFileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            void handleUploadFiles(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </div>

                      {kbDetailError && (
                        <div className="mb-4 text-[12px] text-red-600">{kbDetailError}</div>
                      )}

                      {kbDetail.knowledge_base_documents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-border py-8">
                          <FileText className="w-5 h-5 text-foreground-muted mb-2" />
                          <div className="text-[13px] text-foreground-secondary">No documents yet</div>
                          <div className="text-[12px] text-foreground-muted mt-0.5">
                            Add a file so Rofiant can search it from chat.
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {kbDetail.knowledge_base_documents.map((kbDoc) => (
                            <div
                              key={kbDoc.id}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border"
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
                                <span className="text-sm text-foreground truncate">
                                  {kbDoc.documents?.name ?? "Untitled document"}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleRemoveDocument(kbDoc.document_id)}
                                title="Remove from knowledge base"
                                className="flex items-center justify-center w-7 h-7 rounded-md text-foreground-muted hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : kbDetailError ? (
                    <div className="text-[13px] text-red-600">{kbDetailError}</div>
                  ) : (
                    <div className="text-[13px] text-foreground-muted">Loading…</div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <h1 className="text-[18px] font-bold mb-2">Knowledge Bases</h1>
                      <p className="text-[13px] text-foreground-muted">
                        Named collections of documents Rofiant can search from any chat. Files are
                        stored and indexed on your account, not just this device.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAddKbOpen(true)}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      New knowledge base
                    </button>
                  </div>

                  {kbListError && <div className="mb-4 text-[12px] text-red-600">{kbListError}</div>}

                  {kbList === null ? (
                    <div className="text-[13px] text-foreground-muted">Loading…</div>
                  ) : kbList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-border py-8">
                      <BookOpen className="w-5 h-5 text-foreground-muted mb-2" />
                      <div className="text-[13px] text-foreground-secondary">No knowledge bases yet</div>
                      <div className="text-[12px] text-foreground-muted mt-0.5">
                        Create one and add documents Rofiant can reference from chat.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {kbList.map((kb) => {
                        const count = kb.knowledge_base_documents?.[0]?.count ?? 0;
                        return (
                          <div
                            key={kb.id}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border"
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedKbId(kb.id)}
                              className="min-w-0 text-left flex-1"
                            >
                              <span className="text-sm text-foreground font-medium truncate block">
                                {kb.name}
                              </span>
                              <span className="block text-xs text-foreground-muted truncate">
                                {count} document{count === 1 ? "" : "s"}
                                {kb.description ? ` · ${kb.description}` : ""}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteKb(kb)}
                              title="Delete knowledge base"
                              className="flex items-center justify-center w-7 h-7 rounded-md text-foreground-muted hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {addKbOpen && (
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 animate-[fadeIn_150ms_ease-out]"
                      onClick={() => setAddKbOpen(false)}
                    >
                      <div
                        role="dialog"
                        aria-modal="true"
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-sm rounded-lg border border-border bg-background shadow-xl p-4 space-y-2.5 animate-[modalIn_180ms_ease-out]"
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="text-[13px] font-medium text-foreground">
                            New knowledge base
                          </div>
                          <button
                            type="button"
                            onClick={() => setAddKbOpen(false)}
                            title="Close"
                            className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          autoFocus
                          value={newKb.name}
                          onChange={(e) => setNewKb((s) => ({ ...s, name: e.target.value }))}
                          placeholder="Name (e.g. Client contracts)"
                          className="w-full h-8 px-2.5 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light"
                        />
                        <textarea
                          value={newKb.description}
                          onChange={(e) => setNewKb((s) => ({ ...s, description: e.target.value }))}
                          placeholder="Description (optional)"
                          rows={2}
                          className="w-full px-2.5 py-1.5 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light resize-none"
                        />
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setAddKbOpen(false)}
                            className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateKb}
                            disabled={!newKb.name.trim() || creatingKb}
                            className="h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                          >
                            {creatingKb ? "Creating…" : "Create"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {section === "models" && (
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
                <div className="flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-border py-8 mb-6">
                  <Box className="w-5 h-5 text-foreground-muted mb-2" />
                  <div className="text-[13px] text-foreground-secondary">Can't reach Ollama</div>
                  <div className="text-[12px] text-foreground-muted mt-0.5 max-w-xs">
                    Install Ollama and make sure it's running, then reopen this tab.
                  </div>
                </div>
              )}

              <div className="relative mb-3">
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4 text-foreground-muted hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {(() => {
                const q = modelSearch.trim().toLowerCase();
                const filtered = q
                  ? EASY_LOCAL_MODELS.filter(
                      (m) =>
                        m.name.toLowerCase().includes(q) ||
                        m.id.toLowerCase().includes(q) ||
                        m.desc.toLowerCase().includes(q),
                    )
                  : EASY_LOCAL_MODELS;
                if (filtered.length === 0) {
                  return (
                    <div className="text-center text-[13px] text-foreground-muted py-8">
                      No models match "{modelSearch}"
                    </div>
                  );
                }
                return (
              <div className="space-y-1.5">
                {filtered.map((m) => {
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
                );
              })()}
            </div>
          )}

          {section === "agents" && (
            <div>
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-[18px] font-bold mb-2">Agents</h1>
                  <p className="text-[13px] text-foreground-muted">
                    Save custom system prompts as agents and switch between them without retyping
                    instructions each time.
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
                          onClick={() =>
                            onChange({ activeAgentId: active ? null : a.id, chatMode: "ask" })
                          }
                          className="min-w-0 text-left flex-1"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm text-foreground font-medium truncate">
                              {a.name}
                            </span>
                            {active && <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
                          </span>
                          <span className="block text-xs text-foreground-muted truncate">
                            {a.systemPrompt}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Remove agent "${a.name}"?`,
                              description: "This can't be undone.",
                              confirmLabel: "Remove",
                              danger: true,
                            });
                            if (ok) removeAgent(a.id);
                          }}
                          title="Remove agent"
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
          )}

          {section === "appearance" && (
            <div>
              <h1 className="text-[18px] font-medium mb-6">Appearance</h1>
              <div>
                <Row label="Theme">
                  <SegmentedControl<Theme>
                    value={settings.theme}
                    onChange={(v) => onChange({ theme: v })}
                    options={[
                      { value: "light", label: "Light" },
                      { value: "dark", label: "Dark" },
                      { value: "system", label: "System" },
                    ]}
                  />
                </Row>
                <Row label="Font size">
                  <SegmentedControl<FontSize>
                    value={settings.fontSize}
                    onChange={(v) => onChange({ fontSize: v })}
                    options={[
                      { value: "sm", label: "Small" },
                      { value: "md", label: "Medium" },
                      { value: "lg", label: "Large" },
                    ]}
                  />
                </Row>
                <Row label="Message density">
                  <SegmentedControl<Density>
                    value={settings.density}
                    onChange={(v) => onChange({ density: v })}
                    options={[
                      { value: "compact", label: "Compact" },
                      { value: "comfortable", label: "Comfortable" },
                    ]}
                  />
                </Row>
                <Row label="Interface scale" description="Zoom the entire app in or out">
                  <Dropdown<UiScale>
                    value={settings.uiScale}
                    onChange={(v) => onChange({ uiScale: v })}
                    options={[
                      { value: "80", label: "80%" },
                      { value: "90", label: "90%" },
                      { value: "100", label: "100%" },
                      { value: "110", label: "110%" },
                      { value: "125", label: "125%" },
                      { value: "150", label: "150%" },
                    ]}
                  />
                </Row>
                <Row label="Show timestamps" description="Display time under each message">
                  <Toggle
                    checked={settings.showTimestamps}
                    onChange={(v) => onChange({ showTimestamps: v })}
                  />
                </Row>
                <Row label="Reduce motion" description="Turn off UI transitions and animations">
                  <Toggle
                    checked={settings.reduceMotion}
                    onChange={(v) => onChange({ reduceMotion: v })}
                  />
                </Row>
              </div>
            </div>
          )}

          {section === "profile" && (
            <div>
              <h1 className="text-[18px] font-bold mb-6">Profile</h1>
              {userEmail ? (
                <div className="rounded-lg border border-border px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar email={userEmail} avatarUrl={userAvatarUrl} size={32} />
                      <div className="min-w-0">
                        <div className="text-[13px] text-foreground truncate">{userEmail}</div>
                        <div className="text-[12px] text-foreground-muted">Signed in</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
                    >
                      Sign out
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <span className="text-[12px] text-foreground-muted">Plan</span>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${
                        isPro
                          ? "bg-accent-primary/10 text-accent-primary"
                          : "bg-background-tertiary text-foreground-secondary"
                      }`}
                    >
                      {plan}
                    </span>
                  </div>
                </div>
              ) : null}
              {userEmail && (
                <div className="mt-4">
                  <SectionLabel>Display name</SectionLabel>
                  <div className="flex items-center gap-2">
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveDisplayName();
                      }}
                      placeholder="Your name"
                      className="flex-1 h-8 px-2.5 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light"
                    />
                    <button
                      type="button"
                      onClick={() => void saveDisplayName()}
                      disabled={
                        displayNameSaving || !displayName.trim() || displayName.trim() === userDisplayName
                      }
                      className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {displayNameSaved ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Saved
                        </>
                      ) : displayNameSaving ? (
                        "Saving…"
                      ) : (
                        "Save"
                      )}
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-4">
                <Row
                  label="Website sync"
                  description="Keep conversations in sync with rofiant.ca"
                >
                  <Toggle
                    checked={settings.websiteSync}
                    onChange={(v) => onChange({ websiteSync: v })}
                  />
                </Row>
              </div>
              {!userEmail && (
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
                  <div className="text-[13px] text-foreground-secondary">You're not signed in</div>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity shrink-0"
                  >
                    Sign in
                  </button>
                </div>
              )}
            </div>
          )}

          {section === "shortcuts" && (
            <div>
              <h1 className="text-[18px] font-bold mb-2">Shortcuts</h1>
              <div className="text-[11px] font-medium text-foreground-secondary uppercase tracking-wide mt-2 mb-1">
                Navigation
              </div>
              <div className="mb-4">
                {[
                  ["New chat", modShortcut("⌘N")],
                  ["Go home", modShortcut("⌘H")],
                  ["Command palette", modShortcut("⌘P")],
                  ["Search chats", modShortcut("⌘K")],
                  ["Toggle sidebar", modShortcut("⌘B")],
                  ["Settings", modShortcut("⌘,")],
                  ["View changed files", modShortcut("⌘Y")],
                ].map(([label, keys]) => (
                  <Row key={label} label={label}>
                    <kbd className="px-2 py-1 rounded-md bg-background-tertiary border border-border text-[12px] text-foreground-secondary">
                      {keys}
                    </kbd>
                  </Row>
                ))}
              </div>
              <div className="text-[11px] font-medium text-foreground-secondary uppercase tracking-wide mt-2 mb-1">
                Tabs
              </div>
              <div className="mb-4">
                {[
                  ["Close tab", modShortcut("⌘W")],
                  ["Next tab", modShortcut("⌘⇧]")],
                  ["Previous tab", modShortcut("⌘⇧[")],
                  ["Jump to tab 1-9", `${modShortcut("⌘1")} … ${modShortcut("⌘9")}`],
                ].map(([label, keys]) => (
                  <Row key={label} label={label}>
                    <kbd className="px-2 py-1 rounded-md bg-background-tertiary border border-border text-[12px] text-foreground-secondary">
                      {keys}
                    </kbd>
                  </Row>
                ))}
              </div>
              <div className="text-[11px] font-medium text-foreground-secondary uppercase tracking-wide mt-2 mb-1">
                Messages
              </div>
              <div>
                {[
                  ["Send message", settings.sendKey === "mod-enter" ? modShortcut("⌘⏎") : "⏎"],
                  ["New line", settings.sendKey === "mod-enter" ? "⏎" : "⇧⏎"],
                  ["Stop generating / close dialog", "Esc"],
                ].map(([label, keys]) => (
                  <Row key={label} label={label}>
                    <kbd className="px-2 py-1 rounded-md bg-background-tertiary border border-border text-[12px] text-foreground-secondary">
                      {keys}
                    </kbd>
                  </Row>
                ))}
              </div>
            </div>
          )}

          {section === "data" && (
            <div>
              <h1 className="text-[18px] font-medium mb-6">Data</h1>
              <Row
                label="Export data"
                description="Download all conversations as a JSON file"
              >
                <button
                  type="button"
                  onClick={onExportData}
                  className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
                >
                  Export
                </button>
              </Row>
              <Row
                label="Reset settings to defaults"
                description="Restore theme, font size, shortcuts behavior, etc. Conversations are kept."
              >
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Reset all settings to their defaults?",
                      description: "Conversations are not affected.",
                      confirmLabel: "Reset",
                    });
                    if (ok) {
                      onChange({
                        ...DEFAULT_SETTINGS,
                        customProviders: settings.customProviders,
                        model: settings.model,
                        agents: settings.agents,
                        activeAgentId: settings.activeAgentId,
                      });
                    }
                  }}
                  className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
                >
                  Reset
                </button>
              </Row>
              <Row
                label="Clear all chats"
                description="Permanently delete every conversation on this device"
              >
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Delete every conversation on this device?",
                      description: "This can't be undone.",
                      confirmLabel: "Delete",
                      danger: true,
                    });
                    if (ok) onClearConversations();
                  }}
                  className="h-8 px-3 rounded-lg border border-red-200 text-[13px] text-red-600 hover:bg-red-50 transition-colors shrink-0"
                >
                  Clear
                </button>
              </Row>
            </div>
          )}

          {section === "telemetry" && (
            <div>
              <h1 className="text-[18px] font-medium mb-6">Telemetry</h1>
              <Row
                label="Share anonymous usage data"
                description="Helps us understand which features are used and fix bugs faster. On by default — turn off any time and no more data is sent."
              >
                <Toggle
                  checked={settings.telemetryEnabled}
                  onChange={(v) => onChange({ telemetryEnabled: v })}
                />
              </Row>
              <div className="mt-4 text-[12px] text-foreground-muted leading-relaxed">
                <div className="font-medium text-foreground-secondary mb-1">What's sent</div>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>App events: launches, new chats, messages sent, model changes</li>
                  <li>A random device ID (not tied to your name or email)</li>
                  <li>App version and OS</li>
                </ul>
                <div className="font-medium text-foreground-secondary mt-3 mb-1">What's never sent</div>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Conversation content or message text</li>
                  <li>API keys or provider credentials</li>
                  <li>File contents or file paths</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </main>
      {confirmDialog}
    </div>
  );
}
