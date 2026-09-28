// called automatically BY PayMongo (never by the frontend) when a payment succeeds/fails: verifies the HMAC signature, then marks the payment row paid/failed and settles the citation

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PAYMONGO_WEBHOOK_SECRET")!;

// computes an HMAC-SHA256 signature (lowercase hex) the same way PayMongo does, so ours can be compared against theirs
async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// compares two strings without leaking timing info about where they first differ (unlike a plain === check)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// the payment intent ID lands in a different spot depending on event type, so this checks each possible location
function extractPaymentIntentId(resourceData: any): string | null {
  return (
    resourceData?.attributes?.payment_intent_id ||
    resourceData?.attributes?.payment_intent?.id ||
    resourceData?.attributes?.data?.attributes?.payment_intent_id ||
    resourceData?.attributes?.data?.id ||
    (resourceData?.type === "payment_intent" ? resourceData?.id : null) ||
    null
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // parses the "Paymongo-Signature" header ("t=<timestamp>,te=<test sig>,li=<live sig>") into a key/value map
  const signatureHeader = req.headers.get("Paymongo-Signature");
  const rawBody = await req.text();

  if (!signatureHeader) {
    return new Response("Missing signature", { status: 400 });
  }

  const parts: Record<string, string> = {};
  for (const piece of signatureHeader.split(",")) {
    const [k, v] = piece.split("=");
    if (k && v) parts[k] = v;
  }

  const timestamp = parts.t;
  const candidates = [parts.te, parts.li].filter((v): v is string => Boolean(v));
  if (!timestamp || candidates.length === 0) {
    return new Response("Malformed signature header", { status: 400 });
  }

  // recomputes the expected signature and checks it against PayMongo's test/live signature(s); rejects if neither matches
  const expectedSignature = await hmacHex(WEBHOOK_SECRET, `${timestamp}.${rawBody}`);
  const isValid = candidates.some((sig) => timingSafeEqual(expectedSignature, sig));

  if (!isValid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventType = event?.data?.attributes?.type;
  const resourceData = event?.data?.attributes?.data;
  const paymentIntentId = extractPaymentIntentId(resourceData);

  if (!paymentIntentId || (eventType !== "payment.paid" && eventType !== "payment.failed")) {
    console.log("[paymongo-webhook] unhandled or unmatched event", JSON.stringify({
      eventType,
      extractedPaymentIntentId: paymentIntentId,
      resourceData,
    }));
  } else {
    console.log("[paymongo-webhook] handling event", JSON.stringify({ eventType, paymentIntentId }));
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (eventType === "payment.paid" && paymentIntentId) {
    // finds the local payment row by the PayMongo intent ID saved back in motorist-create-payment
    const { data: payment } = await supabase
      .from("payment")
      .select("payment_id, citation_id, status")
      .eq("paymongo_payment_intent_id", paymentIntentId)
      .maybeSingle();

    if (!payment) {
      console.log("[paymongo-webhook] no local payment row matches intent id", paymentIntentId);
    } else if (payment.status === "pending") {
      // the extra .eq("status", "pending") guards against a race - only the first of a retried/duplicate delivery flips the row
      const { data: updated } = await supabase
        .from("payment")
        .update({ status: "paid", updated_at: new Date().toISOString() })
        .eq("payment_id", payment.payment_id)
        .eq("status", "pending")
        .select("payment_id")
        .maybeSingle();

      if (updated) {
        // payment confirmed - also settle the citation so it stops showing as outstanding
        await supabase
          .from("citation")
          .update({ status: "Settled" })
          .eq("citation_id", payment.citation_id);
        console.log("[paymongo-webhook] marked paid + settled", payment.payment_id, payment.citation_id);
      }
    } else {
      console.log("[paymongo-webhook] payment already resolved, no-op", payment.payment_id, payment.status);
    }
  } else if (eventType === "payment.failed" && paymentIntentId) {
    await supabase
      .from("payment")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("paymongo_payment_intent_id", paymentIntentId)
      .eq("status", "pending");
  }

  // always 200 for a correctly-signed request - PayMongo retries (and can disable the webhook) on 4xx/5xx
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
