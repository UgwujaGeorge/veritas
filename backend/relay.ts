import { config as loadEnv } from "dotenv";
import { setDefaultResultOrder } from "dns";
import { ethers } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

setDefaultResultOrder("ipv4first");

loadEnv({ path: "backend/.env" });
loadEnv();

const VERITAS_ABI = [
  "event EvidenceSubmitted(uint256 indexed grantId, uint256 milestoneIndex, string evidenceUrl, uint256 attemptNumber)",
  "function getGrantCount() view returns (uint256)",
  "function getGrant(uint256 grantId) view returns (tuple(address issuer,address grantee,string title,uint256 totalAmount,tuple(string title,string criteria,string evidenceUrl,uint256 amount,uint8 status,uint256 resubmissionCount)[] milestones,bool active))",
  "function getMilestone(uint256 grantId, uint256 milestoneIndex) view returns (tuple(string title,string criteria,string evidenceUrl,uint256 amount,uint8 status,uint256 resubmissionCount))",
  "function recordVerdict(uint256 grantId, uint256 milestoneIndex, bool approved)",
];

type GenLayerNetwork = "localnet" | "studionet" | "testnetAsimov" | "testnetBradbury";
type BaseNetworkKey = "baseSepolia" | "baseMainnet";

interface BaseRelayTargetConfig {
  key: BaseNetworkKey;
  envPrefix: "BASE_SEPOLIA" | "BASE_MAINNET";
  name: string;
  chainId: number;
  rpcUrl: string;
  contractAddress: string;
}

interface BaseRelayTarget extends BaseRelayTargetConfig {
  provider: ethers.JsonRpcProvider;
  wallet: ethers.Wallet;
  contract: ethers.Contract;
  filter: ethers.DeferredTopicFilter;
  processedEvents: Set<string>;
  lastScannedBlock: number;
  isPolling: boolean;
}

interface PendingGenLayerTx {
  baseNetwork?: BaseNetworkKey;
  baseChainId?: number;
  baseContractAddress: string;
  genLayerContractAddress: string;
  grantId: string;
  milestoneIndex: string;
  evidenceUrl: string;
  attemptNumber: string;
  txHash: `0x${string}`;
  submittedAt: string;
}

interface RelayState {
  pendingGenLayerTxByMilestone: Record<string, PendingGenLayerTx>;
}

export interface RelayStatus {
  /** startRelay() finished wiring up clients and Base targets. */
  started: boolean;
  /** At least one full polling cycle has completed successfully. */
  ready: boolean;
  /** Set when startRelay() threw (e.g. a missing env var) — the relay is not running. */
  fatalError: string | null;
  lastCycleAt: string | null;
  lastCycleError: string | null;
  genLayerNetwork: string | null;
  targets: string[];
}

export const relayStatus: RelayStatus = {
  started: false,
  ready: false,
  fatalError: null,
  lastCycleAt: null,
  lastCycleError: null,
  genLayerNetwork: null,
  targets: [],
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalAddressEnv(name: string) {
  const value = process.env[name];
  if (!value || value.includes("YOUR_DEPLOYED")) {
    return undefined;
  }
  if (!ethers.isAddress(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return value;
}

function getGenLayerNetwork<T>(genLayerChains: Record<GenLayerNetwork, T>) {
  const name = (process.env.GENLAYER_NETWORK ?? "studionet") as GenLayerNetwork;
  const chain = genLayerChains[name];
  if (!chain) {
    throw new Error(`Unsupported GENLAYER_NETWORK: ${name}`);
  }
  return { name, chain };
}

function getConfiguredBaseTargets(): BaseRelayTargetConfig[] {
  const sepoliaContractAddress = optionalAddressEnv("BASE_SEPOLIA_CONTRACT_ADDRESS") ?? optionalAddressEnv("BASE_CONTRACT_ADDRESS");
  const mainnetContractAddress = optionalAddressEnv("BASE_MAINNET_CONTRACT_ADDRESS");
  const targets: BaseRelayTargetConfig[] = [];

  if (sepoliaContractAddress) {
    targets.push({
      key: "baseSepolia",
      envPrefix: "BASE_SEPOLIA",
      name: "Base Sepolia",
      chainId: 84532,
      rpcUrl: process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org",
      contractAddress: sepoliaContractAddress,
    });
  }

  if (mainnetContractAddress) {
    targets.push({
      key: "baseMainnet",
      envPrefix: "BASE_MAINNET",
      name: "Base Mainnet",
      chainId: 8453,
      rpcUrl: process.env.BASE_MAINNET_RPC ?? "https://mainnet.base.org",
      contractAddress: mainnetContractAddress,
    });
  }

  if (targets.length === 0) {
    throw new Error("Set BASE_SEPOLIA_CONTRACT_ADDRESS and/or BASE_MAINNET_CONTRACT_ADDRESS in backend/.env");
  }

  return targets;
}

export function parseVerdict(receipt: unknown) {
  const raw = decodeReadableResult(extractReadableResult(receipt));
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error(`GenLayer verdict did not contain JSON: ${raw}`);
  }

  const verdictText = raw.slice(firstBrace, lastBrace + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(verdictText);
  } catch {
    const normalized = verdictText
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false")
      .replace(/\bNone\b/g, "null")
      .replace(/'/g, '"');
    parsed = JSON.parse(normalized);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`GenLayer verdict was not an object: ${raw}`);
  }
  if (typeof (parsed as { approved?: unknown }).approved !== "boolean") {
    throw new Error("GenLayer verdict did not include a boolean approved field");
  }
  return parsed as { approved: boolean; reasoning?: string };
}

export function decodeReadableResult(raw: string): string {
  let current = raw.trim();

  for (let attempt = 0; attempt < 3; attempt++) {
    if (!isJsonStringLiteral(current)) {
      break;
    }

    try {
      const decoded = JSON.parse(current) as unknown;
      if (typeof decoded === "string") {
        current = decoded.trim();
        continue;
      }
      if (decoded && typeof decoded === "object") {
        return JSON.stringify(decoded);
      }
      return String(decoded ?? "");
    } catch {
      break;
    }
  }

  return current.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function isJsonStringLiteral(value: string) {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"');
}

export function extractReadableResult(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  const candidates = [
    record.result,
    record.returnValue,
    record.output,
    (record.data as Record<string, unknown> | undefined)?.result,
    (record.result as Record<string, unknown> | undefined)?.payload,
    (record.result as Record<string, unknown> | undefined)?.readable,
    ((record.result as Record<string, unknown> | undefined)?.payload as Record<string, unknown> | undefined)?.readable,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      return candidate;
    }
    if (candidate && typeof candidate === "object" && "readable" in candidate) {
      return String((candidate as { readable: unknown }).readable);
    }
  }

  const consensus = record.consensus_data as Record<string, unknown> | undefined;
  const leaderReceipts = consensus?.leader_receipt;
  if (Array.isArray(leaderReceipts)) {
    for (const leaderReceipt of leaderReceipts) {
      const readable = (((leaderReceipt as Record<string, unknown>).result as Record<string, unknown> | undefined)?.payload as
        | Record<string, unknown>
        | undefined)?.readable;
      if (typeof readable === "string" && readable !== "null") {
        return readable;
      }
    }
  }

  return JSON.stringify(value);
}

export function getReceiptExecutionResultName(receipt: unknown): string | undefined {
  if (!receipt || typeof receipt !== "object") {
    return undefined;
  }
  const value = receipt as { txExecutionResultName?: unknown; tx_execution_result_name?: unknown };
  if (typeof value.txExecutionResultName === "string") {
    return value.txExecutionResultName;
  }
  if (typeof value.tx_execution_result_name === "string") {
    return value.tx_execution_result_name;
  }
  return undefined;
}

function getRelayStatePath() {
  return process.env.RELAY_STATE_FILE ?? join(process.cwd(), "backend", "relay-state.json");
}

function readRelayState(): RelayState {
  const path = getRelayStatePath();
  if (!existsSync(path)) {
    return { pendingGenLayerTxByMilestone: {} };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<RelayState>;
    return {
      pendingGenLayerTxByMilestone: parsed.pendingGenLayerTxByMilestone ?? {},
    };
  } catch (error) {
    console.error(`Could not read relay state from ${path}; starting with empty state`, error);
    return { pendingGenLayerTxByMilestone: {} };
  }
}

function writeRelayState(state: RelayState) {
  writeFileSync(getRelayStatePath(), `${JSON.stringify(state, null, 2)}\n`);
}

async function createBaseRelayTarget(config: BaseRelayTargetConfig, relayPrivateKey: string): Promise<BaseRelayTarget> {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  const wallet = new ethers.Wallet(relayPrivateKey, provider);
  const contract = new ethers.Contract(config.contractAddress, VERITAS_ABI, wallet);
  const startBlockEnv = process.env[`${config.envPrefix}_RELAY_START_BLOCK`] ?? process.env.RELAY_START_BLOCK;
  const lastScannedBlock = Number(startBlockEnv ?? (await provider.getBlockNumber()));

  return {
    ...config,
    provider,
    wallet,
    contract,
    filter: contract.filters.EvidenceSubmitted(),
    processedEvents: new Set<string>(),
    lastScannedBlock,
    isPolling: false,
  };
}

export async function startRelay() {
  const { createAccount, createClient } = await import("genlayer-js");
  const { localnet, studionet, testnetAsimov, testnetBradbury } = await import("genlayer-js/chains");
  const { ExecutionResult, TransactionStatus } = await import("genlayer-js/types");
  const genLayerChains = {
    localnet,
    studionet,
    testnetAsimov,
    testnetBradbury,
  };

  const baseTargetConfigs = getConfiguredBaseTargets();
  const genLayerContractAddress = requiredEnv("GENLAYER_CONTRACT_ADDRESS");
  const relayPrivateKey = requiredEnv("RELAY_PRIVATE_KEY") as `0x${string}`;
  const genLayerPrivateKey = (process.env.GENLAYER_PRIVATE_KEY ?? relayPrivateKey) as `0x${string}`;
  const { name: genLayerNetwork, chain: genLayerChain } = getGenLayerNetwork(genLayerChains);

  const genLayerClient = createClient({
    chain: genLayerChain,
    account: createAccount(genLayerPrivateKey),
  });

  const targets = await Promise.all(baseTargetConfigs.map((target) => createBaseRelayTarget(target, relayPrivateKey)));

  console.log(`Forwarding evidence to GenLayer ${genLayerNetwork} contract ${genLayerContractAddress}`);
  for (const target of targets) {
    console.log(`Relay listening on ${target.name} contract ${target.contractAddress}`);
  }

  relayStatus.started = true;
  relayStatus.genLayerNetwork = genLayerNetwork;
  relayStatus.targets = targets.map((target) => `${target.name} ${target.contractAddress}`);

  const inFlightMilestones = new Set<string>();
  const retryAfterByMilestone = new Map<string, number>();
  const verdictFailureCounts = new Map<string, number>();
  const retryMs = Number(process.env.RELAY_RETRY_MS ?? 5 * 60_000);
  // Re-evaluating an unusable verdict is cheap and self-paced (each attempt already waits
  // ~90s for finalization), so use a short gap. This lets the attempt cap complete within a
  // couple of minutes — comfortably inside one awake window on a free-tier host that may
  // sleep and reset the in-memory counter between longer retries.
  const verdictRetryMs = Number(process.env.RELAY_VERDICT_RETRY_MS ?? 20_000);
  const pollMs = Number(process.env.RELAY_POLL_MS ?? 60_000);
  const maxBlockRange = Number(process.env.RELAY_MAX_BLOCK_RANGE ?? 2_000);
  // After this many finalized-but-unusable GenLayer results (errored, no-consensus, or
  // unparseable) for a single submission, the milestone is recorded as Rejected so the
  // grantee can resubmit, instead of the relay retrying the same dead evaluation forever.
  const maxVerdictAttempts = Math.max(1, Number(process.env.RELAY_MAX_VERDICT_ATTEMPTS ?? 3));
  const relayState = readRelayState();

  function milestoneStateKey(target: BaseRelayTarget, grantId: bigint, milestoneIndex: bigint) {
    return `${target.chainId}:${target.contractAddress.toLowerCase()}:${grantId.toString()}:${milestoneIndex.toString()}`;
  }

  function legacyMilestoneStateKey(target: BaseRelayTarget, grantId: bigint, milestoneIndex: bigint) {
    return `${target.contractAddress.toLowerCase()}:${grantId.toString()}:${milestoneIndex.toString()}`;
  }

  function getAttemptNumber(milestone: { resubmissionCount?: bigint }) {
    return ((milestone.resubmissionCount ?? 0n) + 1n).toString();
  }

  function getReusablePendingTx(
    target: BaseRelayTarget,
    key: string,
    legacyKey: string,
    grantId: bigint,
    milestoneIndex: bigint,
    evidenceUrl: string,
    attemptNumber: string,
  ) {
    const pending = relayState.pendingGenLayerTxByMilestone[key] ?? relayState.pendingGenLayerTxByMilestone[legacyKey];
    if (
      pending &&
      (pending.baseChainId === undefined || pending.baseChainId === target.chainId) &&
      pending.baseContractAddress.toLowerCase() === target.contractAddress.toLowerCase() &&
      pending.genLayerContractAddress.toLowerCase() === genLayerContractAddress.toLowerCase() &&
      pending.grantId === grantId.toString() &&
      pending.milestoneIndex === milestoneIndex.toString() &&
      pending.evidenceUrl === evidenceUrl &&
      pending.attemptNumber === attemptNumber
    ) {
      return pending.txHash;
    }
    return undefined;
  }

  function savePendingTx(
    target: BaseRelayTarget,
    key: string,
    grantId: bigint,
    milestoneIndex: bigint,
    evidenceUrl: string,
    attemptNumber: string,
    txHash: `0x${string}`,
  ) {
    relayState.pendingGenLayerTxByMilestone[key] = {
      baseNetwork: target.key,
      baseChainId: target.chainId,
      baseContractAddress: target.contractAddress,
      genLayerContractAddress,
      grantId: grantId.toString(),
      milestoneIndex: milestoneIndex.toString(),
      evidenceUrl,
      attemptNumber,
      txHash,
      submittedAt: new Date().toISOString(),
    };
    writeRelayState(relayState);
  }

  function clearPendingTx(key: string, legacyKey: string) {
    let changed = false;
    for (const pendingKey of [key, legacyKey]) {
      if (relayState.pendingGenLayerTxByMilestone[pendingKey]) {
        delete relayState.pendingGenLayerTxByMilestone[pendingKey];
        changed = true;
      }
    }
    if (changed) {
      writeRelayState(relayState);
    }
  }

  function clearPendingTxForMilestone(target: BaseRelayTarget, grantId: bigint, milestoneIndex: bigint) {
    clearPendingTx(milestoneStateKey(target, grantId, milestoneIndex), legacyMilestoneStateKey(target, grantId, milestoneIndex));
  }

  async function handleEvidenceSubmitted(
    target: BaseRelayTarget,
    grantId: bigint,
    milestoneIndex: bigint,
    evidenceUrl: string,
  ) {
    const milestoneKey = milestoneStateKey(target, grantId, milestoneIndex);
    const legacyKey = legacyMilestoneStateKey(target, grantId, milestoneIndex);
    if (inFlightMilestones.has(milestoneKey)) {
      return;
    }
    const retryAfter = retryAfterByMilestone.get(milestoneKey);
    if (retryAfter && Date.now() < retryAfter) {
      return;
    }
    inFlightMilestones.add(milestoneKey);
    console.log(`[${target.name}] EvidenceSubmitted grant=${grantId.toString()} milestone=${milestoneIndex.toString()}`);

    try {
      const milestone = (await target.contract.getMilestone(grantId, milestoneIndex)) as {
        evidenceUrl?: string;
        criteria: string;
        resubmissionCount?: bigint;
      };
      const currentEvidenceUrl = String(milestone.evidenceUrl ?? evidenceUrl);
      const attemptNumber = getAttemptNumber(milestone);
      const pendingHash = getReusablePendingTx(
        target,
        milestoneKey,
        legacyKey,
        grantId,
        milestoneIndex,
        currentEvidenceUrl,
        attemptNumber,
      );
      let hash: `0x${string}`;

      if (pendingHash) {
        hash = pendingHash;
        console.log(`[${target.name}] Resuming GenLayer verdict transaction ${hash}`);
      } else {
        hash = await genLayerClient.writeContract({
          address: genLayerContractAddress as `0x${string}`,
          functionName: "evaluate_milestone",
          args: [currentEvidenceUrl, milestone.criteria],
          value: 0n,
        });
        savePendingTx(target, milestoneKey, grantId, milestoneIndex, currentEvidenceUrl, attemptNumber, hash);
        console.log(`[${target.name}] Submitted GenLayer verdict transaction ${hash}`);
      }

      // A verdict failure is scoped to this exact submission attempt, so a fresh resubmission
      // (new attempt number or evidence URL) always starts the attempt counter over.
      const verdictFailureKey = `${milestoneKey}:${attemptNumber}:${currentEvidenceUrl}`;

      let receipt: unknown;
      try {
        receipt = await genLayerClient.waitForTransactionReceipt({
          hash: hash as `0x${string}` & { length: 66 },
          status: TransactionStatus.FINALIZED,
          interval: 5_000,
          retries: 120,
        });
      } catch (waitError) {
        // Not finalized yet (still moving through consensus) or a transient RPC issue.
        // Keep the pending tx hash so the next cycle resumes the same evaluation rather than
        // paying for a duplicate one. This is not counted as a verdict failure.
        console.warn(
          `[${target.name}] GenLayer verdict not finalized yet for grant=${grantId.toString()} milestone=${milestoneIndex.toString()}; will resume ${hash}`,
          waitError,
        );
        retryAfterByMilestone.set(milestoneKey, Date.now() + retryMs);
        return;
      }

      const erroredOnGenLayer = getReceiptExecutionResultName(receipt) === ExecutionResult.FINISHED_WITH_ERROR;
      let verdict: { approved: boolean; reasoning?: string } | null = null;
      if (!erroredOnGenLayer) {
        try {
          verdict = parseVerdict(receipt);
        } catch (parseError) {
          console.warn(
            `[${target.name}] Could not parse GenLayer verdict for grant=${grantId.toString()} milestone=${milestoneIndex.toString()}`,
            parseError,
          );
        }
      }

      if (!verdict) {
        // The GenLayer transaction finalized but produced no usable verdict: it errored,
        // validators reached no consensus (Undetermined), or the result was unparseable.
        // The transaction is dead, so drop it and let the next attempt evaluate fresh.
        clearPendingTx(milestoneKey, legacyKey);
        const failures = (verdictFailureCounts.get(verdictFailureKey) ?? 0) + 1;
        verdictFailureCounts.set(verdictFailureKey, failures);

        if (failures < maxVerdictAttempts) {
          console.warn(
            `[${target.name}] GenLayer produced no usable verdict for grant=${grantId.toString()} milestone=${milestoneIndex.toString()} (attempt ${failures}/${maxVerdictAttempts}); re-evaluating fresh`,
          );
          retryAfterByMilestone.set(milestoneKey, Date.now() + verdictRetryMs);
          return;
        }

        console.error(
          `[${target.name}] GenLayer could not reach a usable verdict for grant=${grantId.toString()} milestone=${milestoneIndex.toString()} after ${maxVerdictAttempts} attempts; recording Rejected so the grantee can resubmit`,
        );
        verdict = {
          approved: false,
          reasoning: `GenLayer could not produce a verdict after ${maxVerdictAttempts} attempts.`,
        };
        verdictFailureCounts.delete(verdictFailureKey);
      } else {
        verdictFailureCounts.delete(verdictFailureKey);
      }

      console.log(
        `[${target.name}] GenLayer verdict grant=${grantId.toString()} milestone=${milestoneIndex.toString()} approved=${verdict.approved}`,
      );

      const tx = await target.contract.recordVerdict(grantId, milestoneIndex, verdict.approved);
      console.log(`[${target.name}] Submitted Base verdict transaction ${tx.hash}`);
      await tx.wait();
      console.log(`[${target.name}] Recorded verdict for grant=${grantId.toString()} milestone=${milestoneIndex.toString()}`);
      clearPendingTx(milestoneKey, legacyKey);
      retryAfterByMilestone.delete(milestoneKey);
    } catch (error) {
      console.error(`[${target.name}] Relay failed for grant=${grantId.toString()} milestone=${milestoneIndex.toString()}`, error);
      retryAfterByMilestone.set(milestoneKey, Date.now() + retryMs);
    } finally {
      inFlightMilestones.delete(milestoneKey);
    }
  }

  async function processExistingSubmittedMilestones(target: BaseRelayTarget) {
    const grantCount = (await target.contract.getGrantCount()) as bigint;
    for (let grantId = 0n; grantId < grantCount; grantId++) {
      const grant = (await target.contract.getGrant(grantId)) as {
        milestones: Array<{ evidenceUrl?: string; status: bigint | number }>;
      };
      for (let milestoneIndex = 0; milestoneIndex < grant.milestones.length; milestoneIndex++) {
        const milestone = grant.milestones[milestoneIndex];
        const status = Number(milestone.status);
        const evidenceUrl = String(milestone.evidenceUrl ?? "");
        if (status === 1 && evidenceUrl) {
          await handleEvidenceSubmitted(target, grantId, BigInt(milestoneIndex), evidenceUrl);
        } else if (status !== 1) {
          clearPendingTxForMilestone(target, grantId, BigInt(milestoneIndex));
        }
      }
    }
  }

  async function pollEvidenceSubmittedEvents(target: BaseRelayTarget) {
    const latestBlock = await target.provider.getBlockNumber();
    if (latestBlock <= target.lastScannedBlock) {
      return;
    }

    while (target.lastScannedBlock < latestBlock) {
      const fromBlock = target.lastScannedBlock + 1;
      const toBlock = Math.min(latestBlock, target.lastScannedBlock + maxBlockRange);
      const events = await target.contract.queryFilter(target.filter, fromBlock, toBlock);
      target.lastScannedBlock = toBlock;

      for (const event of events) {
        if (!("args" in event) || !event.args) {
          continue;
        }

        const eventKey = `${target.chainId}:${event.transactionHash}:${event.index}`;
        if (target.processedEvents.has(eventKey)) {
          continue;
        }
        target.processedEvents.add(eventKey);

        const [grantId, milestoneIndex, evidenceUrl] = event.args as unknown as [bigint, bigint, string, bigint];
        await handleEvidenceSubmitted(target, grantId, milestoneIndex, evidenceUrl);
      }
    }
  }

  async function runRelayCycle(target: BaseRelayTarget) {
    if (target.isPolling) {
      return;
    }
    target.isPolling = true;
    try {
      await processExistingSubmittedMilestones(target);
      await pollEvidenceSubmittedEvents(target);
      relayStatus.lastCycleAt = new Date().toISOString();
      relayStatus.lastCycleError = null;
    } catch (error) {
      console.error(`[${target.name}] Relay polling failed`, error);
      relayStatus.lastCycleError = `[${target.name}] ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      target.isPolling = false;
    }
  }

  for (const target of targets) {
    console.log(`[${target.name}] Polling Base events from block ${target.lastScannedBlock + 1} every ${pollMs}ms`);
  }

  await Promise.all(targets.map((target) => runRelayCycle(target)));
  relayStatus.ready = true;
  for (const target of targets) {
    setInterval(() => {
      void runRelayCycle(target);
    }, pollMs);
  }
}

if (require.main === module) {
  startRelay().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
