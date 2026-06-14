# Veritas — Historical Build Plan for Codex

> This file describes the original two-layer prototype. The current architecture is the three-layer Base escrow + GenLayer judgment oracle + relay design documented in `README.md`.

---

## What This App Is

Veritas is a trustless milestone verification platform for grants and bounties. Grant issuers (DAOs, foundations, companies) lock funds in a GenLayer Intelligent Contract. Recipients submit evidence when they hit a milestone. GenLayer's AI validators fetch and evaluate that evidence against the milestone criteria, and release the funds automatically if the milestone is verified — no human reviewer needed.

**The core problem it solves:** Grant programs distribute millions but verify milestones manually. A human reads a GitHub link, checks a dashboard, decides if the work is done. That process is slow, biased, and does not scale. Veritas replaces that human with a trustless AI consensus layer.

**One-sentence pitch:** Submit your milestone evidence, GenLayer reads it and decides, funds release automatically.

---

## How GenLayer Is Used

GenLayer's Intelligent Contracts are Python files that can:
- Fetch and read live URLs (GitHub repos, analytics dashboards, deployed contracts)
- Call an LLM to evaluate what was fetched against a written criteria
- Use the Equivalence Principle so multiple validators reach consensus
- Hold and transfer native GEN tokens (escrow)

Veritas uses all four of these. The contract holds the grant funds, fetches evidence URLs submitted by the grantee, asks the LLM whether the evidence satisfies the milestone criteria, and releases funds on consensus.

---

## Architecture

```
veritas/
├── contracts/
│   └── veritas.py          # The GenLayer Intelligent Contract (Python)
├── tests/
│   ├── test_direct.py         # Direct mode tests (fast, no network)
│   └── test_integration.py    # Studio mode integration tests
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── pages/
│   │   │   ├── Home.tsx           # Dashboard — all grants
│   │   │   ├── CreateGrant.tsx    # Issuer creates a grant
│   │   │   ├── GrantDetail.tsx    # View milestones + submit evidence
│   │   │   └── Verdict.tsx        # Milestone verdict + tx details
│   │   ├── components/
│   │   │   ├── MilestoneCard.tsx
│   │   │   ├── EvidenceForm.tsx
│   │   │   └── WalletConnect.tsx
│   │   └── lib/
│   │       └── genlayer.ts        # GenLayer JS client setup
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.example
├── gltest.config.yaml
├── .env.example
└── BUILD.md
```

### Two parts, clearly separated

**Part 1 — Intelligent Contract (`contracts/veritas.py`)**
Written in Python. Deployed to GenLayer network (Studionet for dev, Testnet Bradbury for production-like testing). This is the only blockchain component.

**Part 2 — Frontend (`frontend/`)**
React + TypeScript + Vite. Deployed to Vercel or any static host. Talks to the contract via `genlayer-js` SDK. No blockchain knowledge required in the frontend code beyond calling SDK functions.

---

## The Intelligent Contract — Full Specification

### File: `contracts/veritas.py`

#### Dependency header (required by GenVM)
```python
# { "Depends": "py-genlayer:test" }
from genlayer import *
import json
```

#### Data structures

```python
@allow_storage
@dataclass
class Milestone:
    title: str
    criteria: str          # Plain English. What the LLM will evaluate against.
    evidence_url: str      # Submitted by grantee. Empty until submitted.
    amount: u256           # Wei. Amount released on approval.
    status: str            # "pending" | "submitted" | "approved" | "rejected"

@allow_storage
@dataclass
class Grant:
    issuer: str            # Address of grant creator
    title: str
    total_amount: u256     # Total locked in contract (wei)
    grantee: str           # Address allowed to submit evidence
    milestones: DynArray[Milestone]
    active: bool
```

#### Contract class

```python
class Veritas(gl.Contract):
    grants: TreeMap[u256, Grant]
    grant_count: u256

    def __init__(self):
        self.grants = TreeMap()
        self.grant_count = u256(0)
```

#### Methods to implement

**`create_grant` — payable, called by issuer**
```python
@gl.public.write.payable
def create_grant(
    self,
    title: str,
    grantee: str,
    milestone_titles: DynArray[str],
    milestone_criteria: DynArray[str],
    milestone_amounts: DynArray[u256],
) -> u256:
```
- Validate that `gl.message.value` equals the sum of all milestone amounts.
- Validate arrays are same length, at least 1 milestone.
- Create a `Grant` object, set `issuer = gl.message.sender`.
- Store in `self.grants[self.grant_count]`.
- Increment `grant_count`, return the new grant ID.
- Revert with a clear message if validation fails.

**`submit_evidence` — called by grantee**
```python
@gl.public.write
def submit_evidence(self, grant_id: u256, milestone_index: u256, evidence_url: str) -> None:
```
- Assert `gl.message.sender == grant.grantee`.
- Assert milestone status is `"pending"`.
- Set `milestone.evidence_url = evidence_url`.
- Set `milestone.status = "submitted"`.
- Then call the internal `_verify_milestone` method.

**`_verify_milestone` — internal, non-deterministic**

This is the core GenLayer function. It fetches the evidence URL, calls the LLM, and releases funds.

```python
def _verify_milestone(self, grant_id: u256, milestone_index: u256) -> None:
    grant = self.grants[grant_id]
    milestone = grant.milestones[milestone_index]

    # Fetch the evidence URL
    def fetch_and_evaluate():
        page = gl.nondet.web.get(milestone.evidence_url)
        content = page.body.decode("utf-8")[:4000]  # Truncate to safe length

        prompt = f"""
You are a grant milestone verifier. Your job is to decide whether submitted evidence satisfies a milestone criteria.

MILESTONE CRITERIA:
{milestone.criteria}

SUBMITTED EVIDENCE (fetched from {milestone.evidence_url}):
{content}

Based only on the evidence above, does it satisfy the milestone criteria?

Respond ONLY with valid JSON in this exact format:
{{
  "approved": true or false,
  "reasoning": "one or two sentences explaining your decision"
}}

Do not include any other text. The JSON must be parseable.
"""
        result = gl.nondet.exec_prompt(prompt)
        return result

    result_str = gl.eq_principle.prompt_comparative(
        fetch_and_evaluate,
        principle="`approved` field must be exactly the same"
    )

    result = json.loads(result_str)

    if result["approved"]:
        milestone.status = "approved"
        # Release this milestone's funds to grantee
        gl.message.send_tokens(grant.grantee, milestone.amount)
    else:
        milestone.status = "rejected"
```

**`get_grant` — view**
```python
@gl.public.view
def get_grant(self, grant_id: u256) -> Grant:
    return self.grants[grant_id]
```

**`get_grant_count` — view**
```python
@gl.public.view
def get_grant_count(self) -> u256:
    return self.grant_count
```

**`get_milestone` — view**
```python
@gl.public.view
def get_milestone(self, grant_id: u256, milestone_index: u256) -> Milestone:
    return self.grants[grant_id].milestones[milestone_index]
```

#### Important GenLayer syntax rules Codex must follow

- Every class stored in contract state must have `@allow_storage` and `@dataclass` decorators.
- Read-only methods must use `@gl.public.view`.
- State-changing methods must use `@gl.public.write`.
- Methods that receive GEN tokens must use `@gl.public.write.payable`.
- Token amounts are in wei. 1 GEN = 10^18 wei.
- `gl.message.sender` is the caller's address (string).
- `gl.message.value` is the GEN sent with the transaction (u256, in wei).
- `gl.nondet.web.get(url)` fetches a URL. Returns an object with `.body` (bytes).
- `gl.nondet.exec_prompt(prompt)` calls the LLM. Returns a string.
- `gl.eq_principle.prompt_comparative(fn, principle=...)` wraps non-deterministic calls for validator consensus.
- `gl.message.send_tokens(address, amount)` sends GEN from the contract to an address.
- Use `assert condition, "Error message"` for reverts.
- Use `DynArray[T]` for dynamic arrays, `TreeMap[K, V]` for mappings.
- The dependency comment `# { "Depends": "py-genlayer:test" }` must be the very first line.

---

## Tests — Full Specification

### File: `tests/test_direct.py`

Use Direct Mode (no network, runs in milliseconds).

```python
import pytest

def test_create_grant(direct_deploy, direct_alice, direct_bob, direct_vm):
    contract = direct_deploy("contracts/veritas.py")
    # Alice creates a grant for Bob with 2 milestones
    direct_vm.sender = direct_alice
    direct_vm.value = 10 ** 18 * 100  # 100 GEN
    grant_id = contract.create_grant(
        "Test Grant",
        direct_bob,
        ["Milestone 1", "Milestone 2"],
        ["Deploy a working contract on testnet", "Get 100 active users"],
        [10**18 * 60, 10**18 * 40],
    )
    assert grant_id == 0
    grant = contract.get_grant(0)
    assert grant.title == "Test Grant"
    assert grant.grantee == direct_bob


def test_submit_evidence_approved(direct_deploy, direct_alice, direct_bob, direct_vm):
    contract = direct_deploy("contracts/veritas.py")

    # Mock the web fetch and LLM response
    direct_vm.mock_web(
        r"github\.com/testuser",
        {"status": 200, "body": "Repository with deployed contract at address 0x123..."}
    )
    direct_vm.mock_llm(
        r"grant milestone verifier",
        '{"approved": true, "reasoning": "The evidence shows a deployed contract address."}'
    )

    direct_vm.sender = direct_alice
    direct_vm.value = 10**18 * 60
    contract.create_grant(
        "Test Grant", direct_bob,
        ["Deploy contract"], ["Deploy a working smart contract on testnet"],
        [10**18 * 60]
    )

    direct_vm.sender = direct_bob
    contract.submit_evidence(0, 0, "https://github.com/testuser/myproject")

    milestone = contract.get_milestone(0, 0)
    assert milestone.status == "approved"


def test_submit_evidence_rejected(direct_deploy, direct_alice, direct_bob, direct_vm):
    contract = direct_deploy("contracts/veritas.py")

    direct_vm.mock_web(r".*", {"status": 200, "body": "Empty page with no relevant content"})
    direct_vm.mock_llm(
        r"grant milestone verifier",
        '{"approved": false, "reasoning": "No evidence of a deployed contract was found."}'
    )

    direct_vm.sender = direct_alice
    direct_vm.value = 10**18 * 60
    contract.create_grant(
        "Test Grant", direct_bob,
        ["Deploy contract"], ["Deploy a working smart contract on testnet"],
        [10**18 * 60]
    )

    direct_vm.sender = direct_bob
    contract.submit_evidence(0, 0, "https://github.com/testuser/empty")

    milestone = contract.get_milestone(0, 0)
    assert milestone.status == "rejected"


def test_only_grantee_can_submit(direct_deploy, direct_alice, direct_bob, direct_charlie, direct_vm):
    contract = direct_deploy("contracts/veritas.py")

    direct_vm.sender = direct_alice
    direct_vm.value = 10**18 * 60
    contract.create_grant(
        "Test Grant", direct_bob,
        ["Deploy contract"], ["Deploy a working smart contract"],
        [10**18 * 60]
    )

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert():
        contract.submit_evidence(0, 0, "https://example.com")


def test_wrong_value_reverts(direct_deploy, direct_alice, direct_vm):
    contract = direct_deploy("contracts/veritas.py")

    direct_vm.sender = direct_alice
    direct_vm.value = 10**18 * 10  # Wrong — milestones sum to 100 GEN
    with direct_vm.expect_revert():
        contract.create_grant(
            "Test Grant", direct_alice,
            ["M1", "M2"],
            ["Criteria 1", "Criteria 2"],
            [10**18 * 60, 10**18 * 40],
        )
```

Run tests with:
```bash
pip install genlayer-test
pytest tests/test_direct.py -v
```

---

## Frontend — Full Specification

### Tech stack
- React 18 + TypeScript
- Vite
- `genlayer-js` (npm package)
- React Router v6

### Install dependencies
```bash
cd frontend
npm install genlayer-js react-router-dom
```

### File: `frontend/src/lib/genlayer.ts`

```typescript
import { createClient, createAccount } from 'genlayer-js';
import { studionet, testnetBradbury } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

const NETWORK = import.meta.env.VITE_NETWORK || 'studionet';
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}`;

const chain = NETWORK === 'testnetBradbury' ? testnetBradbury : studionet;

export function getClient(walletAddress?: `0x${string}`) {
  return createClient({
    chain,
    account: walletAddress ?? createAccount(),
  });
}

export { CONTRACT_ADDRESS, TransactionStatus };
```

### File: `frontend/src/.env.example`
```
VITE_NETWORK=studionet
VITE_CONTRACT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT_ADDRESS
```

### Pages to build

#### `Home.tsx`
- On mount: call `client.readContract({ address: CONTRACT_ADDRESS, functionName: 'get_grant_count' })` to get total count.
- Loop from 0 to count, call `get_grant(id)` for each.
- Display each grant as a card: title, grantee address, number of milestones, milestone statuses.
- "Create Grant" button navigates to `/create`.
- Clicking a grant card navigates to `/grant/:id`.

#### `CreateGrant.tsx`
- Form fields: grant title, grantee wallet address.
- Dynamic milestone list: user can add milestones. Each milestone has: title, criteria (textarea), amount (number in GEN).
- On submit:
  1. Convert GEN amounts to wei (multiply by 10^18, use BigInt).
  2. Sum all amounts for the `value` parameter.
  3. Call `client.writeContract({ address: CONTRACT_ADDRESS, functionName: 'create_grant', args: [...], value: totalWei })`.
  4. Wait for `TransactionStatus.ACCEPTED`.
  5. Show success, navigate to the new grant page.

#### `GrantDetail.tsx`
- Read grant data via `get_grant(id)`.
- Display each milestone with its status badge: pending / submitted / approved / rejected.
- If connected wallet matches `grant.grantee` and milestone is `"pending"`, show "Submit Evidence" button.
- Clicking opens `EvidenceForm` component for that milestone index.

#### `EvidenceForm.tsx`
- Input: evidence URL.
- On submit: call `client.writeContract({ functionName: 'submit_evidence', args: [grantId, milestoneIndex, url] })`.
- Wait for `TransactionStatus.FINALIZED` (not just ACCEPTED — because the GenLayer AI evaluation happens during finalization).
- Show loading state: "GenLayer validators are reading your evidence..."
- On completion: refresh milestone status, show verdict.

#### `WalletConnect.tsx`
- Use MetaMask via browser provider.
- Get wallet address from `window.ethereum`.
- Call `client.connect('studionet')` to switch network.
- Show truncated address when connected.

### Frontend wallet connection pattern (MetaMask)

```typescript
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

async function connectWallet() {
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const walletAddress = accounts[0] as `0x${string}`;

  const client = createClient({
    chain: studionet,
    account: walletAddress,
  });

  await client.connect('studionet'); // Switches MetaMask to GenLayer network
  return { client, walletAddress };
}
```

---

## Development Setup — Step by Step

### Step 1: Environment

```bash
# Install GenLayer CLI
pip install genlayer-cli

# Install test framework
pip install genlayer-test

# Initialize project
genlayer init
genlayer up   # Starts local GenLayer Studio at http://localhost:8080
```

### Step 2: Write and test the contract

```bash
# Run fast unit tests (no network needed)
pytest tests/test_direct.py -v

# Open Studio in browser to test interactively
# http://localhost:8080
# Load contracts/veritas.py
# Deploy via Studio UI
# Test write methods manually
```

### Step 3: Deploy to Studionet

```bash
# Set network to studionet
genlayer config set network studionet

# Deploy
genlayer deploy --contract contracts/veritas.py

# Note the deployed contract address from output
# Copy it to frontend/.env as VITE_CONTRACT_ADDRESS
```

### Step 4: Run frontend

```bash
cd frontend
cp .env.example .env
# Edit .env: set VITE_CONTRACT_ADDRESS to deployed address

npm install
npm run dev
# Frontend runs at http://localhost:5173
```

### Step 5: Deploy to Testnet Bradbury (production-like)

```bash
genlayer config set network testnetBradbury

# Get test GEN from faucet
# https://testnet-faucet.genlayer.foundation

genlayer deploy --contract contracts/veritas.py
```

---

## Network Reference

| Network | RPC | Chain ID | Use for |
|---|---|---|---|
| Studionet (hosted) | `https://studio.genlayer.com/api` | 61999 | Development, no Docker needed |
| Localnet | `http://localhost:4000/api` | 61127 | Full local control |
| Testnet Bradbury | `https://rpc-bradbury.genlayer.com` | 4221 | Production-like with real AI |

**Faucet (Bradbury testnet):** `https://testnet-faucet.genlayer.foundation`
**Explorer (Bradbury):** `https://explorer-bradbury.genlayer.com`
**Studio UI:** `https://studio.genlayer.com`

---

## GenLayer JS SDK — Key Calls

### Read contract state
```typescript
const grant = await client.readContract({
  address: CONTRACT_ADDRESS,
  functionName: 'get_grant',
  args: [BigInt(grantId)],
});
```

### Write to contract (no value)
```typescript
const hash = await client.writeContract({
  address: CONTRACT_ADDRESS,
  functionName: 'submit_evidence',
  args: [BigInt(grantId), BigInt(milestoneIndex), evidenceUrl],
  value: BigInt(0),
});
const receipt = await client.waitForTransactionReceipt({
  hash,
  status: TransactionStatus.FINALIZED,
});
```

### Write to contract (with value / payable)
```typescript
const totalWei = milestoneAmounts.reduce((a, b) => a + b, BigInt(0));
const hash = await client.writeContract({
  address: CONTRACT_ADDRESS,
  functionName: 'create_grant',
  args: [title, grantee, milestoneTitles, milestoneCriteria, milestoneAmounts],
  value: totalWei,
});
```

### Wait for finalization vs acceptance
- Use `TransactionStatus.ACCEPTED` for normal state changes — fast.
- Use `TransactionStatus.FINALIZED` for `submit_evidence` — because the AI evaluation runs during finalization and the milestone status only updates after validators reach consensus.

---

## Common Errors and How to Fix Them

**`contract not found at address`** — The contract address in `.env` is wrong or you're on the wrong network. Check `VITE_NETWORK` matches where you deployed.

**`Insufficient balance`** — The wallet sending `create_grant` doesn't have enough GEN. Use the faucet.

**`Transaction UNDETERMINED`** — Validators could not reach consensus. Usually means the LLM prompt returned malformed JSON. Make the prompt stricter: explicitly say "respond ONLY with JSON, no other text".

**`assert` revert with no message** — Add a message to every assert: `assert condition, "Descriptive error message"`.

**`DynArray index out of range`** — Milestone index passed to `get_milestone` or `submit_evidence` is out of bounds. Validate on the frontend before calling.

**MetaMask wrong network** — Always call `await client.connect('studionet')` before any `writeContract` call. If the wallet is on the wrong chain, GenLayer JS will throw with a helpful message.

---

## What Codex Should Build — Summary Checklist

- [ ] `contracts/veritas.py` — complete Intelligent Contract with all methods above
- [ ] `tests/test_direct.py` — all five direct mode tests passing
- [ ] `frontend/src/lib/genlayer.ts` — client setup
- [ ] `frontend/src/pages/Home.tsx` — grant list dashboard
- [ ] `frontend/src/pages/CreateGrant.tsx` — grant creation form
- [ ] `frontend/src/pages/GrantDetail.tsx` — milestone view + evidence submission
- [ ] `frontend/src/components/EvidenceForm.tsx` — evidence URL input + submit
- [ ] `frontend/src/components/WalletConnect.tsx` — MetaMask connection
- [ ] `frontend/src/App.tsx` — React Router setup with all routes
- [ ] `frontend/.env.example` — template with VITE_NETWORK and VITE_CONTRACT_ADDRESS
- [ ] `gltest.config.yaml` — test configuration
- [ ] `README.md` — setup instructions

---

## GenLayer Skills Plugin (Recommended for Codex)

GenLayer provides a Claude Code plugin that scaffolds and deploys contracts automatically:

```bash
claude /plugin marketplace add genlayerlabs/skills
claude /plugin install genlayer-dev@genlayerlabs
```

Then run `claude /genlayer-dev` inside the project. The skill handles tooling setup, linting, and deployment steps automatically.

---

## Key Design Decisions

**Why `FINALIZED` and not `ACCEPTED` for evidence submission?**
The AI evaluation is a non-deterministic operation. GenLayer processes it through multiple validator rounds. The milestone status only updates on-chain after all validators agree. `ACCEPTED` means one round passed; `FINALIZED` means the appeal window has closed and the result is permanent. For money movement, always wait for `FINALIZED`.

**Why plain English criteria instead of code-based rules?**
That is the entire point of GenLayer. A normal smart contract cannot evaluate "does this GitHub repo have 100 stars and a working CI pipeline." The LLM can. The criteria field is intentionally free-form text that the LLM reads directly.

**Why truncate fetched content to 4000 characters?**
LLM context windows have limits. 4000 characters is enough to read a dashboard or a GitHub README. If the evidence is a data-heavy page, the grantee should link directly to the relevant section.

**Why store amounts in wei (u256) not GEN (float)?**
Same reason Ethereum does. Floating-point math is imprecise and dangerous for money. Always store wei, convert to GEN only for display in the frontend.
