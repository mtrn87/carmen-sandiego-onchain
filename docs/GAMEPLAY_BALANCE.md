# Gameplay Balance Analysis

This document catalogs every gameplay parameter across smart contracts, CRE workflows, and frontend, and provides balance analysis for each system.

## Table of Contents

- [1. CityNode Energy System](#1-citynode-energy-system)
- [2. GameMaster Mission Parameters](#2-gamemaster-mission-parameters)
- [3. Frontend Block Economy](#3-frontend-block-economy)
- [4. Clue Strength & Evidence](#4-clue-strength--evidence)
- [5. Wallet Fragment System](#5-wallet-fragment-system)
- [6. City Discovery](#6-city-discovery)
- [7. Reward & Ranking](#7-reward--ranking)
- [8. Timing Analysis](#8-timing-analysis)
- [9. Balance Observations & Recommendations](#9-balance-observations--recommendations)

---

## 1. CityNode Energy System

**Source:** `contracts/src/CityNode.sol:25-36`

| Parameter | Value | Notes |
|-----------|-------|-------|
| MAX_ENERGY | 20 | Maximum energy a player can hold |
| ENERGY_REGEN_INTERVAL | 15 min | Time to regenerate 1 energy point |
| NUM_LOCATIONS | 3 | Locations per city |
| CLUES_PER_LOCATION | 3 | Clues available per location |

### Action Energy Costs

| Action | Cost | Purpose |
|--------|------|---------|
| Inspect | 1 | View location transactions |
| Scan | 6 | Deep scan for anomalies |
| Request Clue | 2 | Request CRE-generated clue |
| Flag Tx | 1 | Flag a suspicious transaction |
| Request Dossier | 1 | Request suspect dossier |
| Request Capture | 3 | Attempt to capture Carmen |

### Energy Economy Analysis

- **Full energy pool:** 20 energy = enough for ~3 full scan+clue cycles (6+2=8 each) plus 2 inspections
- **Regen rate:** 1 energy per 15 min → full pool refill takes **5 hours**
- **Minimum investigation cycle:** inspect(1) + clue(2) = 3 energy → ~6 investigations per full pool
- **Heavy cycle:** scan(6) + clue(2) + flag(1) = 9 energy → 2 full heavy cycles per pool

---

## 2. GameMaster Mission Parameters

**Source:** `contracts/src/GameMaster.sol:28-35, 892-896`

| Parameter | Value | Notes |
|-----------|-------|-------|
| MAX_BLOCKS | 200 | On-chain block limit before mission expires |
| MAX_INVESTIGATIONS | 10 | Hard cap on investigation attempts |
| EVIDENCE_THRESHOLD | 65 | Clue strength > 65 counts as evidence |
| Investigation Cooldown | 1 block | Minimum blocks between investigations |

### VRF Configuration

| Parameter | Value |
|-----------|-------|
| VRF_CALLBACK_GAS | 200,000 |
| VRF_CONFIRMATIONS | 3 (Sepolia minimum) |
| VRF_NUM_WORDS | 1 |

---

## 3. Frontend Block Economy

**Source:** `frontend/src/store/gameStore.js`

The frontend tracks a parallel "block" economy (UI-side timer) independent of on-chain blocks.

| Parameter | Value | Source Line |
|-----------|-------|-------------|
| MAX_BLOCKS (frontend) | 320 | :283 |
| Investigation Timeout | 20s | :1211 |

### Block Spending Costs

| Action | Block Cost | Source Line |
|--------|-----------|-------------|
| Investigate | +5 blocks | :1168 |
| Request Clue | +3 blocks | :2123 |
| Flag Tx | +1 block | :2254 |
| Request Dossier | +1 block | :2286 |
| Scan City | +21 blocks | :1714 |

### UI Gas System (cosmetic)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Initial Gas | 100 | UI-only resource, not blockchain gas |
| Scan Location Cost | 30 GAS | Deducted from UI gas pool |

### Block Budget Analysis

With 320 max blocks, a player can perform:
- **64 investigations** at 5 blocks each (theoretical max)
- **~10 investigations + 3 scans + 5 clue requests + 5 flags** = 50 + 63 + 15 + 5 = 133 blocks (realistic heavy session)
- **Minimum winning path:** 3 investigations yielding strong clues + 1 capture = 15 + capture cost = well within budget

---

## 4. Clue Strength & Evidence

### CRE Workflow Clue Generation

**Source:** `cre-workflows/mission-start/main.ts:206-219`

| Scenario | Strength Range | Formula |
|----------|---------------|---------|
| Correct city | 40–95 | 40 + (hash % 56) |
| Wrong city | 20–55 | 20 + (hash % 36) |

### Frontend Mock Clue Strength (when CRE unavailable)

**Source:** `frontend/src/store/gameStore.js`

| Tier | Strength Range | Notes |
|------|---------------|-------|
| Starting clue (first visit) | 70–95 | Always strong to hook the player |
| Dead end | 5–20 | Clearly a dead end |
| Weak tier (0–40 raw) | 20–65 | Below or near threshold |
| Medium tier (41–65 raw) | 20–95 | Variable, can cross threshold |
| Strong tier (66–95 raw) | 66–95 | Includes [NEXT LEAD] hint |

### Scripted Route Strength (route_a demo)

**Source:** `cre-workflows/mission-start/main.ts:1414-1446`

| City Role | Strength Range |
|-----------|---------------|
| On-path | 75–90 |
| Near-path | 45–60 |
| Off-path | 10–20 |

### Evidence Probability Analysis

- **Correct city (CRE):** strength 40–95, uniformly distributed → P(strength > 65) = (95-65)/(95-40) = **54.5%**
- **Wrong city (CRE):** strength 20–55 → P(strength > 65) = **0%** (max is 55, always below threshold)
- A player investigating the correct city needs on average **~2 investigations** to get one evidence-quality clue
- To collect 3 wallet fragments (capture threshold): **~6 investigations on the correct city** on average

---

## 5. Wallet Fragment System

**Source:** `cre-workflows/mission-start/main.ts:506-514`, `contracts/src/GameMaster.sol:491`

| Parameter | Value |
|-----------|-------|
| Fragment length | 5 hex characters |
| Wallet address length | 40 hex characters (without 0x) |
| Fragments needed for capture | 3 |
| Fragment trigger | Clue strength > 65 (evidence threshold) |
| Max possible positions | 36 (positions 0–35 for a 5-char window) |

### Fragment Collection Analysis

- Fragments are only generated from evidence-quality clues (strength > 65)
- On the correct city: ~54.5% chance per investigation of getting a fragment
- Expected investigations to collect 3 fragments: **~6 investigations on correct city**
- Each fragment position is deterministic: `keccak256(salt, fragmentCount) % 36`

---

## 6. City Discovery

**Source:** `frontend/src/store/gameStore.js`, `frontend/src/data/cityRegistry.js`

| Parameter | Value |
|-----------|-------|
| Total cities in pool | 17 (across 6 chains) |
| Home city (default) | Santiago (ID: 80002, Polygon Amoy) |
| Initial discovered cities | 3 (home + 2 revealed) |
| Cities revealed per scan | Up to 3 |
| Scan block cost | 21 blocks |

### Discovery Economy

- 17 total cities, starting with 3 → 14 undiscovered
- Each scan reveals up to 3 → full map discovery in ~5 scans
- 5 scans × 21 blocks = **105 blocks** to discover all cities (33% of 320 budget)

---

## 7. Reward & Ranking

### Reward Tiers

**Source:** `contracts/src/GameMaster.sol:892-896`

| Tier | Block Threshold | Points |
|------|----------------|--------|
| Gold | ≤ 20 blocks | 100 |
| Silver | ≤ 35 blocks | 75 |
| Bronze | ≤ 50 blocks | 50 |
| Failed | > 50 blocks | 0 |

### Market Bonus

**Source:** `contracts/src/GameMaster.sol:929-930`

- Trigger: ETH price > $2,500 USD
- Formula: `(price - 2500) / 100` additional points

### Rank Progression

**Source:** `frontend/src/store/gameStore.js:2481-2490`

| Rank | Title | Captures Required |
|------|-------|-------------------|
| 0 | Detective Rookie | 0 |
| 1 | Detective Junior | 1 |
| 2 | Detective Senior | 2 |
| 3 | Detective Chief | 3 |
| 4 | Special Agent | 4 |
| 5 | Master Agent | 5 |

---

## 8. Timing Analysis

### Key Timers

| System | Timer | Value |
|--------|-------|-------|
| CityNode | Energy regen | 1 per 15 min |
| CRE | Carmen moves cron | Every 3 min |
| Frontend | Investigation timeout | 20s (CRE fallback) |
| Frontend | Block timer | Increments per action |
| GameMaster | On-chain block limit | 200 blocks (~40 min on Sepolia at 12s/block) |

### Carmen Movement vs Player Speed

- Carmen moves every **3 minutes**
- A player investigation cycle (inspect → clue → analyze) takes roughly **30–60 seconds** of user time
- With 5 blocks per investigation and 320 max blocks, the time pressure comes from **block spending**, not real-time Carmen movement
- Carmen movement primarily forces the player to **re-discover** her location rather than acting as a hard timer

### On-Chain vs Frontend Block Divergence

- **On-chain MAX_BLOCKS = 200** (~40 min on Sepolia at 12s/block)
- **Frontend MAX_BLOCKS = 320** (action-cost-based, not wall-clock)
- The frontend block counter is a game mechanic (action budget), not a blockchain block tracker
- These are independent systems: a mission can fail on-chain (200 blocks elapsed) while the frontend still has budget remaining

---

## 9. Balance Observations & Recommendations

### Current Balance Assessment

#### Well-Balanced Aspects

1. **Evidence system:** Only correct-city clues can exceed threshold (65). Wrong city maxes at 55. This creates a clear signal for players on the right track.
2. **Fragment collection:** 3 fragments from ~6 correct-city investigations is a reasonable skill gate.
3. **Energy costs:** The cost hierarchy (scan=6 > capture=3 > clue=2 > inspect/flag/dossier=1) correctly prices actions by their information value.
4. **Scripted route balance:** On-path (75–90) vs off-path (10–20) gives clear feedback in demo mode.

#### Potential Concerns

1. **Reward tier thresholds vs actual gameplay:**
   - Gold requires ≤20 blocks. At 5 blocks per investigation, that's only **4 investigations** max.
   - Getting 3 evidence-quality clues in 4 investigations requires significant luck (~54.5% chance each on correct city).
   - **Recommendation:** Gold tier is very aggressive. Consider raising to ≤30 blocks, or reducing investigation block cost to 3.

2. **Energy regeneration is very slow:**
   - Full pool (20 energy) takes **5 hours** to regenerate from zero.
   - A single heavy scan+clue cycle costs 8 energy.
   - **Recommendation:** This is appropriate for a blockchain game with real tx costs. If user engagement dips, consider reducing regen interval to 10 min.

3. **Frontend block budget is generous:**
   - 320 blocks with 5/investigation allows 64 investigations, but MAX_INVESTIGATIONS is capped at 10 on-chain.
   - The frontend budget rarely becomes the binding constraint.
   - **Recommendation:** Consider reducing frontend MAX_BLOCKS to 200 to align with on-chain limit, or using it purely as a UI timer.

4. **On-chain block limit (200) vs reward tiers:**
   - Reward tiers cap at 50 blocks for any reward. Blocks 51–200 yield 0 points but the mission is still "active."
   - This creates a **150-block dead zone** where the mission is active but unwinnable.
   - **Recommendation:** Either reduce MAX_BLOCKS to ~60 (mission fails sooner) or add a "participation" tier for 51–100 blocks.

5. **Carmen movement (3 min) has no direct gameplay cost:**
   - Carmen moving doesn't consume player resources — it just changes which city is "correct."
   - The player doesn't know Carmen moved unless they investigate and notice clue quality dropping.
   - **Recommendation:** Consider adding a terminal notification when Carmen moves (without revealing destination) to create time pressure awareness.

### Parameter Reference Table

| Parameter | Contract | Frontend | Notes |
|-----------|----------|----------|-------|
| Max blocks | 200 | 320 | Divergent — contract is binding |
| Max investigations | 10 | — | Hard cap, no frontend equivalent |
| Evidence threshold | 65 | 65 | Aligned |
| Correct city clue range | 40–95 | 70–95 (mock) | Mock is more generous |
| Wrong city clue range | 20–55 | 5–65 (mock) | Mock can exceed threshold (bug?) |
| Energy max | 20 | 20 | Aligned |
| Fragments needed | 3 | 3 | Aligned |

### Mock vs Production Clue Divergence

The mock clue system (used when CityNode is not configured) has different ranges than the CRE production system:
- **Mock weak tier** can produce clues up to 65 — right at the threshold, potentially generating false evidence
- **CRE wrong city** maxes at 55 — safely below threshold
- **Recommendation:** Align mock ranges with CRE ranges to ensure consistent testing behavior
