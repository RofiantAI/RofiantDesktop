export const FREE_MODELS = [
  {
    id: "openai/gpt-oss-20b",
    name: "GPT OSS 20B",
    desc: "Fast: great for quick back-and-forth",
  },
  {
    id: "llama-3.1-8b-instant",
    name: "Llama 3.1 8B Instant",
    desc: "Lightest, fastest, best for avoiding rate limits",
  },
  {
    id: "qwen/qwen3.6-27b",
    name: "Qwen 3.6 27B",
    desc: "Supports image uploads for vision tasks",
  },
  {
    id: "kiro-auto",
    name: "Kiro Auto",
    desc: "good general-purpose fallback",
  },
] as const;

export const PRO_MODELS = [
  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    desc: "Best for deep thinking and tough problems",
  },
] as const;

export const ALL_MODELS = [...FREE_MODELS, ...PRO_MODELS];

// DMC is a Rofiant-hosted gateway (see supabase/functions/dmc-proxy and
// model_uses_dmc in src-tauri/src/lib.rs — kept in sync manually, same note
// as PRO_MODEL_IDS in supabase/functions/groq-proxy). Free for everyone, so
// it's kept out of ALL_MODELS/isProModel and given its own group in the
// model picker instead of blending into "Cloud models".
// Commented out for now — see ModelPicker.tsx and model_uses_dmc in
// src-tauri/src/lib.rs for the other disabled pieces.
export const DMC_MODELS: { id: string; name: string }[] = [
  // { id: "GLM-4.7-Flash", name: "GLM 4.7 Flash" },
  // { id: "Qwen3.6-35B-A3B-NVFP4", name: "Qwen 3.6 35B A3B" },
  // { id: "Qwen3-Coder-Next-FP8", name: "Qwen3 Coder Next" },
];

const DMC_MODEL_IDS = new Set<string>(DMC_MODELS.map((m) => m.id));

export function isDmcModel(id: string): boolean {
  return DMC_MODEL_IDS.has(id);
}

const FREE_MODEL_IDS = new Set<string>(FREE_MODELS.map((m) => m.id));
const ALL_MODEL_IDS = new Set<string>(ALL_MODELS.map((m) => m.id));

export const DEFAULT_FREE_MODEL = "openai/gpt-oss-20b";
export const DEFAULT_PRO_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_MODEL = DEFAULT_PRO_MODEL;

export function isProModel(id: string): boolean {
  return !FREE_MODEL_IDS.has(id);
}

export function defaultModelForPlan(isPro: boolean): string {
  return isPro ? DEFAULT_PRO_MODEL : DEFAULT_FREE_MODEL;
}

export function clampModelForPlan(model: string, isPro: boolean): string {
  if (model.startsWith("custom:") || isDmcModel(model)) return model;
  if (!ALL_MODEL_IDS.has(model)) return defaultModelForPlan(isPro);
  if (!isPro && isProModel(model)) return DEFAULT_FREE_MODEL;
  return model;
}

export const VISION_MODEL_ID = "qwen/qwen3.6-27b";

export function isVisionModel(id: string): boolean {
  return id === VISION_MODEL_ID;
}

export const EFFORT_LEVELS = ["low", "medium", "high"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];
export const DEFAULT_EFFORT: EffortLevel = "medium";

// Groq only honors reasoning_effort for the gpt-oss family today — sent to
// any other model it's silently ignored, but keep the picker itself scoped
// to models that actually respond to it.
export function supportsEffort(id: string): boolean {
  return id.startsWith("openai/gpt-oss");
}

// Max context window (tokens) per model, for the context-usage indicator in
// the composer. Verified against Groq's docs for the models actually hosted
// there (openai/gpt-oss-20b, openai/gpt-oss-120b, llama-3.1-8b-instant all
// list 131,072). The rest (DMC/Logfare-hosted, custom providers) aren't on a
// public spec sheet, so they fall back to that same figure as a best-effort
// default — update here if the real number for one of those turns out to
// differ.
const DEFAULT_CONTEXT_WINDOW = 131_072;

const CONTEXT_WINDOW_SIZES: Record<string, number> = {
  "openai/gpt-oss-20b": 131_072,
  "openai/gpt-oss-120b": 131_072,
  "llama-3.1-8b-instant": 131_072,
};

export function contextWindowForModel(model: string): number {
  return CONTEXT_WINDOW_SIZES[model] ?? DEFAULT_CONTEXT_WINDOW;
}

// Models proxied through Logfare (see supabase/functions/logfare-proxy and
// model_uses_logfare in src-tauri/src/lib.rs — kept in sync manually).
// Logfare is a free community-run inference API with no uptime guarantee,
// so these are flagged as potentially unstable in the model picker.
const LOGFARE_MODEL_IDS = new Set<string>(["kiro-auto"]);

export function isLogfareModel(id: string): boolean {
  return LOGFARE_MODEL_IDS.has(id);
}
