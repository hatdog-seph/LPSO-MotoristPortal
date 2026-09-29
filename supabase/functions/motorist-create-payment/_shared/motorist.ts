// shared helpers so motorist-login and motorist-session never drift on token format or citation shape

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const LOCK_WINDOW_SECONDS = 60 * 60 * 24 * 7; // real account lock window, counted from citation.received_at, not login time

export const LOCK_MESSAGE =
  "Your 7 days time line is out of date the acc is locked and terminated to setteled your payment go to the lpso office to pay";

// checks whether the 7-day account lock window (from citation.received_at) has closed
export function isPastLockWindow(receivedAt: string | null | undefined): boolean {
  if (!receivedAt) return false;
  const receivedMs = new Date(receivedAt).getTime();
  if (isNaN(receivedMs)) return false;
  return Date.now() > receivedMs + LOCK_WINDOW_SECONDS * 1000;
}

/// checks whether this citation's account access window has expired
export async function isCitationLocked(supabase: any, citationId: string): Promise<boolean> {
  const { data } = await supabase
    .from("citation")
    .select("received_at")
    .eq("citation_id", citationId)
    .maybeSingle();
  return isPastLockWindow(data?.received_at ?? null);
}

// encodes bytes as base64url (URL-safe base64, no padding)
function base64UrlEncode(bytes: Uint8Array): string {
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// decodes a base64url string back into bytes
function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// imports a secret as an HMAC-SHA256 signing/verifying key
async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface MotoristTokenPayload {
  cid: string; // citation_id
  tn: string; // ticket_number
  exp: number; // unix seconds
}

/// signs a citation id + ticket number into a token that expires after 7 days
export async function signToken(
  payload: Omit<MotoristTokenPayload, "exp">,
  secret: string,
): Promise<string> {
  const full: MotoristTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(full)));
  const key = await hmacKey(secret);
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  const sig = base64UrlEncode(sigBytes);
  return `${body}.${sig}`;
}

/// verifies a token's signature and expiry, returning its payload if still valid
export async function verifyToken(
  token: string,
  secret: string,
): Promise<MotoristTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(sig),
    new TextEncoder().encode(body),
  );
  if (!valid) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body)),
    ) as MotoristTokenPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/// extracts the surname from a full name, handling both "SURNAME, First" and "First Last" formats
export function surnameFromFullName(fullName: string): string {
  const trimmed = fullName.trim();
  if (trimmed.includes(",")) {
    const beforeComma = trimmed.split(",")[0];
    return beforeComma.replace(/[^a-zA-Z]/g, "").toLowerCase();
  }
  const parts = trimmed.split(/\s+/);
  const last = parts[parts.length - 1] || "";
  return last.replace(/[^a-zA-Z]/g, "").toLowerCase();
}

/// motorist portal password = last 4 letters of the surname (or the whole surname if shorter) + last 4 characters of the ticket number
export function expectedPassword(fullName: string, ticketNumber: string): string {
  const surname = surnameFromFullName(fullName);
  const surnamePart = surname.length <= 4 ? surname : surname.slice(-4);
  const ticketPart = (ticketNumber || "").replace(/[^a-zA-Z0-9]/g, "").slice(-4).toLowerCase();
  return `${surnamePart}${ticketPart}`;
}

// builds the CORS headers every function returns so the portal's browser requests aren't blocked
export function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export interface CitationBundle {
  ticket: string;
  issued: string;
  motorist: string;
  license: string;
  vehicle: string;
  location: string;
  status: string;
  total: number;
  enforcer: string;
  violations: { code: string; title: string; fine: number }[];
}

/// fetches a citation plus everything it references (motorist, vehicle, location, enforcer, violations) and shapes it into what the portal UI expects
export async function buildCitationBundle(
  supabase: any,
  citationId: string,
): Promise<CitationBundle | null> {
  const { data: citation, error: citationError } = await supabase
    .from("citation")
    .select(
      "citation_id, ticket_number, enforcer_id, motorist_id, vehicle_id, location_id, issued_at, status, motorist_full_name, fine_amount",
    )
    .eq("citation_id", citationId)
    .maybeSingle();

  if (citationError || !citation) return null;

  const [{ data: motorist }, { data: vehicle }, { data: violations }, { data: enforcer }] =
    await Promise.all([
      supabase
        .from("motorist")
        .select("license_number")
        .eq("motorist_id", citation.motorist_id)
        .maybeSingle(),
      supabase
        .from("vehicle")
        .select("plate_number, vehicle_type")
        .eq("vehicle_id", citation.vehicle_id)
        .maybeSingle(),
      supabase
        .from("citation_violation")
        .select("ordinance_code, violation_description, fine_amount")
        .eq("citation_id", citation.citation_id),
      supabase
        .from("enforcer")
        .select("full_name")
        .eq("enforcer_id", citation.enforcer_id)
        .maybeSingle(),
    ]);

  let location = "";
  const { data: locationRow } = citation.location_id
    ? await supabase
        .from("citation_location")
        .select("barangay, landmark")
        .eq("location_id", citation.location_id)
        .maybeSingle()
    : { data: null };
  if (locationRow) {
    location = [locationRow.landmark, locationRow.barangay].filter(Boolean).join(", ");
  }

  const issuedDate = new Date(citation.issued_at);
  const issuedFormatted = isNaN(issuedDate.getTime())
    ? citation.issued_at
    : issuedDate.toLocaleString("en-PH", {
        year: "numeric",
        month: "long",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

  return {
    ticket: citation.ticket_number,
    issued: issuedFormatted,
    motorist: citation.motorist_full_name,
    license: motorist?.license_number || "—",
    vehicle: vehicle ? `${vehicle.vehicle_type} • ${vehicle.plate_number}` : "—",
    location: location || "—",
    status: citation.status,
    total: Number(citation.fine_amount) || 0,
    enforcer: enforcer?.full_name ? `Officer ${enforcer.full_name}` : "—",
    violations: (violations || []).map((v: any) => ({
      code: v.ordinance_code,
      title: v.violation_description,
      fine: Number(v.fine_amount) || 0,
    })),
  };
}