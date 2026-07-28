// Custom URL scheme registered via the deep-link plugin (see src-tauri
// tauri.conf.json "plugins.deep-link" and Cargo.toml). Used as the return
// point for any browser-based auth flow, which hands control back to the
// desktop app instead of a browser tab:
//  - Google's OAuth consent screen redirects here with a `?code=` (PKCE),
//    exchanged via supabase.auth.exchangeCodeForSession in App.tsx.
//  - The website signup page (ROFIANT_SIGNUP_URL) redirects here with
//    `#access_token=...&refresh_token=...` after account creation, applied
//    via supabase.auth.setSession in App.tsx.
export const AUTH_REDIRECT_URL = "rofiant://auth-callback";

// `client=desktop` tells the website's signup form (rofiant-web) to redirect
// back to AUTH_REDIRECT_URL instead of its own web chat after confirmation —
// see signup-form.tsx and auth/callback/route.ts in that repo.
export const ROFIANT_SIGNUP_URL = "https://rofiant.ca/en/auth/signup?client=desktop";

export type ParsedAuthRedirect =
  | { type: "invalid" }
  | { type: "none" }
  | { type: "error"; message: string }
  | { type: "tokens"; accessToken: string; refreshToken: string }
  | { type: "code"; code: string };

// Pure parse step for a deep-link URL handed back from either OAuth (PKCE
// `?code=`) or the website signup flow (`#access_token=&refresh_token=`).
// Kept side-effect-free (no supabase calls) so redirect-shape handling is
// unit-testable without mocking the auth client.
export function parseAuthRedirect(raw: string): ParsedAuthRedirect {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { type: "invalid" };
  }

  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const oauthError =
    parsed.searchParams.get("error_description") ??
    parsed.searchParams.get("error") ??
    hashParams.get("error_description") ??
    hashParams.get("error");
  if (oauthError) {
    return { type: "error", message: oauthError };
  }

  const accessToken = hashParams.get("access_token") ?? parsed.searchParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token") ?? parsed.searchParams.get("refresh_token");
  if (accessToken && refreshToken) {
    return { type: "tokens", accessToken, refreshToken };
  }

  const code = parsed.searchParams.get("code");
  if (code) {
    return { type: "code", code };
  }

  return { type: "none" };
}
