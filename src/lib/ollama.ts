import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface LocalModelDef {
  id: string;
  name: string;
  size: string;
  desc: string;
}

// A short, curated list of small, well-supported Ollama models — not the
// full Ollama catalog. Picked for fast downloads and running on modest
// hardware without extra configuration.
export const EASY_LOCAL_MODELS: LocalModelDef[] = [
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
    id: "phi3:mini",
    name: "Phi-3 Mini",
    size: "2.2 GB",
    desc: "Microsoft's compact model, strong at reasoning for its size.",
  },
  {
    id: "gemma2:2b",
    name: "Gemma 2 2B",
    size: "1.6 GB",
    desc: "Google's lightweight model, tuned for everyday chat.",
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
