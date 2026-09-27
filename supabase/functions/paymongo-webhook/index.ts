// =============================================================================
// paymongo-webhook
// -----------------------------------------------------------------------------
// This is where PayMongo tells us that a payment actually went through (or
// failed). Unlike motorist-create-payment (which only STARTS a payment and
// hands back a QR code), this function is called automatically BY PAYMONGO
// itself, in the background, the moment the motorist finishes scanning and
// paying with GCash/Maya/etc. The motorist and the frontend never call this
// endpoint directly - PayMongo's servers do.
//
// Flow:
//   1. PayMongo sends a POST request here with an event payload and a
//      "Paymongo-Signature" header.
//   2. We verify that signature using HMAC-SHA256 and our webhook secret,
//      to make sure the request really came from PayMongo and wasn't
//      faked by someone else pretending a payment succeeded.
//   3. If the event is "payment.paid", we mark our local `payment` row as
//      paid and flip the citation's status to "Settled".
//   4. If it's "payment.failed", we mark the payment row as failed.
//   5. We always return HTTP 200 for any correctly-signed request PayMongo
//      sends, even if we don't recognize the event type - PayMongo expects
//      200 for anything it successfully delivered, and will retry (and
//      eventually disable the webhook) if it keeps getting 4xx/5xx back.
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PAYMONGO_WEBHOOK_SECRET")!;

// Computes an HMAC-SHA256 signature over `message` using our webhook
// secret as the key, formatted as a lowercase hex string - this is the
// exact same algorithm PayMongo uses on their end, so if our secret
// matches theirs, our computed signature should match what they sent us.
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

// Compares two strings without leaking timing information about where
// they first differ (a normal `===` comparison can be exploited to guess
// a secret one character at a time by measuring response time - this
// avoids that by always comparing every character before returning).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// PayMongo's webhook payload shape varies slightly depending on the event
// type, so the payment intent ID can show up in a few different places.
// This checks each possible location and returns the first one found.
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

  // The "Paymongo-Signature" header looks like: "t=<timestamp>,te=<test
  // signature>,li=<live signature>" - we parse it into a simple key/value
  // map below.
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

  // Re-compute the expected signature ourselves from the timestamp + raw
  // body, and check it against whichever signature(s) PayMongo sent
  // (test-mode "te" and/or live-mode "li"). If neither matches, someone
  // is either not actually PayMongo, or our PAYMONGO_WEBHOOK_SECRET is
  // wrong/out of date - either way, we reject the request.
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
    // Find the local payment row this event refers to, by matching the
    // PayMongo payment intent ID we saved back in motorist-create-payment.
    const { data: payment } = await supabase
      .from("payment")
      .select("payment_id, citation_id, status")
      .eq("paymongo_payment_intent_id", paymentIntentId)
      .maybeSingle();

    if (!payment) {
      console.log("[paymongo-webhook] no local payment row matches intent id", paymentIntentId);
    } else if (payment.status === "pending") {
      // The `.eq("status", "pending")` here (in addition to the initial
      // lookup above) guards against a race: if PayMongo retries this
      // same webhook delivery, or two events arrive close together, only
      // the first one actually flips the row from pending -> paid.
      const { data: updated } = await supabase
        .from("payment")
        .update({ status: "paid", updated_at: new Date().toISOString() })
        .eq("payment_id", payment.payment_id)
        .eq("status", "pending")
        .select("payment_id")
        .maybeSingle();

      if (updated) {
        // Payment confirmed - also settle the citation itself so it no
        // longer shows as outstanding for the motorist or the admin.
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

  // Always 200 for a correctly-signed, successfully-processed request -
  // PayMongo will keep retrying (and can eventually disable the webhook)
  // if it sees 4xx/5xx responses here.
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
