import {
  Settings,
  Plug,
  Box,
  Users,
  Cable,
  Palette,
  Keyboard,
  CircleUser,
  Database,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import { customProviderIdFromModel } from "../../lib/providers";
import type { AppSettings } from "../../lib/settings";

export type Section =
  | "general"
  | "providers"
  | "models"
  | "agents"
  | "mcp"
  | "appearance"
  | "profile"
  | "shortcuts"
  | "data"
  | "telemetry";

export const SECTION_GROUPS: {
  label: string;
  items: { id: Section; label: string; icon: typeof Settings }[];
}[] = [
  {
    label: "Workspace",
    items: [
      { id: "general", label: "General", icon: Settings },
      { id: "providers", label: "Providers", icon: Plug },
      { id: "models", label: "Models", icon: Box },
      { id: "agents", label: "Agents", icon: Users },
      { id: "mcp", label: "MCP Servers", icon: Cable },
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

// Removing a custom provider needs to fall back the active model if that
// provider was selected — shared by the Providers tab (removing a provider
// directly) and the Models tab (removing the CustomProvider an Ollama model
// was backed by).
export function removeProviderFromSettings(
  settings: AppSettings,
  onChange: (patch: Partial<AppSettings>) => void,
  id: string,
) {
  const remaining = settings.customProviders.filter((p) => p.id !== id);
  const patch: Partial<AppSettings> = { customProviders: remaining };
  if (customProviderIdFromModel(settings.model) === id) {
    patch.model = "openai/gpt-oss-20b";
  }
  onChange(patch);
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
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

export function Row({
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

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] text-foreground-secondary mt-6 mb-2 first:mt-0">{children}</div>;
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
      {children}
    </div>
  );
}

export function CardRow({
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

export function SegmentedControl<T extends string>({
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

export function Dropdown<T extends string>({
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
