// Proxies chat-completion requests to Groq using a server-side secret.
// The real GROQ_API_KEY never leaves this function — callers only need a
// valid Supabase user access token, checked below.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

async function isAuthenticated(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length);
  // auth.getUser verifies the token's signature against Supabase Auth —
  // decoding the payload alone (the old approach) lets anyone forge a token.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await supabase.auth.getUser(token);
  return !error && !!data.user;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!(await isAuthenticated(req.headers.get("Authorization")))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) {
    return new Response(JSON.stringify({ error: "server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.text();

  const groqResponse = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqKey}`,
    },
    body,
  });

  return new Response(groqResponse.body, {
    status: groqResponse.status,
    headers: { "Content-Type": "application/json" },
  });
});
