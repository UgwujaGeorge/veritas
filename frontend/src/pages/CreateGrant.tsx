import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  createGrantOnBase,
  formatWeiAsGen,
  parseGenToWei,
} from '../lib/genlayer';
import { useNetwork } from '../lib/network';
import { useWallet } from '../lib/wallet';

interface MilestoneDraft {
  title: string;
  criteria: string;
  amount: string;
}

const emptyMilestone: MilestoneDraft = {
  title: '',
  criteria: '',
  amount: '',
};

export default function CreateGrant() {
  const navigate = useNavigate();
  const { walletAddress } = useWallet();
  const { activeNetwork, isConfigured, networkKey } = useNetwork();
  const [title, setTitle] = useState('');
  const [grantee, setGrantee] = useState('');
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([{ ...emptyMilestone }]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const total = useMemo(() => {
    try {
      return milestones.reduce((sum, milestone) => sum + (milestone.amount ? parseGenToWei(milestone.amount) : 0n), 0n);
    } catch {
      return 0n;
    }
  }, [milestones]);

  function updateMilestone(index: number, patch: Partial<MilestoneDraft>) {
    setMilestones((current) =>
      current.map((milestone, currentIndex) => (currentIndex === index ? { ...milestone, ...patch } : milestone)),
    );
  }

  function removeMilestone(index: number) {
    setMilestones((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!walletAddress) {
      setError('Connect the issuer wallet first');
      return;
    }
    if (!isConfigured) {
      setError(`Set the ${activeNetwork.name} contract address before creating grants`);
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(grantee.trim())) {
      setError('Enter a valid grantee wallet address');
      return;
    }

    let amounts: bigint[];
    try {
      amounts = milestones.map((milestone) => parseGenToWei(milestone.amount));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid milestone amount');
      return;
    }

    if (!title.trim() || milestones.some((milestone) => !milestone.title.trim() || !milestone.criteria.trim())) {
      setError('Grant title, milestone titles, and criteria are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const { grantId } = await createGrantOnBase(
        networkKey,
        walletAddress,
        title.trim(),
        grantee.trim(),
        milestones.map((milestone) => milestone.title.trim()),
        milestones.map((milestone) => milestone.criteria.trim()),
        amounts,
        total,
      );
      navigate(`/grant/${grantId.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Grant creation failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page narrow">
      <Link className="back-link" to="/">
        <ArrowLeft size={18} aria-hidden="true" />
        Grants
      </Link>
      <div className="page-head">
        <div>
          <span className="eyebrow">Issuer</span>
          <h1>Create grant</h1>
        </div>
      </div>

      <form className="panel-form" onSubmit={handleSubmit}>
        <div className="field-grid">
          <label>
            Grant title
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Public goods audit" required />
          </label>
          <label>
            Grantee wallet
            <input
              value={grantee}
              onChange={(event) => setGrantee(event.target.value)}
              placeholder="0x..."
              pattern="^0x[a-fA-F0-9]{40}$"
              required
            />
          </label>
        </div>

        <div className="section-title">
          <h2>Milestones</h2>
          <button
            className="button button-secondary compact"
            type="button"
            onClick={() => setMilestones((current) => [...current, { ...emptyMilestone }])}
          >
            <Plus size={16} aria-hidden="true" />
            Add
          </button>
        </div>

        <div className="milestone-editor-list">
          {milestones.map((milestone, index) => (
            <div className="milestone-editor" key={index}>
              <div className="milestone-editor-head">
                <strong>Milestone {index + 1}</strong>
                {milestones.length > 1 ? (
                  <button className="icon-button" type="button" onClick={() => removeMilestone(index)} aria-label="Remove milestone">
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <div className="field-grid">
                <label>
                  Title
                  <input
                    value={milestone.title}
                    onChange={(event) => updateMilestone(index, { title: event.target.value })}
                    placeholder="Deploy MVP"
                    required
                  />
                </label>
                <label>
                  Amount in ETH
                  <input
                    value={milestone.amount}
                    onChange={(event) => updateMilestone(index, { amount: event.target.value })}
                    placeholder="25"
                    inputMode="decimal"
                    required
                  />
                </label>
              </div>
              <label>
                Criteria
                <textarea
                  value={milestone.criteria}
                  onChange={(event) => updateMilestone(index, { criteria: event.target.value })}
                  placeholder="The submitted repository must include a deployed contract address and passing test output."
                  rows={4}
                  required
                />
              </label>
            </div>
          ))}
        </div>

        <div className="submit-row">
          <div>
            <span className="muted">Total escrow</span>
            <strong>{formatWeiAsGen(total)}</strong>
          </div>
          <button className="button button-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
            Create
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </form>
    </section>
  );
}
