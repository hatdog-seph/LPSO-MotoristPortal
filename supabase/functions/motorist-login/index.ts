// logs a motorist in with ticket number + password, returning a session token + citation (same generic error for both bad ticket and bad password, so a guess can't confirm a ticket number exists)
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildCitationBundle,
  corsHeaders,
  expectedPassword,
  isCitationLocked,
  LOCK_MESSAGE,
  signToken,
} from "../_shared/motorist.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_SECRET = Deno.env.get("MOTORIST_TOKEN_SECRET")!;

const GENERIC_ERROR = "Invalid ticket number or password.";

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  let body: { ticket_number?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const ticketNumber = (body.ticket_number || "").trim();
  const password = (body.password || "").trim().toLowerCase();

  if (!ticketNumber || !password) {
    return new Response(JSON.stringify({ error: GENERIC_ERROR }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: citation, error } = await supabase
    .from("citation")
    .select("citation_id, ticket_number, motorist_full_name")
    .ilike("ticket_number", ticketNumber)
    .maybeSingle();

  if (error || !citation) {
    return new Response(JSON.stringify({ error: GENERIC_ERROR }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const expected = expectedPassword(citation.motorist_full_name);
  if (!expected || password !== expected) {
    return new Response(JSON.stringify({ error: GENERIC_ERROR }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // account-level lockout: 7 days after the citation synced (received_at), login stops working regardless of payment status
  if (await isCitationLocked(supabase, citation.citation_id)) {
    return new Response(JSON.stringify({ error: "locked", message: LOCK_MESSAGE }), {
      status: 423,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const bundle = await buildCitationBundle(supabase, citation.citation_id);
  if (!bundle) {
    return new Response(JSON.stringify({ error: GENERIC_ERROR }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const token = await signToken(
    { cid: citation.citation_id, tn: citation.ticket_number },
    TOKEN_SECRET,
  );

  return new Response(JSON.stringify({ token, citation: bundle }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
});