import { ArrowRight, CheckCircle2, QrCode, ReceiptText, ShieldCheck } from 'lucide-react';
import { useCitation } from '../context/CitationContext';
import PageHead from '../components/PageHead';
import StatusBadge from '../components/StatusBadge';
import Step from '../components/Step';

export default function PaymentPage({ submitted, setShowPay }) {
  const { citation } = useCitation();
  return (
    <>
      <PageHead eyebrow="PAYMENT" title="Payment dashboard" desc="Pay your outstanding citation - verification is fully automatic.">
        {submitted === 'paid' ? (
          <span className="status verified">
            <CheckCircle2 size={14} /> Payment confirmed
          </span>
        ) : (
        <StatusBadge status={citation.status} />
            )}
      </PageHead>

      <div className="payment-layout">
        <section className="card pay-summary">
          <div className="muted">AMOUNT DUE</div>
          <div className="amount">₱{citation.total.toLocaleString()}</div>
          <div className="pay-ticket">
            <ReceiptText size={17} /> {citation.ticket}
          </div>
          <div className="divider" />
          <div className="pay-line">
            <span>Violation fines</span>
            <b>₱{citation.total.toLocaleString()}</b>
          </div>
          <div className="pay-line">
            <span>Processing fee</span>
            <b>₱0.00</b>
          </div>
          <div className="pay-total">
            <span>Total</span>
            <strong>₱{citation.total.toLocaleString()}</strong>
          </div>

          {submitted === 'paid' ? (
            <div className="submitted verified">
              <CheckCircle2 size={22} />
              <div>
                <b>Payment confirmed</b>
                <p>Your QR Ph payment was verified automatically by PayMongo. Your citation is now marked Settled.</p>
              </div>
            </div>
          ) : (
            <button className="primary wide" onClick={() => setShowPay(true)}>
              Pay with QR Ph <ArrowRight size={18} />
            </button>
          )}
        </section>

        <section className="card pay-info">
          <div className="pay-icon">
            <QrCode />
          </div>
          <h3>Pay using QR Ph</h3>
          <p>
            Pay instantly with QR Ph through your banking or e-wallet app (GCash, Maya, and others).
            Every payment is confirmed automatically - there is no manual review step.
          </p>
          <div className="steps">
            <Step n="01" title="Scan & pay" text="Generate and scan your official QR Ph code to pay instantly." />
            <Step n="02" title="Automatic verification" text="PayMongo confirms your payment directly with LPSO - no manual step, no waiting for an admin." />
          </div>
        </section>
      </div>

      <div className="notice">
        <ShieldCheck size={19} />
        <div>
          <b>Important</b>
          <p>
            Payments made through this portal are verified automatically the moment PayMongo confirms
            the transaction. Your citation updates to <strong>Settled</strong> immediately - no admin
            action is required.
          </p>
        </div>
      </div>
    </>
  );
}