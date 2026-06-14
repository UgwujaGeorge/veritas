# Veritas

Veritas is a milestone verification app for grants and bounties. Escrow lives in a Solidity contract on Base, GenLayer validators make the AI-assisted evidence judgment, and a relay backend records the verdict back on Base so funds can be released or withheld.

## Architecture

- `contracts/solidity/Veritas.sol` - Base escrow contract for locking ETH, submitting evidence, and releasing milestone payouts
- `contracts/veritas.py` - GenLayer judgment oracle for fetching evidence and returning `{ "approved": boolean, "reasoning": string }`
- `backend/relay.ts` - bridge service that listens to Base Sepolia and/or Base Mainnet `EvidenceSubmitted` events, asks GenLayer for a verdict, and calls `recordVerdict`
- `frontend/` - React, TypeScript, Vite app with a runtime Base Sepolia/Base Mainnet selector

## Networks

- Base Sepolia: chain ID `84532`, RPC `https://sepolia.base.org`, explorer `https://sepolia.basescan.org`
- Base Mainnet: chain ID `8453`, RPC `https://mainnet.base.org`, explorer `https://basescan.org`
- GenLayer Studionet: used for the verifier oracle during development

## Setup

Install Python tooling:

```bash
python3 -m pip install -r requirements.txt
```

Install root Solidity/backend tooling:

```bash
npm install
```

Install frontend tooling:

```bash
cd frontend
npm install
```

## Test The GenLayer Oracle

```bash
genvm-lint check contracts/veritas.py
pytest tests/test_direct.py -v
```

## Deployment Steps

1. Deploy `Veritas.sol` to Base Sepolia and/or Base Mainnet using Hardhat:

```bash
cp .env.example .env
# Set BASE_DEPLOYER_PRIVATE_KEY in .env, or use RELAY_PRIVATE_KEY in backend/.env
npm run compile
npm run deploy:base-sepolia
npm run deploy:base-mainnet
```

2. Note each deployed Base contract address.

3. Deploy `contracts/veritas.py` to GenLayer Studionet:

```bash
genlayer network set studionet
genlayer deploy --contract contracts/veritas.py
```

4. Note the deployed GenLayer contract address.

5. Set all relay environment variables:

```bash
cp backend/.env.example backend/.env
# Set BASE_SEPOLIA_CONTRACT_ADDRESS, BASE_MAINNET_CONTRACT_ADDRESS, GENLAYER_CONTRACT_ADDRESS, and RELAY_PRIVATE_KEY
```

6. Run the relay:

```bash
npx ts-node backend/relay.ts
```

7. Set both frontend contract addresses in `frontend/.env`:

```bash
cd frontend
cp .env.example .env
# Set VITE_BASE_SEPOLIA_CONTRACT_ADDRESS and VITE_BASE_MAINNET_CONTRACT_ADDRESS
```

8. Run the frontend:

```bash
npm run dev
```

## Flow

1. Issuer picks Base Sepolia or Base Mainnet in the React app, then creates a grant. The frontend calls `createGrant` on that selected Base network and sends ETH escrow.
2. Grantee submits an evidence URL on the same selected Base network. The frontend calls `submitEvidence` on Base.
3. The relay hears `EvidenceSubmitted`, reads the milestone criteria from Base, and calls GenLayer `evaluate_milestone`.
4. After GenLayer finalizes a JSON verdict, the relay calls Base `recordVerdict`.
5. The Base contract marks the milestone approved or rejected. Approved milestones transfer escrow to the grantee.
