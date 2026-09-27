import { HelpCircle, QrCode, ShieldAlert, ShieldCheck } from 'lucide-react';
import PageHead from '../components/PageHead';

export default function HelpPage() {
  return (
    <>
      <PageHead eyebrow="HELP & INFORMATION" title="Need assistance?" desc="Here are the basics for using the motorist portal." />

      <div className="help-grid">
        <section className="card">
          <HelpCircle className="help-big" />
          <h2>About your access</h2>
          <p>
            Your citation is accessed through the QR code printed on your e-ticket, or by signing
            in with your ticket number and portal password. The portal only shows the single
            citation record linked to your ticket, for your privacy and security.
          </p>
        </section>

        <section className="card">
          <QrCode className="help-big" />
          <h2>How to pay</h2>
          <p>
            Go to <b>Payment</b> and select <b>Pay with QR Ph</b>. A QR code is generated for the
            exact amount due - scan it with any QR Ph-enabled banking or e-wallet app (GCash,
            Maya, and others) to complete your payment.
          </p>
        </section>

        <section className="card">
          <h3>Payment verification</h3>
          <p>
            Verification is fully automatic. The moment your QR Ph payment is completed, PayMongo
            confirms the transaction directly with LPSO - there is no reference number to submit
            and no manual review step. Your citation updates to <b>Settled</b> as soon as it's
            confirmed, usually within seconds.
          </p>
          <div className="faq">
            <b>What if my citation still shows Pending right after paying?</b>
            <span>
              Give it a moment - confirmation is automatic but can take a few seconds. Reopen the
              Payment page to see the latest status; you don't need to do anything else.
            </span>
          </div>
        </section>

        <section className="card">
          <ShieldCheck className="help-big" />
          <h2>Trouble scanning the QR code?</h2>
          <p>
            Make sure your screen brightness is up and there's no glare, hold your phone steady
            about 15-20cm from the code, and keep the whole code inside the camera frame. If
            scanning still doesn't work, you can also use your e-wallet app's "Upload QR" option
            with a screenshot of the code.
          </p>
        </section>

        <section className="card">
          <ShieldAlert className="help-big" />
          <h2>Concern about the issuing enforcer?</h2>
          <p>
            If you have a concern about how a citation was issued - such as unprofessional
            conduct or incorrect citation details - use <b>Report Enforcer</b> in the menu to
            submit it directly to LPSO for review.
          </p>
        </section>
      </div>
    </>
  );
}