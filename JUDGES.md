# For judges — ZK-Gated API (The Synthesis)

**Track:** Agents that Keep Secrets  
**Repository:** [github.com/tko1229/zk-gated-api](https://github.com/tko1229/zk-gated-api)  
**Team:** Boba · Participant ID: `bffec5c4c9c549b29487358d9f965163`

## One sentence

AI agents call a gated API using a **zero-knowledge proof of Merkle membership** instead of an API key — the service verifies on **Base Mainnet** and never learns which agent called.

## Contracts (Base Mainnet — chain 8453)

| Contract | Address | Basescan |
|----------|---------|----------|
| HonkVerifier | `0xA95E3fc6a8d4e02d5717AF73744ed9BdEbD30578` | [link](https://basescan.org/address/0xA95E3fc6a8d4e02d5717AF73744ed9BdEbD30578) |
| ZKGatedAccess | `0x0F60203C05270a5d39bF7494e7cd29F1Dd52aFC7` | [link](https://basescan.org/address/0x0F60203C05270a5d39bF7494e7cd29F1Dd52aFC7) |

## 3-minute verify (local)

Prerequisites: Node 18+, Noir (`nargo`), Barretenberg (`bb`), Foundry optional for rebuild only.

```bash
git clone https://github.com/tko1229/zk-gated-api.git && cd zk-gated-api
npm install
export BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/YOUR_KEY"   # your RPC only; never commit
export PATH="$HOME/.nargo/bin:$HOME/.bb:$PATH"
node scripts/call-gated-api.mjs
```

Optional: `node scripts/two-callers-demo.mjs` — two agents from the same set; different proofs, same root.

## What to read in the repo

| Path | Why |
|------|-----|
| `README.md` | Full problem/solution, architecture, reproduce |
| `circuits/membership_proof/` | Noir membership ZK circuit |
| `contracts/src/` | On-chain verifier + `ZKGatedAccess` |
| `api/server.mjs` | Gated HTTP API |
| `dashboard/index.html` | API key vs ZK narrative |

## Demo video

**▶ [Watch demo (MP4, 55s)](https://github.com/tko1229/zk-gated-api/releases/download/v1.0-demo/zk-gated-api-demo.mp4)**

Contents: Problem (API key identity leakage) → Architecture → Live terminal: proof generation + on-chain verification on Base Mainnet → Two anonymous callers → Contracts on Basescan → Conclusion.

## Human–agent process (brief)

- **Spec:** Human set DoD — Noir Merkle proof, on-chain verify on **Base Mainnet only**, gated API, E2E without demo API key in the happy path.
- **Execution:** Coding agent (OpenClaw) from a single task prompt + contract doc; circuits, `bb`, Foundry, deploy **8453**, Express + scripts.
- **Mainnet fix:** Verifier contract size (EIP-170) → adjust optimizer runs, redeploy.
- **Phase 2:** Dashboard, two anonymous callers, Access Policy in README.
- **Audit:** Scripted regression (secrets, compile, mainnet `call-gated-api.mjs`) → **15/15 PASS**; demo video on GitHub Release.
- **Submission:** `conversationLog` + metadata on Synthesis; full timeline + JSON: [`docs/CONVERSATION_LOG.md`](docs/CONVERSATION_LOG.md).

## Security note

No API keys or deployer private keys belong in this repository — only in local `.env` / CI secrets.
