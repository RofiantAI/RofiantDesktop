import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Plus,
  ChevronDown,
  Check,
  Lock,
  X,
  Terminal,
  Square,
  Mic,
  Loader2,
  ListChecks,
  MessageCircle,
  Bot,
} from "lucide-react";
import { ALL_MODELS, isProModel, isVisionModel, VISION_MODEL_ID } from "../lib/models";
import { customModelId, type CustomProvider } from "../lib/providers";
import { readImageFile } from "../lib/image";
import { SLASH_COMMANDS } from "../lib/commands";
import { transcribeAudio } from "../lib/groq";
import type { SendKey } from "../lib/settings";
import type { Agent, ChatMode } from "../lib/agents";

export function Composer({
  disabled,
  isRunning,
  onSend,
  onStop,
  model,
  isPro,
  onModelChange,
  spellcheck,
  sendKey,
  accessToken,
  customProviders,
  mode,
  onModeChange,
  agents,
  activeAgentId,
  onAgentChange,
}: {
  disabled: boolean;
  isRunning: boolean;
  onSend: (text: string, imageDataUrl?: string) => void;
  onStop: () => void;
  model: string;
  isPro: boolean;
  onModelChange: (id: string) => void;
  spellcheck: boolean;
  sendKey: SendKey;
  accessToken: string | null;
  customProviders: CustomProvider[];
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  agents: Agent[];
  activeAgentId: string | null;
  onAgentChange: (agentId: string | null) => void;
}) {
  const [value, setValue] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [commandIndex, setCommandIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const transcribeChainRef = useRef<Promise<void>>(Promise.resolve());
  const segmentTimeoutRef = useRef<number | null>(null);
  const SEGMENT_MS = 3000;

  const commandMatches = value.startsWith("/")
    ? SLASH_COMMANDS.filter((c) => c.cmd.toLowerCase().startsWith(value.toLowerCase()))
    : [];
  const showCommandMenu = commandMatches.length > 0 && !(commandMatches.length === 1 && commandMatches[0].cmd === value);

  useEffect(() => {
    setCommandIndex(0);
  }, [value]);

  function applyCommand(cmd: string) {
    const next = `${cmd} `;
    setValue(next);
    ref.current?.focus();
  }

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
    if (!modeOpen) return;
    function handleClick(e: MouseEvent) {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) {
        setModeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modeOpen]);

  async function attachFile(file: File) {
    const result = await readImageFile(file);
    if (!result.ok) {
      setAttachError(result.error);
      return;
    }
    setAttachError(null);
    setImage(result.dataUrl);
    if (!isVisionModel(model)) onModelChange(VISION_MODEL_ID);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void attachFile(file);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    void attachFile(file);
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function transcribeSegment(blob: Blob, mimeType: string, isFinal: boolean) {
    if (blob.size === 0) return;
    if (!accessToken) return;
    if (isFinal) setIsTranscribing(true);
    try {
      const base64 = await blobToBase64(blob);
      const text = await transcribeAudio(base64, mimeType, accessToken);
      if (text) {
        setValue((v) => (v ? `${v} ${text}` : text));
        ref.current?.focus();
      }
    } catch (err) {
      const message =
        typeof err === "string" ? err : err instanceof Error ? err.message : "Transcription failed";
      console.error("transcribe failed", err);
      setVoiceError(message);
    } finally {
      if (isFinal) setIsTranscribing(false);
    }
  }

  function runSegment() {
    const stream = streamRef.current;
    if (!stream || !isRecordingRef.current) return;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const isFinal = !isRecordingRef.current;
      if (!isFinal) runSegment();
      const blob = new Blob(chunks, { type: mimeType });
      transcribeChainRef.current = transcribeChainRef.current.then(() =>
        transcribeSegment(blob, mimeType, isFinal)
      );
      if (isFinal) {
        void transcribeChainRef.current.then(() => {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        });
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    segmentTimeoutRef.current = window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, SEGMENT_MS);
  }

  async function startRecording() {
    setVoiceError(null);
    if (!accessToken) {
      setVoiceError("Sign in to use voice input");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      isRecordingRef.current = true;
      transcribeChainRef.current = Promise.resolve();
      setIsRecording(true);
      runSegment();
    } catch {
      setVoiceError("Microphone access denied");
    }
  }

  function stopRecording() {
    isRecordingRef.current = false;
    setIsRecording(false);
    if (segmentTimeoutRef.current !== null) {
      window.clearTimeout(segmentTimeoutRef.current);
      segmentTimeoutRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
  }

  function toggleRecording() {
    if (isRecording) stopRecording();
    else void startRecording();
  }

  function submit() {
    const trimmed = value.trim();
    if ((!trimmed && !image) || disabled) return;
    onSend(trimmed, image ?? undefined);
    setValue("");
    setImage(null);
    setAttachError(null);
    if (ref.current) ref.current.style.height = "auto";
  }

  const activeModel = ALL_MODELS.find((m) => m.id === model);
  const activeCustomProvider = customProviders.find((p) => customModelId(p.id) === model);
  const activeAgent = agents.find((a) => a.id === activeAgentId) ?? null;
  const modeLabel = activeAgent ? activeAgent.name : mode === "plan" ? "Plan" : "Ask";
  const ModeIcon = activeAgent ? Bot : mode === "plan" ? ListChecks : MessageCircle;

  return (
    <div className="shrink-0 px-6 pb-5 pt-1">
      <div className="max-w-[720px] mx-auto relative">
        {showCommandMenu && (
          <div className="absolute bottom-full left-0 mb-2 w-full rounded-lg border border-border bg-card shadow-lg py-1 z-10 overflow-hidden">
            {commandMatches.map((c, i) => (
              <button
                key={c.cmd}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyCommand(c.cmd)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  i === commandIndex ? "bg-background-tertiary" : "hover:bg-background-tertiary"
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
                <span className="text-[13px] text-foreground font-medium">{c.cmd}</span>
                <span className="text-[11px] text-foreground-muted truncate">{c.desc}</span>
              </button>
            ))}
          </div>
        )}
      <div className="rounded-2xl border border-border bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)] focus-within:border-border-light transition-colors">
        {image && (
          <div className="flex items-center gap-2 px-3 pt-2.5">
            <div className="relative shrink-0">
              <img src={image} alt="Attached" className="w-10 h-10 rounded-md object-cover border border-border" />
              <button
                type="button"
                onClick={() => setImage(null)}
                title="Remove image"
                className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-foreground text-background"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        )}
        {attachError && (
          <div className="flex items-center justify-between gap-2 px-3 pt-2 text-[11px] text-red-500">
            <span>{attachError}</span>
            <button
              type="button"
              onClick={() => setAttachError(null)}
              title="Dismiss"
              className="shrink-0 text-red-500/70 hover:text-red-500"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {voiceError && (
          <div className="flex items-center justify-between gap-2 px-3 pt-2 text-[11px] text-red-500">
            <span>{voiceError}</span>
            <button
              type="button"
              onClick={() => setVoiceError(null)}
              title="Dismiss"
              className="shrink-0 text-red-500/70 hover:text-red-500"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 px-3 pt-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
            title="Attach"
          >
            <Plus className="w-4 h-4" />
          </button>
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (showCommandMenu) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCommandIndex((i) => (i + 1) % commandMatches.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCommandIndex((i) => (i - 1 + commandMatches.length) % commandMatches.length);
                  return;
                }
                if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                  e.preventDefault();
                  applyCommand(commandMatches[commandIndex].cmd);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setValue("");
                  return;
                }
              }
              const isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
              if (!isEnter || e.nativeEvent.isComposing || e.shiftKey) return;
              const mod = e.metaKey || e.ctrlKey;
              if (sendKey === "mod-enter" ? !mod : mod) return;
              e.preventDefault();
              submit();
            }}
            onPaste={handlePaste}
            spellCheck={spellcheck}
            rows={1}
            placeholder="Ask anything..."
            className="flex-1 resize-none bg-transparent text-[14px] text-foreground placeholder:text-foreground-muted outline-none py-1 max-h-40"
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-2 pt-1">
          <div className="flex items-center gap-3 min-w-0">
          <div className="relative" ref={modeRef}>
            <button
              type="button"
              onClick={() => setModeOpen((v) => !v)}
              className="flex items-center gap-1 text-[12px] text-foreground-muted hover:text-foreground transition-colors"
            >
              <ModeIcon className="w-3 h-3" />
              {modeLabel}
              <ChevronDown className="w-3 h-3" />
            </button>
            {modeOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-56 rounded-lg border border-border bg-card shadow-lg py-1 z-10">
                <button
                  type="button"
                  onClick={() => {
                    onModeChange("ask");
                    onAgentChange(null);
                    setModeOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-background-tertiary"
                >
                  <span className="flex items-center gap-2">
                    <MessageCircle className="w-3.5 h-3.5 text-foreground-muted" />
                    <span>
                      <span className="block text-[13px] text-foreground font-medium">Ask</span>
                      <span className="block text-[11px] text-foreground-muted">Normal chat</span>
                    </span>
                  </span>
                  {mode === "ask" && !activeAgent && (
                    <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onModeChange("plan");
                    onAgentChange(null);
                    setModeOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-background-tertiary"
                >
                  <span className="flex items-center gap-2">
                    <ListChecks className="w-3.5 h-3.5 text-foreground-muted" />
                    <span>
                      <span className="block text-[13px] text-foreground font-medium">Plan</span>
                      <span className="block text-[11px] text-foreground-muted">
                        Outline steps before acting
                      </span>
                    </span>
                  </span>
                  {mode === "plan" && !activeAgent && (
                    <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                  )}
                </button>
                {agents.length > 0 && (
                  <>
                    <div className="my-1 border-t border-border" />
                    <div className="px-3 pt-1 pb-0.5 text-[10px] font-medium text-foreground-muted uppercase tracking-wide">
                      Agents
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {agents.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            onAgentChange(a.id);
                            setModeOpen(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-background-tertiary"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Bot className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
                            <span className="text-[13px] text-foreground font-medium truncate">
                              {a.name}
                            </span>
                          </span>
                          {activeAgentId === a.id && (
                            <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
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
              <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-border bg-card shadow-lg py-1 z-10">
                {customProviders.length > 0 && (
                  <div className="max-h-40 overflow-y-auto">
                    {customProviders.map((p) => {
                      const id = customModelId(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            onModelChange(id);
                            setModelOpen(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-background-tertiary"
                        >
                          <span>
                            <span className="text-[13px] text-foreground font-medium">{p.name}</span>
                            <span className="block text-[11px] text-foreground-muted">{p.model}</span>
                          </span>
                          {model === id && <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
                        </button>
                      );
                    })}
                    <div className="my-1 border-t border-border" />
                  </div>
                )}
                {ALL_MODELS.map((m) => {
                  const locked = !isPro && isProModel(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={locked}
                      onClick={() => {
                        onModelChange(m.id);
                        setModelOpen(false);
                        if (image && !isVisionModel(m.id)) setImage(null);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
                        locked ? "opacity-60 cursor-not-allowed" : "hover:bg-background-tertiary"
                      }`}
                    >
                      <span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-[13px] text-foreground font-medium">{m.name}</span>
                          {locked && (
                            <span className="flex items-center gap-0.5 text-[10px] font-medium text-foreground-muted bg-background-tertiary border border-border rounded px-1 py-0.5">
                              <Lock className="w-2.5 h-2.5" />
                              Pro
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] text-foreground-muted">{m.desc}</span>
                      </span>
                      {!locked && model === m.id && (
                        <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          </div>
          {isRunning ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop generating"
              className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background transition-colors shrink-0"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
            </button>
          ) : isRecording || (!value.trim() && !image) ? (
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isTranscribing}
              title={isRecording ? "Stop recording" : "Speak"}
              className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors shrink-0 ${
                isRecording
                  ? "text-red-500 bg-red-500/10 animate-pulse"
                  : "bg-foreground text-background disabled:bg-background-tertiary disabled:text-foreground-muted"
              }`}
            >
              {isTranscribing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={disabled}
              className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background disabled:bg-background-tertiary disabled:text-foreground-muted transition-colors shrink-0"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className="text-center text-[11px] text-foreground-muted mt-2">
        AI can make mistakes. Double-check important responses.
      </p>
      </div>
    </div>
  );
}
