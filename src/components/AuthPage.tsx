import { useState, type FormEvent } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";

export function AuthPage({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      }
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
            <Sparkles className="w-5 h-5" />
          </div>
          <h1 className="text-[17px] font-medium text-foreground">
            {mode === "signin" ? "Sign in to Rofiant" : "Create your Rofiant account"}
          </h1>
          <p className="text-[13px] text-foreground-muted">Your AI assistant</p>
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
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="flex items-center justify-between mt-4 text-[13px]">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
            }}
            className="text-foreground-secondary hover:text-foreground transition-colors"
          >
            {mode === "signin" ? "Create an account" : "Have an account? Sign in"}
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
