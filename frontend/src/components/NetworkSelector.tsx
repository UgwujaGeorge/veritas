import { useState } from 'react';
import { Network } from 'lucide-react';
import { BASE_NETWORK_OPTIONS, type BaseNetworkKey } from '../lib/chains';
import { switchToBaseChain } from '../lib/genlayer';
import { useNetwork } from '../lib/network';
import { useWallet } from '../lib/wallet';

export default function NetworkSelector() {
  const { networkKey, setNetworkKey } = useNetwork();
  const { walletAddress } = useWallet();
  const [error, setError] = useState('');

  async function selectNetwork(nextNetworkKey: BaseNetworkKey) {
    setError('');
    setNetworkKey(nextNetworkKey);
    try {
      if (walletAddress && window.ethereum) {
        await switchToBaseChain(nextNetworkKey);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch wallet network');
    }
  }

  return (
    <div className="network-switcher-wrap">
      <div className="network-switcher" role="group" aria-label="Base network">
        <Network size={17} aria-hidden="true" />
        {BASE_NETWORK_OPTIONS.map((chain) => (
          <button
            key={chain.key}
            type="button"
            className={networkKey === chain.key ? 'active' : undefined}
            onClick={() => void selectNetwork(chain.key)}
            aria-pressed={networkKey === chain.key}
          >
            {chain.shortName}
          </button>
        ))}
      </div>
      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}
