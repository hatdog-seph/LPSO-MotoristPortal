// =============================================================================
// motorist-create-payment
// -----------------------------------------------------------------------------
// This is the function that CONNECTS THE PAYMENT to PayMongo (QR Ph / GCash,
// Maya, etc). When a motorist clicks "Pay" on a citation, the frontend calls
// this Supabase Edge Function, which then talks to PayMongo's API directly:
//
//   1. Create a Payment Intent on PayMongo (how much to charge, in centavos).
//   2. Create a Payment Method of type "qrph".
//   3. Attach the Payment Method to the Intent - PayMongo responds with a
//      QR Ph code image the motorist can scan with any QR Ph-enabled app.
//   4. Save a "pending" row in our own `payment` table so we can track it.
//
// The actual confirmation that money was received does NOT happen here -
// that's handled separately by the `paymongo-webhook` function, which
// PayMongo calls automatically once the motorist actually pays. This
// function only *starts* the payment and hands back a QR code to display.
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, verifyToken } from "./_shared/motorist.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_SECRET = Deno.env.get("MOTORIST_TOKEN_SECRET")!;
const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY")!;
const PAYMONGO_PUBLIC_KEY = Deno.env.get("PAYMONGO_PUBLIC_KEY")!;

// PayMongo authenticates API calls with HTTP Basic Auth, where the
// "username" is your Secret Key or Public Key and there is no password.
function basicAuth(key: string) {
  return "Basic " + btoa(key + ":");
}

// Creates a brand-new QR Ph payment intent + QR code for this citation.
// This is the 3-step PayMongo dance: Payment Intent -> Payment Method ->
// Attach. Called both on first load and whenever an old/expired QR needs
// to be replaced with a fresh one.
async function createFreshQrph(supabase: any, citation: { citation_id: string; ticket_number: string; fine_amount: number }, amountCentavos: number) {
  // Step 1: Create the Payment Intent - tells PayMongo how much we want
  // to charge and that we only accept the "qrph" payment method for it.
  const intentRes = await fetch("https://api.paymongo.com/v1/payment_intents", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": basicAuth(PAYMONGO_SECRET_KEY) },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: amountCentavos,
          currency: "PHP",
          payment_method_allowed: ["qrph"],
          description: `LPSO Citation ${citation.ticket_number}`,
        },
      },
    }),
  });
  const intentJson = await intentRes.json();
  if (!intentRes.ok) throw new Error(intentJson?.errors?.[0]?.detail || "Could not create payment intent.");
  const paymentIntentId = intentJson.data.id;
  const clientKey = intentJson.data.attributes.client_key;

  // Step 2: Create a Payment Method of type "qrph". This is a separate
  // object from the Payment Intent - it represents *how* the motorist
  // will pay (QR Ph in this case, as opposed to card, GCash direct, etc).
  const methodRes = await fetch("https://api.paymongo.com/v1/payment_methods", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": basicAuth(PAYMONGO_PUBLIC_KEY) },
    body: JSON.stringify({ data: { attributes: { type: "qrph" } } }),
  });
  const methodJson = await methodRes.json();
  if (!methodRes.ok) throw new Error(methodJson?.errors?.[0]?.detail || "Could not create payment method.");
  const paymentMethodId = methodJson.data.id;

  // Step 3: Attach the Payment Method to the Payment Intent. This is the
  // step that actually generates the QR Ph code image - PayMongo returns
  // it inside `next_action.code.image_url` once attached successfully.
  const attachRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${paymentIntentId}/attach`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": basicAuth(PAYMONGO_PUBLIC_KEY) },
    body: JSON.stringify({ data: { attributes: { payment_method: paymentMethodId, client_key: clientKey } } }),
  });
  const attachJson = await attachRes.json();
  if (!attachRes.ok) throw new Error(attachJson?.errors?.[0]?.detail || "Could not attach payment method.");

  const qrImageUrl = attachJson.data?.attributes?.next_action?.code?.image_url;
  if (!qrImageUrl) throw new Error("PayMongo did not return a QR code.");

  // Record this attempt in our OWN database as "pending". This row is
  // what the paymongo-webhook function will later update to "paid" once
  // PayMongo confirms the motorist actually completed the payment.
  await supabase.from("payment").insert({
    citation_id: citation.citation_id,
    paymongo_payment_intent_id: paymentIntentId,
    amount: Number(citation.fine_amount),
    method: "qrph",
    status: "pending",
    source: "qrph",
  });

  return { qr_image_url: qrImageUrl, payment_intent_id: paymentIntentId };
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });
  }

  let body: { token?: string };
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: citation, error: citationError } = await supabase
    .from("citation")
    .select("citation_id, ticket_number, fine_amount, status")
    .eq("citation_id", payload.cid)
    .maybeSingle();

  if (citationError || !citation) {
    return new Response(JSON.stringify({ error: "Citation not found." }), { status: 404, headers: { ...headers, "Content-Type": "application/json" } });
  }

  if (citation.status === "Settled") {
    return new Response(JSON.stringify({ error: "This citation is already settled." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }

  const amountCentavos = Math.round(Number(citation.fine_amount) * 100);
  if (!amountCentavos || amountCentavos < 100) {
    return new Response(JSON.stringify({ error: "Invalid payment amount." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }

  try {
    // Reuse an existing pending QR Ph payment for this citation instead of
    // always minting a brand-new PayMongo payment intent + payment row.
    // Without this, every time the motorist opens/reopens the pay screen
    // (closes the modal, refreshes, or the page remounts) a fresh row gets
    // inserted, leaving behind orphaned duplicate "pending" transactions
    // that never resolve.
    const { data: existing } = await supabase
      .from("payment")
      .select("payment_id, paymongo_payment_intent_id, status")
      .eq("citation_id", citation.citation_id)
      .eq("source", "qrph")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.paymongo_payment_intent_id) {
      const checkRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${existing.paymongo_payment_intent_id}`, {
        headers: { "Authorization": basicAuth(PAYMONGO_SECRET_KEY) },
      });
      const checkJson = await checkRes.json();

      if (checkRes.ok) {
        const pgStatus = checkJson.data?.attributes?.status;
        const qrImageUrl = checkJson.data?.attributes?.next_action?.code?.image_url;

        if (pgStatus === "succeeded") {
          // Already paid (webhook may just not have landed yet) - mark it here
          // too so the frontend/admin see it immediately rather than waiting.
          const { data: updated } = await supabase
            .from("payment")
            .update({ status: "paid", updated_at: new Date().toISOString() })
            .eq("payment_id", existing.payment_id)
            .eq("status", "pending")
            .select("payment_id")
            .maybeSingle();
          if (updated) {
            await supabase.from("citation").update({ status: "Settled" }).eq("citation_id", citation.citation_id);
          }
          return new Response(JSON.stringify({ error: "This citation was already paid. Refresh the page." }), {
            status: 400, headers: { ...headers, "Content-Type": "application/json" },
          });
        }

        if (qrImageUrl && (pgStatus === "awaiting_next_action" || pgStatus === "awaiting_payment_method" || pgStatus === "processing")) {
          // Still a live, unpaid QR - hand back the same one instead of
          // creating a second payment intent/row for the same citation.
          return new Response(JSON.stringify({ qr_image_url: qrImageUrl, payment_intent_id: existing.paymongo_payment_intent_id }), {
            status: 200, headers: { ...headers, "Content-Type": "application/json" },
          });
        }

        // Anything else (expired/cancelled/no QR left) - close out the stale
        // row so it doesn't linger as a duplicate "pending" transaction, then
        // fall through to mint a fresh one below.
        await supabase
          .from("payment")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("payment_id", existing.payment_id)
          .eq("status", "pending");
      }
    }

    const result = await createFreshQrph(supabase, citation, amountCentavos);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Could not create QR Ph payment." }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
