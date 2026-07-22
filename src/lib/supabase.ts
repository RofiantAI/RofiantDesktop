import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nxwzaztltnqdslnvehva.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54d3phenRsdG5xZHNsbnZlaHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNDY5NTIsImV4cCI6MjA5NzkyMjk1Mn0.ccB6uoDr3k7--Xm1QKeDo6sRE_82ZDwzimbcpHYiTjo";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    // PKCE (not the default "implicit" flow) so the OAuth redirect carries a
    // `?code=` we exchange manually — needed because the redirect lands on a
    // custom rofiant:// scheme via the deep-link plugin, not a URL Supabase's
    // implicit flow can parse from window.location.
    flowType: "pkce",
  },
});
