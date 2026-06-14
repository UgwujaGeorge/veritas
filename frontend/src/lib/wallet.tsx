import { createContext, useContext, useMemo, useState } from 'react';
import type { AddressString } from './genlayer';

interface WalletContextValue {
  walletAddress?: AddressString;
  setWalletAddress: (address?: AddressString) => void;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<AddressString | undefined>();
  const value = useMemo(() => ({ walletAddress, setWalletAddress }), [walletAddress]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used inside WalletProvider');
  }
  return context;
}
