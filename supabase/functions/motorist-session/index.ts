// POST { token }
// -> { citation } if the token is valid and unexpired
// -> 401 { error } otherwise (portal should clear the stored token and
//    send the motorist back to the login screen)
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildCitationBundle,
  corsHeaders,
  isCitationLocked,
  LOCK_MESSAGE,
  verifyToken,
} from "../_shared/motorist.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_SECRET = Deno.env.get("MOTORIST_TOKEN_SECRET")!;

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const token = (body.token || "").trim();
  const payload = token ? await verifyToken(token, TOKEN_SECRET) : null;

  if (!payload) {
    return new Response(JSON.stringify({ error: "Session expired. Please sign in again." }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // The lock is checked here too, on every session refresh, so it takes
  // effect for an already-issued token the moment the 7-day window from
  // citation.received_at closes - it doesn't wait for the token's own
  // (longer or independently-timed) exp to be reached.
  if (await isCitationLocked(supabase, payload.cid)) {
    return new Response(JSON.stringify({ error: "locked", message: LOCK_MESSAGE }), {
      status: 423,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const bundle = await buildCitationBundle(supabase, payload.cid);

  if (!bundle) {
    return new Response(JSON.stringify({ error: "Citation not found." }), {
      status: 404,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ citation: bundle }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
});