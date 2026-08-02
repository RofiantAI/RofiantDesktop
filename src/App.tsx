import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Update } from "@tauri-apps/plugin-updater";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { Sidebar } from "./components/Sidebar";
import { UpdateBanner } from "./components/UpdateBanner";
import { TabBar } from "./components/TabBar";
import { ChatPanel } from "./components/ChatPanel";
const SettingsPage = lazy(() =>
  import("./components/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
import { AuthPage } from "./components/AuthPage";
import { MfaChallenge } from "./components/MfaChallenge";
import { FileChangesPanel } from "./components/FileChangesPanel";
const ChangeHistoryPage = lazy(() =>
  import("./components/ChangeHistoryPage").then((m) => ({ default: m.ChangeHistoryPage })),
);
import { useConfirmDialog } from "./components/ConfirmDialog";
import { TitleBar } from "./components/TitleBar";
import { ResizeHandles } from "./components/ResizeHandles";
import { CommandPalette } from "./components/CommandPalette";
import { PageSpinner } from "./components/Skeleton";
import type { CommandItem } from "./components/CommandPalette";
import {
  Plus,
  Home,
  Search,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeft,
  Download,
  Trash2,
  LogIn,
  LogOut,
  MessageSquare,
  History,
  X,
} from "lucide-react";
import { generateTitle, sendChatMessage, stopChatMessage, respondToolApproval } from "./lib/groq";
import type { ChatUsage, ToolApprovalRequest } from "./lib/groq";
// Project/worktree attach is disabled for now — see handleAttachProject
// below, ProjectBar.tsx, and git_worktree_* in lib.rs.
import { removeProjectWorktree } from "./lib/git";
import { customProviderIdFromModel } from "./lib/providers";
import { supabase } from "./lib/supabase";
import { insertUsageEvent } from "./lib/sync";
import { loadSettings, saveSettings, resolveTheme, playDoneSound, notifyResponse } from "./lib/settings";
import { connectMcpServer } from "./lib/mcp";
import { track, setTelemetryEnabled, setTelemetryUserId } from "./lib/telemetry";
import { loadFileChanges, saveFileChanges } from "./lib/fileChanges";
import { loadFolders, saveFolders } from "./lib/folders";
import { checkForUpdate } from "./lib/updater";
import type { AppSettings } from "./lib/settings";
import { getUserAvatarUrl } from "./lib/user-avatar";
import { planFromSession, isProPlan } from "./lib/plan";
import { clampModelForPlan } from "./lib/models";
import { parseSlashCommand } from "./lib/commands";
import type { SlashCommand } from "./lib/commands";
import { loadRules, saveRules, rulesToPrompt } from "./lib/rules";
import type { Rule } from "./lib/rules";
import { PLAN_MODE_INSTRUCTION } from "./lib/agents";
import { isLinux, modShortcut } from "./lib/platform";
import { parseAuthRedirect } from "./lib/auth-redirect";
import type { Conversation, FileChange, Folder, Message } from "./types";

interface FileChangeEventPayload {
  conversation_id: string;
  path: string;
  old_content: string | null;
  new_content: string;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

const TERMINAL_MINIMIZED_KEY = "rofiant_file_changes_terminal_minimized";

function makeConversation(title = "New chat"): Conversation {
  return {
    id: makeId(),
    title,
    messages: [],
    updatedAt: Date.now(),
    status: "idle",
  };
}

function App() {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarSettled, setSidebarSettled] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [rules, setRules] = useState<Rule[]>(() => loadRules());
  const [session, setSession] = useState<Session | null>(null);
  // Set while a session exists but the account requires a second factor
  // (aal1 -> aal2) that hasn't been supplied yet. `session` stays null until
  // that's resolved, so nothing else in the app treats sign-in as complete.
  const [pendingMfaSession, setPendingMfaSession] = useState<Session | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [fileChanges, setFileChanges] = useState<FileChange[]>(() => loadFileChanges());
  const [folders, setFolders] = useState<Folder[]>(() => loadFolders());
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [terminalMinimized, setTerminalMinimized] = useState(
    () => localStorage.getItem(TERMINAL_MINIMIZED_KEY) === "1",
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySidebarOpen, setHistorySidebarOpen] = useState(true);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [mcpConnectErrors, setMcpConnectErrors] = useState<{ id: string; name: string; error: string }[]>([]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const activeRequestIdsRef = useRef<Map<string, string>>(new Map());
  const [toolApproval, setToolApproval] = useState<ToolApprovalRequest | null>(null);

  const handleToolApprovalDecision = useCallback((approved: boolean) => {
    setToolApproval((current) => {
      if (current) {
        track("tool_action_reviewed", { tool: current.tool, approved });
        void respondToolApproval(current.approvalId, approved);
      }
      return null;
    });
  }, []);

  useEffect(() => {
    checkForUpdate()
      .then(setAvailableUpdate)
      .catch((err) => console.error("Background update check failed:", err));
  }, []);

  useEffect(() => {
    if (!sidebarOpen) setSidebarSettled(false);
  }, [sidebarOpen]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    invoke("set_minimize_to_tray", { enabled: settings.minimizeToTray }).catch(() => {});
  }, [settings.minimizeToTray]);

  useEffect(() => {
    for (const server of settings.mcpServers) {
      if (server.enabled) {
        connectMcpServer(server).catch((err) => {
          console.error(`Failed to connect MCP server "${server.name}":`, err);
          setMcpConnectErrors((prev) => [
            ...prev,
            { id: server.id, name: server.name, error: err instanceof Error ? err.message : String(err) },
          ]);
        });
      }
    }
    // Only ever connect the servers present at launch — once Settings is
    // open, its own handlers own connecting/disconnecting as the user edits
    // the list, so this shouldn't re-run on every settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTelemetryEnabled(settings.telemetryEnabled);
  }, [settings.telemetryEnabled]);

  useEffect(() => {
    track("app_opened");
  }, []);

  useEffect(() => {
    setTelemetryUserId(session?.user.id ?? null);
  }, [session?.user.id]);

  useEffect(() => {
    async function completeAuthRedirect(urls: string[]) {
      for (const raw of urls) {
        const result = parseAuthRedirect(raw);
        switch (result.type) {
          case "invalid":
          case "none":
            continue;
          case "error":
            console.error("Sign-in redirect failed:", result.message);
            track("auth_redirect_failed");
            continue;
          case "tokens": {
            const { error } = await supabase.auth.setSession({
              access_token: result.accessToken,
              refresh_token: result.refreshToken,
            });
            if (error) {
              console.error("Failed to apply session from signup redirect:", error);
              track("auth_redirect_failed");
            }
            continue;
          }
          case "code": {
            const { error } = await supabase.auth.exchangeCodeForSession(result.code);
            if (error) {
              console.error("Failed to complete Google sign-in:", error);
              track("google_signin_failed");
            }
            continue;
          }
        }
      }
    }

    // Covers a cold start (app wasn't running when the browser redirected back).
    void getCurrent().then((urls) => {
      if (urls) void completeAuthRedirect(urls);
    });

    // Covers the app already being open when the redirect arrives.
    const unlistenPromise = onOpenUrl((urls) => void completeAuthRedirect(urls));
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const applySessionSeqRef = useRef(0);

  useEffect(() => {
    async function applySession(newSession: Session | null) {
      // getSession() and onAuthStateChange can both call this, and either can
      // resolve out of order (a slow stale getSession() call finishing after
      // a newer SIGNED_OUT event). Bail if a later call already superseded
      // this one by the time our awaits resolve.
      const seq = ++applySessionSeqRef.current;
      if (!newSession) {
        setSession(null);
        setPendingMfaSession(null);
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (seq !== applySessionSeqRef.current) return;
      if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
        setSession(null);
        setPendingMfaSession(newSession);
        return;
      }
      setPendingMfaSession(null);
      setSession(newSession);
    }

    supabase.auth.getSession().then(({ data }) => {
      void applySession(data.session);
      // The cached session's user_metadata (avatar, plan, ...) can be stale —
      // refresh it from the server so changes made on the website (e.g. a
      // newly uploaded profile picture) show up without a manual sign-out.
      if (data.session) void supabase.auth.refreshSession();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      void applySession(newSession);
      if (newSession) setShowAuth(false);
      if (event === "SIGNED_IN") track("signed_in");
      if (event === "SIGNED_OUT") track("signed_out");
    });

    function handleFocus() {
      void supabase.auth.refreshSession();
    }
    window.addEventListener("focus", handleFocus);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<FileChangeEventPayload>("file-change", (event) => {
      const p = event.payload;
      setFileChanges((prev) => [
        ...prev,
        {
          id: makeId(),
          conversationId: p.conversation_id,
          path: p.path,
          oldContent: p.old_content,
          newContent: p.new_content,
          createdAt: Date.now(),
        },
      ]);
      if (p.conversation_id === activeId) setFilesPanelOpen(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [activeId]);

  useEffect(() => {
    const apply = () => {
      document.documentElement.classList.toggle("dark", resolveTheme(settings.theme) === "dark");
    };
    apply();
    if (settings.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion);
  }, [settings.reduceMotion]);

  useEffect(() => {
    saveFileChanges(fileChanges);
  }, [fileChanges]);

  useEffect(() => {
    saveFolders(folders);
  }, [folders]);

  useEffect(() => {
    localStorage.setItem(TERMINAL_MINIMIZED_KEY, terminalMinimized ? "1" : "0");
  }, [terminalMinimized]);

  useEffect(() => {
    document.documentElement.style.zoom = `${settings.uiScale}%`;
  }, [settings.uiScale]);

  const plan = planFromSession(session);
  const isPro = isProPlan(plan);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (patch.model) next.model = clampModelForPlan(patch.model, isPro);
        saveSettings(next);
        return next;
      });
    },
    [isPro],
  );

  useEffect(() => {
    setSettings((prev) => {
      const clamped = clampModelForPlan(prev.model, isPro);
      if (clamped === prev.model) return prev;
      const next = { ...prev, model: clamped };
      saveSettings(next);
      return next;
    });
  }, [isPro]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const tabs = openTabIds
    .map((id) => conversations.find((c) => c.id === id))
    .filter((c): c is Conversation => Boolean(c));

  const openConversation = useCallback((id: string) => {
    setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveId(id);
  }, []);

  const handleNew = useCallback(() => {
    const c = makeConversation(`New chat ${conversations.length + 1}`);
    setConversations((prev) => [c, ...prev]);
    setOpenTabIds((prev) => [...prev, c.id]);
    setActiveId(c.id);
    track("new_chat_created");
  }, [conversations.length]);

  const handleNewInFolder = useCallback(
    (folderId: string) => {
      const c = { ...makeConversation(`New chat ${conversations.length + 1}`), folderId };
      setConversations((prev) => [c, ...prev]);
      setOpenTabIds((prev) => [...prev, c.id]);
      setActiveId(c.id);
      track("new_chat_created", { folder: true });
    },
    [conversations.length],
  );

  const handleCreateFolder = useCallback((name: string) => {
    const folder: Folder = { id: crypto.randomUUID(), name, createdAt: Date.now() };
    setFolders((prev) => [...prev, folder]);
  }, []);

  const handleRenameFolder = useCallback((id: string, name: string) => {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }, []);

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      const target = folders.find((f) => f.id === id);
      const ok = await confirm({
        title: target ? `Delete "${target.name}"?` : "Delete this folder?",
        description: "Chats inside move back to the main list. This can't be undone.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setConversations((prev) =>
        prev.map((c) => (c.folderId === id ? { ...c, folderId: undefined } : c)),
      );
    },
    [folders, confirm],
  );

  const handleMoveToFolder = useCallback((conversationId: string, folderId: string | null) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, folderId: folderId ?? undefined } : c)),
    );
  }, []);

  const handleRenameConversation = useCallback(
    (id: string, title: string) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    },
    [],
  );

  const handleTogglePin = useCallback(
    (id: string) => {
      const target = conversations.find((c) => c.id === id);
      if (!target) return;
      const nextPinned = !target.pinned;
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: nextPinned } : c)));
    },
    [conversations],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const target = conversations.find((c) => c.id === id);
      const ok = await confirm({
        title: target ? `Delete "${target.title}"?` : "Delete this chat?",
        description: "This can't be undone.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setOpenTabIds((prev) => {
        const next = prev.filter((t) => t !== id);
        if (activeId === id) {
          setActiveId(next.at(-1) ?? null);
        }
        return next;
      });
      // Best-effort: a failed git cleanup should never block deleting the
      // conversation itself (repo may have moved, worktree may already be gone).
      if (target?.projectPath && target.worktreePath) {
        void removeProjectWorktree(target.projectPath, target.worktreePath).catch(() => {});
      }
    },
    [conversations, activeId, confirm],
  );

  // Project/worktree attach — disabled for now (ChatPanel no longer renders
  // ProjectBar), left here commented out to resume later.
  // const handleAttachProject = useCallback(async (conversationId: string, repoPath: string) => {
  //   const info = await attachProjectWorktree(repoPath, conversationId);
  //   setConversations((prev) =>
  //     prev.map((c) =>
  //       c.id === conversationId
  //         ? { ...c, projectPath: info.repoPath, worktreePath: info.worktreePath, branch: info.branch }
  //         : c,
  //     ),
  //   );
  // }, []);
  //
  // // Clears the conversation's pointer only — the worktree itself is left
  // // alone (and only ever removed when the conversation is deleted, in
  // // handleDeleteConversation) so detaching can't lose in-progress work.
  // const handleDetachProject = useCallback((conversationId: string) => {
  //   setConversations((prev) =>
  //     prev.map((c) =>
  //       c.id === conversationId
  //         ? { ...c, projectPath: undefined, worktreePath: undefined, branch: undefined }
  //         : c,
  //     ),
  //   );
  // }, []);

  const handleCloseTab = useCallback(
    (id: string) => {
      setOpenTabIds((prev) => {
        const next = prev.filter((t) => t !== id);
        if (activeId === id) {
          setActiveId(next.at(-1) ?? null);
        }
        return next;
      });
    },
    [activeId],
  );

  const handleClearConversations = useCallback(() => {
    setConversations([]);
    setOpenTabIds([]);
    setActiveId(null);
  }, []);

  const handleCheckForUpdate = useCallback(async () => {
    try {
      const update = await checkForUpdate();
      setAvailableUpdate(update);
      track("update_check", { found: !!update });
      return update;
    } catch (err) {
      track("update_check", { found: false, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }, []);

  const handleExportData = useCallback(() => {
    const blob = new Blob([JSON.stringify(conversations, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rofiant-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [conversations]);

  const pushLocalExchange = useCallback(
    (userText: string, replyText: string) => {
      if (!activeId) return;
      const now = Date.now();
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  { id: makeId(), role: "user", content: userText, createdAt: now },
                  { id: makeId(), role: "assistant", content: replyText, createdAt: now },
                ],
                updatedAt: now,
              }
            : c,
        ),
      );
    },
    [activeId],
  );

  const handleCommand = useCallback(
    (command: SlashCommand, raw: string) => {
      if (!activeId) return;
      switch (command.type) {
        case "clear": {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeId ? { ...c, messages: [], title: "New chat", updatedAt: Date.now() } : c,
            ),
          );
          break;
        }
        case "rule-create": {
          if (!command.text) {
            pushLocalExchange(raw, "Usage: /rule create <rule text>");
            break;
          }
          const rule: Rule = { id: makeId(), text: command.text, createdAt: Date.now() };
          setRules((prev) => {
            const next = [...prev, rule];
            saveRules(next);
            return next;
          });
          pushLocalExchange(raw, `Added rule: "${command.text}"`);
          break;
        }
        case "rule-list": {
          const listText = rules.length
            ? rules.map((r, i) => `${i + 1}. ${r.text}`).join("\n")
            : "No rules yet. Use /rule create <text> to add one.";
          pushLocalExchange(raw, listText);
          break;
        }
        case "rule-remove": {
          const idx = Number(command.target) - 1;
          const target = rules[idx] ?? rules.find((r) => r.id === command.target);
          if (!target) {
            pushLocalExchange(raw, `No rule found for "${command.target}". Use /rule list to see rules.`);
            break;
          }
          setRules((prev) => {
            const next = prev.filter((r) => r.id !== target.id);
            saveRules(next);
            return next;
          });
          pushLocalExchange(raw, `Removed rule: "${target.text}"`);
          break;
        }
        case "unknown": {
          pushLocalExchange(raw, `Unknown command: ${command.raw}`);
          break;
        }
      }
    },
    [activeId, rules, pushLocalExchange],
  );

  const handleGoHome = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleClearFileChanges = useCallback(() => {
    setFileChanges((prev) => prev.filter((f) => f.conversationId !== activeId));
  }, [activeId]);

  const handleSaveFileChange = useCallback(async (change: FileChange, content: string) => {
    await invoke("write_file_content", { path: change.path, content });
    setFileChanges((prev) =>
      prev.map((f) => (f.id === change.id ? { ...f, newContent: content } : f)),
    );
  }, []);

  const handleSend = useCallback(
    async (text: string, imageDataUrl?: string) => {
      const command = parseSlashCommand(text);
      if (command) {
        if (!activeId) return;
        handleCommand(command, text);
        return;
      }

      if (!session) {
        setShowAuth(true);
        return;
      }

      const userMessage: Message = {
        id: makeId(),
        role: "user",
        content: text,
        imageDataUrl,
        createdAt: Date.now(),
      };
      const assistantId = makeId();
      const requestStartedAt = Date.now();
      let targetId = activeId;

      if (!targetId) {
        const c = makeConversation(`New chat ${conversations.length + 1}`);
        targetId = c.id;
        setConversations((prev) => [c, ...prev]);
        setOpenTabIds((prev) => [...prev, c.id]);
        setActiveId(c.id);
      }

      const existing = conversations.find((c) => c.id === targetId) ?? null;
      // Composer's `disabled` prop can lag a render behind (e.g. rapid double
      // Enter), letting two sends fire for the same conversation before the
      // first's request id lands in activeRequestIdsRef. Bail here so the
      // second send can't overwrite the first's tracked request id.
      if (existing?.status === "running") return;
      const isFirstMessage = (existing?.messages.length ?? 0) === 0;
      const title = isFirstMessage ? text.slice(0, 40) : (existing?.title ?? "New chat");

      let history: Message[] = [];
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== targetId) return c;
          history = [...c.messages, userMessage];
          return {
            ...c,
            title,
            messages: [
              ...c.messages,
              userMessage,
              { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
            ],
            status: "running",
            updatedAt: Date.now(),
          };
        }),
      );

      if (isFirstMessage && session) {
        void generateTitle(text, session.access_token).then((aiTitle) => {
          if (!aiTitle) return;
          setConversations((prev) =>
            prev.map((c) => (c.id === targetId ? { ...c, title: aiTitle } : c)),
          );
        });
      }

      let assistantText = "";
      const applyDelta = (content: string, replace = false) => {
        assistantText = replace ? content : assistantText + content;
        setConversations((prev) =>
          prev.map((c) =>
            c.id === targetId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: replace ? content : m.content + content }
                      : m,
                  ),
                }
              : c,
          ),
        );
      };

      const trimmedHistory = history
        .slice(-settings.contextLimit)
        .map((m) => ({ role: m.role, content: m.content, imageDataUrl: m.imageDataUrl }));
      const activeAgent = settings.activeAgentId
        ? settings.agents.find((a) => a.id === settings.activeAgentId)
        : null;
      const systemContent = [
        activeAgent?.systemPrompt.trim(),
        settings.customInstructions.trim(),
        rulesToPrompt(rules),
        settings.chatMode === "plan" ? PLAN_MODE_INSTRUCTION : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const outgoing = systemContent
        ? [{ role: "system" as const, content: systemContent }, ...trimmedHistory]
        : trimmedHistory;

      const activeProviderId = customProviderIdFromModel(settings.model);
      const activeProvider = activeProviderId
        ? settings.customProviders.find((p) => p.id === activeProviderId)
        : null;
      if (activeProviderId && !activeProvider) {
        applyDelta("⚠ Selected provider was removed. Pick a model in Settings.", true);
        setConversations((prev) =>
          prev.map((c) => (c.id === targetId ? { ...c, status: "done", updatedAt: Date.now() } : c)),
        );
        return;
      }
      const outgoingModel = activeProvider ? activeProvider.model : settings.model;

      try {
        await sendChatMessage(
          outgoing,
          outgoingModel,
          targetId,
          session.access_token,
          (delta, replace) => applyDelta(delta, replace),
          (usage: ChatUsage) => {
            void insertUsageEvent(session.user.id, usage.model, usage.inputTokens, usage.outputTokens);
            track("message_sent", { model: usage.model, chat_mode: settings.chatMode });
            setConversations((prev) =>
              prev.map((c) =>
                c.id === targetId
                  ? {
                      ...c,
                      lastUsage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
                    }
                  : c,
              ),
            );
          },
          (requestId) => activeRequestIdsRef.current.set(targetId, requestId),
          activeProvider ? { baseUrl: activeProvider.baseUrl, apiKey: activeProvider.apiKey } : null,
          (req: ToolApprovalRequest) => {
            if (settings.chatMode === "skip-permissions") {
              track("tool_action_reviewed", { tool: req.tool, approved: true, auto: true });
              void respondToolApproval(req.approvalId, true);
              return;
            }
            setToolApproval(req);
          },
          settings.reasoningEffort,
          existing?.worktreePath,
          isPro,
        );
        if (settings.responseSound) playDoneSound();
        if (settings.notifyOnResponse) {
          void notifyResponse(title, assistantText.slice(0, 120) || "Response ready");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        applyDelta(`${assistantText ? assistantText + "\n\n" : ""}⚠ ${message}`, true);
      } finally {
        activeRequestIdsRef.current.delete(targetId);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === targetId
              ? {
                  ...c,
                  status: "done",
                  updatedAt: Date.now(),
                  messages: c.messages.map((m) =>
                    m.id === assistantId ? { ...m, durationMs: Date.now() - requestStartedAt } : m,
                  ),
                }
              : c,
          ),
        );
      }
    },
    [activeId, settings, session, conversations, rules, handleCommand, isPro],
  );

  const handleStop = useCallback(() => {
    if (!activeId) return;
    const requestId = activeRequestIdsRef.current.get(activeId);
    if (requestId) void stopChatMessage(requestId);
  }, [activeId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;

      if (key === "escape") {
        if (activeId && conversations.find((c) => c.id === activeId)?.status === "running") {
          e.preventDefault();
          handleStop();
        } else if (showAuth) {
          e.preventDefault();
          setShowAuth(false);
        } else if (commandPaletteOpen) {
          e.preventDefault();
          setCommandPaletteOpen(false);
        } else if (historyOpen) {
          e.preventDefault();
          setHistoryOpen(false);
        } else if (settingsOpen) {
          e.preventDefault();
          setSettingsOpen(false);
        }
        return;
      }

      if (!mod) return;

      if (key === "n") {
        e.preventDefault();
        handleNew();
      } else if (key === "b") {
        e.preventDefault();
        if (historyOpen) setHistorySidebarOpen((v) => !v);
        else setSidebarOpen((v) => !v);
      } else if (key === "k") {
        e.preventDefault();
        setSidebarOpen(true);
        setSearchTrigger((t) => t + 1);
      } else if (key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (key === "p") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      } else if (key === "h") {
        e.preventDefault();
        handleGoHome();
      } else if (key === "y") {
        e.preventDefault();
        setHistoryOpen(true);
      } else if (key === "l") {
        e.preventDefault();
        document.getElementById("composer-input")?.focus();
      } else if (key === "w") {
        e.preventDefault();
        if (activeId) handleCloseTab(activeId);
      } else if (key === "]" && e.shiftKey) {
        e.preventDefault();
        if (tabs.length > 1 && activeId) {
          const i = tabs.findIndex((t) => t.id === activeId);
          setActiveId(tabs[(i + 1) % tabs.length].id);
        }
      } else if (key === "[" && e.shiftKey) {
        e.preventDefault();
        if (tabs.length > 1 && activeId) {
          const i = tabs.findIndex((t) => t.id === activeId);
          setActiveId(tabs[(i - 1 + tabs.length) % tabs.length].id);
        }
      } else if (/^[1-9]$/.test(key)) {
        e.preventDefault();
        const target = tabs[Number(key) - 1];
        if (target) setActiveId(target.id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleNew,
    handleGoHome,
    handleStop,
    handleCloseTab,
    activeId,
    conversations,
    tabs,
    showAuth,
    commandPaletteOpen,
    historyOpen,
    settingsOpen,
  ]);

  const commandItems: CommandItem[] = [
    {
      id: "new-chat",
      label: "New chat",
      icon: Plus,
      shortcut: modShortcut("⌘N"),
      onRun: handleNew,
    },
    {
      id: "home",
      label: "Go home",
      icon: Home,
      shortcut: modShortcut("⌘H"),
      onRun: handleGoHome,
    },
    {
      id: "search",
      label: "Search chats",
      icon: Search,
      shortcut: modShortcut("⌘K"),
      onRun: () => {
        setSettingsOpen(false);
        setHistoryOpen(false);
        setSidebarOpen(true);
        setSearchTrigger((t) => t + 1);
      },
    },
    {
      id: "toggle-sidebar",
      label: (historyOpen ? historySidebarOpen : sidebarOpen) ? "Close sidebar" : "Open sidebar",
      icon: (historyOpen ? historySidebarOpen : sidebarOpen) ? PanelLeftClose : PanelLeft,
      shortcut: modShortcut("⌘B"),
      onRun: () =>
        historyOpen ? setHistorySidebarOpen((v) => !v) : setSidebarOpen((v) => !v),
    },
    {
      id: "settings",
      label: "Open settings",
      icon: SettingsIcon,
      shortcut: modShortcut("⌘,"),
      onRun: () => setSettingsOpen(true),
    },
    {
      id: "open-history",
      label: "View changed files",
      icon: History,
      shortcut: modShortcut("⌘Y"),
      onRun: () => setHistoryOpen(true),
    },
    ...(activeId
      ? [
          {
            id: "close-tab",
            label: "Close tab",
            icon: X,
            shortcut: modShortcut("⌘W"),
            onRun: () => handleCloseTab(activeId),
          },
        ]
      : []),
    {
      id: "export-data",
      label: "Export data",
      icon: Download,
      onRun: handleExportData,
    },
    {
      id: "clear-chats",
      label: "Clear all chats",
      icon: Trash2,
      onRun: async () => {
        const ok = await confirm({
          title: "Delete every conversation on this device?",
          description: "This can't be undone.",
          confirmLabel: "Delete",
          danger: true,
        });
        if (ok) handleClearConversations();
      },
    },
    session
      ? { id: "sign-out", label: "Sign out", icon: LogOut, onRun: () => supabase.auth.signOut() }
      : { id: "sign-in", label: "Sign in", icon: LogIn, onRun: () => setShowAuth(true) },
    ...conversations.map((c) => ({
      id: `conversation-${c.id}`,
      label: c.title,
      subtitle: "Chat",
      icon: MessageSquare,
      onRun: () => openConversation(c.id),
    })),
  ];

  let content: React.ReactNode;

  if (pendingMfaSession) {
    content = <MfaChallenge onSignOut={() => supabase.auth.signOut()} />;
  } else if (showAuth) {
    content = <AuthPage onClose={() => setShowAuth(false)} />;
  } else if (historyOpen) {
    content = (
      <ChangeHistoryPage
        changes={fileChanges.filter((f) => f.conversationId === activeId)}
        sidebarOpen={historySidebarOpen}
        onClose={() => setHistoryOpen(false)}
        onClear={handleClearFileChanges}
      />
    );
  } else if (settingsOpen) {
    content = (
      <SettingsPage
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
        sidebarOpen={sidebarOpen}
        userEmail={session?.user.email ?? null}
        userAvatarUrl={session ? getUserAvatarUrl(session.user) : null}
        userDisplayName={
          (session?.user.user_metadata?.display_name as string | undefined)?.trim() || null
        }
        accessToken={session?.access_token ?? null}
        plan={plan}
        isPro={isPro}
        onSignIn={() => {
          setSettingsOpen(false);
          setShowAuth(true);
        }}
        onSignOut={() => supabase.auth.signOut()}
        onClearConversations={handleClearConversations}
        onExportData={handleExportData}
        onCheckForUpdate={handleCheckForUpdate}
      />
    );
  } else {
    content = (
    <div className="flex h-full overflow-hidden">
      <div
        className="shrink-0"
        style={{
          width: sidebarOpen ? 272 : 0,
          transition: "width 220ms cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: sidebarSettled ? "visible" : "hidden",
        }}
        onTransitionEnd={() => {
          if (sidebarOpen) setSidebarSettled(true);
        }}
      >
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={openConversation}
          onNew={handleNew}
          onHome={handleGoHome}
          onOpenSettings={() => setSettingsOpen(true)}
          onRename={handleRenameConversation}
          onTogglePin={handleTogglePin}
          onDelete={handleDeleteConversation}
          folders={folders}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveToFolder={handleMoveToFolder}
          onNewInFolder={handleNewInFolder}
          searchTrigger={searchTrigger}
          user={
            session
              ? {
                  email: session.user.email ?? "",
                  avatarUrl: getUserAvatarUrl(session.user),
                  displayName:
                    (session.user.user_metadata?.display_name as string | undefined)?.trim() ||
                    null,
                }
              : null
          }
          plan={plan}
          onSignIn={() => setShowAuth(true)}
          onSignOut={() => supabase.auth.signOut()}
          theme={settings.theme}
          onThemeChange={(theme) => updateSettings({ theme })}
          onCheckForUpdate={handleCheckForUpdate}
        />
      </div>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TabBar
          tabs={tabs}
          activeId={activeId}
          sidebarOpen={sidebarOpen}
          onSelect={setActiveId}
          onClose={handleCloseTab}
          onNew={handleNew}
          onRename={handleRenameConversation}
          filesPanelOpen={filesPanelOpen}
          onToggleFilesPanel={() => setFilesPanelOpen((v) => !v)}
          changedFilesCount={fileChanges.filter((f) => f.conversationId === activeId).length}
          onOpenHistory={() => setHistoryOpen(true)}
        />
        <ChatPanel
          conversation={activeConversation}
          conversations={conversations}
          onSend={handleSend}
          onStop={handleStop}
          settings={settings}
          isPro={isPro}
          onModelChange={(id) => updateSettings({ model: id })}
          onEffortChange={(effort) => updateSettings({ reasoningEffort: effort })}
          onModeChange={(mode) => updateSettings({ chatMode: mode })}
          onAgentChange={(agentId) => updateSettings({ activeAgentId: agentId })}
          accessToken={session?.access_token ?? null}
          toolApproval={toolApproval}
          onApproveTool={() => handleToolApprovalDecision(true)}
          onRejectTool={() => handleToolApprovalDecision(false)}
        />
      </main>

      <FileChangesPanel
        changes={fileChanges.filter((f) => f.conversationId === activeId)}
        terminalMinimized={terminalMinimized}
        onToggleTerminalMinimized={() => setTerminalMinimized((v) => !v)}
        terminalCwd={activeConversation?.worktreePath}
        open={filesPanelOpen}
        onClose={() => setFilesPanelOpen(false)}
        onSaveChange={handleSaveFileChange}
      />
    </div>
    );
  }

  // macOS and Windows round undecorated top-level windows at the OS level
  // regardless of our CSS; Linux window managers don't, and the window here
  // isn't `transparent` in tauri.conf.json, so drawing rounded-lg corners on
  // top of a still-rectangular window just exposes an unstyled corner.
  const rounded = !maximized && !isLinux;

  return (
    <div
      className={`flex flex-col h-screen box-border border border-border-light overflow-hidden bg-background text-foreground ${
        rounded ? "rounded-lg" : ""
      }`}
    >
      {confirmDialog}
      <ResizeHandles />
      <TitleBar
        sidebarOpen={historyOpen ? historySidebarOpen : sidebarOpen}
        onToggleSidebar={() =>
          historyOpen ? setHistorySidebarOpen((v) => !v) : setSidebarOpen((v) => !v)
        }
        maximized={maximized}
        rounded={rounded}
      />
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        items={commandItems}
      />
      {mcpConnectErrors.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
          {mcpConnectErrors.map((e) => (
            <div
              key={e.id}
              className="rounded-lg border border-border-light bg-background-secondary shadow-lg px-3.5 py-3 text-xs"
              style={{ animation: "toastIn 200ms ease-out" }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-foreground">
                  Couldn&apos;t connect MCP server &ldquo;{e.name}&rdquo;
                </span>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() =>
                    setMcpConnectErrors((prev) => prev.filter((x) => x.id !== e.id))
                  }
                  className="shrink-0 text-foreground-muted hover:text-foreground transition-colors"
                >
                  ×
                </button>
              </div>
              <div className="mt-1 text-foreground-muted">{e.error}</div>
            </div>
          ))}
        </div>
      )}
      {availableUpdate && (
        <UpdateBanner update={availableUpdate} onDismiss={() => setAvailableUpdate(null)} />
      )}
      <div className="flex-1 min-h-0">
        <Suspense fallback={<PageSpinner />}>{content}</Suspense>
      </div>
    </div>
  );
}

export default App;
