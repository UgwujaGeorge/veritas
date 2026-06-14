import { FormEvent, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import {
  submitEvidenceOnBase,
  waitForMilestoneVerdict,
} from '../lib/genlayer';
import { useNetwork } from '../lib/network';
import { useWallet } from '../lib/wallet';

interface EvidenceFormProps {
  grantId: bigint;
  milestoneIndex: bigint;
  attemptNumber: number;
  isRetry: boolean;
  onFinalized: (txHash: string) => void;
}

export default function EvidenceForm({ grantId, milestoneIndex, attemptNumber, isRetry, onFinalized }: EvidenceFormProps) {
  const { walletAddress } = useWallet();
  const { activeNetwork, isConfigured, networkKey } = useNetwork();
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!walletAddress) {
      setError('Connect the grantee wallet first');
      return;
    }
    if (!isConfigured) {
      setError(`Set the ${activeNetwork.name} contract address before submitting evidence`);
      return;
    }
    if (!/^https?:\/\/.+/i.test(evidenceUrl.trim())) {
      setError('Enter a valid evidence URL');
      return;
    }

    setIsSubmitting(true);
    try {
      const { hash } = await submitEvidenceOnBase(networkKey, walletAddress, grantId, milestoneIndex, evidenceUrl.trim());
      await waitForMilestoneVerdict(networkKey, grantId, milestoneIndex);
      onFinalized(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evidence submission failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="evidence-form" onSubmit={handleSubmit}>
      <label htmlFor="evidenceUrl">Evidence URL for attempt {attemptNumber}</label>
      <div className="inline-field">
        <input
          id="evidenceUrl"
          type="url"
          placeholder="https://github.com/org/repo"
          value={evidenceUrl}
          onChange={(event) => setEvidenceUrl(event.target.value)}
          disabled={isSubmitting}
          required
        />
        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
          {isRetry ? 'Retry' : 'Submit'} #{attemptNumber}
        </button>
      </div>
      {isSubmitting ? <p className="muted">GenLayer validators are reviewing your evidence... this takes ~4 minutes</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
