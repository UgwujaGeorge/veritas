/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAIN?: 'sepolia' | 'mainnet';
  readonly VITE_DEFAULT_BASE_NETWORK?: 'sepolia' | 'mainnet';
  readonly VITE_BASE_CONTRACT_ADDRESS?: `0x${string}`;
  readonly VITE_BASE_SEPOLIA_CONTRACT_ADDRESS?: `0x${string}`;
  readonly VITE_BASE_MAINNET_CONTRACT_ADDRESS?: `0x${string}`;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
}

interface Window {
  ethereum?: EthereumProvider;
}
