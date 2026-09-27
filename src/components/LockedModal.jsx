import { ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCitation } from '../context/CitationContext';

// Full-screen popup for the real account-level 7-day lockout. Shown the
// moment the server reports the account is locked - whether that happens
// from a login attempt or from an existing session getting kicked out on
// its next check - so the motorist always sees this exact message rather
// than a generic error or a silent redirect.
export default function LockedModal() {
  const { lockedMessage, dismissLocked } = useCitation();
  const nav = useNavigate();

  if (!lockedMessage) return null;

  const close = () => {
    dismissLocked();
    nav('/login');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(20, 22, 20, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 14, maxWidth: 420, width: '100%',
        padding: '28px 26px', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', background: '#fdecec',
          color: '#c0392b', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <ShieldAlert size={26} />
        </div>
        <h2 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700 }}>Account locked</h2>
        <p style={{ margin: '0 0 22px', fontSize: 14.5, lineHeight: 1.55, color: '#333' }}>
          {lockedMessage}
        </p>
        <button
          onClick={close}
          className="primary wide"
          style={{ width: '100%' }}
        >
          Okay
        </button>
      </div>
    </div>
  );
}