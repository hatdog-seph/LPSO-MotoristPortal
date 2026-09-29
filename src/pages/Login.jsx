import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, QrCode, ReceiptText, ShieldCheck } from 'lucide-react';
import lpsoLogo from '../data/images/lpso_logo.png';
import { useCitation } from '../context/CitationContext';

export default function Login() {
  const [searchParams] = useSearchParams();
  const prefillTicket = searchParams.get('ticket') || '';
  const [ticket, setTicket] = useState(prefillTicket);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useCitation();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!ticket || !password) {
      setError('Enter your ticket number and password.');
      return;
    }
    setError('');
    setSubmitting(true);
    const result = await login(ticket.trim(), password);
    setSubmitting(false);
    if (!result.ok) {
      // A locked account already pops up the full-screen lock notice
      // (see LockedModal, driven by CitationContext's lockedMessage) - no
      // need to also duplicate that message in the inline form banner.
      if (!result.locked) setError(result.error);
      return;
    }
    nav('/portal');
  };

  return (
    <div className="auth">
      <img className="auth-watermark" src={lpsoLogo} alt="" aria-hidden="true" />
      <div className="auth-art">
        <div className="auth-brand">
          <div className="crest logo-crest">
            <img src={lpsoLogo} alt="LPSO logo" />
          </div>
          <div>
            <strong>eTicket</strong>
            <span>Libmanan Public Safety Office</span>
          </div>
        </div>

        <div className="auth-copy">
          <div className="eyebrow">MOTORIST PORTAL</div>
          <h1>
            View your citation.
            <br />
            <em>Pay with confidence.</em>
          </h1>
          <p>
            Securely review your LPSO traffic citation and submit your digital payment
            reference from any mobile device.
          </p>
          <div className="auth-points">
            <span>
              <QrCode size={17} /> QR-based citation access
            </span>
            <span>
              <ShieldCheck size={17} /> Secure record viewing
            </span>
            <span>
              <ReceiptText size={17} /> Digital payment receipt
            </span>
          </div>
        </div>

        <div className="auth-foot">© 2026 Libmanan Public Safety Office • eTicket</div>
      </div>

      <div className="auth-panel">
        <div className="mobile-logo">
          <div className="crest logo-crest">
            <img src={lpsoLogo} alt="LPSO logo" />
          </div>
          <div>
            <strong>eTicket</strong>
            <small>Motorist Portal</small>
          </div>
        </div>

        <div className="login-box">
          <div className="login-icon">
            <img src={lpsoLogo} alt="LPSO logo" />
          </div>
          <h2>Welcome back</h2>
          <p>Enter the details from your citation to continue.</p>

          <form onSubmit={submit}>
            <label>
              Ticket number
              <input
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                placeholder="e.g. LPSO-2026-004821"
              />
            </label>
            {prefillTicket && (
              <div className="field-hint field-hint-success">
                Filled in from your scanned citation
              </div>
            )}
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Password (e.g. cruz0001)"
              />
            </label>
            <div className="field-hint" style={{ fontStyle: "italic" }}>
              Password: the last 4 letters of your surname (or your full surname if it's
              shorter than 4 letters) + the last 4 characters of your ticket
              number.
            </div>
            {error && (
              <div className="form-error">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
            <button className="primary wide" disabled={submitting}>
              {submitting ? 'Signing in…' : (<>Sign in <ArrowRight size={18} /></>)}
            </button>
          </form>

          <div className="login-help">
            <QrCode size={18} />
            <span>
              Scanned a citation QR code?
              <br />
              <b>Your ticket number is already linked.</b>
            </span>
          </div>

          <div className="privacy">
            <ShieldCheck size={14} /> Your citation information is private and intended only for
            the cited motorist.
          </div>
        </div>
      </div>
    </div>
  );
}
