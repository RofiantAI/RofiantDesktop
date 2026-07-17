// Proxies audio-transcription requests to Groq using a server-side secret.
// The real GROQ_API_KEY never leaves this function — callers only need a
// valid Supabase user access token, checked below.
import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

const PER_MINUTE_LIMIT = 20;
const PER_DAY_LIMIT = 500;

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
    const { data: withinLimit, error: rateError } = await admin.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_per_minute_limit: PER_MINUTE_LIMIT,
      p_per_day_limit: PER_DAY_LIMIT,
    });
    if (rateError) {
      console.error("groq-transcribe-proxy: rate limit check failed", rateError);
    } else if (!withinLimit) {
      return new Response(JSON.stringify({ error: "rate limit exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else {
    console.error("groq-transcribe-proxy: SUPABASE_SERVICE_ROLE_KEY not set, skipping rate limiting");
  }

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) {
    return new Response(JSON.stringify({ error: "server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const contentType = req.headers.get("Content-Type") ?? "multipart/form-data";

  const groqResponse = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      Authorization: `Bearer ${groqKey}`,
    },
    body: req.body,
    // @ts-expect-error - required by fetch when streaming a request body
    duplex: "half",
  });

  return new Response(groqResponse.body, {
    status: groqResponse.status,
    headers: { "Content-Type": "application/json" },
  });
});
