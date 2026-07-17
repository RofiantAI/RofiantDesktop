export interface Rule {
  id: string;
  text: string;
  createdAt: number;
}

const KEY = "rofiant_rules";

export function loadRules(): Rule[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveRules(rules: Rule[]) {
  localStorage.setItem(KEY, JSON.stringify(rules));
}

export function rulesToPrompt(rules: Rule[]): string {
  if (rules.length === 0) return "";
  return "Rules to follow:\n" + rules.map((r) => `- ${r.text}`).join("\n");
}
