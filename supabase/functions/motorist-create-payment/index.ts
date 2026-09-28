// starts a QR Ph payment for a citation (Payment Intent -> Payment Method -> Attach on PayMongo) and hands back the QR code; paymongo-webhook is what later confirms it was actually paid

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, verifyToken } from "./_shared/motorist.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_SECRET = Deno.env.get("MOTORIST_TOKEN_SECRET")!;
const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY")!;
const PAYMONGO_PUBLIC_KEY = Deno.env.get("PAYMONGO_PUBLIC_KEY")!;

// PayMongo uses HTTP Basic Auth with the Secret/Public Key as the username and no password
function basicAuth(key: string) {
  return "Basic " + btoa(key + ":");
}

// mints a brand-new QR Ph payment intent + QR code for a citation (the 3-step PayMongo flow below)
async function createFreshQrph(supabase: any, citation: { citation_id: string; ticket_number: string; fine_amount: number }, amountCentavos: number) {
  // Step 1: create the Payment Intent (amount + that we only accept "qrph")
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

  // Step 2: create a Payment Method of type "qrph" - represents how the motorist will pay
  const methodRes = await fetch("https://api.paymongo.com/v1/payment_methods", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": basicAuth(PAYMONGO_PUBLIC_KEY) },
    body: JSON.stringify({ data: { attributes: { type: "qrph" } } }),
  });
  const methodJson = await methodRes.json();
  if (!methodRes.ok) throw new Error(methodJson?.errors?.[0]?.detail || "Could not create payment method.");
  const paymentMethodId = methodJson.data.id;

  // Step 3: attach the Payment Method to the Intent - this is what actually generates the QR code image
  const attachRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${paymentIntentId}/attach`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": basicAuth(PAYMONGO_PUBLIC_KEY) },
    body: JSON.stringify({ data: { attributes: { payment_method: paymentMethodId, client_key: clientKey } } }),
  });
  const attachJson = await attachRes.json();
  if (!attachRes.ok) throw new Error(attachJson?.errors?.[0]?.detail || "Could not attach payment method.");

  const qrImageUrl = attachJson.data?.attributes?.next_action?.code?.image_url;
  if (!qrImageUrl) throw new Error("PayMongo did not return a QR code.");

  // records this attempt as "pending"; paymongo-webhook flips it to "paid" once confirmed
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
    // reuses an existing pending QR Ph payment instead of minting a new one every time the pay screen reopens
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
          // already paid (webhook may not have landed yet) - mark it now so the UI reflects it immediately
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
          // still a live, unpaid QR - reuse it instead of creating a duplicate payment intent
          return new Response(JSON.stringify({ qr_image_url: qrImageUrl, payment_intent_id: existing.paymongo_payment_intent_id }), {
            status: 200, headers: { ...headers, "Content-Type": "application/json" },
          });
        }

        // otherwise (expired/cancelled) close out the stale row and fall through to mint a fresh one
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
