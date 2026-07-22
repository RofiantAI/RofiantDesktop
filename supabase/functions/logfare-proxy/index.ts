// Proxies chat-completion requests to Logfare using a server-side secret.
// The real LOGFARE_API_KEY never leaves this function — callers only need a
// valid Supabase user access token, checked below. Mirrors groq-proxy; kept
// as a separate function so each provider's upstream/secret stays isolated.
import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

const LOGFARE_URL = "https://logfare.ai/v1/chat/completions";

const PER_MINUTE_LIMIT = 30;
const PER_DAY_LIMIT = 1000;

async function getUser(authHeader: string | null): Promise<User | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  // auth.getUser verifies the token's signature against Supabase Auth —
  // decoding the payload alone (the old approach) lets anyone forge a token.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const user = await getUser(req.headers.get("Authorization"));
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey) {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);
    // Same RPC and per-user key as groq-proxy, so usage across both
    // providers shares one combined cap instead of doubling the effective
    // limit by switching models.
    const { data: withinLimit, error: rateError } = await admin.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_per_minute_limit: PER_MINUTE_LIMIT,
      p_per_day_limit: PER_DAY_LIMIT,
    });
    if (rateError) {
      console.error("logfare-proxy: rate limit check failed", rateError);
    } else if (!withinLimit) {
      return new Response(JSON.stringify({ error: "rate limit exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else {
    console.error("logfare-proxy: SUPABASE_SERVICE_ROLE_KEY not set, skipping rate limiting");
  }

  const logfareKey = Deno.env.get("LOGFARE_API_KEY");
  if (!logfareKey) {
    return new Response(JSON.stringify({ error: "server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const bodyText = await req.text();
  try {
    JSON.parse(bodyText);
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const logfareResponse = await fetch(LOGFARE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${logfareKey}`,
    },
    body: bodyText,
  });

  return new Response(logfareResponse.body, {
    status: logfareResponse.status,
    headers: { "Content-Type": "application/json" },
  });
});
