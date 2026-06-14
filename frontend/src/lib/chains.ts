export type BaseNetworkKey = 'sepolia' | 'mainnet';

export interface BaseChainConfig {
  key: BaseNetworkKey;
  id: number;
  name: string;
  shortName: string;
  rpcUrl: string;
  explorerUrl: string;
  currency: 'ETH';
  contractAddress?: `0x${string}`;
}

function envAddress(value?: string) {
  return value as `0x${string}` | undefined;
}

export const baseSepolia: BaseChainConfig = {
  key: 'sepolia',
  id: 84532,
  name: 'Base Sepolia',
  shortName: 'Sepolia',
  rpcUrl: 'https://sepolia.base.org',
  explorerUrl: 'https://sepolia.basescan.org',
  currency: 'ETH',
  contractAddress: envAddress(import.meta.env.VITE_BASE_SEPOLIA_CONTRACT_ADDRESS ?? import.meta.env.VITE_BASE_CONTRACT_ADDRESS),
};

export const baseMainnet: BaseChainConfig = {
  key: 'mainnet',
  id: 8453,
  name: 'Base',
  shortName: 'Mainnet',
  rpcUrl: 'https://mainnet.base.org',
  explorerUrl: 'https://basescan.org',
  currency: 'ETH',
  contractAddress: envAddress(import.meta.env.VITE_BASE_MAINNET_CONTRACT_ADDRESS),
};

export const BASE_NETWORKS: Record<BaseNetworkKey, BaseChainConfig> = {
  sepolia: baseSepolia,
  mainnet: baseMainnet,
};

export const BASE_NETWORK_OPTIONS = [baseSepolia, baseMainnet];

export const DEFAULT_NETWORK_KEY: BaseNetworkKey =
  import.meta.env.VITE_DEFAULT_BASE_NETWORK === 'mainnet' || import.meta.env.VITE_CHAIN === 'mainnet'
    ? 'mainnet'
    : 'sepolia';

export function getBaseNetwork(networkKey: BaseNetworkKey) {
  return BASE_NETWORKS[networkKey];
}

export function isConfiguredBaseContract(chain: BaseChainConfig) {
  return Boolean(
    chain.contractAddress &&
      /^0x[a-fA-F0-9]{40}$/.test(chain.contractAddress) &&
      !chain.contractAddress.includes('YOUR_DEPLOYED'),
  );
}
