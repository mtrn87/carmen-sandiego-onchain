/**
 * ================================================================
 *  Carmen Sandiego On-Chain — TESTNET DEMO (Player Side Only)
 * ================================================================
 *
 *  Full game loop on Sepolia testnet — for hackathon demonstration.
 *
 *  REQUIRES: cre-responder.ts running in a SEPARATE terminal.
 *
 *  This script handles PLAYER actions only:
 *    registerPlayer → startMission → submitInvestigation x3
 *  The CRE oracle (cre-responder.ts) handles all callbacks:
 *    receiveClue → resolveCapture → setMissionTokenURI
 *
 *  Chainlink services:
 *    CRE (Runtime Environment) · VRF v2.5 · Data Feeds · AI (Groq)
 *
 *  Usage:
 *    Terminal 1: npx hardhat run scripts/cre-responder.ts --network sepolia
 *    Terminal 2: npx hardhat run scripts/demo-testnet.ts  --network sepolia
 * ================================================================
 */

import { ethers, network } from "hardhat";
import { secp256k1 } from "@noble/curves/secp256k1";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import * as crypto from "crypto";

// ── Constants ──
const VALID_CHAIN_IDS = [421614, 84532, 51];
const CITIES: Record<number, { name: string; emoji: string; chain: string }> = {
  421614: { name: "Tokyo",  emoji: "🗼", chain: "Arbitrum Sepolia" },
  84532:  { name: "Paris",  emoji: "🗼", chain: "Base Sepolia" },
  51:     { name: "Sydney", emoji: "🎡", chain: "XDC Apothem" },
};
const VRF_SUB_ID    = "80568780173052067359480512728291582443404092976312047101726106109476569951281";
const VRF_COORDINATOR = "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B";

// Generate a real secp256k1 key pair for ECIES encryption
const DEMO_PRIV_KEY     = secp256k1.utils.randomPrivateKey();
const DEMO_PUB_KEY_BYTES = secp256k1.getPublicKey(DEMO_PRIV_KEY, false);
const MOCK_PUBLIC_KEY   = "0x" + Buffer.from(DEMO_PUB_KEY_BYTES).toString("hex");

// ── Colors ──
const C = {
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m",
  magenta: "\x1b[35m", cyan: "\x1b[36m", white: "\x1b[37m", bold: "\x1b[1m",
  dim: "\x1b[2m", reset: "\x1b[0m", bgRed: "\x1b[41m", bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m", bgMagenta: "\x1b[45m",
};

// ── Helpers ──
const sleep  = (ms: number) => new Promise(r => setTimeout(r, ms));
const log    = async (msg: string, d = 200) => { console.log(msg); await sleep(d); };
const sep    = async () => { console.log(`${C.dim}${"─".repeat(64)}${C.reset}`); await sleep(100); };
const banner = async (text: string) => {
  console.log("");
  console.log(`${C.bold}${C.bgBlue}${C.white} ${"═".repeat(62)} ${C.reset}`);
  console.log(`${C.bold}${C.bgBlue}${C.white}  ${text.padEnd(61)}${C.reset}`);
  console.log(`${C.bold}${C.bgBlue}${C.white} ${"═".repeat(62)} ${C.reset}`);
  console.log(""); await sleep(400);
};

// Spinner + wait for on-chain condition
async function waitFor(
  check: () => Promise<boolean>,
  label: string,
  intervalMs = 4000,
  timeoutMs  = 180000,
): Promise<boolean> {
  const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  const start  = Date.now();
  let f = 0;
  while (Date.now() - start < timeoutMs) {
    if (await check()) {
      process.stdout.write(`\r  ${C.green}✓${C.reset} ${label}${" ".repeat(30)}\n`);
      return true;
    }
    const elapsed = Math.round((Date.now() - start) / 1000);
    process.stdout.write(
      `\r  ${C.magenta}${frames[f++ % frames.length]}${C.reset} ${C.dim}${label}... ${elapsed}s${C.reset}    `
    );
    await sleep(intervalMs);
  }
  process.stdout.write(`\r  ${C.red}✗${C.reset} Timeout: ${label}${" ".repeat(20)}\n`);
  return false;
}

// TX receipt — full hash + Etherscan link
async function showTxLink(receipt: any, label = "TX") {
  if (!receipt?.hash) return;
  await log(`  ${C.green}[${label}]${C.reset} ${C.bold}${receipt.hash}${C.reset}`);
  await log(`  ${C.dim}  Block    : #${receipt.blockNumber}${C.reset}`);
  await log(`  ${C.dim}  Etherscan: https://sepolia.etherscan.io/tx/${receipt.hash}${C.reset}`);
}

// VRF Coordinator ABI (event parsing)
const VRF_COORDINATOR_ABI = [
  "event RandomWordsRequested(bytes32 indexed keyHash, uint256 requestId, uint256 preSeed, uint256 indexed subId, uint16 minimumRequestConfirmations, uint32 callbackGasLimit, uint32 numWords, bytes extraArgs, address indexed sender)",
  "event RandomWordsFulfilled(uint256 indexed requestId, uint256 outputSeed, uint256 indexed subId, uint96 payment, bool nativePayment, bool success, bool onlyPremium)",
];

// Chainlink Data Feeds (Sepolia)
const FEED_ETH_USD  = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const FEED_LINK_USD = "0xc59E3633BAAC79493d908e63626716e204a45EdF";
const FEED_ABI = [
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function decimals() view returns (uint8)",
];

async function showDataFeeds(provider: any) {
  console.log("");
  await log(`${C.bold}${C.yellow}  CHAINLINK DATA FEEDS (live Sepolia):${C.reset}`);
  const feeds = [
    { name: "ETH / USD",  addr: FEED_ETH_USD  },
    { name: "LINK / USD", addr: FEED_LINK_USD },
  ];
  for (const f of feeds) {
    try {
      const c   = new ethers.Contract(f.addr, FEED_ABI, provider);
      const dec = await c.decimals();
      const res = await c.latestRoundData();
      const price = (Number(res[1]) / Math.pow(10, Number(dec))).toFixed(2);
      const age   = Math.floor(Date.now() / 1000 - Number(res[3]));
      await log(`  ${C.yellow}  ●${C.reset} ${C.bold}${f.name.padEnd(11)}${C.reset}: $${price.padStart(10)}  ${C.dim}(${age}s ago)${C.reset}`);
      await log(`  ${C.dim}    Feed    : ${f.addr}${C.reset}`);
      await log(`  ${C.dim}    Explorer: https://sepolia.etherscan.io/address/${f.addr}${C.reset}`);
    } catch {
      await log(`  ${C.dim}  ● ${f.name}: unavailable${C.reset}`);
    }
  }
  console.log("");
}

function findEvent(receipt: any, contract: any, eventName: string) {
  return receipt.logs.find((l: any) => {
    try {
      return contract.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === eventName;
    } catch { return false; }
  });
}

function parseEvent(contract: any, logEntry: any) {
  return contract.interface.parseLog({ topics: [...logEntry.topics], data: logEntry.data });
}

// ECIES — explain encryption (player's key pair, education only)
async function showECIESKeySetup() {
  await log(`${C.cyan}[ECIES]${C.reset} Generating secp256k1 key pair for clue encryption:`);
  await log(`  ${C.dim}Algorithm  : ECIES — secp256k1 ECDH + HKDF-SHA256 + AES-256-GCM${C.reset}`);
  await log(`  ${C.dim}Curve      : secp256k1 (same as Ethereum wallets)${C.reset}`);
  await log(`  ${C.dim}Pub key    : ${MOCK_PUBLIC_KEY.slice(0, 28)}... (65 bytes, stored on-chain)${C.reset}`);
  await log(`  ${C.dim}Priv key   : stays local — only the player can decrypt their clues${C.reset}`);
  await log(`${C.green}[ECIES]${C.reset} CRE will encrypt every clue with this public key`);
}

// ── Main ──
async function main() {
  if (network.name === "hardhat" || network.name === "localhost") {
    console.error("ERROR: Use --network sepolia");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  const provider  = signer.provider!;

  const GM_ADDR    = process.env.GAME_MASTER_ADDRESS!;
  const PROXY_ADDR = process.env.GAME_MASTER_PROXY_ADDRESS!;
  const NFT_ADDR   = process.env.MISSION_NFT_ADDRESS!;

  const gameMaster = await ethers.getContractAt("GameMaster", GM_ADDR, signer);
  const missionNFT = await ethers.getContractAt("MissionNFT", NFT_ADDR, signer);

  const demoStartTime = Date.now();

  // ================================================================
  //  PHASE 0 — SETUP
  // ================================================================
  await banner("CARMEN SANDIEGO ON-CHAIN — Hackathon Demo v2.0");

  const currentBlock = await provider.getBlockNumber();
  const balance      = ethers.formatEther(await provider.getBalance(signer.address));

  await log(`${C.cyan}[SETUP]${C.reset} Network   : ${C.bold}Ethereum Sepolia${C.reset} (chainId 11155111)`);
  await log(`${C.cyan}[SETUP]${C.reset} Block     : #${currentBlock}`);
  await log(`${C.cyan}[SETUP]${C.reset} Wallet    : ${signer.address}`);
  await log(`${C.cyan}[SETUP]${C.reset} Balance   : ${parseFloat(balance).toFixed(4)} ETH`);
  await sep();

  await log(`${C.green}  GameMaster  ${C.reset}: ${GM_ADDR}`);
  await log(`  ${C.dim}  https://sepolia.etherscan.io/address/${GM_ADDR}${C.reset}`);
  await log(`${C.green}  MissionNFT  ${C.reset}: ${NFT_ADDR}`);
  await log(`  ${C.dim}  https://sepolia.etherscan.io/address/${NFT_ADDR}${C.reset}`);
  await log(`${C.green}  Proxy (CRE) ${C.reset}: ${PROXY_ADDR}`);
  await log(`${C.green}  VRF Coord.  ${C.reset}: ${VRF_COORDINATOR}`);
  await log(`${C.green}  VRF Sub ID  ${C.reset}: ${VRF_SUB_ID.slice(0, 24)}...`);
  await log(`  ${C.dim}  https://vrf.chain.link/sepolia/${VRF_SUB_ID}${C.reset}`);
  await sep();

  await showDataFeeds(provider);

  // Detect CRE oracle — wait for cre-responder.ts to come online
  const creOracle = await gameMaster.creOracle();
  await log(`${C.magenta}[CRE]${C.reset} CRE Oracle : ${C.bold}${creOracle}${C.reset}`);

  if (creOracle.toLowerCase() === PROXY_ADDR.toLowerCase()) {
    // cre-responder.ts not started yet — oracle still at proxy address
    console.log("");
    console.log(`${C.bold}${C.yellow}  ╔══════════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.bold}${C.yellow}  ║  CRE Oracle not active — start the local oracle         ║${C.reset}`);
    console.log(`${C.bold}${C.yellow}  ║                                                         ║${C.reset}`);
    console.log(`${C.bold}${C.yellow}  ║  Open a SECOND terminal and run:                        ║${C.reset}`);
    console.log(`${C.bold}${C.yellow}  ║                                                         ║${C.reset}`);
    console.log(`${C.bold}${C.yellow}  ║  $ npx hardhat run scripts/cre-responder.ts \\           ║${C.reset}`);
    console.log(`${C.bold}${C.yellow}  ║        --network sepolia                                ║${C.reset}`);
    console.log(`${C.bold}${C.yellow}  ║                                                         ║${C.reset}`);
    console.log(`${C.bold}${C.yellow}  ╚══════════════════════════════════════════════════════════╝${C.reset}`);
    console.log("");
    const online = await waitFor(
      async () => {
        const o = await gameMaster.creOracle();
        return o.toLowerCase() !== PROXY_ADDR.toLowerCase();
      },
      "Waiting for cre-responder.ts to come online",
      5000,
      300000,
    );
    if (!online) {
      console.error("Timeout: start cre-responder.ts first.");
      process.exit(1);
    }
  }

  const activeOracle = await gameMaster.creOracle();
  await log(`${C.green}[CRE]${C.reset} ✓ Oracle active: ${C.bold}${activeOracle}${C.reset}`);
  await log(`  ${C.dim}cre-responder.ts is running — 6 workflows listening for events${C.reset}`);
  await sep();

  // Check active mission status
  const activeMissionRaw = await gameMaster.getPlayerActiveMission(signer.address);
  let activeMission = activeMissionRaw;
  if (activeMissionRaw > 0n) {
    const mCheck = await gameMaster.getMission(Number(activeMissionRaw));
    if (mCheck.status !== 1n) {
      await log(`${C.dim}[SETUP]${C.reset} Previous mission #${activeMissionRaw} ${mCheck.status === 2n ? "completed" : "cancelled"} — starting fresh`);
      activeMission = 0n;
    } else {
      await log(`${C.yellow}[SETUP]${C.reset} Resuming active mission #${activeMissionRaw}...`);
    }
  }

  // ================================================================
  //  PHASE 1 — PLAYER REGISTRATION + ECIES KEY (always runs)
  // ================================================================
  await banner("PHASE 1: Player Registration + ECIES Key Setup");

  await showECIESKeySetup();
  console.log("");

  const existingKey = await gameMaster.getPlayerPublicKey(signer.address);
  const keyNeedsUpdate = existingKey === "0x" || existingKey === "" ||
    existingKey.toLowerCase() !== MOCK_PUBLIC_KEY.toLowerCase();

  if (keyNeedsUpdate) {
    const isNew = existingKey === "0x" || existingKey === "";
    await log(`${C.yellow}[PLAYER]${C.reset} ${isNew ? "Registering player" : "Updating ECIES public key"} on-chain...`);
    if (!isNew) {
      await log(`  ${C.dim}Old key: ${existingKey.slice(0, 28)}... (updating to fresh session key)${C.reset}`);
    }
    const tx      = await gameMaster.registerPlayer(MOCK_PUBLIC_KEY);
    const receipt = await tx.wait();
    await log(`${C.green}[CONTRACT]${C.reset} ${C.bold}${isNew ? "PlayerRegistered" : "PublicKey updated"}${C.reset}!`);
    await showTxLink(receipt, "CONTRACT");
  } else {
    await log(`${C.green}  ✓${C.reset} Player registered — public key matches current session`);
    await log(`  ${C.dim}key: ${existingKey.slice(0, 28)}...${C.reset}`);
  }
  await log(`${C.green}  ✓${C.reset} CRE will now encrypt all clues with this public key`);

  // ================================================================
  //  PHASE 2 — MISSION START + VRF + CRE BRIEFING
  // ================================================================
  let missionId: number;

  if (activeMission === 0n) {
    await banner("PHASE 2: Mission Start + Chainlink VRF v2.5 + CRE Briefing");

    await log(`${C.yellow}[PLAYER]${C.reset} Requesting a new mission from ACME Chief...`);

    const startTx      = await gameMaster.startMission();
    const startReceipt = await startTx.wait();
    missionId = Number(await gameMaster.getPlayerActiveMission(signer.address));

    await log(`${C.green}[CONTRACT]${C.reset} ${C.bold}MissionStarted${C.reset} #${missionId}`);
    await showTxLink(startReceipt, "CONTRACT");
    console.log("");

    // Parse VRF requestId from receipt
    const vrfCoordContract = new ethers.Contract(VRF_COORDINATOR, VRF_COORDINATOR_ABI, provider);
    let vrfRequestId    = "";
    let vrfRequestBlock = Number(startReceipt?.blockNumber ?? 0);
    for (const logEntry of startReceipt?.logs ?? []) {
      try {
        const parsed = vrfCoordContract.interface.parseLog({ topics: [...logEntry.topics], data: logEntry.data });
        if (parsed?.name === "RandomWordsRequested") {
          vrfRequestId = (parsed.args as any).requestId?.toString() ?? "";
          break;
        }
      } catch { /* different contract */ }
    }

    await log(`${C.magenta}[VRF]${C.reset} Chainlink VRF v2.5 randomness request:`);
    await log(`  ${C.dim}Coordinator  : ${VRF_COORDINATOR}${C.reset}`);
    await log(`  ${C.dim}Sub ID       : ${VRF_SUB_ID.slice(0, 24)}...${C.reset}`);
    await log(`  ${C.dim}Key hash     : 0x787d74caea10b2b357790d...${C.reset}`);
    await log(`  ${C.dim}Gas limit    : 200,000 | Confirmations: 3${C.reset}`);
    if (vrfRequestId) {
      await log(`  ${C.magenta}Request ID   : ${C.bold}${vrfRequestId}${C.reset}`);
      await log(`  ${C.dim}  https://vrf.chain.link/sepolia/subscriptions${C.reset}`);
    }
    await log(`  ${C.dim}Request TX   : https://sepolia.etherscan.io/tx/${startReceipt?.hash}${C.reset}`);
    console.log("");

    // Wait for VRF fulfillment
    await log(`${C.magenta}[VRF]${C.reset} Waiting for Chainlink VRF fulfillment (~1-3 blocks)...`);
    const vrfFulfilled = await waitFor(
      async () => {
        const m = await gameMaster.getMission(missionId);
        return m.targetHash !== ethers.ZeroHash;
      },
      "VRF fulfillment from Chainlink DON",
      5000,
      150000,
    );
    if (!vrfFulfilled) { console.error("VRF timeout"); process.exit(1); }

    await log(`${C.green}[VRF]${C.reset} ✓ Random word received from Chainlink DON!`);

    // Try to find fulfillment TX
    if (vrfRequestId) {
      try {
        const filter = vrfCoordContract.filters["RandomWordsFulfilled"](BigInt(vrfRequestId));
        const events = await vrfCoordContract.queryFilter(filter, vrfRequestBlock, vrfRequestBlock + 300);
        if (events.length > 0) {
          const evt = events[0] as any;
          await log(`${C.magenta}[VRF]${C.reset} Fulfillment TX : ${C.bold}${evt.transactionHash}${C.reset}`);
          await log(`  ${C.dim}  Block    : #${evt.blockNumber}${C.reset}`);
          await log(`  ${C.dim}  Etherscan: https://sepolia.etherscan.io/tx/${evt.transactionHash}${C.reset}`);
        }
      } catch { /* queryFilter may not be supported */ }
    }

    // Read mission state (VRF is done, salt + targetHash are now available)
    const mission    = await gameMaster.getMission(missionId);
    const salt       = await gameMaster.missionSalts(missionId);
    const targetHash = mission.targetHash;

    console.log("");
    await log(`${C.magenta}[CRE]${C.reset} generate-briefing workflow triggered by MissionStarted event`);
    await log(`  ${C.dim}CRE derives salt from VRF word: keccak256(vrfWord, missionId)${C.reset}`);
    await log(`  ${C.dim}salt       = ${salt.slice(0, 18)}...${C.reset}`);
    await log(`  ${C.dim}targetHash = keccak256(chainId, salt) → COMMIT — contract is BLIND${C.reset}`);
    await log(`  ${C.dim}targetHash = ${targetHash.slice(0, 18)}...${C.reset}`);
    console.log("");
    await log(`${C.magenta}[CRE]${C.reset} Encrypting briefing with ECIES (player public key)...`);
    await log(`${C.magenta}[CRE]${C.reset} Calling AI (Groq/LLaMA 3.3 70B) for briefing narrative...`);

    // Wait for CRE simulation to deliver briefing (clue #1)
    await log(`${C.dim}  Waiting for CRE simulation to call receiveClue()...${C.reset}`);
    const briefingOk = await waitFor(
      async () => (await gameMaster.getMissionClues(missionId)).length >= 1,
      "CRE delivering briefing clue",
      4000,
      120000,
    );
    if (!briefingOk) { console.error("CRE briefing timeout"); process.exit(1); }

    await log(`${C.green}[CRE]${C.reset} ✓ Briefing delivered — encrypted with player's ECIES key`);
    await log(`${C.dim}  Verify ClueReceived event on Etherscan: https://sepolia.etherscan.io/address/${GM_ADDR}${C.reset}`);

  } else {
    missionId = Number(activeMission);
    await log(`${C.green}[RESUME]${C.reset} Resuming active mission #${missionId}`);
  }

  // Read final mission state for investigation
  const missionState = await gameMaster.getMission(missionId);
  const salt         = await gameMaster.missionSalts(missionId);
  const targetHash   = missionState.targetHash;

  // CRE-side reveal (shown for educational purpose — CRE knows this, contract does NOT)
  const carmenChainId = (() => {
    for (const cid of VALID_CHAIN_IDS) {
      const h = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]));
      if (h === targetHash) return cid;
    }
    return 0;
  })();
  const carmenCity = CITIES[carmenChainId];

  console.log("");
  await log(`${C.dim}[Note for demo]${C.reset} CRE brute-forces Carmen's location off-chain:`);
  for (const cid of VALID_CHAIN_IDS) {
    const h     = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]));
    const match = h === targetHash;
    await log(`  ${C.dim}keccak256(${cid}, salt) = ${h.slice(0, 14)}... ${match ? `${C.green}MATCH ✓ Carmen here${C.reset}` : "no match"}${C.reset}`, 100);
  }
  await log(`${C.bold}${C.red}  Carmen is in: ${carmenCity?.name} ${carmenCity?.emoji} (${carmenCity?.chain})${C.reset}`);
  await log(`  ${C.dim}Contract only sees the hash — location is HIDDEN until reveal${C.reset}`);

  // ================================================================
  //  PHASE 3 — INVESTIGATION LOOP (player only — CRE responds)
  // ================================================================
  await banner("PHASE 3: Investigation Loop — Player vs CRE Oracle");

  // Re-read targetHash right before investigations start in case carmen-moves fired during VRF/briefing
  const freshState     = await gameMaster.getMission(missionId);
  const freshTH        = freshState.targetHash;
  const freshCarmenId  = (() => {
    for (const cid of VALID_CHAIN_IDS) {
      const h = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]));
      if (h === freshTH) return cid;
    }
    return carmenChainId; // fallback to original
  })();
  if (freshCarmenId !== carmenChainId) {
    await log(`${C.yellow}[SETUP]${C.reset} Carmen moved during VRF wait! Updating plan: ${CITIES[carmenChainId]?.name} → ${C.bold}${CITIES[freshCarmenId]?.name}${C.reset}`);
  }
  let actualCarmenChainId = freshCarmenId;

  const wrongCities        = VALID_CHAIN_IDS.filter(c => c !== actualCarmenChainId);
  const investigationOrder = [...wrongCities, actualCarmenChainId];

  await log(`${C.cyan}[GAME]${C.reset} Investigation plan: ${investigationOrder.length} cities`);
  await log(`  ${C.dim}Investigations: wrong cities first, then correct city (triggers auto-capture)${C.reset}`);
  await log(`  ${C.dim}CRE oracle    : watches InvestigationSubmitted → calls receiveClue()${C.reset}`);
  await log(`  ${C.dim}Auto-capture  : after 3+ clues + correct city → CRE calls resolveCapture()${C.reset}`);
  console.log("");

  const clueResults: { city: string; isCorrect: boolean }[] = [];

  for (let i = 0; i < investigationOrder.length; i++) {
    // For the last investigation: re-read on-chain targetHash in case carmen-moves fired
    if (i === investigationOrder.length - 1) {
      const currentState = await gameMaster.getMission(missionId);
      const currentTH    = currentState.targetHash;
      let currentCarmen  = 0;
      for (const cid of VALID_CHAIN_IDS) {
        const h = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]));
        if (h === currentTH) { currentCarmen = cid; break; }
      }
      if (currentCarmen !== 0 && currentCarmen !== investigationOrder[i]) {
        await log(`${C.yellow}  [CRE]${C.reset} Carmen moved mid-game! Now in ${C.bold}${CITIES[currentCarmen]?.name}${C.reset} — updating final investigation`);
        investigationOrder[i] = currentCarmen;
        actualCarmenChainId   = currentCarmen; // update for summary display
      }
    }

    const invChain  = investigationOrder[i];
    const cityInfo  = CITIES[invChain];
    // isCorrect: last investigation is always intended to be correct (even if carmen moved)
    const isCorrect = i === investigationOrder.length - 1;

    const cluesBefore = (await gameMaster.getMissionClues(missionId)).length;

    console.log(`${C.bold}${C.cyan}  ┌─ Investigation #${i + 1}: ${cityInfo.name} ${cityInfo.emoji} ${"─".repeat(35)}┐${C.reset}`);
    console.log(`${C.cyan}  │${C.reset}`);
    await log(`${C.yellow}  [PLAYER]${C.reset} Traveling to ${C.bold}${cityInfo.name}${C.reset} (${cityInfo.chain})`);
    await log(`${C.yellow}  [PLAYER]${C.reset} Submitting submitInvestigation(${invChain}) on-chain...`);

    let invTx: any, invReceipt: any;
    for (let att = 0; att < 3; att++) {
      try {
        if (att > 0) {
          await log(`  ${C.yellow}⚠ Retry (nonce conflict) — waiting 5s...${C.reset}`);
          await new Promise(r => setTimeout(r, 5000));
        }
        invTx      = await gameMaster.submitInvestigation(invChain);
        invReceipt = await invTx.wait();
        break;
      } catch (e: any) {
        const msg = e.message ?? "";
        if (att < 2 && (msg.includes("replacement transaction") || msg.includes("nonce has already") || msg.includes("already known"))) continue;
        throw e;
      }
    }

    await log(`${C.green}  [CONTRACT]${C.reset} ${C.bold}InvestigationSubmitted${C.reset}(chainId=${invChain})`);
    await showTxLink(invReceipt, "CONTRACT");
    console.log(`${C.cyan}  │${C.reset}`);

    await log(`${C.magenta}  [CRE]${C.reset} mission-start workflow triggered by InvestigationSubmitted event`);
    await log(`  ${C.dim}  CRE checks: keccak256(${invChain}, salt) ${isCorrect ? "= targetHash → TRUE clue" : "≠ targetHash → false clue"}${C.reset}`);
    await log(`  ${C.dim}  CRE calls Groq API for AI-generated clue...${C.reset}`);
    await log(`  ${C.dim}  CRE encrypts with ECIES (secp256k1 + AES-256-GCM)...${C.reset}`);
    console.log(`${C.cyan}  │${C.reset}`);

    // Wait for CRE to deliver clue — OR mission completed/failed
    let missionCapturedEarly = false;
    let missionFailedEarly   = false;
    const clueOk = await waitFor(
      async () => {
        if ((await gameMaster.getMissionClues(missionId)).length > cluesBefore) return true;
        const m = await gameMaster.getMission(missionId);
        if (m.status === 2n) { missionCapturedEarly = true; return true; }
        if (m.status === 3n) { missionFailedEarly   = true; return true; }
        return false;
      },
      `CRE oracle delivering clue for ${cityInfo.name}`,
      3000,
      120000,
    );

    if (!clueOk) {
      await log(`${C.red}  [ERROR]${C.reset} CRE did not respond in time. Is cre workflow simulate running?`);
      process.exit(1);
    }

    if (missionFailedEarly) {
      await log(`${C.red}  [FAIL]${C.reset} Mission failed (likely MAX_BLOCKS exceeded — start a fresh run).`);
      console.log(`${C.bold}${C.cyan}  └${"─".repeat(57)}┘${C.reset}`);
      process.exit(1);
    }

    if (missionCapturedEarly) {
      await log(`${C.green}  [CRE]${C.reset} Carmen already captured! (carmen-moves may have shifted location)`);
      console.log(`${C.bold}${C.cyan}  └${"─".repeat(57)}┘${C.reset}`);
      break;
    }

    // Read delivered clue
    const clues     = await gameMaster.getMissionClues(missionId);
    const lastClue  = clues[clues.length - 1];
    const clueTypes = ["Text", "Audio", "Image"];
    const strength  = Number(lastClue.strength);
    const isEvidence = strength > 65;

    const evidenceTag = isEvidence
      ? `${C.bold}${C.green}[EVIDENCE ✓]${C.reset}`
      : `${C.dim}[not evidence]${C.reset}`;

    console.log(`${isEvidence ? C.green : C.yellow}  │  CLUE #${clues.length} — ${clueTypes[Number(lastClue.clueType)] ?? "Text"} | Strength: ${C.bold}${strength}/100${C.reset}  ${evidenceTag}`);
    await log(`${C.green}  [CRE]${C.reset} ✓ receiveClue() submitted on-chain`);
    await log(`  ${C.dim}  Ciphertext: 0x${lastClue.ipfsPointer?.slice(0, 24)}... (ECIES-encrypted)${C.reset}`);
    await log(`  ${C.dim}  Verify: https://sepolia.etherscan.io/address/${GM_ADDR}#events${C.reset}`);

    if (isEvidence) {
      await log(`${C.magenta}  [CRE]${C.reset} Strength > 65 → delivering Carmen wallet fragment (encrypted)`);
    }

    if (isCorrect && clues.length >= 4) {
      console.log(`${C.cyan}  │${C.reset}`);
      await log(`${C.bold}${C.magenta}  [CRE]${C.reset} ${C.bold}Auto-capture triggered!${C.reset} 3+ clues + correct city`);
      await log(`  ${C.dim}  CRE verifies: keccak256(${carmenChainId}, salt) == targetHash${C.reset}`);
      await log(`  ${C.dim}  CRE calls resolveCapture(missionId, ${carmenChainId}, salt)...${C.reset}`);
    }

    console.log(`${C.bold}${C.cyan}  └${"─".repeat(57)}┘${C.reset}`);
    console.log("");
    clueResults.push({ city: cityInfo.name, isCorrect });
  }

  // ================================================================
  //  PHASE 4 — CAPTURE (auto-triggered by CRE)
  // ================================================================
  await banner("PHASE 4: Capture + Commit-Reveal Verification");

  await log(`${C.magenta}[CRE]${C.reset} Waiting for auto-capture (resolveCapture)...`);
  await log(`  ${C.dim}CRE performs REVEAL: sends chainId + salt to contract${C.reset}`);
  await log(`  ${C.dim}Contract verifies: keccak256(chainId, salt) == storedTargetHash${C.reset}`);

  const captureOk = await waitFor(
    async () => {
      const m = await gameMaster.getMission(missionId);
      return m.status === 2n;
    },
    "CRE submitting resolveCapture()",
    3000,
    120000,
  );
  if (!captureOk) { console.error("Capture timeout"); process.exit(1); }

  // Read capture details from events (query last 10 blocks — Alchemy free tier limit)
  const captureFilter  = gameMaster.filters.CarmenCaptured(missionId);
  const latestBlock    = await provider.getBlockNumber();
  const captureEvents  = await gameMaster.queryFilter(captureFilter, Math.max(0, latestBlock - 9), latestBlock);
  let blocksUsed = 0, reward = 0, tokenId = 0;
  if (captureEvents.length > 0) {
    const evt = captureEvents[captureEvents.length - 1] as any;
    blocksUsed = Number(evt.args[2]);
    reward     = Number(evt.args[3]);
    const txRec = await provider.getTransactionReceipt(evt.transactionHash);
    await log(`${C.green}[CRE]${C.reset} ✓ resolveCapture() confirmed!`);
    await log(`  ${C.green}[TX]${C.reset} ${C.bold}${evt.transactionHash}${C.reset}`);
    await log(`  ${C.dim}  Block    : #${evt.blockNumber}${C.reset}`);
    await log(`  ${C.dim}  Etherscan: https://sepolia.etherscan.io/tx/${evt.transactionHash}${C.reset}`);

    // Parse NFT mint from the same TX
    if (txRec) {
      const nftFilter = missionNFT.filters.MissionNFTMinted?.();
      if (nftFilter) {
        const nftLog = txRec.logs.find((l: any) => {
          try { return missionNFT.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === "MissionNFTMinted"; }
          catch { return false; }
        });
        if (nftLog) {
          const parsed = missionNFT.interface.parseLog({ topics: [...nftLog.topics], data: nftLog.data });
          tokenId = Number(parsed?.args[0]);
        }
      }
    }
  }

  const tierName = reward >= 100 ? "GOLD" : reward >= 75 ? "SILVER" : reward >= 50 ? "BRONZE" : "COPPER";

  console.log("");
  console.log(`${C.bgGreen}${C.bold}${C.white}                                                              ${C.reset}`);
  console.log(`${C.bgGreen}${C.bold}${C.white}   CARMEN SANDIEGO HAS BEEN CAPTURED!                         ${C.reset}`);
  console.log(`${C.bgGreen}${C.bold}${C.white}   Location : ${(carmenCity.name + " " + carmenCity.emoji + " (" + carmenCity.chain + ")").padEnd(48)}${C.reset}`);
  console.log(`${C.bgGreen}${C.bold}${C.white}   Rank     : ${tierName.padEnd(48)}${C.reset}`);
  console.log(`${C.bgGreen}${C.bold}${C.white}   Blocks   : ${String(blocksUsed).padEnd(48)}${C.reset}`);
  console.log(`${C.bgGreen}${C.bold}${C.white}                                                              ${C.reset}`);
  console.log("");

  await log(`${C.green}  [EVENT]${C.reset} ${C.bold}CarmenCaptured${C.reset}(mission=#${missionId}, reward=${reward}, blocks=${blocksUsed})`);
  if (tokenId > 0) {
    await log(`${C.green}  [EVENT]${C.reset} ${C.bold}MissionNFTMinted${C.reset}(tokenId=#${tokenId}, owner=${signer.address.slice(0, 14)}...)`);
  }

  // ================================================================
  //  PHASE 5 — NFT TROPHY (generate-finale CRE workflow)
  // ================================================================
  await banner("PHASE 5: NFT Trophy — generate-finale CRE Workflow");

  await log(`${C.magenta}[CRE]${C.reset} generate-finale workflow triggered by CarmenCaptured event`);
  await log(`  ${C.dim}CRE calls Groq API for victory narrative...${C.reset}`);
  await log(`  ${C.dim}CRE renders SVG trophy (on-chain, no IPFS)...${C.reset}`);
  await log(`  ${C.dim}CRE calls setMissionTokenURI() with base64 ERC-721 metadata...${C.reset}`);

  if (tokenId > 0) {
    const uriSet = await waitFor(
      async () => {
        try {
          const uri = await missionNFT.tokenURI(tokenId);
          return uri.startsWith("data:");
        } catch { return false; }
      },
      "CRE setting NFT token URI",
      4000,
      120000,
    );

    if (uriSet) {
      const finalURI = await missionNFT.tokenURI(tokenId);
      await log(`${C.green}[CRE]${C.reset} ✓ NFT trophy URI set on-chain!`);
      await log(`  ${C.dim}  Token URI: data:application/json;base64,... (${finalURI.length} chars)${C.reset}`);
      await log(`  ${C.dim}  NFT: https://sepolia.etherscan.io/token/${NFT_ADDR}?a=${tokenId}${C.reset}`);
      await log(`  ${C.dim}  OpenSea (Sepolia): https://testnets.opensea.io/assets/sepolia/${NFT_ADDR}/${tokenId}${C.reset}`);
    }
  }

  // ================================================================
  //  PHASE 6 — FINAL SUMMARY
  // ================================================================
  await banner("DEMO COMPLETE — On-Chain Verification");

  const finalMission = await gameMaster.getMission(missionId);
  const playerFree   = (await gameMaster.getPlayerActiveMission(signer.address)) === 0n;
  const finalBlock   = await provider.getBlockNumber();
  const elapsed      = Math.round((Date.now() - demoStartTime) / 1000);
  const elapsedMin   = Math.floor(elapsed / 60);
  const elapsedSec   = elapsed % 60;

  let nftOwner = "N/A", finalTokenURI = "";
  if (tokenId > 0) {
    try {
      nftOwner       = await missionNFT.ownerOf(tokenId);
      finalTokenURI  = await missionNFT.tokenURI(tokenId);
    } catch { /* */ }
  }

  const invStr = clueResults.map(r => `${r.city}${r.isCorrect ? "✓" : "✗"}`).join(" → ");

  console.log(`${C.bold}${C.cyan}  ╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ║  MISSION REPORT                                     ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ╠══════════════════════════════════════════════════════╣${C.reset}`);
  await log(`${C.cyan}  ║${C.reset}  Network          : Ethereum Sepolia (11155111)`);
  await log(`${C.cyan}  ║${C.reset}  Mission ID        : #${missionId}`);
  await log(`${C.cyan}  ║${C.reset}  Carmen was in     : ${carmenCity.name} ${carmenCity.emoji} (${carmenCity.chain})`);
  await log(`${C.cyan}  ║${C.reset}  Investigations    : ${invStr}`);
  await log(`${C.cyan}  ║${C.reset}  Reward            : ${reward} pts — ${C.bold}${tierName} RANK${C.reset}`);
  await log(`${C.cyan}  ║${C.reset}  Blocks used       : ${blocksUsed}`);
  console.log(`${C.bold}${C.cyan}  ╠══════════════════════════════════════════════════════╣${C.reset}`);
  await log(`${C.cyan}  ║${C.reset}  Mission status    : ${finalMission.status === 2n ? `${C.green}Completed ✓${C.reset}` : "???"}`);
  await log(`${C.cyan}  ║${C.reset}  Player free        : ${playerFree ? `${C.green}Yes ✓${C.reset}` : "No"}`);
  if (tokenId > 0) {
    const ownerOk = nftOwner.toLowerCase() === signer.address.toLowerCase();
    await log(`${C.cyan}  ║${C.reset}  NFT tokenId       : #${tokenId} (owner: ${ownerOk ? `${C.green}player ✓${C.reset}` : nftOwner.slice(0, 14)})`);
    await log(`${C.cyan}  ║${C.reset}  Token URI         : ${finalTokenURI ? `on-chain SVG (${finalTokenURI.length} chars) ${C.green}✓${C.reset}` : `${C.yellow}not set${C.reset}`}`);
  }
  await log(`${C.cyan}  ║${C.reset}  Current block     : #${finalBlock}`);
  await log(`${C.cyan}  ║${C.reset}  Demo elapsed      : ${elapsedMin > 0 ? `${elapsedMin}m ` : ""}${elapsedSec}s (real testnet time)`);
  console.log(`${C.bold}${C.cyan}  ╚══════════════════════════════════════════════════════╝${C.reset}`);
  console.log("");

  // Chainlink services summary
  console.log(`${C.bold}  CHAINLINK SERVICES — ACTIVE IN THIS DEMO:${C.reset}`);
  console.log(`${C.dim}  ┌────────────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.green}  │ CRE (Runtime Environment)${C.reset}  7 workflows, event-driven oracle`);
  console.log(`${C.green}  │ VRF v2.5${C.reset}                   Provably fair city selection`);
  console.log(`${C.green}  │ Data Feeds${C.reset}                  ETH/USD + LINK/USD (Sepolia)`);
  console.log(`${C.dim}  │ CCIP (cross-chain)${C.reset}         CityNode messaging (deployed)`);
  console.log(`${C.dim}  ├────────────────────────────────────────────────────────┤${C.reset}`);
  console.log(`${C.green}  │ AI (Groq / LLaMA 3.3 70B)${C.reset} Contextual clue + NFT narrative`);
  console.log(`${C.green}  │ ECIES secp256k1${C.reset}            End-to-end clue encryption`);
  console.log(`${C.green}  │ Commit-Reveal${C.reset}              Zero-knowledge location`);
  console.log(`${C.green}  │ ERC-721 (on-chain SVG)${C.reset}     Mission trophy NFT`);
  console.log(`${C.dim}  └────────────────────────────────────────────────────────┘${C.reset}`);
  console.log(`  ${C.dim}GameMaster: https://sepolia.etherscan.io/address/${GM_ADDR}${C.reset}`);
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
