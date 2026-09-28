import { CheckCircle2, Clock3 } from 'lucide-react';


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