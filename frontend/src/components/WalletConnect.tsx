import { useEffect, useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import {
  formatAddress,
  switchToBaseChain,
  type AddressString,
} from '../lib/genlayer';
import { useNetwork } from '../lib/network';
import { useWallet } from '../lib/wallet';

export default function WalletConnect() {
  const { walletAddress, setWalletAddress } = useWallet();
  const { activeNetwork, networkKey } = useNetwork();
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const handleAccountsChanged = (accounts: unknown) => {
      const next = Array.isArray(accounts) && accounts[0] ? (accounts[0] as AddressString) : undefined;
      setWalletAddress(next);
    };

    window.ethereum?.on?.('accountsChanged', handleAccountsChanged);
    return () => window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged);
  }, [setWalletAddress]);

  async function connectWallet() {
    setError('');
    if (!window.ethereum) {
      setError('MetaMask is not available');
      return;
    }

    setIsConnecting(true);
    try {
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      const address = accounts[0] as AddressString;
      await switchToBaseChain(networkKey);
      setWalletAddress(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not connect to ${activeNetwork.name}`);
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="wallet-wrap">
      <button className="button button-secondary" type="button" onClick={connectWallet} disabled={isConnecting}>
        {isConnecting ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Wallet size={18} aria-hidden="true" />}
        <span>{walletAddress ? formatAddress(walletAddress) : 'Connect'}</span>
      </button>
      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}
