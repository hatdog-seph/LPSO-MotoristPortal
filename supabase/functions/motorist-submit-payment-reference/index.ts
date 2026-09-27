// =============================================================================
// motorist-submit-payment-reference
// -----------------------------------------------------------------------------
// Fallback path for a payment method OTHER than QR Ph (e.g. a manual bank
// deposit or over-the-counter payment) - the motorist types in the reference
// number themselves. Unlike QR Ph payments, this is saved as "pending" with
// source = "manual" and is NOT auto-verified by any webhook, since there's
// no PayMongo transaction behind it - an admin has to manually confirm it
// happened before the citation is considered settled.
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, verifyToken } from "./_shared/motorist.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_SECRET = Deno.env.get("MOTORIST_TOKEN_SECRET")!;

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });
  }

  let body: { token?: string; method?: string; reference_number?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }

  const token = (body.token || "").trim();
  const payload = token ? await verifyToken(token, TOKEN_SECRET) : null;
  if (!payload) {
    return new Response(JSON.stringify({ error: "Session expired. Please sign in again." }), { status: 401, headers: { ...headers, "Content-Type": "application/json" } });
  }

  const method = (body.method || "").trim();
  const referenceNumber = (body.reference_number || "").trim();
  if (!method || !referenceNumber) {
    return new Response(JSON.stringify({ error: "Payment method and reference number are required." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: citation, error: citationError } = await supabase
    .from("citation")
    .select("citation_id, fine_amount, status")
    .eq("citation_id", payload.cid)
    .maybeSingle();

  if (citationError || !citation) {
    return new Response(JSON.stringify({ error: "Citation not found." }), { status: 404, headers: { ...headers, "Content-Type": "application/json" } });
  }

  const { error: insertError } = await supabase.from("payment").insert({
    citation_id: citation.citation_id,
    amount: Number(citation.fine_amount),
    method,
    reference_number: referenceNumber,
    status: "pending",
    source: "manual",
  });

  if (insertError) {
    return new Response(JSON.stringify({ error: "Could not submit payment reference." }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
});
