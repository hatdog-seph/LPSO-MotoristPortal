// lets a logged-in motorist file a complaint about the enforcer who issued their citation, saved to enforcer_report for admin review

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, verifyToken } from "./_shared/motorist.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_SECRET = Deno.env.get("MOTORIST_TOKEN_SECRET")!;

const VALID_CATEGORIES = [
  "Unprofessional behavior",
  "Incorrect citation information",
  "Request for clarification",
  "Suspected improper conduct",
  "Other",
];

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  let body: { token?: string; category?: string; description?: string; contact_info?: string };
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

  const category = (body.category || "").trim();
  const description = (body.description || "").trim();
  const contactInfo = (body.contact_info || "").trim();

  if (!VALID_CATEGORIES.includes(category)) {
    return new Response(JSON.stringify({ error: "Select a valid report category." }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  if (description.length < 10) {
    return new Response(JSON.stringify({ error: "Please provide a more detailed description." }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: citation, error: citationError } = await supabase
    .from("citation")
    .select("citation_id, enforcer_id")
    .eq("citation_id", payload.cid)
    .maybeSingle();

  if (citationError || !citation) {
    return new Response(JSON.stringify({ error: "Citation not found." }), {
      status: 404,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const { error: insertError } = await supabase.from("enforcer_report").insert({
    citation_id: citation.citation_id,
    enforcer_id: citation.enforcer_id,
    category,
    description,
    contact_info: contactInfo || null,
  });

  if (insertError) {
    return new Response(JSON.stringify({ error: "Could not submit report. Please try again." }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
});
