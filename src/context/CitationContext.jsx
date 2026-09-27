import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const TOKEN_KEY = 'motoristToken';
const CitationContext = createContext(null);

const FALLBACK_LOCK_MESSAGE =
  'Your 7 days time line is out of date the acc is locked and terminated to setteled your payment go to the lpso office to pay';

// supabase-js (functions-js) THROWS for any non-2xx response before ever
// touching `data` - it always comes back as `{ data: null, error }`, even
// though our edge function sent a perfectly good JSON body like
// { error: "locked", message: "..." }. That body only exists on
// `error.context`, which is the raw Response object, and has to be
// re-read with its own .json() call. Without this, `data` is always null
// on a 401/423 and we can never tell "locked" apart from "wrong password"
// or any other failure - which is exactly the bug that made the account
// lock always show the generic invalid-credentials message.
async function readFunctionErrorBody(fnError) {
  try {
    if (fnError?.context && typeof fnError.context.json === 'function') {
      return await fnError.context.json();
    }
  } catch {
    // context body already consumed, not JSON, etc. - fall through.
  }
  return null;
}

export function CitationProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [citation, setCitation] = useState(null);
  // Starts true whenever a token already exists, so Portal can show a
  // loading state instead of flashing back to /login while the stored
  // token is being re-validated on page reload.
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY));
  const [error, setError] = useState('');
  // Set whenever the server reports the account's 7-day access window (from
  // citation.received_at) has closed - independent of the token's own
  // expiry and of paid/unpaid status. Any part of the app can watch this to
  // show the required lock popup, from a failed login attempt or from a
  // session that was still holding a technically-unexpired token.
  const [lockedMessage, setLockedMessage] = useState('');

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setCitation(null);
  }, []);

  const dismissLocked = useCallback(() => setLockedMessage(''), []);

  const login = useCallback(async (ticketNumber, password) => {
    setError('');
    const { data, error: fnError } = await supabase.functions.invoke('motorist-login', {
      body: { ticket_number: ticketNumber, password },
    });

    if (fnError) {
      const body = await readFunctionErrorBody(fnError);
      if (body?.error === 'locked') {
        const message = body.message || FALLBACK_LOCK_MESSAGE;
        clearSession();
        setLockedMessage(message);
        return { ok: false, locked: true, error: message };
      }
      const message = body?.error || 'Invalid ticket number or password.';
      setError(message);
      return { ok: false, error: message };
    }

    if (!data?.token) {
      const message = 'Invalid ticket number or password.';
      setError(message);
      return { ok: false, error: message };
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setCitation(data.citation);
    return { ok: true };
  }, [clearSession]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const reportEnforcer = useCallback(async ({ category, description, contact_info }) => {
    const { data, error: fnError } = await supabase.functions.invoke('motorist-report-enforcer', {
      body: { token, category, description, contact_info },
    });
    if (fnError || !data?.ok) {
      return { ok: false, error: data?.error || 'Could not submit report. Please try again.' };
    }
    return { ok: true };
  }, [token]);

  const createQrphPayment = useCallback(async () => {
    const { data, error: fnError } = await supabase.functions.invoke('motorist-create-payment', {
      body: { token },
    });
    if (fnError || !data?.qr_image_url) {
      return { ok: false, error: data?.error || 'Could not start the QR Ph payment. Please try again.' };
    }
    return { ok: true, qrImageUrl: data.qr_image_url, paymentIntentId: data.payment_intent_id };
  }, [token]);

  const checkPaymentStatus = useCallback(async (paymentIntentId) => {
    const { data, error: fnError } = await supabase.functions.invoke('motorist-payment-status', {
      body: { token, payment_intent_id: paymentIntentId },
    });
    if (fnError || !data?.status) {
      return { ok: false, error: data?.error || 'Could not check payment status.' };
    }
    return { ok: true, status: data.status };
  }, [token]);

  const refresh = useCallback(async (activeToken) => {
    const { data, error: fnError } = await supabase.functions.invoke('motorist-session', {
      body: { token: activeToken },
    });

    if (fnError) {
      const body = await readFunctionErrorBody(fnError);
      clearSession();
      if (body?.error === 'locked') {
        setLockedMessage(body.message || FALLBACK_LOCK_MESSAGE);
      }
      return false;
    }

    if (!data?.citation) {
      clearSession();
      return false;
    }
    setCitation(data.citation);
    return true;
  }, [clearSession]);

  // On first load, if a token is already stored (e.g. page refresh),
  // re-validate it against the server and re-fetch the citation rather
  // than trusting anything cached client-side.
  useEffect(() => {
    let active = true;
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh(token).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CitationContext.Provider
      value={{
        citation,
        token,
        isAuthenticated: !!token,
        loading,
        error,
        lockedMessage,
        dismissLocked,
        login,
        logout,
        reportEnforcer,
        createQrphPayment,
        checkPaymentStatus,
      }}
    >
      {children}
    </CitationContext.Provider>
  );
}

export function useCitation() {
  const ctx = useContext(CitationContext);
  if (!ctx) throw new Error('useCitation must be used within CitationProvider');
  return ctx;
}