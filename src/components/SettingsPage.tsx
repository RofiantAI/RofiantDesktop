import { useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { ArrowLeft } from "lucide-react";
import type { AppSettings } from "../lib/settings";
import { useConfirmDialog } from "./ConfirmDialog";
import { SECTION_GROUPS, type Section } from "./settings/shared";
import { GeneralSection } from "./settings/GeneralSection";
import { ProvidersSection } from "./settings/ProvidersSection";
import { McpSection } from "./settings/McpSection";
import { ModelsSection } from "./settings/ModelsSection";
import { AgentsSection } from "./settings/AgentsSection";
import { SkillsSection } from "./settings/SkillsSection";
import { AppearanceSection } from "./settings/AppearanceSection";
import { ProfileSection } from "./settings/ProfileSection";
import { ShortcutsSection } from "./settings/ShortcutsSection";
import { DataSection } from "./settings/DataSection";
import { TelemetrySection } from "./settings/TelemetrySection";

export function SettingsPage({
  settings,
  onChange,
  onClose,
  sidebarOpen,
  userEmail,
  userAvatarUrl,
  userDisplayName,
  plan,
  isPro,
  onSignIn,
  onSignOut,
  onClearConversations,
  onExportData,
  onCheckForUpdate,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
  sidebarOpen: boolean;
  userEmail: string | null;
  userAvatarUrl: string | null;
  userDisplayName: string | null;
  accessToken: string | null;
  plan: string;
  isPro: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onClearConversations: () => void;
  onExportData: () => void;
  onCheckForUpdate: () => Promise<Update | null>;
}) {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [section, setSection] = useState<Section>(SECTION_GROUPS[0].items[0].id);

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground">
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: sidebarOpen ? 220 : 0,
          transition: "width 220ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <aside className="w-[220px] h-full border-r border-border bg-background-secondary flex flex-col">
          <div className="h-11 flex items-center px-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 text-[13px] text-foreground-secondary hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>
          <nav className="px-2 py-2 overflow-y-auto">
            {SECTION_GROUPS.map((group) => (
              <div key={group.label} className="mb-3 last:mb-0">
                <div className="px-2 mb-1 text-[11px] font-medium text-foreground-muted uppercase tracking-wide">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((s) => {
                    const Icon = s.icon;
                    const active = section === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSection(s.id)}
                        className={`flex items-center gap-2.5 w-full h-8 px-2 rounded-md text-[13px] transition-colors text-left ${
                          active
                            ? "bg-background-tertiary text-foreground"
                            : "text-foreground-secondary hover:bg-background-tertiary/60 hover:text-foreground"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-8 py-10">
          {section === "general" && (
            <GeneralSection
              settings={settings}
              onChange={onChange}
              userEmail={userEmail}
              isPro={isPro}
              onSignIn={onSignIn}
              onSignOut={onSignOut}
              onCheckForUpdate={onCheckForUpdate}
            />
          )}
          {section === "providers" && (
            <ProvidersSection settings={settings} onChange={onChange} confirm={confirm} />
          )}
          {section === "mcp" && <McpSection settings={settings} onChange={onChange} confirm={confirm} />}
          {section === "models" && (
            <ModelsSection settings={settings} onChange={onChange} confirm={confirm} />
          )}
          {section === "agents" && (
            <AgentsSection settings={settings} onChange={onChange} confirm={confirm} />
          )}
          {section === "skills" && <SkillsSection confirm={confirm} />}
          {section === "appearance" && <AppearanceSection settings={settings} onChange={onChange} />}
          {section === "profile" && (
            <ProfileSection
              userEmail={userEmail}
              userAvatarUrl={userAvatarUrl}
              userDisplayName={userDisplayName}
              plan={plan}
              isPro={isPro}
              onSignIn={onSignIn}
              onSignOut={onSignOut}
            />
          )}
          {section === "shortcuts" && <ShortcutsSection settings={settings} />}
          {section === "data" && (
            <DataSection
              settings={settings}
              onChange={onChange}
              onClearConversations={onClearConversations}
              onExportData={onExportData}
              confirm={confirm}
            />
          )}
          {section === "telemetry" && <TelemetrySection settings={settings} onChange={onChange} />}
        </div>
      </main>
      {confirmDialog}
    </div>
  );
}
