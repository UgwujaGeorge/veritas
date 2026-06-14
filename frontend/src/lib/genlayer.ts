import { BrowserProvider, Contract, formatEther, JsonRpcProvider, parseEther } from 'ethers';
import { getBaseNetwork, isConfiguredBaseContract, type BaseNetworkKey } from './chains';
import { veritasAbi } from './veritasAbi';

export type AddressString = `0x${string}`;
export type MilestoneStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

export interface Milestone {
  title: string;
  criteria: string;
  evidenceUrl: string;
  amount: bigint;
  status: MilestoneStatus;
  resubmissionCount: bigint;
}

export interface Grant {
  issuer: string;
  title: string;
  totalAmount: bigint;
  grantee: string;
  milestones: Milestone[];
  active: boolean;
}

const statusByIndex: MilestoneStatus[] = ['pending', 'submitted', 'approved', 'rejected'];
const readProviders = new Map<BaseNetworkKey, JsonRpcProvider>();

export function isContractConfigured(networkKey: BaseNetworkKey) {
  return isConfiguredBaseContract(getBaseNetwork(networkKey));
}

export function getContractAddress(networkKey: BaseNetworkKey) {
  const chain = getBaseNetwork(networkKey);
  if (!isConfiguredBaseContract(chain)) {
    throw new Error(`Set ${networkKey === 'mainnet' ? 'VITE_BASE_MAINNET_CONTRACT_ADDRESS' : 'VITE_BASE_SEPOLIA_CONTRACT_ADDRESS'} in frontend/.env`);
  }
  return chain.contractAddress as AddressString;
}

function getReadProvider(networkKey: BaseNetworkKey) {
  const existing = readProviders.get(networkKey);
  if (existing) {
    return existing;
  }

  const chain = getBaseNetwork(networkKey);
  const provider = new JsonRpcProvider(chain.rpcUrl, chain.id);
  readProviders.set(networkKey, provider);
  return provider;
}

export function getReadContract(networkKey: BaseNetworkKey) {
  return new Contract(getContractAddress(networkKey), veritasAbi, getReadProvider(networkKey));
}

export async function getWriteContract(networkKey: BaseNetworkKey, walletAddress?: AddressString) {
  if (!window.ethereum) {
    throw new Error('MetaMask is not available');
  }

  await switchToBaseChain(networkKey);
  const provider = new BrowserProvider(window.ethereum);
  const signer = walletAddress ? await provider.getSigner(walletAddress) : await provider.getSigner();
  return new Contract(getContractAddress(networkKey), veritasAbi, signer);
}

export async function switchToBaseChain(networkKey: BaseNetworkKey) {
  if (!window.ethereum) {
    throw new Error('MetaMask is not available');
  }

  const chain = getBaseNetwork(networkKey);
  const chainIdHex = `0x${chain.id.toString(16)}`;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
  } catch (err) {
    const code = typeof err === 'object' && err && 'code' in err ? (err as { code?: number }).code : undefined;
    if (code !== 4902) {
      throw err;
    }

    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: chainIdHex,
          chainName: chain.name,
          nativeCurrency: {
            name: chain.currency,
            symbol: chain.currency,
            decimals: 18,
          },
          rpcUrls: [chain.rpcUrl],
          blockExplorerUrls: [chain.explorerUrl],
        },
      ],
    });
  }
}

export async function createGrantOnBase(
  networkKey: BaseNetworkKey,
  walletAddress: AddressString,
  title: string,
  grantee: string,
  milestoneTitles: string[],
  milestoneCriteria: string[],
  milestoneAmounts: bigint[],
  totalAmount: bigint,
) {
  const contract = await getWriteContract(networkKey, walletAddress);
  const tx = await contract.createGrant(title, grantee, milestoneTitles, milestoneCriteria, milestoneAmounts, {
    value: totalAmount,
  });
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error('Grant creation transaction was not mined');
  }

  let grantId: bigint | null = null;
  for (const log of receipt.logs as Array<{ data: string; topics: readonly string[] }>) {
    try {
      const event = contract.interface.parseLog({ data: log.data, topics: [...log.topics] });
      if (event?.name === 'GrantCreated') {
        grantId = toBigInt(event.args.grantId ?? event.args[0]);
        break;
      }
    } catch {
      // Ignore logs emitted by other contracts touched by the transaction.
    }
  }

  if (grantId === null) {
    throw new Error('Grant was created but the GrantCreated event was not found');
  }

  return { hash: tx.hash as string, receipt, grantId };
}

export async function submitEvidenceOnBase(
  networkKey: BaseNetworkKey,
  walletAddress: AddressString,
  grantId: bigint,
  milestoneIndex: bigint,
  evidenceUrl: string,
) {
  const contract = await getWriteContract(networkKey, walletAddress);
  const tx = await contract.submitEvidence(grantId, milestoneIndex, evidenceUrl);
  const receipt = await tx.wait();
  return { hash: tx.hash as string, receipt };
}

export async function waitForMilestoneVerdict(
  networkKey: BaseNetworkKey,
  grantId: bigint,
  milestoneIndex: bigint,
  intervalMs = 10_000,
) {
  while (true) {
    const milestone = await readMilestone(networkKey, grantId, milestoneIndex);
    if (milestone.status === 'approved' || milestone.status === 'rejected') {
      return milestone;
    }
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
}

export async function readGrantCount(networkKey: BaseNetworkKey) {
  const result = await getReadContract(networkKey).getGrantCount();
  return toBigInt(result);
}

export async function readGrant(networkKey: BaseNetworkKey, id: number | bigint) {
  const result = await getReadContract(networkKey).getGrant(BigInt(id));
  return normalizeGrant(result);
}

export async function readMilestone(networkKey: BaseNetworkKey, grantId: number | bigint, milestoneIndex: number | bigint) {
  const result = await getReadContract(networkKey).getMilestone(BigInt(grantId), BigInt(milestoneIndex));
  return normalizeMilestone(result);
}

export function parseGenToWei(input: string) {
  const trimmed = input.trim();
  if (!trimmed || Number(trimmed) <= 0) {
    throw new Error('Amount must be greater than 0');
  }
  return parseEther(trimmed);
}

export function formatWeiAsGen(value: bigint) {
  const formatted = formatEther(value);
  const trimmed = formatted.includes('.') ? formatted.replace(/\.?0+$/, '') : formatted;
  const [whole, fraction] = trimmed.split('.');
  const amount = fraction && fraction.length > 6 ? `${whole}.${fraction.slice(0, 6)}` : trimmed;
  return `${amount} ETH`;
}

export function formatAddress(address?: string) {
  if (!address) {
    return 'Not connected';
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getAttemptNumber(milestone: Milestone) {
  return Number(milestone.resubmissionCount) + 1;
}

export function getNextAttemptNumber(milestone: Milestone) {
  return getAttemptNumber(milestone) + (milestone.status === 'rejected' ? 1 : 0);
}

export function normalizeGrant(raw: unknown): Grant {
  const value = normalizeObject(raw, ['issuer', 'grantee', 'title', 'totalAmount', 'milestones', 'active']);
  const milestones = Array.isArray(value.milestones) ? value.milestones.map(normalizeMilestone) : [];

  return {
    issuer: String(value.issuer ?? ''),
    grantee: String(value.grantee ?? ''),
    title: String(value.title ?? ''),
    totalAmount: toBigInt(value.totalAmount ?? 0),
    milestones,
    active: Boolean(value.active),
  };
}

export function normalizeMilestone(raw: unknown): Milestone {
  const value = normalizeObject(raw, ['title', 'criteria', 'evidenceUrl', 'amount', 'status', 'resubmissionCount']);
  const statusIndex = Number(toBigInt(value.status ?? 0));

  return {
    title: String(value.title ?? ''),
    criteria: String(value.criteria ?? ''),
    evidenceUrl: String(value.evidenceUrl ?? ''),
    amount: toBigInt(value.amount ?? 0),
    status: statusByIndex[statusIndex] ?? 'pending',
    resubmissionCount: toBigInt(value.resubmissionCount ?? 0),
  };
}

export function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  if (typeof value === 'string') {
    return BigInt(value);
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    return BigInt(String(value));
  }
  return 0n;
}

function normalizeObject(raw: unknown, fields: string[]) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(fields.map((field, index) => [field, raw[index]]));
  }
  return (raw ?? {}) as Record<string, unknown>;
}
