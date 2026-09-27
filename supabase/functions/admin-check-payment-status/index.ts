// =============================================================================
// admin-check-payment-status
// -----------------------------------------------------------------------------
// Admin-only "refresh"/manual-verify button on the Payment Verification
// page: re-checks a QR Ph payment's REAL status directly against PayMongo's
// API (never trusts a frontend claim). This exists for cases where the
// webhook hasn't landed yet (e.g. it was slow, or briefly disabled) - the
// admin can force a re-check instead of waiting.
//
// verify_jwt is true for this function, so the caller must present a valid
// Supabase Auth session (i.e. a logged-in admin), and the `payment` table's
// own Row Level Security additionally restricts writes to the
// `authenticated` role - so an unauthenticated motorist could never call
// this even if they discovered the URL.
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY")!;

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function basicAuth(key: string) {
  return "Basic " + btoa(key + ":");
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });
  }

  // verify_jwt already rejected any request without a valid Supabase
  // session before this code runs, so req.headers carries a verified
  // admin's Authorization header at this point.

  let body: { payment_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }

  const paymentId = (body.payment_id || "").trim();
  if (!paymentId) {
    return new Response(JSON.stringify({ error: "payment_id is required." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: payment, error: paymentError } = await supabase
    .from("payment")
    .select("payment_id, citation_id, paymongo_payment_intent_id, status, source")
    .eq("payment_id", paymentId)
    .maybeSingle();

  if (paymentError || !payment) {
    return new Response(JSON.stringify({ error: "Payment record not found." }), { status: 404, headers: { ...headers, "Content-Type": "application/json" } });
  }

  if (payment.source !== "qrph" || !payment.paymongo_payment_intent_id) {
    return new Response(JSON.stringify({ error: "This payment has no PayMongo transaction to check - it was submitted manually." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }

  try {
    const res = await fetch(`https://api.paymongo.com/v1/payment_intents/${payment.paymongo_payment_intent_id}`, {
      headers: { "Authorization": basicAuth(PAYMONGO_SECRET_KEY) },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.errors?.[0]?.detail || "Could not reach PayMongo.");

    const pgStatus = json.data?.attributes?.status; // awaiting_payment_method | awaiting_next_action | processing | succeeded | ...
    let nextStatus: "pending" | "paid" | "failed" | null = null;
    if (pgStatus === "succeeded") nextStatus = "paid";
    else if (pgStatus === "awaiting_payment_method") nextStatus = "failed";

    // Idempotent: only write if the status actually changed, and never
    // downgrade a payment that a webhook already marked paid/failed.
    if (nextStatus && payment.status === "pending" && nextStatus !== payment.status) {
      await supabase
        .from("payment")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("payment_id", payment.payment_id);

      if (nextStatus === "paid") {
        await supabase.from("citation").update({ status: "Settled" }).eq("citation_id", payment.citation_id);
      }
    }

    return new Response(JSON.stringify({ ok: true, paymongo_status: pgStatus, status: nextStatus || payment.status }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Could not check payment status." }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
