import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock3, Plus, RefreshCw, XCircle } from 'lucide-react';
import {
  formatAddress,
  formatWeiAsGen,
  readGrant,
  readGrantCount,
  type Grant,
} from '../lib/genlayer';
import { useNetwork } from '../lib/network';

export default function Home() {
  const navigate = useNavigate();
  const { activeNetwork, isConfigured, networkKey } = useNetwork();
  const [grants, setGrants] = useState<Array<{ id: number; grant: Grant }>>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function loadGrants() {
    setError('');
    if (!isConfigured) {
      setGrants([]);
      return;
    }

    setIsLoading(true);
    try {
      const count = Number(await readGrantCount(networkKey));
      const loaded = await Promise.all(
        Array.from({ length: count }, async (_, id) => ({
          id,
          grant: await readGrant(networkKey, id),
        })),
      );
      setGrants(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load grants');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadGrants();
  }, [isConfigured, networkKey]);

  const totals = useMemo(() => {
    return grants.reduce(
      (acc, { grant }) => {
        acc.amount += grant.totalAmount;
        grant.milestones.forEach((milestone) => {
          acc[milestone.status] += 1;
        });
        return acc;
      },
      { amount: 0n, pending: 0, submitted: 0, approved: 0, rejected: 0 },
    );
  }, [grants]);

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h1>Grant verification queue</h1>
        </div>
        <div className="page-actions">
          <button className="button button-secondary" type="button" onClick={loadGrants} disabled={isLoading}>
            <RefreshCw className={isLoading ? 'spin' : undefined} size={18} aria-hidden="true" />
            Refresh
          </button>
          <Link className="button button-primary" to="/create">
            <Plus size={18} aria-hidden="true" />
            Create Grant
          </Link>
        </div>
      </div>

      {!isConfigured ? (
        <div className="notice">
          <AlertCircle size={20} aria-hidden="true" />
          <span>Set the {activeNetwork.name} contract address in `frontend/.env`.</span>
        </div>
      ) : null}

      {error ? <div className="notice error">{error}</div> : null}

      <div className="stats-grid">
        <div className="stat">
          <span>Locked</span>
          <strong>{formatWeiAsGen(totals.amount)}</strong>
        </div>
        <div className="stat">
          <span>Pending</span>
          <strong>{totals.pending}</strong>
        </div>
        <div className="stat">
          <span>Submitted</span>
          <strong>{totals.submitted}</strong>
        </div>
        <div className="stat">
          <span>Approved</span>
          <strong>{totals.approved}</strong>
        </div>
      </div>

      {grants.length === 0 && !isLoading ? (
        <div className="empty-state">
          <h2>No grants loaded</h2>
          <p>Deploy the contract on {activeNetwork.name}, configure the address, then create the first grant.</p>
          <Link className="button button-primary" to="/create">
            <Plus size={18} aria-hidden="true" />
            Create Grant
          </Link>
        </div>
      ) : (
        <div className="grant-grid">
          {grants.map(({ id, grant }) => (
            <button className="grant-card card" type="button" key={id} onClick={() => navigate(`/grant/${id}`)}>
              <div className="grant-card-head">
                <span className="grant-id">#{id}</span>
                <span className={grant.active ? 'active-dot' : 'inactive-dot'}>{grant.active ? 'Active' : 'Closed'}</span>
              </div>
              <h2>{grant.title}</h2>
              <dl>
                <div>
                  <dt>Grantee</dt>
                  <dd>{formatAddress(grant.grantee)}</dd>
                </div>
                <div>
                  <dt>Escrow</dt>
                  <dd>{formatWeiAsGen(grant.totalAmount)}</dd>
                </div>
              </dl>
              <div className="status-row" aria-label="Milestone statuses">
                <span title="Pending">
                  <Clock3 size={16} aria-hidden="true" />
                  {grant.milestones.filter((milestone) => milestone.status === 'pending').length}
                </span>
                <span title="Submitted">
                  <Clock3 size={16} aria-hidden="true" />
                  {grant.milestones.filter((milestone) => milestone.status === 'submitted').length}
                </span>
                <span title="Approved">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {grant.milestones.filter((milestone) => milestone.status === 'approved').length}
                </span>
                <span title="Rejected">
                  <XCircle size={16} aria-hidden="true" />
                  {grant.milestones.filter((milestone) => milestone.status === 'rejected').length}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
