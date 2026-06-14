import { createContext, useContext, useMemo, useState } from 'react';
import {
  BASE_NETWORKS,
  DEFAULT_NETWORK_KEY,
  isConfiguredBaseContract,
  type BaseChainConfig,
  type BaseNetworkKey,
} from './chains';

interface NetworkContextValue {
  networkKey: BaseNetworkKey;
  activeNetwork: BaseChainConfig;
  contractAddress?: `0x${string}`;
  isConfigured: boolean;
  setNetworkKey: (networkKey: BaseNetworkKey) => void;
}

const STORAGE_KEY = 'veritas:base-network';
const NetworkContext = createContext<NetworkContextValue | undefined>(undefined);

function readInitialNetworkKey(): BaseNetworkKey {
  if (typeof window === 'undefined') {
    return DEFAULT_NETWORK_KEY;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'mainnet' || stored === 'sepolia' ? stored : DEFAULT_NETWORK_KEY;
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [networkKey, setNetworkKeyState] = useState<BaseNetworkKey>(readInitialNetworkKey);
  const activeNetwork = BASE_NETWORKS[networkKey];

  function setNetworkKey(nextNetworkKey: BaseNetworkKey) {
    setNetworkKeyState(nextNetworkKey);
    window.localStorage.setItem(STORAGE_KEY, nextNetworkKey);
  }

  const value = useMemo(
    () => ({
      networkKey,
      activeNetwork,
      contractAddress: activeNetwork.contractAddress,
      isConfigured: isConfiguredBaseContract(activeNetwork),
      setNetworkKey,
    }),
    [activeNetwork, networkKey],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used inside NetworkProvider');
  }
  return context;
}
