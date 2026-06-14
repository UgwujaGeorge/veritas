import { CheckCircle2, Clock3, ExternalLink, Upload, XCircle } from 'lucide-react';
import { formatWeiAsGen, getAttemptNumber, getNextAttemptNumber, type Milestone } from '../lib/genlayer';

interface MilestoneCardProps {
  milestone: Milestone;
  index: number;
  canSubmit: boolean;
  onSubmitClick: () => void;
}

const statusMeta = {
  pending: { icon: Clock3, label: 'Pending' },
  submitted: { icon: Clock3, label: 'Submitted' },
  approved: { icon: CheckCircle2, label: 'Approved' },
  rejected: { icon: XCircle, label: 'Rejected' },
};

export default function MilestoneCard({ milestone, index, canSubmit, onSubmitClick }: MilestoneCardProps) {
  const StatusIcon = statusMeta[milestone.status]?.icon ?? Clock3;
  const attemptNumber = getAttemptNumber(milestone);
  const nextAttemptNumber = getNextAttemptNumber(milestone);
  const submitLabel = milestone.status === 'rejected' ? 'Try again' : 'Submit';
  const retryLabel = milestone.resubmissionCount === 1n ? 'retry' : 'retries';

  return (
    <article className="card milestone-card">
      <div className="milestone-head">
        <div>
          <span className="eyebrow">Milestone {index + 1}</span>
          <h3>{milestone.title}</h3>
        </div>
        <span className={`status status-${milestone.status}`}>
          <StatusIcon size={16} aria-hidden="true" />
          {statusMeta[milestone.status]?.label ?? milestone.status}
        </span>
      </div>
      <div className="attempt-row">
        <span>Attempt {attemptNumber}</span>
        {milestone.resubmissionCount > 0n ? <span>{milestone.resubmissionCount.toString()} {retryLabel}</span> : null}
      </div>
      <p className="criteria">{milestone.criteria}</p>
      <div className="milestone-foot">
        <strong>{formatWeiAsGen(milestone.amount)}</strong>
        {milestone.evidenceUrl ? (
          <a className="evidence-link" href={milestone.evidenceUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            Evidence
          </a>
        ) : null}
        {canSubmit ? (
          <button className="button button-primary compact" type="button" onClick={onSubmitClick}>
            <Upload size={16} aria-hidden="true" />
            {nextAttemptNumber > 1 ? `${submitLabel} #${nextAttemptNumber}` : submitLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}
