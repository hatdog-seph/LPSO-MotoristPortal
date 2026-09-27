import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronRight, Gavel, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import PageHead from '../components/PageHead';

export default function ViolationFinder() {
  const [ordinances, setOrdinances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from('ordinance')
      .select('ordinance_id, ordinance_code, violation_description, fine_amount')
      .order('ordinance_code', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) {
          setError('Could not load violations right now. Please try again later.');
        } else {
          setOrdinances(data || []);
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordinances;
    return ordinances.filter(
      (o) =>
        o.ordinance_code.toLowerCase().includes(q) ||
        o.violation_description.toLowerCase().includes(q),
    );
  }, [ordinances, query]);

  return (
    <>
      <PageHead
        eyebrow="VIOLATION FINDER"
        title="Search traffic violations"
        desc="Look up municipal ordinances and their fines as recorded by the LPSO."
      />

      <div className="vf-search">
        <Search size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search violation..."
        />
        {query && (
          <button className="vf-clear" onClick={() => setQuery('')}>
            <X size={16} />
          </button>
        )}
      </div>

      {loading && (
        <div className="vf-state">
          <div className="spinner" />
          <p>Loading violations…</p>
        </div>
      )}

      {!loading && error && (
        <div className="vf-state vf-error">
          <AlertCircle size={22} />
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="vf-state">
          <Gavel size={28} />
          <p>No violations match "{query}".</p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="vf-grid">
          {filtered.map((o) => (
            <button className="vf-card" key={o.ordinance_id} onClick={() => setSelected(o)}>
              <div className="vf-card-code">{o.ordinance_code}</div>
              <div className="vf-card-title">{o.violation_description}</div>
              <div className="vf-card-fine">₱{Number(o.fine_amount).toLocaleString()}</div>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={() => setSelected(null)}>
              <X />
            </button>
            <div className="modal-head">
              <div className="pay-icon small">
                <Gavel />
              </div>
              <div>
                <span className="muted">{selected.ordinance_code}</span>
                <h2>{selected.violation_description}</h2>
              </div>
            </div>
            <div className="modal-amount">
              <span>Fine amount</span>
              <strong>₱{Number(selected.fine_amount).toLocaleString()}</strong>
            </div>
            <div className="modal-note">
              <AlertCircle size={16} /> This reflects the fine on record with the LPSO at the time
              of lookup. The amount on an actual citation is fixed at the moment it was issued.
            </div>
          </div>
        </div>
      )}
    </>
  );
}