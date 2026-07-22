import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";

export function MfaChallenge({ onSignOut }: { onSignOut: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (error) {
        setError(error.message);
        setChecking(false);
        return;
      }
      const verified = data?.totp?.find((f) => f.status === "verified");
      if (!verified) {
        setError("No verification method found for this account.");
        setChecking(false);
        return;
      }
      setFactorId(verified.id);
      setChecking(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Success upgrades the session to aal2 and fires onAuthStateChange;
    // App.tsx's listener picks that up and swaps this screen out.
  }

  return (
    <div className="flex h-full items-center justify-center bg-background px-6">
      <div className="w-full max-w-[360px]">
        <div className="flex flex-col items-center gap-2 mb-8">
          <h1 className="text-[17px] font-medium text-foreground">Two-factor authentication</h1>
          <p className="text-[13px] text-foreground-muted text-center">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        {checking ? (
          <div className="flex items-center justify-center gap-2 text-[13px] text-foreground-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking your account…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[12px] text-foreground-secondary">Verification code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                disabled={!factorId}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="w-full h-9 px-3 rounded-lg bg-card border border-border text-[14px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light transition-colors tracking-widest text-center disabled:opacity-60"
              />
            </div>

            {error && <p className="text-[12px] text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading || code.length !== 6 || !factorId}
              className="flex items-center justify-center gap-2 w-full h-9 rounded-lg bg-foreground text-background text-[14px] font-medium hover:opacity-90 disabled:opacity-60 transition-opacity mt-1"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {loading ? "Verifying…" : "Verify"}
            </button>
          </form>
        )}

        <div className="flex items-center justify-center mt-4 text-[13px]">
          <button
            type="button"
            onClick={onSignOut}
            className="text-foreground-muted hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
