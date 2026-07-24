import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import type { Conversation } from "../types";
import type { AppSettings } from "../lib/settings";
import type { ChatMode } from "../lib/agents";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { ToolApprovalCard } from "./ToolApprovalCard";
import type { ToolApprovalRequest } from "../lib/groq";

export function ChatPanel({
  conversation,
  onSend,
  onStop,
  settings,
  isPro,
  onModelChange,
  onModeChange,
  onAgentChange,
  accessToken,
  toolApproval,
  onApproveTool,
  onRejectTool,
}: {
  conversation: Conversation | null;
  onSend: (text: string, imageDataUrl?: string) => void;
  onStop: () => void;
  settings: AppSettings;
  isPro: boolean;
  onModelChange: (id: string) => void;
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
      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <p className="text-lg text-foreground-secondary mb-6">What can I help with?</p>
        <div className="w-full">
          <Composer
            disabled={false}
            isRunning={false}
            onSend={onSend}
            onStop={onStop}
            model={settings.model}
            isPro={isPro}
            onModelChange={onModelChange}
            spellcheck={settings.spellcheck}
            sendKey={settings.sendKey}
            accessToken={accessToken}
            customProviders={settings.customProviders}
            mode={settings.chatMode}
            onModeChange={onModeChange}
            agents={settings.agents}
            activeAgentId={settings.activeAgentId}
            onAgentChange={onAgentChange}
          />
        </div>
      </div>
    );
  }

  const lastMessage = conversation.messages.at(-1);
  const isStreaming = conversation.status === "running" && lastMessage?.role === "assistant";
  const spacing = settings.density === "compact" ? "space-y-3" : "space-y-6";
  const textSize =
    settings.fontSize === "sm" ? "text-[13px]" : settings.fontSize === "lg" ? "text-[16px]" : "text-[15px]";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className={`max-w-[720px] mx-auto px-6 py-8 ${spacing} ${textSize}`}>
          {conversation.messages.map((m, i) => (
            <div key={m.id} className="group min-w-0">
              {m.role === "assistant" &&
                isStreaming &&
                i === conversation.messages.length - 1 && (
                  <div className="flex items-center gap-1.5 text-xs text-foreground-muted mb-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Working…
                  </div>
                )}
              <MessageBubble message={m} showTimestamp={settings.showTimestamps} />
            </div>
          ))}
        </div>
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
        spellcheck={settings.spellcheck}
        sendKey={settings.sendKey}
        accessToken={accessToken}
        customProviders={settings.customProviders}
        mode={settings.chatMode}
        onModeChange={onModeChange}
        agents={settings.agents}
        activeAgentId={settings.activeAgentId}
        onAgentChange={onAgentChange}
      />
    </div>
  );
}
