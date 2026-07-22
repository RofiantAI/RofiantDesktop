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
