import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface LocalModelDef {
  id: string;
  name: string;
  size: string;
  desc: string;
}

// Curated catalog of well-supported Ollama models, spanning small
// (phone/laptop friendly) to large (workstation/server) sizes.
export const EASY_LOCAL_MODELS: LocalModelDef[] = [
  // --- Llama family ---
  {
    id: "llama3.2:1b",
    name: "Llama 3.2 1B",
    size: "1.3 GB",
    desc: "Smallest and fastest — runs well on almost any machine.",
  },
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 3B",
    size: "2.0 GB",
    desc: "Meta's small general-purpose model, balanced speed and quality.",
  },
  {
    id: "llama3.1:8b",
    name: "Llama 3.1 8B",
    size: "4.7 GB",
    desc: "Meta's solid all-rounder for chat and reasoning.",
  },
  {
    id: "llama3.1:70b",
    name: "Llama 3.1 70B",
    size: "40 GB",
    desc: "Large Meta model — needs a beefy GPU or lots of RAM.",
  },
  {
    id: "llama3:8b",
    name: "Llama 3 8B",
    size: "4.7 GB",
    desc: "Previous-gen Meta general-purpose model.",
  },
  {
    id: "llama2:7b",
    name: "Llama 2 7B",
    size: "3.8 GB",
    desc: "Classic Meta chat model, still widely compatible.",
  },
  {
    id: "codellama:7b",
    name: "Code Llama 7B",
    size: "3.8 GB",
    desc: "Meta's model fine-tuned for code generation.",
  },
  {
    id: "codellama:13b",
    name: "Code Llama 13B",
    size: "7.4 GB",
    desc: "Larger Code Llama for tougher coding tasks.",
  },

  // --- Phi family ---
  {
    id: "phi3:mini",
    name: "Phi-3 Mini",
    size: "2.2 GB",
    desc: "Microsoft's compact model, strong at reasoning for its size.",
  },
  {
    id: "phi3:medium",
    name: "Phi-3 Medium",
    size: "7.9 GB",
    desc: "Larger Phi-3, better quality at moderate size.",
  },
  {
    id: "phi3.5:3.8b",
    name: "Phi-3.5 Mini",
    size: "2.2 GB",
    desc: "Updated Phi-3 mini with improved instruction following.",
  },

  // --- Gemma family ---
  {
    id: "gemma2:2b",
    name: "Gemma 2 2B",
    size: "1.6 GB",
    desc: "Google's lightweight model, tuned for everyday chat.",
  },
  {
    id: "gemma2:9b",
    name: "Gemma 2 9B",
    size: "5.4 GB",
    desc: "Google's mid-size model, good general quality.",
  },
  {
    id: "gemma2:27b",
    name: "Gemma 2 27B",
    size: "16 GB",
    desc: "Google's largest Gemma 2 — needs a strong GPU.",
  },

  // --- Mistral family ---
  {
    id: "mistral:7b",
    name: "Mistral 7B",
    size: "4.1 GB",
    desc: "Fast and capable general-purpose model from Mistral AI.",
  },
  {
    id: "mistral-nemo:12b",
    name: "Mistral Nemo 12B",
    size: "7.1 GB",
    desc: "Mistral AI's mid-size model built with NVIDIA.",
  },
  {
    id: "mixtral:8x7b",
    name: "Mixtral 8x7B",
    size: "26 GB",
    desc: "Mistral AI's mixture-of-experts model — high quality, large.",
  },

  // --- Qwen family ---
  {
    id: "qwen2.5:0.5b",
    name: "Qwen 2.5 0.5B",
    size: "0.4 GB",
    desc: "Tiny Alibaba model — runs almost anywhere.",
  },
  {
    id: "qwen2.5:3b",
    name: "Qwen 2.5 3B",
    size: "1.9 GB",
    desc: "Small Qwen model with good multilingual support.",
  },
  {
    id: "qwen2.5:7b",
    name: "Qwen 2.5 7B",
    size: "4.7 GB",
    desc: "Balanced Qwen model, strong at coding and reasoning.",
  },
  {
    id: "qwen2.5:14b",
    name: "Qwen 2.5 14B",
    size: "9.0 GB",
    desc: "Larger Qwen model for tougher tasks.",
  },
  {
    id: "qwen2.5:32b",
    name: "Qwen 2.5 32B",
    size: "19 GB",
    desc: "High-end Qwen model — needs a strong GPU.",
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen 2.5 Coder 7B",
    size: "4.7 GB",
    desc: "Qwen variant fine-tuned specifically for coding.",
  },

  // --- DeepSeek family ---
  {
    id: "deepseek-r1:1.5b",
    name: "DeepSeek R1 1.5B",
    size: "1.1 GB",
    desc: "Tiny reasoning-focused model, distilled from DeepSeek R1.",
  },
  {
    id: "deepseek-r1:7b",
    name: "DeepSeek R1 7B",
    size: "4.7 GB",
    desc: "Reasoning-focused model with visible chain-of-thought.",
  },
  {
    id: "deepseek-r1:8b",
    name: "DeepSeek R1 8B",
    size: "4.9 GB",
    desc: "Llama-based DeepSeek R1 distillation, strong reasoning.",
  },
  {
    id: "deepseek-r1:14b",
    name: "DeepSeek R1 14B",
    size: "9.0 GB",
    desc: "Larger DeepSeek R1 distillation for harder problems.",
  },
  {
    id: "deepseek-coder-v2:16b",
    name: "DeepSeek Coder V2 16B",
    size: "8.9 GB",
    desc: "DeepSeek's mixture-of-experts model tuned for code.",
  },

  // --- Other well-known models ---
  {
    id: "llava:7b",
    name: "LLaVA 7B",
    size: "4.7 GB",
    desc: "Vision-language model — can describe and reason about images.",
  },
  {
    id: "starcoder2:3b",
    name: "StarCoder2 3B",
    size: "1.7 GB",
    desc: "Compact code-completion model from BigCode.",
  },
  {
    id: "command-r:35b",
    name: "Command R 35B",
    size: "20 GB",
    desc: "Cohere's model tuned for RAG and tool use.",
  },
  {
    id: "vicuna:7b",
    name: "Vicuna 7B",
    size: "3.8 GB",
    desc: "Popular community fine-tune of Llama for chat.",
  },
  {
    id: "orca-mini:3b",
    name: "Orca Mini 3B",
    size: "1.9 GB",
    desc: "Small, fast model tuned for instruction following.",
  },
  {
    id: "tinyllama:1.1b",
    name: "TinyLlama 1.1B",
    size: "0.6 GB",
    desc: "Extremely small model for constrained hardware.",
  },
  {
    id: "wizardlm2:7b",
    name: "WizardLM 2 7B",
    size: "4.1 GB",
    desc: "Microsoft-affiliated fine-tune focused on complex instructions.",
  },
  {
    id: "neural-chat:7b",
    name: "Neural Chat 7B",
    size: "4.1 GB",
    desc: "Intel-tuned Mistral variant for conversational tasks.",
  },
  {
    id: "stablelm2:1.6b",
    name: "StableLM 2 1.6B",
    size: "1.0 GB",
    desc: "Stability AI's small, efficient chat model.",
  },
];

export const OLLAMA_BASE_URL = "http://localhost:11434/v1";

export interface OllamaPullProgress {
  model: string;
  status: string;
  completed?: number;
  total?: number;
  done: boolean;
  error?: string;
}

export async function listInstalledOllamaModels(): Promise<string[]> {
  return invoke<string[]>("ollama_list_models");
}

export async function pullOllamaModel(
  model: string,
  onProgress: (progress: OllamaPullProgress) => void,
): Promise<void> {
  const unlisten = await listen<OllamaPullProgress>("ollama-pull-progress", (event) => {
    if (event.payload.model !== model) return;
    onProgress(event.payload);
  });
  try {
    await invoke("ollama_pull_model", { model });
  } finally {
    unlisten();
  }
}

export async function deleteOllamaModel(model: string): Promise<void> {
  await invoke("ollama_delete_model", { model });
}
