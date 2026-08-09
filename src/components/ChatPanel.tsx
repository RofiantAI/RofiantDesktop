import { useEffect, useRef } from "react";
import { Dotm3x3_20 } from "./ui/dotm-3x3-20";
import type { Conversation } from "../types";
import type { AppSettings } from "../lib/settings";
import type { ChatMode } from "../lib/agents";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
// Project/worktree attach is disabled for now — see ProjectBar.tsx,
// lib/git.ts, and git_worktree_* in lib.rs, all left in place to resume.
// import { ProjectBar } from "./ProjectBar";
import { ToolApprovalCard } from "./ToolApprovalCard";
import type { ToolApprovalRequest } from "../lib/groq";

export function ChatPanel({
  conversation,
  conversations,
  onSend,
  onStop,
  settings,
  isPro,
  onModelChange,
  onSelectLocalModel,
  onEffortChange,
  onModeChange,
  onAgentChange,
  accessToken,
  toolApproval,
  onApproveTool,
  onRejectTool,
}: {
  conversation: Conversation | null;
  conversations: Conversation[];
  onSend: (text: string, imageDataUrl?: string) => void;
  onStop: () => void;
  settings: AppSettings;
  isPro: boolean;
  onModelChange: (id: string) => void;
  onSelectLocalModel: (id: string, name: string) => void;
  onEffortChange: (effort: AppSettings["reasoningEffort"]) => void;
  onModeChange: (mode: ChatMode) => void;
  onAgentChange: (agentId: string | null) => void;
  accessToken: string | null;
  toolApproval: ToolApprovalRequest | null;
  onApproveTool: () => void;
  onRejectTool: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageContent = conversation?.messages.at(-1)?.content;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [conversation?.messages.length, lastMessageContent]);

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <img src="/grey.svg" alt="" className="w-12 h-12" />
          <p className="text-2xl text-foreground-secondary">What can I help with?</p>
        </div>
        <Composer
          disabled={false}
          isRunning={false}
          onSend={onSend}
          onStop={onStop}
          model={settings.model}
          isPro={isPro}
          onModelChange={onModelChange}
          onSelectLocalModel={onSelectLocalModel}
          effort={settings.reasoningEffort}
          onEffortChange={onEffortChange}
          spellcheck={settings.spellcheck}
          sendKey={settings.sendKey}
          accessToken={accessToken}
          customProviders={settings.customProviders}
          mode={settings.chatMode}
          onModeChange={onModeChange}
          agents={settings.agents}
          activeAgentId={settings.activeAgentId}
          onAgentChange={onAgentChange}
          contextUsage={null}
          conversations={conversations}
          currentConversationId={null}
        />
      </div>
    );
  }

  const lastMessage = conversation.messages.at(-1);
  const isStreaming =
    conversation.status === "running" && lastMessage?.role === "assistant";
  const spacing = settings.density === "compact" ? "space-y-3" : "space-y-6";
  const textSize =
    settings.fontSize === "sm"
      ? "text-[13px]"
      : settings.fontSize === "lg"
        ? "text-[16px]"
        : "text-[15px]";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {conversation.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <img src="/grey.svg" alt="" className="w-12 h-12" />
            <p className="text-2xl text-foreground-secondary">What can I help with?</p>
          </div>
        ) : (
          <div
            className={`max-w-[720px] mx-auto px-6 py-8 ${spacing} ${textSize}`}
          >
            {conversation.messages.map((m, i) => (
              <div key={m.id} className="group min-w-0">
                {m.role === "assistant" &&
                  isStreaming &&
                  i === conversation.messages.length - 1 && (
                    <div className="flex items-center gap-1.5 text-xs text-foreground-muted mb-2">
                      <Dotm3x3_20 size={14} dotSize={2} speed={1.2} colorPreset="grad-sunset" />
                      Working…
                    </div>
                  )}
                <MessageBubble
                  message={m}
                  showTimestamp={settings.showTimestamps}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      {toolApproval && (
        <ToolApprovalCard
          summary={toolApproval.summary}
          onApprove={onApproveTool}
          onReject={onRejectTool}
        />
      )}
      <Composer
        disabled={conversation.status === "running"}
        isRunning={conversation.status === "running"}
        onSend={onSend}
        onStop={onStop}
        model={settings.model}
        isPro={isPro}
        onModelChange={onModelChange}
        onSelectLocalModel={onSelectLocalModel}
        effort={settings.reasoningEffort}
        onEffortChange={onEffortChange}
        spellcheck={settings.spellcheck}
        sendKey={settings.sendKey}
        accessToken={accessToken}
        customProviders={settings.customProviders}
        mode={settings.chatMode}
        onModeChange={onModeChange}
        agents={settings.agents}
        activeAgentId={settings.activeAgentId}
        onAgentChange={onAgentChange}
        contextUsage={conversation.lastUsage ?? null}
        conversations={conversations}
        currentConversationId={conversation.id}
      />
    </div>
  );
}
