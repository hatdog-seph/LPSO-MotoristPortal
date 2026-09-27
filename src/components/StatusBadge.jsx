import { CheckCircle2, Clock3 } from 'lucide-react';

// Reflects the citation's actual persisted status (set only by the PayMongo
// webhook / a server-side status check) - never a hardcoded label. "Settled"
// is the only status the backend ever sets once a payment is verified, so
// that's the one case this renders as confirmed; everything else is still
// pending, whatever citation.status happens to say.
export default function StatusBadge({ status }) {
  const isSettled = status === 'Settled';
  return isSettled ? (
    <span className="status verified">
      <CheckCircle2 size={14} /> Payment confirmed
    </span>
  ) : (
    <span className="status pending">
      <Clock3 size={14} /> Pending Payment
    </span>
  );
}