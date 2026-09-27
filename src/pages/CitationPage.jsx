import { ArrowRight, Car, CreditCard, MapPin, ReceiptText, ShieldCheck } from 'lucide-react';
import { useCitation } from '../context/CitationContext';
import PageHead from '../components/PageHead';
import StatusBadge from '../components/StatusBadge';
import InfoRow from '../components/InfoRow';

export default function CitationPage({ setPage }) {
  const { citation } = useCitation();
  const isSettled = citation.status === 'Settled';
  return (
    <>
      <PageHead eyebrow="MY CITATION" title="Citation details" desc="Review the complete information recorded by the LPSO enforcer.">
        <StatusBadge status={citation.status} />
      </PageHead>

      <section className="card detail-card">
        <div className="detail-banner">
          <div className="ticket-symbol">
            <ReceiptText />
          </div>
          <div>
            <span>TRAFFIC CITATION</span>
            <h2>{citation.ticket}</h2>
            <p>Issued {citation.issued}</p>
          </div>
        </div>

        <div className="detail-section">
          <h3>Motorist & vehicle</h3>
          <div className="detail-two">
            <InfoRow icon={<ShieldCheck />} label="Motorist" value={citation.motorist} />
            <InfoRow icon={<CreditCard />} label="Driver's license" value={citation.license} />
            <InfoRow icon={<Car />} label="Vehicle" value={citation.vehicle} />
            <InfoRow icon={<MapPin />} label="Apprehension location" value={citation.location} />
          </div>
        </div>

        <div className="detail-section">
          <h3>Violations & fines</h3>
          {citation.violations.map((v) => (
            <div className="line-item" key={v.code}>
              <div>
                <b>{v.code}</b>
                <p>{v.title}</p>
              </div>
              <strong>₱{v.fine.toLocaleString()}</strong>
            </div>
          ))}
        </div>

        <div className="total-row big">
          <span>Total amount due</span>
          <strong>₱{citation.total.toLocaleString()}</strong>
        </div>

        {!isSettled && (
          <div className="card-actions">
            <button className="primary wide" onClick={() => setPage('payment')}>
              Proceed to payment <ArrowRight size={17} />
            </button>
          </div>
        )}
      </section>
    </>
  );
}