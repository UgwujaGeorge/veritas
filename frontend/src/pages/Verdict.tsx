import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock3, ExternalLink, XCircle } from 'lucide-react';
import {
  formatWeiAsGen,
  getAttemptNumber,
  readMilestone,
  type Milestone,
} from '../lib/genlayer';
import { useNetwork } from '../lib/network';

export default function Verdict() {
  const { id, milestoneIndex } = useParams();
  const location = useLocation();
  const txHash = (location.state as { txHash?: string } | null)?.txHash;
  const { activeNetwork, contractAddress, isConfigured, networkKey } = useNetwork();
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [error, setError] = useState('');

  const grantId = Number(id ?? 0);
  const index = Number(milestoneIndex ?? 0);

  useEffect(() => {
    async function loadVerdict() {
      if (!isConfigured) {
        setMilestone(null);
        return;
      }
      try {
        setMilestone(await readMilestone(networkKey, grantId, index));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load verdict');
      }
    }

    void loadVerdict();
  }, [grantId, index, isConfigured, networkKey]);

  const VerdictIcon = milestone?.status === 'approved' ? CheckCircle2 : milestone?.status === 'rejected' ? XCircle : Clock3;

  return (
    <section className="page narrow">
      <Link className="back-link" to={`/grant/${grantId}`}>
        <ArrowLeft size={18} aria-hidden="true" />
        Grant #{grantId}
      </Link>
      <div className="verdict-panel">
        {milestone ? (
          <>
            <div className={`verdict-icon status-${milestone.status}`}>
              <VerdictIcon size={36} aria-hidden="true" />
            </div>
            <span className="eyebrow">Milestone {index + 1}</span>
            <h1>{milestone.status}</h1>
            <h2>{milestone.title}</h2>
            <p>{milestone.criteria}</p>
            <div className="detail-strip compact-strip">
              <div>
                <span>Amount</span>
                <strong>{formatWeiAsGen(milestone.amount)}</strong>
              </div>
              <div>
                <span>Attempt</span>
                <strong>{getAttemptNumber(milestone)}</strong>
              </div>
              <div>
                <span>Network</span>
                <strong>{activeNetwork.name}</strong>
              </div>
              <div>
                <span>Contract</span>
                <strong>{contractAddress ? `${contractAddress.slice(0, 10)}...` : 'Not set'}</strong>
              </div>
            </div>
            {txHash ? (
              <a className="tx-box" href={`${activeNetwork.explorerUrl}/tx/${txHash}`} target="_blank" rel="noreferrer">
                <span>Transaction</span>
                <code>{txHash}</code>
              </a>
            ) : null}
            {milestone.evidenceUrl ? (
              <a className="button button-secondary" href={milestone.evidenceUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={18} aria-hidden="true" />
                Evidence
              </a>
            ) : null}
          </>
        ) : (
          <div className="empty-state">
            <h1>Verdict unavailable</h1>
            <p>{error || `Check the configured ${activeNetwork.name} contract address.`}</p>
          </div>
        )}
      </div>
    </section>
  );
}
