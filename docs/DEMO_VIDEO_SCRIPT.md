# 🎬 Demo Video Script — Carmen Sandiego On-Chain
### Chainlink Convergence Hackathon | CRE + AI Focus | ~4 min

---

## Requirements Covered

| Requirement | How |
|---|---|
| Brief project introduction + problem | Section 1 & 2 |
| System working (sample) | Section 4 — `simulate-all.sh` live |
| Code where Chainlink is used | Section 3 — `generate-briefing/main.ts` |
| CRE workflow simulated via CLI | `bash simulate-all.sh` → 6/6 PASSED |
| Blockchain + external API/LLM | Data Feed (ETH/USD) + Groq/LLaMA inside WASM |

---

## Scenes & Commands

```
Scene 1 (0:00)  — voice only, no screen required
Scene 2 (0:30)  — voice only or GitHub repo
Scene 3 (0:50)  — VSCode: open generate-briefing/main.ts
Scene 4 (1:30)  — Git Bash: bash simulate-all.sh
Scene 5 (3:30)  — voice only
Scene 6 (4:00)  — closing card
```

**Key command:**
```bash
cd c:/AmbienteDesenvolvimento/Hackaton/carmen-sandiego-onchain/cre-workflows
bash simulate-all.sh
```

**Code file to show:**
```
cre-workflows/generate-briefing/main.ts
  Line 453 → Chainlink Data Feed (ETH/USD via EVMClient)
  Line 558 → Groq LLaMA 3.3-70b via HTTPClient
  Line 595 → ECIES encryption (secp256k1)
  Line 611 → writeReport → Keystone Forwarder
```

---

## Full Narration Script

---

### [0:00 — PROBLEM — 30s]

> Every blockchain game today has the same dirty secret: the fun parts — generating content, evaluating player actions, updating game state — all run on a centralized server. The smart contract is just a scoreboard. One server goes down, one company pulls the plug, and the game is gone forever.

> There's a deeper problem: who decides if your answer is right? A backend you can't audit. An API you have to trust. That's not Web3 — that's Web2 with a wallet.

---

### [0:30 — SOLUTION — 20s]

> Carmen Sandiego On-Chain moves the entire game brain onto Chainlink CRE — the Decentralized Runtime Environment. No backend. No admin key. Every clue generated, every investigation evaluated, every NFT minted — executed by a decentralized oracle network, verifiable on-chain.

---

### [0:50 — THE CODE — 40s]
*(show `generate-briefing/main.ts` in VSCode)*

> Here's the generate-briefing workflow. This TypeScript compiles to WASM and runs inside the Chainlink DON. Look at what happens in a single execution:

> **Line 453** — EVMClient reads the Chainlink ETH/USD Data Feed directly from Sepolia. No HTTP request. Pure on-chain read inside the WASM runtime.

> **Line 558** — calls the Groq API with LLaMA 3.3-70b via CRE HTTPClient. Temperature zero — deterministic so all DON nodes reach consensus on the same briefing.

> **Line 595** — the briefing is ECIES-encrypted with the player's secp256k1 public key registered on-chain. Not even the DON nodes can read it. Only the player can decrypt.

> **Line 611** — writeReport delivers the signed result through the Keystone Forwarder. The smart contract verifies the DON's threshold signature before accepting the clue.

---

### [1:30 — SYSTEM LIVE — 2min]
*(run `bash simulate-all.sh` in Git Bash)*

> Now let's see all 6 workflows running via the CRE CLI against real Sepolia transactions.

*(carmen-moves passes)*
> carmen-moves — cron trigger, moves Carmen periodically. No transaction needed.

*(generate-briefing — Data Feed line appears)*
> generate-briefing — watch this. First log from the WASM: **Chainlink Data Feed ETH/USD — $1,983 — live from Sepolia.** Round number, timestamp, contract address — all verifiable on-chain.

*(Groq line appears)*
> Then: Groq LLaMA called from inside the CRE WASM. The DON is running an AI model call as part of the decentralized computation. 963 characters of noir-style briefing — generated, encrypted, and delivered on-chain in under 2 seconds.

> Blockchain data + AI generation + end-to-end encryption + on-chain delivery. One workflow. Zero centralized servers.

*(mission-start, generate-finale pass)*
> mission-start evaluates investigations using commit-reveal — the contract never knows Carmen's location in plaintext. generate-finale builds the SVG NFT trophy entirely on-chain.

*(6/6 PASSED appears)*
> **Six workflows. Six passes. All compiled to WASM, validated against live Sepolia data.**

---

### [3:30 — WHY IT SOLVES THE PROBLEM — 30s]

> The game rules aren't on a server — they're in WASM bytecode on the Chainlink DON. Every clue is deterministic and verifiable. Carmen's location is hidden by a cryptographic commitment, not a database row. When the DON reaches consensus, a threshold signature proves no single node — and no single company — controlled the outcome.

> Production deployment is pending CRE early access — already requested. The simulation confirms every workflow is ready.

---

### [4:00 — CLOSE — 15s]

> Carmen Sandiego On-Chain — the first blockchain game where the game itself is decentralized. Powered by Chainlink CRE, Data Feeds, VRF, and CCIP.

---

## Recording Tips

- Use **Git Bash** terminal (not PowerShell — `cre` won't be in PATH)
- Font size: **16px minimum** so logs are readable in the video
- Theme: dark (already default)
- Kill all Node processes before starting the gameplay demo:
  ```powershell
  taskkill /F /IM node.exe
  ```
- Start `cre-responder.ts` FIRST, wait for `Listening for on-chain events...`, then start `demo-testnet.ts`

---

## Chainlink Services Visible in the Video

| Service | Where it appears |
|---|---|
| CRE / Keystone | All 6 workflows — `simulate-all.sh` output |
| Data Feeds (ETH/USD) | `generate-briefing` log: `ETH/USD = $1,983.43` |
| Groq LLM via HTTPClient | `generate-briefing` log: `AI briefing generated via Groq/LLaMA` |
| VRF v2.5 | `demo-testnet.ts` startup — request ID + fulfillment TX |
| ECIES encryption | `generate-briefing` + `mission-start` logs |
| writeReport / Forwarder | `generate-briefing` + `mission-start` + `generate-finale` |
| Commit-Reveal | `mission-start` log: `keccak256(city, salt) = ... MATCH` |
| NFT on-chain SVG | `generate-finale` log: `Trophy NFT metadata set — GOLD rank` |
