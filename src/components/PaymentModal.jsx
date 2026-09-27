import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, QrCode, X } from 'lucide-react';
import { useCitation } from '../context/CitationContext';

// QR Ph (PayMongo) is the only payment method. There is no manual/"I
// already paid" fallback: every payment is confirmed automatically by
// PayMongo's webhook, never by a frontend claim, screenshot, or admin
// guesswork - so there is nothing here for an admin to manually verify.
export default function PaymentModal({ onClose, onPaid }) {
  const { citation, createQrphPayment, checkPaymentStatus } = useCitation();

  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const [qrStatus, setQrStatus] = useState('pending'); // pending | paid | failed
  const pollRef = useRef(null);

  const startQrph = async () => {
    setQrLoading(true);
    setQrError('');
    const result = await createQrphPayment();
    setQrLoading(false);
    if (!result.ok) {
      setQrError(result.error);
      return;
    }
    setQrImageUrl(result.qrImageUrl);
    setPaymentIntentId(result.paymentIntentId);
    setQrStatus('pending');
  };

  useEffect(() => {
    if (!qrImageUrl && !qrLoading && !qrError) {
      startQrph();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!paymentIntentId || qrStatus !== 'pending') return undefined;

    pollRef.current = setInterval(async () => {
      const result = await checkPaymentStatus(paymentIntentId);
      if (!result.ok) return;
      if (result.status === 'paid') {
        setQrStatus('paid');
        clearInterval(pollRef.current);
      } else if (result.status === 'failed') {
        setQrStatus('failed');
        clearInterval(pollRef.current);
      }
    }, 3000);

    return () => clearInterval(pollRef.current);
  }, [paymentIntentId, qrStatus, checkPaymentStatus]);

  useEffect(() => {
    if (qrStatus === 'paid') {
      const t = setTimeout(() => onPaid(), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrStatus]);

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <button className="modal-x" onClick={onClose}>
          <X />
        </button>

        <div className="modal-head">
          <div className="pay-icon small">
            <QrCode />
          </div>
          <div>
            <span className="muted">PAY CITATION</span>
            <h2>Pay with QR Ph</h2>
          </div>
        </div>

        <div className="modal-amount">
          <span>Amount to pay</span>
          <strong>₱{citation.total.toLocaleString()}</strong>
        </div>

        <div className="qrph-panel">
          {qrLoading && (
            <div className="qrph-state">
              <Loader2 className="spin" size={26} />
              <p>Generating your QR Ph code…</p>
            </div>
          )}

          {!qrLoading && qrError && (
            <div className="qrph-state qrph-error">
              <AlertCircle size={24} />
              <p>{qrError}</p>
              <button className="secondary" onClick={startQrph}>
                Try again
              </button>
            </div>
          )}

          {!qrLoading && !qrError && qrImageUrl && qrStatus === 'pending' && (
            <>
              <div className="qrph-image">
                <img src={qrImageUrl} alt="QR Ph payment code" />
              </div>
              <div className="qrph-waiting">
                <Loader2 className="spin" size={16} /> Waiting for payment confirmation…
              </div>
              <p className="qrph-hint">
                Scan this code using any QR Ph-enabled banking or e-wallet app (GCash, Maya, etc).
                This page will update automatically once your payment is confirmed - no further
                action is needed on your end.
              </p>
            </>
          )}

          {!qrLoading && qrStatus === 'paid' && (
            <div className="qrph-state qrph-success">
              <CheckCircle2 size={28} />
              <p>Payment confirmed! Updating your citation…</p>
            </div>
          )}

          {!qrLoading && qrStatus === 'failed' && (
            <div className="qrph-state qrph-error">
              <AlertCircle size={24} />
              <p>The payment did not go through. Please try again.</p>
              <button className="secondary" onClick={startQrph}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}