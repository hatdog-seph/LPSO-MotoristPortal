// polled every few seconds by the portal while a QR Ph payment is pending, so the page updates itself once paid - just reads our own payment table, never calls PayMongo directly

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

  let body: { token?: string; payment_intent_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }

  const token = (body.token || "").trim();
  const payload = token ? await verifyToken(token, TOKEN_SECRET) : null;
  if (!payload) {
    return new Response(JSON.stringify({ error: "Session expired." }), { status: 401, headers: { ...headers, "Content-Type": "application/json" } });
  }

  const paymentIntentId = (body.payment_intent_id || "").trim();
  if (!paymentIntentId) {
    return new Response(JSON.stringify({ error: "Missing payment_intent_id." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: payment, error } = await supabase
    .from("payment")
    .select("status, citation_id")
    .eq("paymongo_payment_intent_id", paymentIntentId)
    .eq("citation_id", payload.cid)
    .maybeSingle();

  if (error || !payment) {
    return new Response(JSON.stringify({ error: "Payment not found." }), { status: 404, headers: { ...headers, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ status: payment.status }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
});
