/**
 * ================================================================
 *  CRE Responder — Chainlink CRE Local Oracle
 * ================================================================
 *
 *  Simulates the 6 Chainlink CRE workflows running on-chain.
 *  Watches events and responds like the deployed DON workflows:
 *
 *    Workflow              Trigger                  Action
 *    ─────────────────────────────────────────────────────────
 *    player-check          PlayerCheckRequested     recordCheckResult
 *    player-registration   RegistrationRequested    registerPlayer
 *    generate-briefing     MissionStarted + VRF     receiveClue (type=0)
 *    mission-start         InvestigationSubmitted   receiveClue + walletFragment
 *    carmen-moves          Periodic (3 min)         updateTarget
 *    generate-finale       CarmenCaptured           setMissionTokenURI
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
import * as fs from "fs";
import * as path from "path";

// ── Load scenario data ──
const scenariosPath = path.resolve(__dirname, "../../cre-workflows/data/scenarios.json");
const scenariosData = JSON.parse(fs.readFileSync(scenariosPath, "utf-8"));

type ScenarioClue = { type: number; text: string };
type Scenario = {
  id: string; title: string; briefing: string; captureMessage: string;
  cities: Record<string, { name: string; emoji: string; chain: string }>;
  cityClues: Record<string, { landmark: string; culture: string }>;
  clues: { true: ScenarioClue[]; false: ScenarioClue[] };
};

function getScenario(missionId: number): Scenario {
  const idx = (missionId - 1) % scenariosData.scenarios.length;
  return scenariosData.scenarios[idx] as Scenario;
}

// ── Constants ──
const VALID_CHAIN_IDS = [421614, 84532, 51];
const CITIES: Record<number, { name: string; emoji: string; chain: string }> = {
  421614: { name: "Tokyo",  emoji: "🗼", chain: "Arbitrum Sepolia" },
  84532:  { name: "Paris",  emoji: "🗼", chain: "Base Sepolia" },
  51:     { name: "Sydney", emoji: "🎡", chain: "XDC Apothem" },
};
const ACTION_RECEIVE_CLUE = 1;
const ACTION_RESOLVE_CAPTURE = 2;
const ACTION_UPDATE_TARGET = 3;
const ACTION_RECEIVE_WALLET_FRAGMENT = 4;
const ACTION_SET_TOKEN_URI = 6;
const FRAGMENT_LENGTH = 5;

// ── Colors ──
const C = {
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m",
  magenta: "\x1b[35m", cyan: "\x1b[36m", bold: "\x1b[1m", dim: "\x1b[2m",
  reset: "\x1b[0m", bgGreen: "\x1b[42m", bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m", white: "\x1b[37m", bgBlue: "\x1b[44m",
};

const time = () => new Date().toLocaleTimeString("pt-BR", { hour12: false });
const log  = (msg: string) => console.log(`${C.dim}[${time()}]${C.reset} ${msg}`);
const sep  = () => console.log(`${C.dim}  ${"─".repeat(60)}${C.reset}`);

// Pretty workflow section banner
function wfOpen(workflow: string, trigger: string, icon = "⚡") {
  console.log("");
  const title = `${icon}  ${workflow.toUpperCase()}`;
  console.log(`${C.bold}${C.cyan}  ╔══ ${title} ${"═".repeat(Math.max(0, 52 - title.length))}╗${C.reset}`);
  console.log(`${C.cyan}  ║${C.reset}  Trigger : ${C.bold}${trigger}${C.reset}`);
}
function wfClose() {
  console.log(`${C.dim}  ${"─".repeat(60)}${C.reset}`);
  console.log("");
}

// Send TX, wait, log hash + Etherscan — retries on nonce conflicts
async function sendTx(txFactory: () => Promise<any>, label: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        log(`  ${C.yellow}⚠ Retry attempt ${attempt}/2 — waiting 4s for nonce to settle...${C.reset}`);
        await new Promise(r => setTimeout(r, 4000));
      }
      log(`  ${C.yellow}→${C.reset} Sending: ${C.bold}${label}${C.reset}`);
      const tx = await txFactory();
      log(`  ${C.dim}  Submitted : ${tx.hash}${C.reset}`);
      const rec = await tx.wait();
      log(`  ${C.green}  ✓ Confirmed: ${C.bold}${rec.hash}${C.reset}`);
      log(`  ${C.dim}  Block      : #${rec.blockNumber}${C.reset}`);
      log(`  ${C.dim}  Gas used   : ${rec.gasUsed?.toString()}${C.reset}`);
      log(`  ${C.dim}  Etherscan  : https://sepolia.etherscan.io/tx/${rec.hash}${C.reset}`);
      return rec;
    } catch (e: any) {
      const msg = e.message ?? "";
      const isRetryable = msg.includes("replacement transaction") || msg.includes("nonce has already") || msg.includes("already known") || msg.includes("Too Many Requests") || msg.includes("rate limit") || msg.includes("429");
      if (attempt < 2 && isRetryable) {
        const waitMs = msg.includes("Too Many Requests") || msg.includes("429") ? 8000 : 4000;
        log(`  ${C.yellow}⚠ Retry attempt ${attempt + 1}/2 — waiting ${waitMs / 1000}s (${msg.slice(0, 40)})...${C.reset}`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw e;
    }
  }
}

// ── ECIES secp256k1 ──
function eciesEncrypt(recipientPubKey: Uint8Array, plaintext: string): string {
  const ephPriv = secp256k1.utils.randomPrivateKey();
  const ephPub  = secp256k1.getPublicKey(ephPriv, false);
  const shared  = secp256k1.getSharedSecret(ephPriv, recipientPubKey);
  const aesKey  = hkdf(sha256, shared.slice(1, 33), undefined, "carmen-ecies", 32);
  const iv      = crypto.randomBytes(12);
  const cipher  = crypto.createCipheriv("aes-256-gcm", Buffer.from(aesKey), iv);
  const enc     = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag     = cipher.getAuthTag();
  return Buffer.concat([Buffer.from(ephPub), Buffer.from(iv), enc, tag]).toString("hex");
}

// ── CRE Logic ──
function bruteForceCarmenCity(salt: string, targetHash: string): number {
  for (const cid of VALID_CHAIN_IDS) {
    const h = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]));
    if (h === targetHash) return cid;
  }
  return 0;
}

function calculateStrength(salt: string, clueIndex: number, isCorrect: boolean): number {
  const hash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "string"], [salt, clueIndex, "strength"]
    )
  );
  const raw = Number(BigInt(hash) % BigInt(256));
  return isCorrect ? 40 + (raw % 56) : 20 + (raw % 36);
}

function selectClue(scenario: Scenario, cluesReceived: number, isCorrect: boolean): ScenarioClue {
  const pool = isCorrect ? scenario.clues.true : scenario.clues.false;
  return pool[cluesReceived % pool.length];
}

function buildBriefing(scenario: Scenario, missionId: number, cities: number[]): string {
  const cityLines = cities.map(cid => {
    const c = CITIES[cid];
    const sc = scenario.cities[cid.toString()];
    return `  • ${sc?.name || c?.name || cid} (${c?.chain || "unknown"})`;
  }).join("\n");

  return [
    `╔══════════════════════════════════════════════╗`,
    `║   ACME DETECTIVE AGENCY — CLASSIFIED         ║`,
    `╚══════════════════════════════════════════════╝`,
    ``,
    `MISSION #${missionId}: ${scenario.title.toUpperCase()}`,
    `CLASSIFICATION: TOP SECRET — INITIAL BRIEFING`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    scenario.briefing,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `POSSIBLE LOCATIONS:`,
    cityLines,
    ``,
    `The blockchain trail has gone cold. Start tracking.`,
    ``,
    `— Chief, ACME Detective Agency`,
  ].join("\n");
}

function parsePubKey(hex: string): Uint8Array | null {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length !== 130) return null;
  const bytes = new Uint8Array(65);
  for (let i = 0; i < 65; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  // Validate it's actually on the secp256k1 curve
  try { secp256k1.ProjectivePoint.fromHex(bytes); } catch { return null; }
  return bytes;
}

function getRewardTier(reward: number) {
  if (reward >= 100) return { name: "GOLD",   color: "#FFD700", accent: "#B8860B", icon: "🥇" };
  if (reward >= 75)  return { name: "SILVER", color: "#C0C0C0", accent: "#808080", icon: "🥈" };
  if (reward >= 50)  return { name: "BRONZE", color: "#CD7F32", accent: "#8B4513", icon: "🥉" };
  return                    { name: "COPPER", color: "#B87333", accent: "#6B3A1F", icon: "🏅" };
}

function generateTrophySVG(
  missionId: number, scenario: Scenario,
  tier: { name: string; color: string; accent: string },
  cityName: string, blocksUsed: number, clues: number, evidence: number,
): string {
  const title = scenario.title.length > 35 ? scenario.title.slice(0, 32) + "..." : scenario.title;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a1a;stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#1a0a2e;stop-opacity:1"/>
    </linearGradient>
    <linearGradient id="trophy" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${tier.color};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${tier.accent};stop-opacity:1"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="400" height="500" fill="url(#bg)" rx="16"/>
  <rect x="8" y="8" width="384" height="484" fill="none" stroke="${tier.color}" stroke-width="2" rx="12" opacity="0.6"/>
  <text x="200" y="40" text-anchor="middle" fill="#666" font-family="monospace" font-size="10">ACME DETECTIVE AGENCY</text>
  <text x="200" y="60" text-anchor="middle" fill="${tier.color}" font-family="monospace" font-size="14" font-weight="bold" filter="url(#glow)">MISSION COMPLETE</text>
  <g transform="translate(200,155)">
    <path d="M-40,-50 L40,-50 L50,-40 L30,0 L20,10 L20,30 L-20,30 L-20,10 L-30,0 L-50,-40 Z" fill="url(#trophy)" filter="url(#glow)"/>
    <rect x="-25" y="30" width="50" height="8" fill="${tier.accent}" rx="2"/>
    <rect x="-30" y="38" width="60" height="6" fill="${tier.color}" rx="2"/>
    <circle cx="0" cy="-25" r="12" fill="none" stroke="${tier.accent}" stroke-width="2"/>
    <text x="0" y="-20" text-anchor="middle" fill="${tier.accent}" font-family="monospace" font-size="12" font-weight="bold">${tier.name.charAt(0)}</text>
  </g>
  <text x="200" y="220" text-anchor="middle" fill="${tier.color}" font-family="monospace" font-size="20" font-weight="bold" filter="url(#glow)">${tier.name} RANK</text>
  <line x1="40" y1="240" x2="360" y2="240" stroke="${tier.color}" stroke-width="1" opacity="0.3"/>
  <text x="200" y="265" text-anchor="middle" fill="#ccc" font-family="monospace" font-size="11">MISSION #${missionId}</text>
  <text x="200" y="285" text-anchor="middle" fill="#fff" font-family="monospace" font-size="10">${title}</text>
  <line x1="40" y1="305" x2="360" y2="305" stroke="${tier.color}" stroke-width="1" opacity="0.3"/>
  <text x="40" y="330" fill="#888" font-family="monospace" font-size="10">CAPTURED IN</text>
  <text x="360" y="330" text-anchor="end" fill="#fff" font-family="monospace" font-size="10">${cityName}</text>
  <text x="40" y="355" fill="#888" font-family="monospace" font-size="10">BLOCKS USED</text>
  <text x="360" y="355" text-anchor="end" fill="#fff" font-family="monospace" font-size="10">${blocksUsed}</text>
  <text x="40" y="380" fill="#888" font-family="monospace" font-size="10">CLUES COLLECTED</text>
  <text x="360" y="380" text-anchor="end" fill="#fff" font-family="monospace" font-size="10">${clues}</text>
  <text x="40" y="405" fill="#888" font-family="monospace" font-size="10">EVIDENCE GATHERED</text>
  <text x="360" y="405" text-anchor="end" fill="#fff" font-family="monospace" font-size="10">${evidence}</text>
  <line x1="40" y1="425" x2="360" y2="425" stroke="${tier.color}" stroke-width="1" opacity="0.3"/>
  <text x="200" y="450" text-anchor="middle" fill="#555" font-family="monospace" font-size="8">CARMEN SANDIEGO ON-CHAIN</text>
  <text x="200" y="465" text-anchor="middle" fill="#555" font-family="monospace" font-size="8">CHAINLINK CRE + VRF v2.5</text>
  <text x="200" y="485" text-anchor="middle" fill="${tier.color}" font-family="monospace" font-size="9" opacity="0.7">convergence hackathon 2025</text>
</svg>`;
}

function buildFinaleNarrative(
  scenario: Scenario, missionId: number, cityName: string,
  tierName: string, blocksUsed: number, clues: number,
): string {
  const perf =
    tierName === "GOLD"   ? "Your flawless investigation earned the highest distinction."
    : tierName === "SILVER" ? "A thorough investigation — well done, detective."
    : tierName === "BRONZE" ? "Carmen put up a fight, but your persistence paid off."
    : "Against all odds, you tracked her down.";
  return [
    `MISSION #${missionId} — ${tierName} RANK`,
    `OPERATION: ${scenario.title.toUpperCase()}`,
    `LOCATION: ${cityName} | BLOCKS: ${blocksUsed} | CLUES: ${clues}`,
    ``, scenario.captureMessage || "Carmen Sandiego has been captured!", ``, perf,
    ``, `— Chief, ACME Detective Agency`,
  ].join("\n");
}

// ── Main ──
async function main() {
  if (network.name === "hardhat" || network.name === "localhost") {
    console.error("ERROR: Use --network sepolia");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();

  const GM_ADDR       = process.env.GAME_MASTER_ADDRESS!;
  const PROXY_ADDR    = process.env.GAME_MASTER_PROXY_ADDRESS!;
  const NFT_ADDR      = process.env.MISSION_NFT_ADDRESS!;
  const REGISTRY_ADDR = process.env.PLAYER_REGISTRY_ADDRESS!;

  const gameMaster    = await ethers.getContractAt("GameMaster",      GM_ADDR,       signer);
  const proxy         = await ethers.getContractAt("GameMasterProxy", PROXY_ADDR,    signer);
  const missionNFT    = await ethers.getContractAt("MissionNFT",      NFT_ADDR,      signer);
  const playerRegistry = await ethers.getContractAt("PlayerRegistry", REGISTRY_ADDR, signer);

  const provider  = signer.provider!;
  const balance   = ethers.formatEther(await provider.getBalance(signer.address));
  const block     = await provider.getBlockNumber();

  // ── Ensure signer is CRE oracle ──
  const currentCRE = await gameMaster.creOracle();
  if (currentCRE.toLowerCase() !== signer.address.toLowerCase()) {
    console.log(`\n${C.yellow}[SETUP]${C.reset} Setting CRE oracle to signer...`);
    await sendTx(() => gameMaster.setCREOracle(signer.address), "setCREOracle(signer)");
    console.log(`${C.green}[SETUP]${C.reset} ✓ CRE oracle ready`);
  }

  // ── Ensure signer is gameMaster on PlayerRegistry ──
  const registryGM = await playerRegistry.gameMaster();
  if (registryGM.toLowerCase() !== signer.address.toLowerCase()) {
    try {
      await sendTx(() => playerRegistry.setGameMaster(signer.address), "PlayerRegistry.setGameMaster");
    } catch (e: any) {
      log(`${C.yellow}[WARN]${C.reset} PlayerRegistry.setGameMaster: ${e.message?.slice(0, 80)}`);
    }
  }

  // ── Startup Banner ──
  console.log("");
  console.log(`${C.bold}${C.bgBlue}${C.white} ${"═".repeat(62)} ${C.reset}`);
  console.log(`${C.bold}${C.bgBlue}${C.white}  CHAINLINK CRE LOCAL ORACLE — Carmen Sandiego On-Chain      ${C.reset}`);
  console.log(`${C.bold}${C.bgBlue}${C.white} ${"═".repeat(62)} ${C.reset}`);
  console.log("");
  log(`${C.green}Network${C.reset}  : Ethereum Sepolia (chainId 11155111)`);
  log(`${C.green}Block${C.reset}    : #${block}`);
  log(`${C.green}Signer${C.reset}   : ${C.bold}${signer.address}${C.reset}  (${parseFloat(balance).toFixed(4)} ETH)`);
  console.log("");
  log(`${C.green}GameMaster${C.reset}      : ${GM_ADDR}`);
  log(`  ${C.dim}https://sepolia.etherscan.io/address/${GM_ADDR}${C.reset}`);
  log(`${C.green}GameMasterProxy${C.reset} : ${PROXY_ADDR}`);
  log(`  ${C.dim}https://sepolia.etherscan.io/address/${PROXY_ADDR}${C.reset}`);
  log(`${C.green}MissionNFT${C.reset}      : ${NFT_ADDR}`);
  log(`  ${C.dim}https://sepolia.etherscan.io/address/${NFT_ADDR}${C.reset}`);
  log(`${C.green}PlayerRegistry${C.reset}  : ${REGISTRY_ADDR}`);
  log(`  ${C.dim}https://sepolia.etherscan.io/address/${REGISTRY_ADDR}${C.reset}`);
  console.log("");

  // ── Chainlink Data Feeds ──
  console.log(`${C.bold}  CHAINLINK DATA FEEDS (live Sepolia):${C.reset}`);
  const FEED_ABI = [
    "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function decimals() view returns (uint8)",
  ];
  const FEED_ETH_USD  = "0x694aa1769357215de4fac081bf1f309adc325306";
  const FEED_LINK_USD = "0xc59e3633baac79493d908e63626716e204a45edf";
  try {
    const ethFeed  = new ethers.Contract(FEED_ETH_USD,  FEED_ABI, provider);
    const linkFeed = new ethers.Contract(FEED_LINK_USD, FEED_ABI, provider);
    const [ethDecimals, ethRound]   = await Promise.all([ethFeed.decimals(),  ethFeed.latestRoundData()]);
    const [linkDecimals, linkRound] = await Promise.all([linkFeed.decimals(), linkFeed.latestRoundData()]);
    const ethPrice  = (Number(ethRound.answer)  / Math.pow(10, Number(ethDecimals))).toFixed(2);
    const linkPrice = (Number(linkRound.answer) / Math.pow(10, Number(linkDecimals))).toFixed(4);
    log(`${C.green}ETH/USD${C.reset}  : $${ethPrice}  (round #${ethRound.roundId})`);
    log(`  ${C.dim}${FEED_ETH_USD}${C.reset}`);
    log(`${C.green}LINK/USD${C.reset} : $${linkPrice}  (round #${linkRound.roundId})`);
    log(`  ${C.dim}${FEED_LINK_USD}${C.reset}`);
  } catch (feedErr: any) {
    log(`${C.yellow}[Data Feeds]${C.reset} Could not fetch: ${feedErr.message?.slice(0, 60)}`);
  }
  console.log("");

  // ── Active Workflows ──
  console.log(`${C.bold}  ACTIVE CRE WORKFLOWS:${C.reset}`);
  console.log(`${C.dim}  ┌──────────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.green}  │ generate-briefing${C.reset}   MissionStarted + VRF  → receiveClue`);
  console.log(`${C.green}  │ mission-start${C.reset}       InvestigationSubmitted → receiveClue`);
  console.log(`${C.green}  │ generate-finale${C.reset}     CarmenCaptured         → setTokenURI`);
  console.log(`${C.green}  │ player-check${C.reset}        PlayerCheckRequested   → recordResult`);
  console.log(`${C.green}  │ player-registration${C.reset} RegistrationRequested  → registerPlayer`);
  console.log(`${C.green}  │ carmen-moves${C.reset}        Periodic (15 min)      → updateTarget`);
  console.log(`${C.dim}  └──────────────────────────────────────────────────────┘${C.reset}`);
  console.log("");
  log(`${C.bold}${C.cyan}Listening for on-chain events... (Ctrl+C to stop)${C.reset}`);
  sep();

  // Processing lock to avoid nonce conflicts on sequential txs
  let processing = false;
  const withLock = async (label: string, fn: () => Promise<void>) => {
    while (processing) await new Promise(r => setTimeout(r, 500));
    processing = true;
    try {
      await fn();
    } catch (e: any) {
      log(`${C.red}[ERROR:${label}]${C.reset} ${e.message?.slice(0, 200)}`);
    } finally {
      processing = false;
    }
  };

  // Track missions and briefings
  const briefingSent     = new Set<number>();
  const pendingVRF       = new Map<number, { player: string; startBlock: number }>();
  const processedEvents  = new Set<string>();  // txHash:logIndex dedup

  // ── 1. PlayerCheckRequested ──
  playerRegistry.on("PlayerCheckRequested", (player: string, event: any) => {
    withLock("player-check", async () => {
      wfOpen("player-check", `PlayerCheckRequested — ${player.slice(0, 14)}...`);
      const p      = await playerRegistry.players(player);
      const exists = p.wallet !== ethers.ZeroAddress;
      const nick   = p.nickname || "(none)";
      const rank   = Number(p.rank || 0);
      log(`  ${C.dim}Wallet : ${player}${C.reset}`);
      log(`  ${C.dim}Exists : ${exists} | Nickname: "${nick}" | Rank: ${rank}${C.reset}`);
      await sendTx(
        () => playerRegistry.recordCheckResult(player, exists, nick, rank),
        "PlayerRegistry.recordCheckResult()"
      );
      wfClose();
    });
  });

  // ── 2. RegistrationRequested ──
  playerRegistry.on("RegistrationRequested", (player: string, nickname: string, event: any) => {
    withLock("player-registration", async () => {
      wfOpen("player-registration", `RegistrationRequested — "${nickname}"`);
      log(`  ${C.dim}Wallet   : ${player}${C.reset}`);
      log(`  ${C.dim}Nickname : "${nickname}"${C.reset}`);
      const available = await playerRegistry.isNicknameAvailable(nickname);
      if (!available) {
        log(`  ${C.yellow}⚠ Nickname "${nickname}" already taken — skipping${C.reset}`);
        wfClose();
        return;
      }
      await sendTx(
        () => playerRegistry.registerPlayer(player, nickname),
        "PlayerRegistry.registerPlayer()"
      );
      log(`  ${C.green}✓ Player "${nickname}" registered on-chain${C.reset}`);
      wfClose();
    });
  });

  // ── 3. MissionStarted (add to VRF poll queue) ──
  gameMaster.on("MissionStarted", (missionId: bigint, player: string, startBlock: bigint, event: any) => {
    const mid = Number(missionId);
    wfOpen("generate-briefing", `MissionStarted #${mid} — ${player.slice(0, 14)}...`);
    log(`  ${C.dim}Mission ID : #${mid}${C.reset}`);
    log(`  ${C.dim}Player     : ${player}${C.reset}`);
    log(`  ${C.dim}Start block: #${Number(startBlock)}${C.reset}`);
    log(`  ${C.yellow}⏳ Queued for VRF poll — waiting for Chainlink VRF fulfillment...${C.reset}`);
    pendingVRF.set(mid, { player, startBlock: Number(startBlock) });
    wfClose();
  });

  // ── 4. InvestigationSubmitted → clue + optional wallet fragment + auto-capture ──
  gameMaster.on("InvestigationSubmitted", (missionId: bigint, player: string, chainId: bigint, event: any) => {
    // Deduplicate: ethers.js v6 polling can deliver the same event twice
    const eventId = `${event?.transactionHash ?? event?.log?.transactionHash ?? ""}:${event?.logIndex ?? event?.index ?? 0}`;
    if (eventId !== ":0" && processedEvents.has(eventId)) {
      log(`${C.dim}[SKIP:mission-start] Duplicate event ${eventId.slice(0, 30)}... — already processed${C.reset}`);
      return;
    }
    if (eventId !== ":0") processedEvents.add(eventId);

    withLock("mission-start", async () => {
      const mid              = Number(missionId);
      const investigatedChain = Number(chainId);
      const investigatedCity  = CITIES[investigatedChain];

      wfOpen("mission-start", `InvestigationSubmitted #${mid} — ${investigatedCity?.name || investigatedChain}`);

      const mission        = await gameMaster.getMission(mid);
      const salt           = await gameMaster.missionSalts(mid);
      const cluesReceived  = Number(mission.cluesReceived);

      log(`  ${C.dim}Mission    : #${mid}${C.reset}`);
      log(`  ${C.dim}Player     : ${player}${C.reset}`);
      log(`  ${C.dim}Investigated: ${investigatedCity?.name || investigatedChain} (chainId=${investigatedChain})${C.reset}`);
      log(`  ${C.dim}Salt       : ${salt.slice(0, 18)}...${C.reset}`);
      log(`  ${C.dim}TargetHash : ${mission.targetHash.slice(0, 18)}...${C.reset}`);
      log(`  ${C.dim}CluesReceived before: ${cluesReceived}${C.reset}`);
      sep();

      // ── Commit-Reveal: brute-force Carmen's actual location ──
      log(`  ${C.cyan}[commit-reveal]${C.reset} Deriving Carmen's location (off-chain only):`);
      let carmenChainId = 0;
      for (const cid of VALID_CHAIN_IDS) {
        const h     = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]));
        const match = h === mission.targetHash;
        log(`  ${C.dim}  keccak256(${cid}, salt) = ${h.slice(0, 16)}... ${match ? `${C.green}MATCH ✓ Carmen here${C.reset}` : ""}${C.reset}`);
        if (match) carmenChainId = cid;
      }
      const carmenCity   = CITIES[carmenChainId];
      const isCorrect    = investigatedChain === carmenChainId;
      const strength     = calculateStrength(salt, cluesReceived, isCorrect);
      const isEvidence   = strength > 65;

      log(`  ${C.bold}${isCorrect ? C.green : C.yellow}  → Carmen is in: ${carmenCity?.name || carmenChainId} ${carmenCity?.emoji || ""} (${carmenCity?.chain || "?"})${C.reset}`);
      log(`  ${C.dim}  Contract sees only the hash — location HIDDEN until reveal${C.reset}`);
      sep();

      // ── Clue selection ──
      const scenario = getScenario(mid);
      const clue     = selectClue(scenario, cluesReceived, isCorrect);

      log(`  ${C.cyan}[clue-selection]${C.reset} ${isCorrect ? `${C.green}CORRECT city${C.reset}` : `${C.yellow}WRONG city${C.reset}`} → ${isCorrect ? "TRUE" : "FALSE"} clue pool`);
      log(`  ${C.dim}  Scenario   : "${scenario.title}"${C.reset}`);
      log(`  ${C.dim}  Pool       : ${isCorrect ? "true" : "false"}[${cluesReceived % (isCorrect ? scenario.clues.true : scenario.clues.false).length}]${C.reset}`);
      log(`  ${C.dim}  Clue type  : ${clue.type === 0 ? "Text" : clue.type === 1 ? "Audio" : "Image"}${C.reset}`);
      log(`  ${C.dim}  Clue text  : "${clue.text.slice(0, 80)}${clue.text.length > 80 ? "..." : ""}"${C.reset}`);
      sep();

      // ── Strength calculation ──
      log(`  ${C.cyan}[strength]${C.reset} Deterministic from salt entropy:`);
      const _strengthHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "uint256", "string"], [salt, cluesReceived, "strength"]
        )
      );
      const _strengthRaw = Number(BigInt(_strengthHash) % BigInt(256));
      log(`  ${C.dim}  keccak256(salt, clueIndex=${cluesReceived}, "strength") → raw=${_strengthRaw}${C.reset}`);
      log(`  ${C.dim}  Range: ${isCorrect ? "40–95 (correct)" : "20–55 (wrong)"}${C.reset}`);
      log(`  ${C.bold}  Strength = ${strength}/100 ${isEvidence ? `${C.green}> 65 → EVIDENCE${C.reset}` : `${C.dim}≤ 65${C.reset}`}${C.reset}`);
      sep();

      // ── ECIES encryption ──
      const pubKeyHex   = await gameMaster.getPlayerPublicKey(player);
      const pubKeyBytes = parsePubKey(pubKeyHex);
      if (!pubKeyBytes) {
        log(`  ${C.red}✗ Invalid player public key — skipping${C.reset}`);
        wfClose();
        return;
      }

      log(`  ${C.cyan}[ECIES]${C.reset} Encrypting clue with player's secp256k1 public key:`);
      log(`  ${C.dim}  Algorithm  : ECDH (secp256k1) + HKDF-SHA256 + AES-256-GCM${C.reset}`);
      log(`  ${C.dim}  Public key : ${pubKeyHex.slice(0, 28)}... (65 bytes)${C.reset}`);
      const encrypted   = eciesEncrypt(pubKeyBytes, clue.text);
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes(clue.text));
      log(`  ${C.dim}  Ciphertext : 0x${encrypted.slice(0, 24)}... (${encrypted.length / 2} bytes)${C.reset}`);
      log(`  ${C.dim}  ContentHash: ${contentHash.slice(0, 18)}...${C.reset}`);
      sep();

      // ── Send receiveClue ──
      log(`  ${C.cyan}[receiveClue]${C.reset} Delivering encrypted clue to GameMaster:`);
      await sendTx(
        () => gameMaster.receiveClue(mid, clue.type, contentHash, encrypted, strength),
        `GameMaster.receiveClue(#${mid}, type=${clue.type}, strength=${strength})`
      );
      log(`  ${C.green}✓ Clue #${cluesReceived + 1} delivered on-chain${C.reset}`);
      sep();

      // ── Wallet fragment (strong clues only) ──
      if (isEvidence) {
        log(`  ${C.cyan}[wallet-fragment]${C.reset} Strength > 65 → generating Carmen wallet fragment:`);
        const fragCount   = Number(await gameMaster.missionFragmentCount(mid));
        const carmenWallet = await gameMaster.deriveCarmenWallet(salt);
        const walletHex   = carmenWallet.slice(2).toLowerCase();

        const posHash   = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [salt, fragCount])
        );
        const startIdx  = Number(BigInt(posHash) % BigInt(40 - FRAGMENT_LENGTH + 1));
        const chars     = walletHex.slice(startIdx, startIdx + FRAGMENT_LENGTH);

        log(`  ${C.dim}  Carmen wallet  : 0x${walletHex.slice(0, 8)}...${walletHex.slice(-4)}${C.reset}`);
        log(`  ${C.dim}  Fragment #${fragCount} : chars "${chars}" at position ${startIdx}–${startIdx + FRAGMENT_LENGTH}${C.reset}`);
        log(`  ${C.dim}  Context: ${FRAGMENT_LENGTH} chars of 40-char wallet address${C.reset}`);

        const fragPayload = JSON.stringify({ fragmentIndex: fragCount, startIndex: startIdx, length: FRAGMENT_LENGTH, chars });
        const encFrag     = eciesEncrypt(pubKeyBytes, fragPayload);
        const fragHash    = ethers.keccak256(ethers.toUtf8Bytes(fragPayload));

        log(`  ${C.dim}  Encrypted payload: 0x${encFrag.slice(0, 24)}... (${encFrag.length / 2} bytes)${C.reset}`);
        await sendTx(
          () => gameMaster.receiveWalletFragment(mid, startIdx, FRAGMENT_LENGTH, fragHash, encFrag),
          `GameMaster.receiveWalletFragment(#${mid}, pos=${startIdx}, len=${FRAGMENT_LENGTH})`
        );
        log(`  ${C.green}✓ Wallet fragment #${fragCount} delivered${C.reset}`);
        sep();
      }

      // ── Auto-capture: 3+ clues AND correct city ──
      const totalClues = cluesReceived + 1;
      log(`  ${C.dim}Clue count: ${cluesReceived} on-chain + 1 new = ${totalClues} total (need ≥ 3)${C.reset}`);

      if (isCorrect && totalClues >= 3) {
        console.log("");
        console.log(`${C.bold}${C.bgMagenta}${C.white}  AUTO-CAPTURE TRIGGERED!                                      ${C.reset}`);
        console.log(`${C.bold}${C.bgMagenta}${C.white}  ${totalClues} clues + correct city = conditions met          ${C.reset}`);
        console.log("");
        log(`  ${C.cyan}[resolveCapture]${C.reset} Sending REVEAL to GameMaster:`);
        log(`  ${C.dim}  Reveals: chainId=${carmenChainId} + salt=${salt.slice(0, 14)}...${C.reset}`);
        log(`  ${C.dim}  Contract verifies: keccak256(${carmenChainId}, salt) == targetHash${C.reset}`);

        // Brief pause so clue event processes first
        await new Promise(r => setTimeout(r, 3000));

        await sendTx(
          () => gameMaster.resolveCapture(mid, carmenChainId, salt),
          `GameMaster.resolveCapture(#${mid}, city=${carmenChainId}, reveal)`
        );
        console.log("");
        console.log(`${C.bgGreen}${C.bold}${C.white}  CARMEN CAPTURED in ${(carmenCity?.name || "?").padEnd(10)} ${carmenCity?.emoji || ""}  mission #${mid} complete!  ${C.reset}`);
        console.log("");
      }

      wfClose();
    });
  });

  // ── 5. CarmenCaptured → generate-finale ──
  gameMaster.on("CarmenCaptured", (missionId: bigint, player: string, blocksUsed: bigint, reward: bigint, event: any) => {
    withLock("generate-finale", async () => {
      const mid      = Number(missionId);
      const blocks   = Number(blocksUsed);
      const pts      = Number(reward);
      const tier     = getRewardTier(pts);

      wfOpen("generate-finale", `CarmenCaptured #${mid} — ${tier.icon} ${tier.name} rank`);
      log(`  ${C.dim}Mission ID : #${mid}${C.reset}`);
      log(`  ${C.dim}Player     : ${player}${C.reset}`);
      log(`  ${C.dim}Blocks used: ${blocks}${C.reset}`);
      log(`  ${C.dim}Reward pts : ${pts} → ${C.bold}${tier.name} RANK${C.reset} ${tier.icon}`);
      sep();

      // Read mission data
      const mission   = await gameMaster.getMission(mid);
      const salt      = await gameMaster.missionSalts(mid);
      const captured  = bruteForceCarmenCity(salt, mission.targetHash);
      const cityName  = CITIES[captured]?.name || "Unknown";
      const scenario  = getScenario(mid);
      const clues     = Number(mission.cluesReceived);
      const evidence  = Number(await gameMaster.missionEvidenceCount(mid));

      log(`  ${C.cyan}[NFT-generation]${C.reset} Building ERC-721 trophy metadata:`);
      log(`  ${C.dim}  Scenario   : "${scenario.title}"${C.reset}`);
      log(`  ${C.dim}  Capture    : ${cityName} (chainId=${captured})${C.reset}`);
      log(`  ${C.dim}  Stats      : ${clues} clues | ${evidence} evidence | ${blocks} blocks${C.reset}`);

      // Generate SVG + metadata
      const svg       = generateTrophySVG(mid, scenario, tier, cityName, blocks, clues, evidence);
      const narrative = buildFinaleNarrative(scenario, mid, cityName, tier.name, blocks, clues);
      const svgB64    = Buffer.from(svg).toString("base64");

      const metadata = {
        name: `Carmen Sandiego Mission #${mid} — ${tier.name}`,
        description: narrative,
        image: `data:image/svg+xml;base64,${svgB64}`,
        external_url: "https://github.com/mtrn87/carmen-sandiego-onchain",
        attributes: [
          { trait_type: "Scenario",          value: scenario.title },
          { trait_type: "Reward Tier",       value: tier.name },
          { trait_type: "Capture City",      value: cityName },
          { display_type: "number", trait_type: "Blocks Used",        value: blocks   },
          { display_type: "number", trait_type: "Clues Collected",    value: clues    },
          { display_type: "number", trait_type: "Evidence Gathered",  value: evidence },
          { display_type: "number", trait_type: "Reward Points",      value: pts      },
        ],
      };
      const tokenURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;

      log(`  ${C.dim}  SVG size   : ${svg.length} chars${C.reset}`);
      log(`  ${C.dim}  Token URI  : data:application/json;base64,... (${tokenURI.length} chars total)${C.reset}`);
      log(`  ${C.dim}  Format     : fully on-chain data URI — no IPFS required${C.reset}`);
      sep();

      log(`  ${C.cyan}[setMissionTokenURI]${C.reset} Writing NFT metadata to chain:`);
      await sendTx(
        () => gameMaster.setMissionTokenURI(mid, tokenURI),
        `GameMaster.setMissionTokenURI(#${mid})`
      );
      log(`  ${C.green}✓ NFT trophy URI set — token #${mid} fully on-chain${C.reset}`);

      // Get token ID from events
      try {
        const nftFilter = missionNFT.filters.MissionNFTMinted?.();
        if (nftFilter) {
          const events = await missionNFT.queryFilter(nftFilter, -100);
          const relevant = events.find((e: any) => Number(e.args?.[1] ?? e.args?.[0]) === mid || true);
          if (relevant) {
            const tokenId = (relevant as any).args?.[0];
            if (tokenId !== undefined) {
              log(`  ${C.dim}  Token ID   : #${tokenId}${C.reset}`);
              log(`  ${C.dim}  OpenSea    : https://testnets.opensea.io/assets/sepolia/${NFT_ADDR}/${tokenId}${C.reset}`);
            }
          }
        }
      } catch { /* ignore */ }

      wfClose();
    });
  });

  // ── VRF Poller: check pending missions every 5s ──
  const vrfPollInterval = setInterval(async () => {
    if (processing || pendingVRF.size === 0) return;

    for (const [mid, info] of pendingVRF.entries()) {
      try {
        const mission = await gameMaster.getMission(mid);
        if (mission.targetHash !== ethers.ZeroHash) {
          console.log("");
          log(`${C.green}[VRF]${C.reset} ${C.bold}Mission #${mid}: VRF fulfilled!${C.reset}`);
          log(`  ${C.dim}TargetHash : ${mission.targetHash.slice(0, 18)}...${C.reset}`);
          log(`  ${C.dim}Salt (derived): ${(await gameMaster.missionSalts(mid)).slice(0, 18)}...${C.reset}`);
          pendingVRF.delete(mid);

          if (!briefingSent.has(mid)) {
            briefingSent.add(mid);
            await withLock("generate-briefing", async () => {
              const salt = await gameMaster.missionSalts(mid);

              wfOpen("generate-briefing", `VRF fulfilled for mission #${mid}`, "📜");
              log(`  ${C.dim}Salt       : ${salt.slice(0, 18)}...${C.reset}`);
              log(`  ${C.dim}TargetHash : ${mission.targetHash.slice(0, 18)}...${C.reset}`);

              const scenario     = getScenario(mid);
              const briefingText = buildBriefing(scenario, mid, VALID_CHAIN_IDS);
              log(`  ${C.dim}Scenario   : "${scenario.title}"${C.reset}`);
              log(`  ${C.dim}Briefing   : ${briefingText.length} chars — enriched noir-style dossier${C.reset}`);
              sep();

              const pubKeyHex   = await gameMaster.getPlayerPublicKey(info.player);
              const pubKeyBytes = parsePubKey(pubKeyHex);
              if (!pubKeyBytes) {
                log(`  ${C.red}✗ No valid public key for ${info.player.slice(0, 14)} — skip${C.reset}`);
                wfClose();
                return;
              }

              log(`  ${C.cyan}[ECIES]${C.reset} Encrypting briefing:`);
              log(`  ${C.dim}  Public key : ${pubKeyHex.slice(0, 28)}... (secp256k1 uncompressed)${C.reset}`);
              const encrypted   = eciesEncrypt(pubKeyBytes, briefingText);
              const contentHash = ethers.keccak256(ethers.toUtf8Bytes(briefingText));
              log(`  ${C.dim}  Ciphertext : 0x${encrypted.slice(0, 24)}... (${encrypted.length / 2} bytes)${C.reset}`);
              log(`  ${C.dim}  ContentHash: ${contentHash.slice(0, 18)}...${C.reset}`);
              sep();

              log(`  ${C.cyan}[receiveClue]${C.reset} Delivering briefing as clue type=0 (Text):`);
              await sendTx(
                () => gameMaster.receiveClue(mid, 0, contentHash, encrypted, 30),
                `GameMaster.receiveClue(#${mid}, type=0/briefing, strength=30)`
              );
              log(`  ${C.green}✓ Encrypted briefing delivered — player can now decrypt with private key${C.reset}`);
              wfClose();
            });
          }
        }
      } catch { /* read errors during poll */ }
    }
  }, 5000);

  // ── Carmen Moves (periodic, every 15 min) ──
  const carmenMovesInterval = setInterval(async () => {
    if (processing) return;
    try {
      await withLock("carmen-moves", async () => {
        const activeIds: bigint[] = await gameMaster.getActiveMissionIds();
        if (activeIds.length === 0) return;

        log(`${C.cyan}[carmen-moves]${C.reset} Checking ${activeIds.length} active mission(s)...`);
        for (const mid of activeIds) {
          const mission = await gameMaster.getMission(mid);
          const salt    = await gameMaster.missionSalts(mid);
          if (salt === ethers.ZeroHash) continue;

          const currentCity  = bruteForceCarmenCity(salt, mission.targetHash);
          if (currentCity === 0) continue;

          const others   = VALID_CHAIN_IDS.filter(c => c !== currentCity);
          if (others.length === 0) continue;
          const hashNum  = BigInt(mission.targetHash);
          const newCity  = others[Number(hashNum % BigInt(others.length))];
          const newHash  = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [newCity, salt]));

          log(`  ${C.magenta}Mission #${Number(mid)}${C.reset}: ${CITIES[currentCity]?.name} → ${CITIES[newCity]?.name}`);
          await sendTx(
            () => gameMaster.updateTarget(mid, newHash),
            `GameMaster.updateTarget(#${Number(mid)}, newCity=${newCity})`
          );
        }
      });
    } catch (e: any) {
      log(`${C.red}[ERROR:carmen-moves]${C.reset} ${e.message?.slice(0, 100) ?? e}`);
    }
  }, 15 * 60 * 1000); // 15 min — keeps Carmen moving but doesn't interrupt 3-inv demo loop

  // ── Graceful Shutdown ──
  const shutdown = async () => {
    console.log("");
    console.log(`${C.yellow}[SHUTDOWN]${C.reset} Stopping CRE Responder...`);
    clearInterval(vrfPollInterval);
    clearInterval(carmenMovesInterval);

    try {
      const oracle = await gameMaster.creOracle();
      if (oracle.toLowerCase() === signer.address.toLowerCase()) {
        log(`[SHUTDOWN] Restoring CRE oracle → Proxy address`);
        await sendTx(() => gameMaster.setCREOracle(PROXY_ADDR), "setCREOracle(proxy)");
        log(`${C.green}[SHUTDOWN]${C.reset} ✓ CRE oracle restored to ${PROXY_ADDR}`);
      }
    } catch (e: any) {
      log(`${C.red}[SHUTDOWN]${C.reset} Could not restore oracle: ${e.message?.slice(0, 80)}`);
    }

    console.log(`\n${C.green}[SHUTDOWN]${C.reset} CRE Responder stopped.\n`);
    process.exit(0);
  };

  process.on("SIGINT",  shutdown);
  process.on("SIGTERM", shutdown);

  // Keep alive
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
