import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Avatar } from "../Sidebar";
import { SectionLabel } from "./shared";

export function ProfileSection({
  userEmail,
  userAvatarUrl,
  userDisplayName,
  plan,
  isPro,
  onSignIn,
  onSignOut,
}: {
  userEmail: string | null;
  userAvatarUrl: string | null;
  userDisplayName: string | null;
  plan: string;
  isPro: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const [displayName, setDisplayName] = useState(userDisplayName ?? "");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [displayNameSaved, setDisplayNameSaved] = useState(false);

  useEffect(() => {
    setDisplayName(userDisplayName ?? "");
  }, [userDisplayName]);

  async function saveDisplayName() {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === userDisplayName) return;
    setDisplayNameSaving(true);
    try {
      await supabase.auth.updateUser({ data: { display_name: trimmed } });
      setDisplayNameSaved(true);
      setTimeout(() => setDisplayNameSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save display name:", err);
    } finally {
      setDisplayNameSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-[18px] font-bold mb-6">Profile</h1>
      {userEmail ? (
        <div className="rounded-lg border border-border px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar email={userEmail} avatarUrl={userAvatarUrl} size={32} />
              <div className="min-w-0">
                <div className="text-[13px] text-foreground truncate">{userEmail}</div>
                <div className="text-[12px] text-foreground-muted">Signed in</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="h-8 px-3 rounded-lg border border-border text-[13px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
            >
              Sign out
            </button>
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            <span className="text-[12px] text-foreground-muted">Plan</span>
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${
                isPro ? "bg-accent-primary/10 text-accent-primary" : "bg-background-tertiary text-foreground-secondary"
              }`}
            >
              {plan}
            </span>
          </div>
        </div>
      ) : null}
      {userEmail && (
        <div className="mt-4">
          <SectionLabel>Display name</SectionLabel>
          <div className="flex items-center gap-2">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveDisplayName();
              }}
              placeholder="Your name"
              className="flex-1 h-8 px-2.5 rounded-md bg-card border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light"
            />
            <button
              type="button"
              onClick={() => void saveDisplayName()}
              disabled={displayNameSaving || !displayName.trim() || displayName.trim() === userDisplayName}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {displayNameSaved ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Saved
                </>
              ) : displayNameSaving ? (
                "Saving…"
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>
      )}
      {!userEmail && (
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
          <div className="text-[13px] text-foreground-secondary">You're not signed in</div>
          <button
            type="button"
            onClick={onSignIn}
            className="h-8 px-3 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            Sign in
          </button>
        </div>
      )}
    </div>
  );
}
