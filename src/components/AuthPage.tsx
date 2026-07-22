import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { supabase } from "../lib/supabase";
import { AUTH_REDIRECT_URL, ROFIANT_SIGNUP_URL } from "../lib/auth-redirect";

export function AuthPage({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setError(null);
    setNotice(null);
    setGoogleLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: AUTH_REDIRECT_URL,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error("No sign-in URL returned");
      await openUrl(data.url);
      setNotice("Continue in your browser, then approve access to come back here.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGoogleLoading(false);
    }
  }

  function handleCreateAccount() {
    setError(null);
    setNotice("Continue in your browser to create your account, then come back here.");
    void openUrl(ROFIANT_SIGNUP_URL);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-background px-6">
      <div className="w-full max-w-[360px]">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-background-tertiary border border-border text-foreground">
            <img src="/icon.svg" alt="" className="rounded-md" />
          </div>
          <h1 className="text-[17px] font-medium text-foreground">Sign in to Rofiant</h1>
          <p className="text-[13px] text-foreground-muted">Your AI assistant</p>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="flex items-center justify-center gap-2 w-full h-9 rounded-lg border border-border text-[14px] text-foreground hover:bg-background-tertiary disabled:opacity-60 transition-colors mb-4"
        >
          {googleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29A11.96 11.96 0 000 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
              />
            </svg>
          )}
          {googleLoading ? "Opening browser…" : "Continue with Google"}
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] text-foreground-muted uppercase tracking-wide">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[12px] text-foreground-secondary">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-9 px-3 rounded-lg bg-card border border-border text-[14px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] text-foreground-secondary">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-9 px-3 rounded-lg bg-card border border-border text-[14px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light transition-colors"
            />
          </div>

          {error && <p className="text-[12px] text-red-600">{error}</p>}
          {notice && <p className="text-[12px] text-accent-success">{notice}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full h-9 rounded-lg bg-foreground text-background text-[14px] font-medium hover:opacity-90 disabled:opacity-60 transition-opacity mt-1"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Sign in
          </button>
        </form>

        <div className="flex items-center justify-between mt-4 text-[13px]">
          <button
            type="button"
            onClick={handleCreateAccount}
            className="text-foreground-secondary hover:text-foreground transition-colors"
          >
            Create an account
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-foreground-muted hover:text-foreground transition-colors"
          >
            Continue without signing in
          </button>
        </div>
      </div>
    </div>
  );
}
