import { useState } from 'react';
import { AlertCircle, CheckCircle2, Send, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useCitation } from '../context/CitationContext';
import PageHead from '../components/PageHead';
import InfoRow from '../components/InfoRow';

const CATEGORIES = [
  'Unprofessional behavior',
  'Incorrect citation information',
  'Request for clarification',
  'Suspected improper conduct',
  'Other',
];

export default function ReportEnforcer() {
  const { citation, reportEnforcer } = useCitation();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (description.trim().length < 10) {
      setError('Please provide a bit more detail (at least 10 characters).');
      return;
    }
    setError('');
    setSubmitting(true);
    const result = await reportEnforcer({ category, description: description.trim(), contactInfo: contactInfo.trim() });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <>
        <PageHead
          eyebrow="REPORT ENFORCER"
          title="Report an Enforcer"
          desc="Reports are reviewed by authorized LPSO administrators."
        />
        <section className="card report-submitted">
          <CheckCircle2 size={40} />
          <h2>Report submitted</h2>
          <p>
            Thank you. Your report has been sent to LPSO administrators for review. It's linked
            to citation <b>{citation.ticket}</b>, but not visible to anyone besides authorized
            reviewers.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="REPORT ENFORCER"
        title="Report an Enforcer"
        desc="Reports are reviewed by authorized LPSO administrators. This does not affect your citation or its status."
      />

      <section className="card report-form">
        <div className="section-label">CITATION CONTEXT</div>
        <div className="report-context">
          <InfoRow icon={<ShieldCheck />} label="Apprehending officer" value={citation.enforcer} />
          <InfoRow icon={<ShieldAlert />} label="Related ticket" value={citation.ticket} />
        </div>

        <form onSubmit={submit}>
          <label>
            Report category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened, as clearly and specifically as you can."
              rows={6}
            />
          </label>

          <label>
            Contact information (optional)
            <input
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="Phone or email, if you're open to being contacted about this report"
            />
          </label>

          {error && (
            <div className="form-error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button className="primary wide" disabled={submitting}>
            {submitting ? 'Submitting…' : (<>Submit Report <Send size={17} /></>)}
          </button>
        </form>
      </section>

      <div className="notice">
        <ShieldCheck size={19} />
        <div>
          <b>How reports are handled</b>
          <p>
            Submitting a report does not mark the enforcer as guilty or apply any disciplinary
            action automatically. An authorized LPSO administrator reviews every report before
            any action is taken. Your report is never visible to other motorists.
          </p>
        </div>
      </div>
    </>
  );
}