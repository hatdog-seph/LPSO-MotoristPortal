// admin-only "refresh" button: re-checks a QR Ph payment's real status against PayMongo directly, for when the webhook hasn't landed yet (requires a logged-in admin session)

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

  // verify_jwt already rejected any unauthenticated request before this code runs

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

    // idempotent: only writes on an actual change, never downgrades a payment the webhook already resolved
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
