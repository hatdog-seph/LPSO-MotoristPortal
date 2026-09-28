import { ArrowRight, Car, Clock3, CreditCard, FileText, Info, MapPin, ReceiptText, ShieldCheck } from 'lucide-react';
import { useCitation } from '../context/CitationContext';
import PageHead from '../components/PageHead';
import StatusBadge from '../components/StatusBadge';
import Stat from '../components/Stat';
import InfoRow from '../components/InfoRow';

export default function Overview({ setPage, setShowPay }) {
  const { citation } = useCitation();
  return (
    <>
      <PageHead
        eyebrow="MOTORIST DASHBOARD"
        title={`Hello, ${citation.motorist}.`}
        desc="Here’s the current status of your traffic citation."
      >
        <StatusBadge status={citation.status} />
      </PageHead>

      <div className="stats">
        <Stat
          icon={<ReceiptText />}
          label="Citation total"
          value={`₱${citation.total.toLocaleString()}`}
          sub="Outstanding balance"
        />
        <Stat
          icon={<FileText />}
          label="Violations"
          value={citation.violations.length}
          sub="Recorded on this ticket"
        />
        <Stat
        icon={<Clock3 />}
        label="Status"
        value={citation.status}
        sub={citation.status === 'Settled' ? 'Verified by PayMongo' : 'Awaiting payment'}
        />
      </div>

      <section className="card citation-card">
        <div className="card-title">
          <div>
            <span className="muted">CITATION RECORD</span>
            <h2>{citation.ticket}</h2>
          </div>
          <StatusBadge status={citation.status} />
        </div>

        <div className="citation-grid">
          <InfoRow icon={<Car />} label="Vehicle" value={citation.vehicle} />
          <InfoRow icon={<FileText />} label="Issued" value={citation.issued} />
          <InfoRow icon={<MapPin />} label="Location" value={citation.location} />
          <InfoRow icon={<ShieldCheck />} label="Apprehending officer" value={citation.enforcer} />
        </div>

        <div className="violations">
          <div className="section-label">VIOLATIONS</div>
          {citation.violations.map((v) => (
            <div className="violation" key={v.code}>
              <div className="vi-code">{v.code}</div>
              <div className="vi-main">
                <b>{v.title}</b>
                <span>Municipal ordinance violation</span>
              </div>
              <strong>₱{v.fine.toLocaleString()}</strong>
            </div>
          ))}
        </div>

        <div className="total-row">
          <span>Total amount due</span>
          <strong>₱{citation.total.toLocaleString()}</strong>
        </div>

        <div className="card-actions">
          <button className="secondary" onClick={() => setPage('citation')}>
            Review full citation <ArrowRight size={17} />
          </button>
          <button className="primary" onClick={() => setPage('payment')}>
            Pay citation <CreditCard size={17} />
          </button>
        </div>
      </section>

      <div className="notice">
  <Info size={19} />
  <div>
    <b>How payment verification works</b>
    <p>
      Pay through QR Ph and PayMongo confirms the transaction directly with LPSO the moment
      it completes - verification is fully automatic, with no manual step and no reference
      number to submit. Your citation updates to Settled as soon as PayMongo confirms it.
    </p>
  </div>
</div>
    </>
  );
}
