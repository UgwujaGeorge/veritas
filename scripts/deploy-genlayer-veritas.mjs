import { config as loadEnv } from 'dotenv'
import { readFileSync } from 'node:fs'
import { createAccount, createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { TransactionStatus } from 'genlayer-js/types'

loadEnv()
loadEnv({ path: 'backend/.env' })

const privateKey = process.env.GENLAYER_PRIVATE_KEY || process.env.RELAY_PRIVATE_KEY || process.env.BASE_DEPLOYER_PRIVATE_KEY
if (!privateKey) {
  throw new Error('Set GENLAYER_PRIVATE_KEY, RELAY_PRIVATE_KEY, or BASE_DEPLOYER_PRIVATE_KEY before deploying to GenLayer')
}

const account = createAccount(privateKey)
const client = createClient({
  chain: studionet,
  endpoint: process.env.GENLAYER_RPC_URL || studionet.rpcUrls.default.http[0],
  account,
})

const contractCode = new Uint8Array(readFileSync(new URL('../contracts/veritas.py', import.meta.url)))

console.log(`Deploying Veritas GenLayer verifier to StudioNet from ${account.address}`)

const txHash = await client.deployContract({
  code: contractCode,
  args: [],
})

const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: TransactionStatus.ACCEPTED,
  interval: 5_000,
  retries: 200,
})

const receiptStatusName =
  typeof receipt.statusName === 'string'
    ? receipt.statusName
    : typeof receipt.status_name === 'string'
      ? receipt.status_name
      : undefined

if (![TransactionStatus.ACCEPTED, TransactionStatus.FINALIZED].includes(receiptStatusName)) {
  const statusLabel = receiptStatusName ?? receipt.status ?? 'unknown'
  throw new Error(`Deployment did not reach an accepted state. Status: ${statusLabel}`)
}

const decoded = receipt.txDataDecoded
const contractAddress =
  typeof receipt.data?.contract_address === 'string'
    ? receipt.data.contract_address
    : decoded && 'contractAddress' in decoded
      ? decoded.contractAddress
      : undefined

if (!contractAddress) {
  throw new Error('Deployment succeeded but no contract address was found in the receipt')
}

console.log(`GenLayer verifier transaction: ${txHash}`)
console.log(`GenLayer verifier address: ${contractAddress}`)
