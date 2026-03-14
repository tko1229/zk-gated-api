# ZK-Gated API Access — The Synthesis Hackathon Demo

> **Track:** Agents that Keep Secrets  
> **Team:** Boba (Participant `bffec5c4c9c549b29487358d9f965163`)

## Problem

Every API call an AI agent makes leaks metadata about the human behind it. API keys, OAuth tokens, and bearer credentials create a direct link between the agent's actions and its owner's identity. The more capable agents become, the more they reveal about the people who use them.

## Solution

Replace API keys with **zero-knowledge proofs**. An agent proves it belongs to a set of authorized agents (registered via ERC-8004 on Base) **without revealing which agent it is**. The API service verifies the proof on-chain and grants access — no API key, no identity disclosure, just math.

**How it works:**
1. Authorized agents are registered in a Merkle tree (leaves = hashed agent IDs)
2. The agent generates a ZK proof: *"I know a secret agent_id that is in this tree"* — without revealing the ID
3. The proof is verified on-chain by an UltraHonk verifier on **Base Mainnet**
4. If valid → access granted. The service never learns *which* agent made the request.

## Contracts (Base Mainnet — Chain 8453)

| Contract | Address | Purpose |
|----------|---------|---------|
| **HonkVerifier** | [`0xA95E3fc6a8d4e02d5717AF73744ed9BdEbD30578`](https://basescan.org/address/0xA95E3fc6a8d4e02d5717AF73744ed9BdEbD30578) | Noir UltraHonk ZK proof verifier |
| **ZKGatedAccess** | [`0x0F60203C05270a5d39bF7494e7cd29F1Dd52aFC7`](https://basescan.org/address/0x0F60203C05270a5d39bF7494e7cd29F1Dd52aFC7) | Access control — checks proof against Merkle root |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐
│  AI Agent   │────▶│  ZK Proof    │────▶│  Gated API Server   │
│  (Boba)     │     │  (Noir/BB)   │     │  (Express.js)       │
│             │     │              │     │                     │
│ Private:    │     │ Proves:      │     │ Verifies on-chain:  │
│ - agent_id  │     │ "I'm in the  │     │ HonkVerifier on     │
│ - Merkle    │     │  allowed set"│     │ Base Mainnet        │
│   path      │     │              │     │                     │
└─────────────┘     └──────────────┘     └─────────────────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │  Base Mainnet   │
                                          │  Chain 8453     │
                                          │                 │
                                          │  HonkVerifier   │
                                          │  ZKGatedAccess  │
                                          └─────────────────┘
```

## Stack

- **Noir** (1.0.0-beta.19) — ZK circuit language for the membership proof
- **Barretenberg** (4.0.0) — UltraHonk proving system, generates Solidity verifier
- **Foundry** (Forge 1.5.1) — Smart contract compilation and deployment
- **Base Mainnet** — On-chain verification (EVM-compatible L2)
- **Node.js** — Orchestration scripts and API server

## Reproduce

### Prerequisites

- [Noir](https://noir-lang.org/docs/getting_started/installation/) (nargo 1.0.0-beta.19+)
- [Barretenberg](https://github.com/AztecProtocol/aztec-packages) (bb CLI)
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge)
- Node.js 18+
- Base Mainnet RPC URL

### Setup

```bash
# Install dependencies
npm install

# Set environment variables
export BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/YOUR_KEY"
# For deployment only (not needed for verification):
# export BASE_DEPLOYER_PRIVATE_KEY="0x..."

# Add Noir and Barretenberg to PATH
export PATH="$HOME/.nargo/bin:$HOME/.bb:$PATH"
```

### Run End-to-End Demo

```bash
# Generate proof and verify on Base Mainnet (uses Boba's agent ID by default)
node scripts/call-gated-api.mjs

# With custom agent IDs:
node scripts/call-gated-api.mjs --agent-id 42 --agent-ids "42,100,200,300"
```

### Step by Step

```bash
# 1. Compile the Noir circuits
cd circuits/membership_proof && nargo compile && cd ../..
cd circuits/compute_tree && nargo compile && cd ../..

# 2. Generate verification key
cd circuits/membership_proof
bb write_vk --oracle_hash keccak -b ./target/membership_proof.json -o ./target
cd ../..

# 3. Generate proof for a specific agent
node scripts/generate-proof.mjs --agent-id 42 --agent-ids "42,100,200,300"

# 4. Start the gated API server (optional — for HTTP demo)
export HONK_VERIFIER_ADDRESS="0xA95E3fc6a8d4e02d5717AF73744ed9BdEbD30578"
export ZK_GATED_ACCESS_ADDRESS="0x0F60203C05270a5d39bF7494e7cd29F1Dd52aFC7"
node api/server.mjs
```

### Deploy Your Own (optional)

```bash
cd contracts
export MERKLE_ROOT="0x..."  # Your tree root
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $BASE_RPC_URL \
  --private-key $BASE_DEPLOYER_PRIVATE_KEY \
  --broadcast
```

## Circuit Details

### Membership Proof (`circuits/membership_proof`)

- **Public input:** Merkle root (identifies the authorized agent set)
- **Private inputs:** agent_id, Merkle path siblings, path indices
- **Proves:** "I know a leaf (agent_id) in this Merkle tree" without revealing which leaf
- **Hash function:** Pedersen (Noir stdlib)
- **Tree depth:** 3 (supports up to 8 agents; extendable)

### Compute Tree (`circuits/compute_tree`)

- Helper circuit to compute the Merkle tree and all intermediate hashes
- Used off-chain to derive the root and paths for each agent

## Security Properties

1. **Agent anonymity:** The verifier learns only that the prover is *one of* the registered agents — not which one
2. **No API key in transit:** Access is granted purely by proof validity; no bearer token leaves the agent
3. **On-chain verification:** Proof validity is checked by a smart contract on Base Mainnet — trustless and auditable
4. **Human-controlled policy:** The Merkle root (agent set) is updatable by the contract owner

## Project Structure

```
synthesis-demo/
├── circuits/
│   ├── membership_proof/      # Main ZK circuit (membership proof)
│   └── compute_tree/          # Helper circuit (Merkle tree computation)
├── contracts/
│   ├── src/
│   │   ├── Verifier.sol       # Auto-generated UltraHonk verifier
│   │   └── ZKGatedAccess.sol  # Access control wrapper
│   └── script/
│       └── Deploy.s.sol       # Deployment script
├── api/
│   └── server.mjs             # Gated API server
├── dashboard/
│   └── index.html             # Visual comparison dashboard
├── scripts/
│   ├── call-gated-api.mjs     # End-to-end demo script
│   ├── generate-proof.mjs     # Proof generation utility
│   └── two-callers-demo.mjs   # Two anonymous callers demo
└── README.md
```

## Two Anonymous Callers

Two agents from the same set both prove membership — the verifier **cannot distinguish** between them:

```bash
node scripts/two-callers-demo.mjs
```

Output:
```
Agent A: ✅ VERIFIED (proof hash: 0xa71bcba1...)
Agent B: ✅ VERIFIED (proof hash: 0x24faf3c3...)

Both proofs:
  ✅ Verify against the SAME Merkle root
  ✅ Both return true from the on-chain verifier
  ❌ Proofs are DIFFERENT (can't correlate calls)
  ❌ No agent ID appears in either proof
  ❌ Verifier CANNOT tell which agent made which call
```

## Dashboard

Open `dashboard/index.html` in a browser to see a visual comparison of API-key-based access vs ZK-proof-based access, including live contract info and the two-caller demo results.

## Access Policy

The access policy is controlled by the **Merkle root** stored in the `ZKGatedAccess` contract:

- **Who can access:** Only agents whose hashed IDs are leaves in the Merkle tree
- **Scope:** The current tree root grants access to the `/api/secret` endpoint
- **Update:** The contract owner can call `updateMerkleRoot(bytes32)` to add/remove agents
- **Granularity:** In a production system, different roots could gate different endpoints or scopes — the circuit could be extended with a `scope` field in the proof

This is a **human-defined policy**: the contract owner (the human) decides which agents are authorized by computing and publishing the appropriate Merkle root. The agent proves membership; the human defines the set.

## License

MIT
