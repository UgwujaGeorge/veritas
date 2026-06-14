import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import EvidenceForm from '../components/EvidenceForm';
import MilestoneCard from '../components/MilestoneCard';
import {
  formatAddress,
  formatWeiAsGen,
  getNextAttemptNumber,
  readGrant,
  type Grant,
} from '../lib/genlayer';
import { useNetwork } from '../lib/network';
import { useWallet } from '../lib/wallet';

export default function GrantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { walletAddress } = useWallet();
  const { activeNetwork, isConfigured, networkKey } = useNetwork();
  const [grant, setGrant] = useState<Grant | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const grantId = Number(id ?? 0);

  async function loadGrant() {
    setError('');
    if (!isConfigured) {
      setGrant(null);
      return;
    }

    setIsLoading(true);
    try {
      setGrant(await readGrant(networkKey, grantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load grant');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadGrant();
  }, [grantId, isConfigured, networkKey]);

  const isGrantee =
    Boolean(walletAddress && grant?.grantee) && walletAddress?.toLowerCase() === grant?.grantee.toLowerCase();

  return (
    <section className="page">
      <Link className="back-link" to="/">
        <ArrowLeft size={18} aria-hidden="true" />
        Grants
      </Link>
      <div className="page-head">
        <div>
          <span className="eyebrow">Grant #{grantId}</span>
          <h1>{grant?.title ?? 'Grant detail'}</h1>
        </div>
        <button className="button button-secondary" type="button" onClick={loadGrant} disabled={isLoading}>
          <RefreshCw className={isLoading ? 'spin' : undefined} size={18} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {grant ? (
        <>
          <div className="detail-strip">
            <div>
              <span>Issuer</span>
              <strong>{formatAddress(grant.issuer)}</strong>
            </div>
            <div>
              <span>Grantee</span>
              <strong>{formatAddress(grant.grantee)}</strong>
            </div>
            <div>
              <span>Escrow</span>
              <strong>{formatWeiAsGen(grant.totalAmount)}</strong>
            </div>
            <div>
              <span>Milestones</span>
              <strong>{grant.milestones.length}</strong>
            </div>
          </div>

          <div className="milestone-list">
            {grant.milestones.map((milestone, index) => (
              <div key={`${milestone.title}-${index}`} className="milestone-block">
                <MilestoneCard
                  milestone={milestone}
                  index={index}
                  canSubmit={Boolean(isGrantee && (milestone.status === 'pending' || milestone.status === 'rejected'))}
                  onSubmitClick={() => setSelectedMilestone(index)}
                />
                {selectedMilestone === index ? (
                  <EvidenceForm
                    grantId={BigInt(grantId)}
                    milestoneIndex={BigInt(index)}
                    attemptNumber={getNextAttemptNumber(milestone)}
                    isRetry={milestone.status === 'rejected'}
                    onFinalized={(txHash) => {
                      navigate(`/grant/${grantId}/milestone/${index}/verdict`, { state: { txHash } });
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <h2>{isLoading ? 'Loading grant' : 'Grant not loaded'}</h2>
          <p>Check the configured {activeNetwork.name} contract address.</p>
        </div>
      )}
    </section>
  );
}
