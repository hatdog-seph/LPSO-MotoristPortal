import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronRight, Gavel, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import PageHead from '../components/PageHead';

const VIOLATION_DETAILS = {
  'ORD-001': "Using a private or unfranchised vehicle to carry passengers or goods for a fee without a franchise or permit.",
  'ORD-002': "Driving a motor vehicle without a valid driver's license, or failing to show one when asked by an enforcer.",
  'ORD-003': "Driving a vehicle without its Official Receipt and Certificate of Registration, or without the plate issued for it.",
  'ORD-004': "Driving a vehicle with no plate, or with a plate that is missing, covered, or unreadable.",
  'ORD-005': "Failing to present a valid ID or operator's/driver's ID, or presenting one that has expired.",
  'ORD-006': "Driving opposite to the posted direction on a one-way street.",
  'ORD-007': "Making a left turn or U-turn where a sign or marking prohibits it.",
  'ORD-008': "Leaving a vehicle unattended on a road or public place in a way that blocks traffic or poses a hazard, or leaving it for an extended period.",
  'ORD-009': "Failing to obey traffic signs, signals, road markings, or the hand signals of a traffic enforcer.",
  'ORD-010': "Driving while drunk or impaired by alcohol.",
  'ORD-011': "Parking in a no-parking zone, on sidewalks or crossings, or anywhere that blocks traffic or pedestrians.",
  'ORD-012': "Being rude to passengers, charging above the approved fare, or refusing to take a passenger without a valid reason.",
  'ORD-013': "Operating a tricycle, pedicab (padjak), or bicycle-for-hire that isn't registered with the municipality.",
  'ORD-014': "Operating a public utility vehicle without a trash receptacle for passengers.",
  'ORD-015': "Picking up or dropping off passengers or cargo outside official loading and unloading zones.",
  'ORD-016': "Operating a franchised vehicle outside its authorized route or area.",
  'ORD-017': "A public utility driver wearing slippers, shorts, or a sleeveless shirt while on duty instead of the required attire.",
  'ORD-018': "Smoking inside a public utility vehicle, whether by the driver or a passenger.",
  'ORD-019': "Riding a motorcycle without a standard protective helmet, as driver or back rider.",
};

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
            {VIOLATION_DETAILS[selected.ordinance_id] && (
              <div className="modal-desc">
                <span className="muted">What this means</span>
                <p>{VIOLATION_DETAILS[selected.ordinance_id]}</p>
              </div>
            )}
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