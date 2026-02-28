/**
 * ================================================================
 *  CRE Responder — Event-driven Oracle Simulator
 * ================================================================
 *
 *  Watches on-chain events and responds like the 6 CRE workflows:
 *    - player-check:        PlayerCheckRequested → recordCheckResult
 *    - player-registration: RegistrationRequested → registerPlayer
 *    - generate-briefing:   MissionStarted (after VRF) → receiveClue (briefing)
 *    - mission-start:       InvestigationSubmitted → receiveClue + walletFragment
 *    - carmen-moves:        Periodic cron → updateTarget
 *    - generate-finale:     CarmenCaptured → setMissionTokenURI
 *
 *  Usage: npx hardhat run scripts/cre-responder.ts --network sepolia
 *         Press Ctrl+C to stop.
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
const CITIES: Record<number, { name: string; chain: string }> = {
  421614: { name: "Tokyo", chain: "Arbitrum Sepolia" },
  84532:  { name: "Paris", chain: "Base Sepolia" },
  51:     { name: "Sydney", chain: "XDC Apothem" },
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
  reset: "\x1b[0m", bgGreen: "\x1b[42m", white: "\x1b[37m",
};

const log = (msg: string) => console.log(`${C.dim}[${new Date().toLocaleTimeString()}]${C.reset} ${msg}`);

// ── ECIES ──
function eciesEncrypt(recipientPubKey: Uint8Array, plaintext: string): string {
  const ephPriv = secp256k1.utils.randomPrivateKey();
  const ephPub = secp256k1.getPublicKey(ephPriv, false);
  const shared = secp256k1.getSharedSecret(ephPriv, recipientPubKey);
  const aesKey = hkdf(sha256, shared.slice(1, 33), undefined, "carmen-ecies", 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(aesKey), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from(ephPub), Buffer.from(iv), enc, tag]).toString("hex");
}

// ── CRE Logic ──
function bruteForceCarmenCity(salt: string, targetHash: string): number {
  for (const cid of VALID_CHAIN_IDS) {
    const hash = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]));
    if (hash === targetHash) return cid;
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

function buildBriefing(scenario: Scenario, missionId: number): string {
  return [
    `CLASSIFIED BRIEFING — MISSION #${missionId}`,
    ``, scenario.briefing, ``,
    `Possible locations: ${Object.values(scenario.cities).map(c => `${c.name} (${c.chain})`).join(", ")}`,
    ``, `Good luck, detective. The blockchain never lies.`,
  ].join("\n");
}

function getRewardTier(reward: number) {
  if (reward >= 100) return { name: "GOLD", color: "#FFD700", accent: "#B8860B" };
  if (reward >= 75) return { name: "SILVER", color: "#C0C0C0", accent: "#808080" };
  if (reward >= 50) return { name: "BRONZE", color: "#CD7F32", accent: "#8B4513" };
  return { name: "COPPER", color: "#B87333", accent: "#6B3A1F" };
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
    tierName === "GOLD" ? "Your flawless investigation earned the highest distinction."
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

function parsePubKey(hex: string): Uint8Array | null {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length !== 130) return null;
  const bytes = new Uint8Array(65);
  for (let i = 0; i < 65; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

// ── Main ──
async function main() {
  if (network.name === "hardhat" || network.name === "localhost") {
    console.error("ERROR: Use --network sepolia");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();

  const GM_ADDR = process.env.GAME_MASTER_ADDRESS!;
  const PROXY_ADDR = process.env.GAME_MASTER_PROXY_ADDRESS!;
  const NFT_ADDR = process.env.MISSION_NFT_ADDRESS!;
  const REGISTRY_ADDR = process.env.PLAYER_REGISTRY_ADDRESS!;

  const gameMaster = await ethers.getContractAt("GameMaster", GM_ADDR, signer);
  const proxy = await ethers.getContractAt("GameMasterProxy", PROXY_ADDR, signer);
  const missionNFT = await ethers.getContractAt("MissionNFT", NFT_ADDR, signer);
  const playerRegistry = await ethers.getContractAt("PlayerRegistry", REGISTRY_ADDR, signer);

  // Ensure signer is CRE oracle
  const currentCRE = await gameMaster.creOracle();
  if (currentCRE.toLowerCase() !== signer.address.toLowerCase()) {
    log(`${C.yellow}[SETUP]${C.reset} Setting CRE oracle → signer for simulation`);
    await (await gameMaster.setCREOracle(signer.address)).wait();
  }

  // Ensure signer is gameMaster on PlayerRegistry
  const registryGM = await playerRegistry.gameMaster();
  if (registryGM.toLowerCase() !== signer.address.toLowerCase()) {
    log(`${C.yellow}[SETUP]${C.reset} Setting PlayerRegistry.gameMaster → signer`);
    try {
      await (await playerRegistry.setGameMaster(signer.address)).wait();
    } catch (e: any) {
      log(`${C.yellow}[WARN]${C.reset} Could not set registry gameMaster: ${e.message?.slice(0, 60)}`);
    }
  }

  console.log("");
  console.log(`${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║   CRE RESPONDER — Event-Driven Oracle Simulator     ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════╝${C.reset}`);
  console.log("");
  log(`${C.green}Signer:${C.reset} ${signer.address}`);
  log(`${C.green}GameMaster:${C.reset} ${GM_ADDR}`);
  log(`${C.green}PlayerRegistry:${C.reset} ${REGISTRY_ADDR}`);
  log(`${C.green}Proxy:${C.reset} ${PROXY_ADDR}`);
  console.log("");
  log(`${C.bold}Listening for events... (Ctrl+C to stop)${C.reset}`);
  log(`${C.dim}─────────────────────────────────────────────────────${C.reset}`);

  // Track missions we've already sent briefings for
  const briefingSent = new Set<number>();
  // Track pending VRF missions (MissionStarted but no VRF yet)
  const pendingVRF = new Map<number, { player: string; startBlock: number }>();
  // Processing lock to avoid parallel tx issues
  let processing = false;

  const withLock = async (label: string, fn: () => Promise<void>) => {
    while (processing) await new Promise(r => setTimeout(r, 500));
    processing = true;
    try { await fn(); } catch (e: any) {
      log(`${C.red}[ERROR] ${label}: ${e.message?.slice(0, 120)}${C.reset}`);
    } finally { processing = false; }
  };

  // ── 1. PlayerCheckRequested ──
  playerRegistry.on("PlayerCheckRequested", (player: string, event: any) => {
    withLock("player-check", async () => {
      log(`${C.cyan}[player-check]${C.reset} PlayerCheckRequested for ${player.slice(0, 10)}...`);
      const p = await playerRegistry.players(player);
      const exists = p.wallet !== ethers.ZeroAddress;
      const nickname = p.nickname || "";
      const rank = Number(p.rank || 0);
      log(`${C.cyan}[player-check]${C.reset} exists=${exists}, nickname="${nickname}", rank=${rank}`);
      const tx = await playerRegistry.recordCheckResult(player, exists, nickname, rank);
      await tx.wait();
      log(`${C.green}[player-check]${C.reset} ✓ recordCheckResult sent`);
    });
  });

  // ── 2. RegistrationRequested ──
  playerRegistry.on("RegistrationRequested", (player: string, nickname: string, event: any) => {
    withLock("player-registration", async () => {
      log(`${C.cyan}[player-registration]${C.reset} RegistrationRequested: ${player.slice(0, 10)}... → "${nickname}"`);
      const available = await playerRegistry.isNicknameAvailable(nickname);
      if (!available) {
        log(`${C.yellow}[player-registration]${C.reset} Nickname "${nickname}" taken, skipping`);
        return;
      }
      const tx = await playerRegistry.registerPlayer(player, nickname);
      await tx.wait();
      log(`${C.green}[player-registration]${C.reset} ✓ Player registered: "${nickname}"`);
    });
  });

  // ── 3. MissionStarted → wait for VRF → generate briefing ──
  gameMaster.on("MissionStarted", (missionId: bigint, player: string, startBlock: bigint, event: any) => {
    const mid = Number(missionId);
    log(`${C.cyan}[generate-briefing]${C.reset} MissionStarted #${mid} by ${player.slice(0, 10)}...`);
    pendingVRF.set(mid, { player, startBlock: Number(startBlock) });
  });

  // ── 4. InvestigationSubmitted → deliver clue ──
  gameMaster.on("InvestigationSubmitted", (missionId: bigint, player: string, chainId: bigint, event: any) => {
    withLock("mission-start", async () => {
      const mid = Number(missionId);
      const investigatedChain = Number(chainId);
      log(`${C.cyan}[mission-start]${C.reset} InvestigationSubmitted #${mid}: chainId=${investigatedChain}`);

      const mission = await gameMaster.getMission(mid);
      const salt = await gameMaster.missionSalts(mid);
      const carmenChainId = bruteForceCarmenCity(salt, mission.targetHash);
      const isCorrect = investigatedChain === carmenChainId;
      const cluesReceived = Number(mission.cluesReceived);

      const scenario = getScenario(mid);
      const strength = calculateStrength(salt, cluesReceived, isCorrect);
      const clue = selectClue(scenario, cluesReceived, isCorrect);
      const isEvidence = strength > 65;

      log(`${C.magenta}[mission-start]${C.reset} ${isCorrect ? "CORRECT" : "Wrong"} city | strength=${strength} ${isEvidence ? "[EVIDENCE]" : ""}`);

      // Get player public key and encrypt
      const pubKeyHex = await gameMaster.getPlayerPublicKey(player);
      const pubKeyBytes = parsePubKey(pubKeyHex);
      if (!pubKeyBytes) {
        log(`${C.red}[mission-start]${C.reset} Invalid player public key, skipping`);
        return;
      }

      const encrypted = eciesEncrypt(pubKeyBytes, clue.text);
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes(clue.text));

      const tx = await gameMaster.receiveClue(mid, clue.type, contentHash, encrypted, strength);
      await tx.wait();
      log(`${C.green}[mission-start]${C.reset} ✓ Clue delivered (type=${clue.type}, strength=${strength})`);

      // Wallet fragment for strong clues
      if (isEvidence) {
        const fragCount = Number(await gameMaster.missionFragmentCount(mid));
        const carmenWallet = await gameMaster.deriveCarmenWallet(salt);
        const walletHex = carmenWallet.slice(2).toLowerCase();

        const posHash = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [salt, fragCount])
        );
        const startIdx = Number(BigInt(posHash) % BigInt(40 - FRAGMENT_LENGTH + 1));
        const chars = walletHex.slice(startIdx, startIdx + FRAGMENT_LENGTH);

        const fragPayload = JSON.stringify({
          fragmentIndex: fragCount, startIndex: startIdx, length: FRAGMENT_LENGTH, chars,
        });
        const encFrag = eciesEncrypt(pubKeyBytes, fragPayload);
        const fragHash = ethers.keccak256(ethers.toUtf8Bytes(fragPayload));

        const fragTx = await gameMaster.receiveWalletFragment(mid, startIdx, FRAGMENT_LENGTH, fragHash, encFrag);
        await fragTx.wait();
        log(`${C.green}[mission-start]${C.reset} ✓ Wallet fragment #${fragCount} delivered (pos=${startIdx})`);
      }
    });
  });

  // ── 5. CarmenCaptured → generate finale ──
  gameMaster.on("CarmenCaptured", (missionId: bigint, player: string, blocksUsed: bigint, reward: bigint, event: any) => {
    withLock("generate-finale", async () => {
      const mid = Number(missionId);
      const blocks = Number(blocksUsed);
      const rewardPts = Number(reward);

      log(`${C.bgGreen}${C.bold}${C.white} CARMEN CAPTURED! ${C.reset} Mission #${mid} | ${rewardPts} pts | ${blocks} blocks`);

      const mission = await gameMaster.getMission(mid);
      const salt = await gameMaster.missionSalts(mid);
      const carmenChainId = bruteForceCarmenCity(salt, mission.targetHash);
      const cityName = CITIES[carmenChainId]?.name || "Unknown";
      const scenario = getScenario(mid);
      const clues = Number(mission.cluesReceived);
      const evidence = Number(await gameMaster.missionEvidenceCount(mid));
      const tier = getRewardTier(rewardPts);

      // Generate SVG + metadata
      const svg = generateTrophySVG(mid, scenario, tier, cityName, blocks, clues, evidence);
      const narrative = buildFinaleNarrative(scenario, mid, cityName, tier.name, blocks, clues);

      const svgB64 = Buffer.from(svg).toString("base64");
      const metadata = {
        name: `Carmen Sandiego Mission #${mid} — ${tier.name}`,
        description: narrative,
        image: `data:image/svg+xml;base64,${svgB64}`,
        external_url: "https://github.com/mtrn87/carmen-sandiego-onchain",
        attributes: [
          { trait_type: "Scenario", value: scenario.title },
          { trait_type: "Reward Tier", value: tier.name },
          { trait_type: "Capture City", value: cityName },
          { display_type: "number", trait_type: "Blocks Used", value: blocks },
          { display_type: "number", trait_type: "Clues Collected", value: clues },
          { display_type: "number", trait_type: "Evidence Gathered", value: evidence },
          { display_type: "number", trait_type: "Reward Points", value: rewardPts },
        ],
      };
      const tokenURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;

      const tx = await gameMaster.setMissionTokenURI(mid, tokenURI);
      await tx.wait();
      log(`${C.green}[generate-finale]${C.reset} ✓ NFT trophy set (${tier.name} rank, ${tokenURI.length} chars)`);
    });
  });

  // ── VRF Poller: check pending missions for VRF fulfillment ──
  const vrfPollInterval = setInterval(async () => {
    if (processing || pendingVRF.size === 0) return;

    for (const [mid, info] of pendingVRF.entries()) {
      try {
        const mission = await gameMaster.getMission(mid);
        if (mission.targetHash !== ethers.ZeroHash) {
          log(`${C.green}[VRF]${C.reset} Mission #${mid} VRF fulfilled!`);
          pendingVRF.delete(mid);

          if (!briefingSent.has(mid)) {
            briefingSent.add(mid);
            await withLock("generate-briefing", async () => {
              const salt = await gameMaster.missionSalts(mid);
              const scenario = getScenario(mid);
              const briefingText = buildBriefing(scenario, mid);

              const pubKeyHex = await gameMaster.getPlayerPublicKey(info.player);
              const pubKeyBytes = parsePubKey(pubKeyHex);
              if (!pubKeyBytes) {
                log(`${C.red}[generate-briefing]${C.reset} No valid public key for ${info.player.slice(0, 10)}`);
                return;
              }

              const encrypted = eciesEncrypt(pubKeyBytes, briefingText);
              const contentHash = ethers.keccak256(ethers.toUtf8Bytes(briefingText));

              const tx = await gameMaster.receiveClue(mid, 0, contentHash, encrypted, 30);
              await tx.wait();
              log(`${C.green}[generate-briefing]${C.reset} ✓ Encrypted briefing delivered for mission #${mid}`);
            });
          }
        }
      } catch { /* ignore read errors */ }
    }
  }, 5000);

  // ── Carmen Moves: periodic (every 3 min) ──
  const carmenMovesInterval = setInterval(async () => {
    if (processing) return;

    await withLock("carmen-moves", async () => {
      const activeIds: bigint[] = await gameMaster.getActiveMissionIds();
      if (activeIds.length === 0) return;

      log(`${C.cyan}[carmen-moves]${C.reset} Checking ${activeIds.length} active missions...`);

      for (const mid of activeIds) {
        const mission = await gameMaster.getMission(mid);
        const salt = await gameMaster.missionSalts(mid);
        if (salt === ethers.ZeroHash) continue;

        const currentCity = bruteForceCarmenCity(salt, mission.targetHash);
        if (currentCity === 0) continue;

        const otherCities = VALID_CHAIN_IDS.filter(c => c !== currentCity);
        if (otherCities.length === 0) continue;

        const hashNum = BigInt(mission.targetHash);
        const newCity = otherCities[Number(hashNum % BigInt(otherCities.length))];
        const newHash = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [newCity, salt]));

        const tx = await gameMaster.updateTarget(mid, newHash);
        await tx.wait();
        log(`${C.magenta}[carmen-moves]${C.reset} Mission #${Number(mid)}: ${CITIES[currentCity]?.name} → ${CITIES[newCity]?.name}`);
      }
    });
  }, 3 * 60 * 1000); // every 3 minutes

  // ── Graceful shutdown ──
  const shutdown = async () => {
    console.log("");
    log(`${C.yellow}[SHUTDOWN]${C.reset} Stopping CRE Responder...`);
    clearInterval(vrfPollInterval);
    clearInterval(carmenMovesInterval);

    // Restore CRE oracle to proxy
    try {
      const currentCRE = await gameMaster.creOracle();
      if (currentCRE.toLowerCase() === signer.address.toLowerCase()) {
        log(`${C.yellow}[SHUTDOWN]${C.reset} Restoring CRE oracle → Proxy`);
        await (await gameMaster.setCREOracle(PROXY_ADDR)).wait();
        log(`${C.green}[SHUTDOWN]${C.reset} ✓ CRE oracle restored to proxy`);
      }
    } catch (e: any) {
      log(`${C.red}[SHUTDOWN]${C.reset} Could not restore CRE oracle: ${e.message?.slice(0, 60)}`);
    }

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep alive
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
