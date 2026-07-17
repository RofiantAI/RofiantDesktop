import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Update } from "@tauri-apps/plugin-updater";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "./components/Sidebar";
import { UpdateBanner } from "./components/UpdateBanner";
import { TabBar } from "./components/TabBar";
import { ChatPanel } from "./components/ChatPanel";
import { SettingsPage } from "./components/SettingsPage";
import { AuthPage } from "./components/AuthPage";
import { FileChangesPanel } from "./components/FileChangesPanel";
import { ChangeHistoryPage } from "./components/ChangeHistoryPage";
import { TitleBar } from "./components/TitleBar";
import { ResizeHandles } from "./components/ResizeHandles";
import { CommandPalette } from "./components/CommandPalette";
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
import { generateTitle, sendChatMessage, stopChatMessage } from "./lib/groq";
import type { ChatUsage } from "./lib/groq";
import { customProviderIdFromModel } from "./lib/providers";
import { supabase } from "./lib/supabase";
import {
  clearRemoteConversations,
  deleteRemoteConversation,
  ensureRemoteConversation,
  fetchRemoteConversations,
  insertRemoteMessage,
  insertUsageEvent,
  setRemotePinned,
  touchRemoteConversation,
} from "./lib/sync";
import { loadSettings, saveSettings, resolveTheme, playDoneSound, notifyResponse } from "./lib/settings";
import { loadFileChanges, saveFileChanges } from "./lib/fileChanges";
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
import type { Conversation, FileChange, Message } from "./types";

interface FileChangeEventPayload {
  conversation_id: string;
  path: string;
  old_content: string | null;
  new_content: string;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function makeConversation(title = "New chat"): Conversation {
  return {
    id: makeId(),
    title,
    messages: [],
    updatedAt: Date.now(),
    status: "idle",
  };
}

const initial = makeConversation("Welcome");

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([initial]);
  const [openTabIds, setOpenTabIds] = useState<string[]>([initial.id]);
  const [activeId, setActiveId] = useState<string | null>(initial.id);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [rules, setRules] = useState<Rule[]>(() => loadRules());
  const [session, setSession] = useState<Session | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [fileChanges, setFileChanges] = useState<FileChange[]>(() => loadFileChanges());
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const activeRequestIdsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    checkForUpdate().then(setAvailableUpdate);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      // The cached session's user_metadata (avatar, plan, ...) can be stale —
      // refresh it from the server so changes made on the website (e.g. a
      // newly uploaded profile picture) show up without a manual sign-out.
      if (data.session) void supabase.auth.refreshSession();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) setShowAuth(false);
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

  const loadedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user.id ?? null;
    const syncKey = `${userId ?? "anon"}:${settings.websiteSync}`;
    if (syncKey === loadedUserIdRef.current) return;
    loadedUserIdRef.current = syncKey;

    if (!userId || !settings.websiteSync) {
      const fresh = makeConversation("Welcome");
      setConversations([fresh]);
      setOpenTabIds([fresh.id]);
      setActiveId(fresh.id);
      return;
    }

    let cancelled = false;
    fetchRemoteConversations(userId).then((remote) => {
      if (cancelled) return;
      const loaded = remote.length > 0 ? remote : [makeConversation("Welcome")];
      setConversations(loaded);
      setOpenTabIds([loaded[0].id]);
      setActiveId(loaded[0].id);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id, settings.websiteSync]);

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
      setFilesPanelOpen(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

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
  }, [conversations.length]);

  const handleRenameConversation = useCallback(
    (id: string, title: string) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
      const target = conversations.find((c) => c.id === id);
      if (settings.websiteSync && target?.remoteId) void touchRemoteConversation(target.remoteId, title);
    },
    [conversations, settings.websiteSync],
  );

  const handleTogglePin = useCallback(
    (id: string) => {
      const target = conversations.find((c) => c.id === id);
      if (!target) return;
      const nextPinned = !target.pinned;
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: nextPinned } : c)));
      if (settings.websiteSync && target.remoteId) void setRemotePinned(target.remoteId, nextPinned);
    },
    [conversations, settings.websiteSync],
  );

  const handleDeleteConversation = useCallback(
    (id: string) => {
      const target = conversations.find((c) => c.id === id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setOpenTabIds((prev) => {
        const next = prev.filter((t) => t !== id);
        if (activeId === id) {
          setActiveId(next.at(-1) ?? null);
        }
        return next;
      });
      if (settings.websiteSync && target?.remoteId) void deleteRemoteConversation(target.remoteId);
    },
    [conversations, activeId, settings.websiteSync],
  );

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
    if (session && settings.websiteSync) void clearRemoteConversations(session.user.id);
    const fresh = makeConversation("Welcome");
    setConversations([fresh]);
    setOpenTabIds([fresh.id]);
    setActiveId(fresh.id);
  }, [session, settings.websiteSync]);

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
      let targetId = activeId;

      if (!targetId) {
        const c = makeConversation(`New chat ${conversations.length + 1}`);
        targetId = c.id;
        setConversations((prev) => [c, ...prev]);
        setOpenTabIds((prev) => [...prev, c.id]);
        setActiveId(c.id);
      }

      const existing = conversations.find((c) => c.id === targetId) ?? null;
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

      let remoteId = existing?.remoteId ?? null;
      if (session && settings.websiteSync) {
        if (!remoteId) {
          remoteId = await ensureRemoteConversation(session.user.id, title);
          if (remoteId) {
            const resolvedRemoteId = remoteId;
            setConversations((prev) =>
              prev.map((c) => (c.id === targetId ? { ...c, remoteId: resolvedRemoteId } : c)),
            );
          }
        } else if (isFirstMessage === false) {
          void touchRemoteConversation(remoteId, title);
        }
        if (remoteId) void insertRemoteMessage(remoteId, "user", text, imageDataUrl);
      }

      if (isFirstMessage && session && settings.websiteSync) {
        const resolvedRemoteId = remoteId;
        void generateTitle(text, session.access_token).then((aiTitle) => {
          if (!aiTitle) return;
          setConversations((prev) =>
            prev.map((c) => (c.id === targetId ? { ...c, title: aiTitle } : c)),
          );
          if (resolvedRemoteId) void touchRemoteConversation(resolvedRemoteId, aiTitle);
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
          (delta) => applyDelta(delta),
          (usage: ChatUsage) => {
            void insertUsageEvent(session.user.id, usage.model, usage.inputTokens, usage.outputTokens);
          },
          (requestId) => activeRequestIdsRef.current.set(targetId, requestId),
          activeProvider ? { baseUrl: activeProvider.baseUrl, apiKey: activeProvider.apiKey } : null,
        );
        if (settings.responseSound) playDoneSound();
        if (settings.notifyOnResponse) {
          void notifyResponse(title, assistantText.slice(0, 120) || "Response ready");
        }
        if (remoteId && settings.websiteSync) void insertRemoteMessage(remoteId, "assistant", assistantText);
      } catch (err) {
        applyDelta(`⚠ ${err instanceof Error ? err.message : String(err)}`, true);
      } finally {
        activeRequestIdsRef.current.delete(targetId);
        setConversations((prev) =>
          prev.map((c) => (c.id === targetId ? { ...c, status: "done", updatedAt: Date.now() } : c)),
        );
      }
    },
    [activeId, settings, session, conversations, rules, handleCommand],
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
        setSidebarOpen((v) => !v);
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
      shortcut: "⌘N",
      onRun: handleNew,
    },
    {
      id: "home",
      label: "Go home",
      icon: Home,
      shortcut: "⌘H",
      onRun: handleGoHome,
    },
    {
      id: "search",
      label: "Search chats",
      icon: Search,
      shortcut: "⌘K",
      onRun: () => {
        setSettingsOpen(false);
        setHistoryOpen(false);
        setSidebarOpen(true);
        setSearchTrigger((t) => t + 1);
      },
    },
    {
      id: "toggle-sidebar",
      label: sidebarOpen ? "Close sidebar" : "Open sidebar",
      icon: sidebarOpen ? PanelLeftClose : PanelLeft,
      shortcut: "⌘B",
      onRun: () => setSidebarOpen((v) => !v),
    },
    {
      id: "settings",
      label: "Open settings",
      icon: SettingsIcon,
      shortcut: "⌘,",
      onRun: () => setSettingsOpen(true),
    },
    {
      id: "open-history",
      label: "View changed files",
      icon: History,
      shortcut: "⌘Y",
      onRun: () => setHistoryOpen(true),
    },
    ...(activeId
      ? [
          {
            id: "close-tab",
            label: "Close tab",
            icon: X,
            shortcut: "⌘W",
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
      onRun: () => {
        if (window.confirm("Delete every conversation on this device? This can't be undone.")) {
          handleClearConversations();
        }
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

  if (showAuth) {
    content = <AuthPage onClose={() => setShowAuth(false)} />;
  } else if (historyOpen) {
    content = (
      <ChangeHistoryPage
        changes={fileChanges.filter((f) => f.conversationId === activeId)}
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
        userEmail={session?.user.email ?? null}
        userAvatarUrl={session ? getUserAvatarUrl(session.user) : null}
        plan={plan}
        isPro={isPro}
        onSignIn={() => {
          setSettingsOpen(false);
          setShowAuth(true);
        }}
        onSignOut={() => supabase.auth.signOut()}
        onClearConversations={handleClearConversations}
        onExportData={handleExportData}
      />
    );
  } else {
    content = (
    <div className="flex h-full overflow-hidden">
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: sidebarOpen ? 272 : 0,
          transition: "width 220ms cubic-bezier(0.4, 0, 0.2, 1)",
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
          searchTrigger={searchTrigger}
          user={
            session
              ? { email: session.user.email ?? "", avatarUrl: getUserAvatarUrl(session.user) }
              : null
          }
          plan={plan}
          onSignIn={() => setShowAuth(true)}
          onSignOut={() => supabase.auth.signOut()}
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
          filesPanelOpen={filesPanelOpen}
          onToggleFilesPanel={() => setFilesPanelOpen((v) => !v)}
          changedFilesCount={fileChanges.filter((f) => f.conversationId === activeId).length}
          onOpenHistory={() => setHistoryOpen(true)}
        />
        <ChatPanel
          conversation={activeConversation}
          onSend={handleSend}
          onStop={handleStop}
          settings={settings}
          isPro={isPro}
          onModelChange={(id) => updateSettings({ model: id })}
          onModeChange={(mode) => updateSettings({ chatMode: mode })}
          onAgentChange={(agentId) => updateSettings({ activeAgentId: agentId })}
          accessToken={session?.access_token ?? null}
        />
      </main>

      {filesPanelOpen && (
        <FileChangesPanel
          changes={fileChanges.filter((f) => f.conversationId === activeId)}
          onClose={() => setFilesPanelOpen(false)}
        />
      )}
    </div>
    );
  }

  return (
    <div className="flex flex-col h-screen box-border border border-border-light overflow-hidden bg-background text-foreground">
      <ResizeHandles />
      <TitleBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        items={commandItems}
      />
      {availableUpdate && (
        <UpdateBanner update={availableUpdate} onDismiss={() => setAvailableUpdate(null)} />
      )}
      <div className="flex-1 min-h-0">{content}</div>
    </div>
  );
}

export default App;
