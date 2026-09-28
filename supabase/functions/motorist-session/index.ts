// re-validates a motorist's stored session token and returns the citation, or 401 so the portal sends them back to login
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

  // checked again on every session refresh so the lock takes effect the moment the 7-day window closes, not just when the token itself expires
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