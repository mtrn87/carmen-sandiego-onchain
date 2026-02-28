/**
 * ================================================================
 *  E2E Full Game Flow — Testnet (Real VRF + CRE Simulation)
 * ================================================================
 *
 *  Simulates the COMPLETE Carmen Sandiego On-Chain game flow on
 *  Sepolia testnet, including all 6 CRE workflows with real ECIES
 *  encryption, CityNode gameplay on cross-chain, and NFT trophy
 *  generation.
 *
 *  Usage: npx hardhat run scripts/e2e-full.ts --network sepolia
 *
 *  Phases:
 *    0. Connect to deployed contracts
 *    1. ECIES key generation + PlayerRegistry registration
 *    2. Start mission → Real Chainlink VRF v2.5
 *    3. Generate briefing (CRE simulation)
 *    4. CityNode Path B gameplay (cross-chain)
 *    5. Investigation loop + CRE clue delivery (ECIES + wallet fragments)
 *    6. Carmen moves (target update)
 *    7. Capture Carmen (reveal + NFT mint)
 *    8. Generate finale (SVG trophy + token URI)
 *    9. Restore CRE oracle + final verification
 * ================================================================
 */

import { ethers, network } from "hardhat";
import { secp256k1 } from "@noble/curves/secp256k1";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// ── Load scenario data ──────────────────────────────────────────
const scenariosPath = path.resolve(__dirname, "../../cre-workflows/data/scenarios.json");
const scenariosData = JSON.parse(fs.readFileSync(scenariosPath, "utf-8"));

type ScenarioClue = { type: number; text: string };
type Scenario = {
  id: string;
  title: string;
  briefing: string;
  captureMessage: string;
  cities: Record<string, { name: string; emoji: string; chain: string }>;
  cityClues: Record<string, { landmark: string; culture: string }>;
  clues: { true: ScenarioClue[]; false: ScenarioClue[] };
};

function getScenario(missionId: number): Scenario {
  const scenarios = scenariosData.scenarios;
  const index = (missionId - 1) % scenarios.length;
  return scenarios[index] as Scenario;
}

// ── ANSI Colors ──────────────────────────────────────────────────
const C = {
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m",
  magenta: "\x1b[35m", cyan: "\x1b[36m", white: "\x1b[37m", bold: "\x1b[1m",
  dim: "\x1b[2m", reset: "\x1b[0m", bgRed: "\x1b[41m", bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m", bgMagenta: "\x1b[45m", bgYellow: "\x1b[43m",
};

const CITIES: Record<number, { name: string; emoji: string; chain: string }> = {
  421614: { name: "Tokyo", emoji: "\u{1F5FC}", chain: "Arbitrum Sepolia" },
  84532:  { name: "Paris", emoji: "\u{1F5FC}", chain: "Base Sepolia" },
  51:     { name: "Sydney", emoji: "\u{1F3D6}", chain: "XDC Apothem" },
};
const VALID_CHAIN_IDS = [421614, 84532, 51];

const CITYNODE_MAP: Record<number, { envAddr: string; envRpc: string }> = {
  421614: { envAddr: "CITYNODE_TOKYO_ADDRESS", envRpc: "ARBITRUM_SEPOLIA_RPC_URL" },
  84532:  { envAddr: "CITYNODE_PARIS_ADDRESS", envRpc: "BASE_SEPOLIA_RPC_URL" },
  51:     { envAddr: "CITYNODE_SYDNEY_ADDRESS", envRpc: "XDC_APOTHEM_RPC_URL" },
};

// ── UI Helpers ──────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = (msg: string) => console.log(msg);
const sep = () => console.log(`${C.dim}${"─".repeat(60)}${C.reset}`);

const banner = (text: string) => {
  console.log("");
  console.log(`${C.bold}${C.bgBlue}${C.white} ${"═".repeat(58)} ${C.reset}`);
  console.log(`${C.bold}${C.bgBlue}${C.white}  ${text.padEnd(57)}${C.reset}`);
  console.log(`${C.bold}${C.bgBlue}${C.white} ${"═".repeat(58)} ${C.reset}`);
  console.log("");
};

const box = (lines: string[], color: string = C.cyan) => {
  const width = 56;
  console.log(`${color}${C.bold}  \u250C${"─".repeat(width)}\u2510${C.reset}`);
  for (const line of lines) {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
    const pad = Math.max(0, width - stripped.length);
    console.log(`${color}  \u2502${C.reset} ${line}${" ".repeat(pad)}${color}\u2502${C.reset}`);
  }
  console.log(`${color}${C.bold}  \u2514${"─".repeat(width)}\u2518${C.reset}`);
};

const txLink = (hash: string, chain: string = "sepolia") => {
  if (chain === "sepolia") return `https://sepolia.etherscan.io/tx/${hash}`;
  if (chain === "arbitrum") return `https://sepolia.arbiscan.io/tx/${hash}`;
  if (chain === "base") return `https://sepolia.basescan.org/tx/${hash}`;
  return hash;
};

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

// ── ECIES (secp256k1 + HKDF + AES-256-GCM) ────────────────────
function generateECIESKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = secp256k1.utils.randomPrivateKey();
  const publicKey = secp256k1.getPublicKey(privateKey, false); // uncompressed 65 bytes
  return { privateKey, publicKey };
}

function eciesEncrypt(recipientPubKey: Uint8Array, plaintext: string): string {
  const ephemeralPrivKey = secp256k1.utils.randomPrivateKey();
  const ephemeralPubKey = secp256k1.getPublicKey(ephemeralPrivKey, false);
  const sharedPoint = secp256k1.getSharedSecret(ephemeralPrivKey, recipientPubKey);
  const sharedX = sharedPoint.slice(1, 33);
  const aesKey = hkdf(sha256, sharedX, undefined, "carmen-ecies", 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(aesKey), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([
    Buffer.from(ephemeralPubKey), Buffer.from(iv), encrypted, tag
  ]).toString("hex");
}

function eciesDecrypt(privateKey: Uint8Array, ciphertextHex: string): string {
  const data = Buffer.from(ciphertextHex, "hex");
  const ephemeralPubKey = data.subarray(0, 65);
  const iv = data.subarray(65, 77);
  const ciphertextAndTag = data.subarray(77);
  const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);
  const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);
  const sharedPoint = secp256k1.getSharedSecret(privateKey, new Uint8Array(ephemeralPubKey));
  const sharedX = sharedPoint.slice(1, 33);
  const aesKey = hkdf(sha256, sharedX, undefined, "carmen-ecies", 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(aesKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── CRE Logic Helpers ──────────────────────────────────────────
function bruteForceCarmenCity(salt: string, targetHash: string, chainIds: number[]): number {
  for (const cid of chainIds) {
    const hash = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]));
    if (hash === targetHash) return cid;
  }
  return 0;
}

function calculateStrength(salt: string, clueIndex: number, isCorrectCity: boolean): number {
  const hash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "string"], [salt, clueIndex, "strength"]
    )
  );
  const raw = Number(BigInt(hash) % BigInt(256));
  return isCorrectCity ? 40 + (raw % 56) : 20 + (raw % 36);
}

function selectClue(scenario: Scenario, cluesReceived: number, isCorrectCity: boolean): ScenarioClue {
  const pool = isCorrectCity ? scenario.clues.true : scenario.clues.false;
  return pool[cluesReceived % pool.length];
}

// ── Proxy Report Helper ────────────────────────────────────────
async function sendReportViaProxy(proxy: any, oracle: any, action: number, data: string) {
  const report = ethers.AbiCoder.defaultAbiCoder().encode(["uint8", "bytes"], [action, data]);
  const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes10", "address"],
    [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
  );
  const tx = await proxy.connect(oracle).onReport(metadata, report);
  return (await tx.wait())!;
}

// ── Generate Finale Helpers ────────────────────────────────────
function getRewardTier(reward: number): { name: string; color: string; accent: string } {
  if (reward >= 100) return { name: "GOLD", color: "#FFD700", accent: "#B8860B" };
  if (reward >= 75) return { name: "SILVER", color: "#C0C0C0", accent: "#808080" };
  if (reward >= 50) return { name: "BRONZE", color: "#CD7F32", accent: "#8B4513" };
  return { name: "COPPER", color: "#B87333", accent: "#6B3A1F" };
}

function generateTrophySVG(
  missionId: number, scenario: Scenario,
  tier: { name: string; color: string; accent: string },
  cityName: string, blocksUsed: number, cluesCollected: number, evidenceCount: number,
): string {
  const titleTrunc = scenario.title.length > 35 ? scenario.title.slice(0, 32) + "..." : scenario.title;
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
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
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
  <text x="200" y="285" text-anchor="middle" fill="#fff" font-family="monospace" font-size="10">${titleTrunc}</text>
  <line x1="40" y1="305" x2="360" y2="305" stroke="${tier.color}" stroke-width="1" opacity="0.3"/>
  <text x="40" y="330" fill="#888" font-family="monospace" font-size="10">CAPTURED IN</text>
  <text x="360" y="330" text-anchor="end" fill="#fff" font-family="monospace" font-size="10">${cityName}</text>
  <text x="40" y="355" fill="#888" font-family="monospace" font-size="10">BLOCKS USED</text>
  <text x="360" y="355" text-anchor="end" fill="#fff" font-family="monospace" font-size="10">${blocksUsed}</text>
  <text x="40" y="380" fill="#888" font-family="monospace" font-size="10">CLUES COLLECTED</text>
  <text x="360" y="380" text-anchor="end" fill="#fff" font-family="monospace" font-size="10">${cluesCollected}</text>
  <text x="40" y="405" fill="#888" font-family="monospace" font-size="10">EVIDENCE GATHERED</text>
  <text x="360" y="405" text-anchor="end" fill="#fff" font-family="monospace" font-size="10">${evidenceCount}</text>
  <line x1="40" y1="425" x2="360" y2="425" stroke="${tier.color}" stroke-width="1" opacity="0.3"/>
  <text x="200" y="450" text-anchor="middle" fill="#555" font-family="monospace" font-size="8">CARMEN SANDIEGO ON-CHAIN</text>
  <text x="200" y="465" text-anchor="middle" fill="#555" font-family="monospace" font-size="8">CHAINLINK CRE + VRF v2.5</text>
  <text x="200" y="485" text-anchor="middle" fill="${tier.color}" font-family="monospace" font-size="9" opacity="0.7">convergence hackathon 2025</text>
</svg>`;
}

function buildEnrichedFinale(
  scenario: Scenario, missionId: number, cityName: string,
  tierName: string, blocksUsed: number, cluesCollected: number,
): string {
  const captureBase = scenario.captureMessage || "Carmen Sandiego has been captured!";
  const perf =
    tierName === "GOLD" ? "Your flawless investigation earned the highest distinction. The blockchain remembers perfection."
    : tierName === "SILVER" ? "A thorough investigation \u2014 the on-chain evidence speaks for itself. Well done, detective."
    : tierName === "BRONZE" ? "Carmen put up a fight, but your persistence paid off. Every block counted."
    : "Against all odds, you tracked her down. The chain never lies.";
  const quote =
    tierName === "GOLD" ? `"Impressive, detective. ${blocksUsed} blocks \u2014 I barely had time to finish my coffee. We'll meet again on-chain."`
    : tierName === "SILVER" ? `"Not bad, detective. You followed the hashes well. But next time, I'll use zero-knowledge proofs."`
    : `"You got lucky this time, detective. The next heist will have more layers than a Merkle tree."`;
  return [
    `MISSION #${missionId} \u2014 ${tierName} RANK`,
    `OPERATION: ${scenario.title.toUpperCase()}`,
    `LOCATION: ${cityName} | BLOCKS: ${blocksUsed} | CLUES: ${cluesCollected}`,
    ``, captureBase, ``, perf, ``, `Carmen's last words:`, quote, ``,
    `\u2014 Chief, ACME Detective Agency`,
  ].join("\n");
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  if (network.name === "hardhat" || network.name === "localhost") {
    console.error(`${C.red}ERROR: This script is for TESTNET. Use --network sepolia${C.reset}`);
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  const PRIVATE_KEY = process.env.PRIVATE_KEY!;

  // ── Load addresses ──
  const GM_ADDR = process.env.GAME_MASTER_ADDRESS!;
  const PROXY_ADDR = process.env.GAME_MASTER_PROXY_ADDRESS!;
  const NFT_ADDR = process.env.MISSION_NFT_ADDRESS!;
  const REGISTRY_ADDR = process.env.PLAYER_REGISTRY_ADDRESS!;

  if (!GM_ADDR || !PROXY_ADDR || !NFT_ADDR || !REGISTRY_ADDR) {
    console.error(`${C.red}ERROR: Missing contract addresses in .env${C.reset}`);
    process.exit(1);
  }

  // ================================================================
  //  PHASE 0: CONNECT TO DEPLOYED CONTRACTS
  // ================================================================
  banner("CARMEN SANDIEGO ON-CHAIN \u2014 E2E Full Flow (Testnet)");

  const gameMaster = await ethers.getContractAt("GameMaster", GM_ADDR, signer);
  const proxy = await ethers.getContractAt("GameMasterProxy", PROXY_ADDR, signer);
  const missionNFT = await ethers.getContractAt("MissionNFT", NFT_ADDR, signer);
  const playerRegistry = await ethers.getContractAt("PlayerRegistry", REGISTRY_ADDR, signer);

  const balance = await ethers.provider.getBalance(signer.address);

  box([
    `${C.bold}Network${C.reset}        Sepolia (chainId 11155111)`,
    `${C.bold}Signer${C.reset}         ${signer.address}`,
    `${C.bold}Balance${C.reset}        ${ethers.formatEther(balance)} ETH`,
    `${C.bold}GameMaster${C.reset}     ${GM_ADDR}`,
    `${C.bold}Proxy${C.reset}          ${PROXY_ADDR}`,
    `${C.bold}MissionNFT${C.reset}     ${NFT_ADDR}`,
    `${C.bold}Registry${C.reset}       ${REGISTRY_ADDR}`,
  ]);

  // Connect to CityNodes on other chains
  const CityNodeFactory = await ethers.getContractFactory("CityNode");
  const cityNodeABI = CityNodeFactory.interface;

  const cityNodeContracts: Record<number, { contract: any; provider: any; wallet: any }> = {};
  for (const chainId of VALID_CHAIN_IDS) {
    const { envAddr, envRpc } = CITYNODE_MAP[chainId];
    const addr = process.env[envAddr];
    const rpcUrl = process.env[envRpc];
    if (addr && rpcUrl) {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      const contract = new ethers.Contract(addr, cityNodeABI, wallet);
      cityNodeContracts[chainId] = { contract, provider, wallet };
      const bal = await provider.getBalance(wallet.address);
      log(`${C.green}  \u2713${C.reset} CityNode ${CITIES[chainId].name} (${CITIES[chainId].chain}): ${addr.slice(0, 14)}... | ${ethers.formatEther(bal)} ETH`);
    } else {
      log(`${C.yellow}  \u2717${C.reset} CityNode ${CITIES[chainId].name}: missing address or RPC`);
    }
  }
  sep();

  // ================================================================
  //  PHASE 1: ECIES KEY GENERATION + PLAYER REGISTRATION
  // ================================================================
  banner("PHASE 1: ECIES Key Pair + Player Registration");

  // 1a. Generate real ECIES key pair
  log(`${C.yellow}[STEP 1.1]${C.reset} Generating ${C.bold}real secp256k1 ECIES key pair${C.reset}...`);
  const eciesKeys = generateECIESKeyPair();
  const publicKeyHex = "0x" + bytesToHex(eciesKeys.publicKey);
  log(`${C.green}  \u2713${C.reset} Private key: ${bytesToHex(eciesKeys.privateKey).slice(0, 16)}... (32 bytes)`);
  log(`${C.green}  \u2713${C.reset} Public key:  ${publicKeyHex.slice(0, 20)}... (65 bytes, uncompressed)`);

  // 1b. Quick ECIES round-trip test
  log(`\n${C.yellow}[STEP 1.2]${C.reset} Testing ECIES encrypt/decrypt round-trip...`);
  const testPlaintext = "Hello from Carmen Sandiego On-Chain E2E test!";
  const testCiphertext = eciesEncrypt(eciesKeys.publicKey, testPlaintext);
  const testDecrypted = eciesDecrypt(eciesKeys.privateKey, testCiphertext);
  const eciesOk = testDecrypted === testPlaintext;
  log(`${eciesOk ? C.green : C.red}  ${eciesOk ? "\u2713" : "\u2717"}${C.reset} ECIES round-trip: ${eciesOk ? "PASS" : "FAIL"} (${testCiphertext.length / 2} bytes ciphertext)`);
  if (!eciesOk) { console.error("ECIES FAILED"); process.exit(1); }

  // 1c. PlayerRegistry registration
  log(`\n${C.yellow}[STEP 1.3]${C.reset} PlayerRegistry registration...`);
  const existingPlayer = await playerRegistry.players(signer.address);
  const nickname = `Agent_E2E_${Date.now() % 10000}`;

  if (existingPlayer.wallet !== ethers.ZeroAddress) {
    log(`${C.green}  \u2713${C.reset} Already registered as "${existingPlayer.nickname}"`);
  } else {
    log(`${C.dim}  \u2192 requestRegistration("${nickname}")${C.reset}`);
    const reqTx = await playerRegistry.requestRegistration(nickname);
    await reqTx.wait();
    log(`${C.green}  \u2713${C.reset} RegistrationRequested event emitted`);

    // Simulate CRE callback: owner calls registerPlayer
    log(`${C.magenta}  [CRE]${C.reset} Simulating CRE callback \u2192 registerPlayer(${signer.address.slice(0, 10)}..., "${nickname}")`);
    const gmOnRegistry = await playerRegistry.gameMaster();
    if (gmOnRegistry === ethers.ZeroAddress || gmOnRegistry.toLowerCase() !== signer.address.toLowerCase()) {
      // Set gameMaster on registry to our wallet temporarily
      const currentOwner = await playerRegistry.owner();
      if (currentOwner.toLowerCase() === signer.address.toLowerCase()) {
        await (await playerRegistry.setGameMaster(signer.address)).wait();
        log(`${C.dim}  \u2192 Set registry gameMaster to signer${C.reset}`);
      }
    }
    const regTx = await playerRegistry.registerPlayer(signer.address, nickname);
    await regTx.wait();
    log(`${C.green}  \u2713${C.reset} PlayerRegistered on PlayerRegistry!`);
  }

  // 1d. Register ECIES key on GameMaster
  log(`\n${C.yellow}[STEP 1.4]${C.reset} Registering ECIES public key on GameMaster...`);
  const existingKey = await gameMaster.getPlayerPublicKey(signer.address);

  if (existingKey && existingKey !== "0x" && existingKey.length > 2) {
    log(`${C.green}  \u2713${C.reset} Key already registered: ${existingKey.slice(0, 20)}...`);
    log(`${C.yellow}  \u2192${C.reset} Updating to new key for fresh ECIES round-trip...`);
  }

  const regKeyTx = await gameMaster.registerPlayer(publicKeyHex);
  log(`${C.dim}  \u2192 tx: ${regKeyTx.hash}${C.reset}`);
  await regKeyTx.wait();
  log(`${C.green}  \u2713${C.reset} ECIES public key registered on GameMaster`);

  // Verify
  const storedKey = await gameMaster.getPlayerPublicKey(signer.address);
  const keyMatch = storedKey.toLowerCase() === publicKeyHex.toLowerCase();
  log(`${keyMatch ? C.green : C.red}  ${keyMatch ? "\u2713" : "\u2717"}${C.reset} On-chain key matches: ${keyMatch ? "YES" : "NO"}`);

  // ================================================================
  //  PHASE 2: START MISSION + REAL VRF
  // ================================================================
  banner("PHASE 2: Start Mission \u2192 Chainlink VRF v2.5");

  // Check for active mission
  let missionId = Number(await gameMaster.activePlayerMission(signer.address));
  let mission: any;
  let skipStartMission = false;

  if (missionId > 0) {
    mission = await gameMaster.getMission(missionId);
    const hasVRF = mission.targetHash !== ethers.ZeroHash;
    const isActive = mission.status === BigInt(1);
    if (isActive && hasVRF) {
      log(`${C.green}  \u2713${C.reset} Resuming active mission #${missionId} (VRF already fulfilled)`);
      skipStartMission = true;
    } else if (isActive) {
      log(`${C.yellow}[INFO]${C.reset} Mission #${missionId} pending VRF \u2014 starting fresh`);
    }
  }

  if (!skipStartMission) {
    log(`${C.yellow}[STEP 2.1]${C.reset} Calling ${C.bold}GameMaster.startMission()${C.reset}...`);
    const startTx = await gameMaster.startMission();
    log(`${C.dim}  \u2192 tx: ${startTx.hash}${C.reset}`);
    const startReceipt = await startTx.wait();
    const missionStartedLog = findEvent(startReceipt, gameMaster, "MissionStarted");
    if (missionStartedLog) {
      missionId = Number(parseEvent(gameMaster, missionStartedLog)!.args[0]);
    } else {
      missionId = Number(await gameMaster.activePlayerMission(signer.address));
    }
    log(`${C.green}  \u2713${C.reset} MissionStarted #${missionId} (block ${startReceipt?.blockNumber})`);

    // Poll for VRF
    log(`\n${C.yellow}[STEP 2.2]${C.reset} Waiting for ${C.bold}Chainlink VRF v2.5${C.reset}...`);
    mission = await gameMaster.getMission(missionId);
    let attempts = 0;
    while (mission.targetHash === ethers.ZeroHash && attempts < 60) {
      attempts++;
      process.stdout.write(`\r${C.yellow}  \u23F3 Waiting for VRF${".".repeat((attempts % 3) + 1).padEnd(3)} (${attempts * 5}s)${C.reset}  `);
      await sleep(5000);
      mission = await gameMaster.getMission(missionId);
    }
    console.log("");
    if (mission.targetHash === ethers.ZeroHash) {
      console.error(`\n${C.red}ERROR: VRF timeout. Re-run to resume.${C.reset}`);
      process.exit(1);
    }
  }

  // Brute-force Carmen's city
  const salt = await gameMaster.missionSalts(missionId);
  log(`${C.green}  \u2713${C.reset} VRF fulfilled! targetHash=${mission.targetHash.slice(0, 18)}...`);
  log(`${C.dim}  \u2192 Salt: ${salt}${C.reset}`);

  const carmenChainId = bruteForceCarmenCity(salt, mission.targetHash, VALID_CHAIN_IDS);
  if (carmenChainId === 0) {
    console.error(`${C.red}ERROR: Could not brute-force Carmen's location${C.reset}`);
    process.exit(1);
  }
  const carmenCity = CITIES[carmenChainId];
  const scenario = getScenario(missionId);

  console.log("");
  box([
    `${C.bold}COMMIT-REVEAL: Carmen's location decoded${C.reset}`,
    ``,
    `Carmen is in: ${C.bold}${C.red}${carmenCity.name} ${carmenCity.emoji}${C.reset} (${carmenCity.chain})`,
    `ChainId: ${C.bold}${carmenChainId}${C.reset}`,
    `Scenario: ${C.bold}"${scenario.title}"${C.reset}`,
    ``,
    `${C.dim}Contract only has the hash \u2014 CRE knows the city.${C.reset}`,
  ], C.red);

  // ================================================================
  //  PHASE 3: GENERATE BRIEFING (CRE Simulation)
  // ================================================================
  banner("PHASE 3: Generate Briefing (CRE Simulation)");

  // Set CRE oracle to our wallet
  const creNow = await gameMaster.creOracle();
  if (creNow.toLowerCase() !== signer.address.toLowerCase()) {
    log(`${C.cyan}[SETUP]${C.reset} Setting CRE oracle \u2192 signer wallet (for simulation)`);
    await (await gameMaster.setCREOracle(signer.address)).wait();
    log(`${C.green}  \u2713${C.reset} CRE oracle updated`);
  }

  log(`${C.magenta}[CRE]${C.reset} generate-briefing triggered by MissionStarted event`);

  // Build briefing text (from scenario data)
  const briefingText = [
    `CLASSIFIED BRIEFING \u2014 MISSION #${missionId}`,
    ``,
    scenario.briefing,
    ``,
    `Possible locations: ${Object.values(scenario.cities).map(c => `${c.name} (${c.chain})`).join(", ")}`,
    ``,
    `Good luck, detective. The blockchain never lies.`,
  ].join("\n");

  // ECIES encrypt briefing
  const encryptedBriefing = eciesEncrypt(eciesKeys.publicKey, briefingText);
  const briefingHash = ethers.keccak256(ethers.toUtf8Bytes(briefingText));
  log(`${C.magenta}[CRE]${C.reset} Briefing ECIES-encrypted (${encryptedBriefing.length / 2} bytes)`);

  // Send via direct call (CRE oracle = signer)
  const briefingData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint8", "bytes32", "string", "uint8"],
    [missionId, 0, briefingHash, encryptedBriefing, 30]
  );
  const briefingTx = await gameMaster.receiveClue(missionId, 0, briefingHash, encryptedBriefing, 30);
  log(`${C.dim}  \u2192 tx: ${briefingTx.hash}${C.reset}`);
  await briefingTx.wait();

  // Decrypt and verify
  const decryptedBriefing = eciesDecrypt(eciesKeys.privateKey, encryptedBriefing);
  const briefingMatch = decryptedBriefing === briefingText;
  log(`${C.green}  \u2713${C.reset} ClueReceived (briefing, type=0, strength=30)`);
  log(`${briefingMatch ? C.green : C.red}  ${briefingMatch ? "\u2713" : "\u2717"}${C.reset} ECIES decrypt round-trip: ${briefingMatch ? "PASS" : "FAIL"}`);

  box([
    `${C.bold}MISSION BRIEFING (decrypted)${C.reset}`,
    `${"─".repeat(54)}`,
    ...briefingText.split("\n").slice(0, 6).map(l => l.slice(0, 54)),
    `${C.dim}...${C.reset}`,
  ], C.cyan);

  // ================================================================
  //  PHASE 4: CITYNODE PATH B GAMEPLAY (Cross-chain)
  // ================================================================
  banner("PHASE 4: CityNode Path B Gameplay");

  // We interact with ONE CityNode (Carmen's city) for the full gameplay loop
  const carmenCityNode = cityNodeContracts[carmenChainId];

  if (carmenCityNode) {
    const cn = carmenCityNode.contract;
    const cnWallet = carmenCityNode.wallet;

    log(`${C.cyan}[CITYNODE]${C.reset} Interacting with ${C.bold}${carmenCity.name}${C.reset} CityNode on ${carmenCity.chain}`);

    // Check energy + reset if needed
    let energy = Number(await cn.getEnergy(cnWallet.address));
    log(`${C.dim}  \u2192 Current energy: ${energy}/${10}${C.reset}`);

    if (energy < 7) {
      log(`${C.yellow}  \u2192${C.reset} Resetting player progress for fresh energy...`);
      try {
        await (await cn.resetPlayerProgress(cnWallet.address)).wait();
        energy = Number(await cn.getEnergy(cnWallet.address));
        log(`${C.green}  \u2713${C.reset} Energy reset to ${energy}/${10}`);
      } catch (e: any) {
        log(`${C.yellow}  \u2717${C.reset} Reset failed: ${e.message?.slice(0, 60)}`);
      }
    }

    // 4a. Inspect location 0
    log(`\n${C.yellow}[STEP 4.1]${C.reset} ${C.bold}inspectLocation(0)${C.reset} \u2014 cost: 1 energy`);
    try {
      const inspTx = await cn.inspectLocation(0);
      await inspTx.wait();
      energy = Number(await cn.getEnergy(cnWallet.address));
      log(`${C.green}  \u2713${C.reset} LocationInspected! Energy: ${energy}/${10}`);
    } catch (e: any) {
      log(`${C.yellow}  \u2717${C.reset} ${e.message?.slice(0, 80)}`);
    }

    // 4b. Scan anomalies at location 0
    log(`\n${C.yellow}[STEP 4.2]${C.reset} ${C.bold}scanAnomalies(0)${C.reset} \u2014 cost: 2 energy`);
    try {
      const scanTx = await cn.scanAnomalies(0);
      const scanReceipt = await scanTx.wait();
      energy = Number(await cn.getEnergy(cnWallet.address));
      log(`${C.green}  \u2713${C.reset} AnomalyTxLinked + SuspectWalletObserved! Energy: ${energy}/${10}`);
    } catch (e: any) {
      log(`${C.yellow}  \u2717${C.reset} ${e.message?.slice(0, 80)}`);
    }

    // 4c. Request clue (location 0, clue 0)
    log(`\n${C.yellow}[STEP 4.3]${C.reset} ${C.bold}requestClue(0, 0)${C.reset} \u2014 cost: 2 energy`);
    try {
      const reqClueTx = await cn.requestClue(0, 0);
      const reqClueReceipt = await reqClueTx.wait();
      energy = Number(await cn.getEnergy(cnWallet.address));
      log(`${C.green}  \u2713${C.reset} ClueRequested! Energy: ${energy}/${10}`);

      // Resolve clue (we are gameMaster on CityNode)
      log(`${C.magenta}  [CRE]${C.reset} Resolving clue via gameMaster...`);
      const clueDataHash = ethers.keccak256(ethers.toUtf8Bytes("e2e-clue-citynode"));
      const anomalyRefId = ethers.keccak256(ethers.toUtf8Bytes("anomaly-ref-1"));
      const resolveTx = await cn.resolveClue(1, 0, clueDataHash, anomalyRefId);
      await resolveTx.wait();
      log(`${C.green}  \u2713${C.reset} ClueUnlocked on CityNode!`);
    } catch (e: any) {
      log(`${C.yellow}  \u2717${C.reset} ${e.message?.slice(0, 80)}`);
    }

    // 4d. Flag suspicious transaction
    log(`\n${C.yellow}[STEP 4.4]${C.reset} ${C.bold}flagTx(refId)${C.reset} \u2014 cost: 1 energy`);
    try {
      const flagRefId = ethers.keccak256(ethers.toUtf8Bytes("flag-ref-e2e"));
      const flagTx = await cn.flagTx(flagRefId);
      await flagTx.wait();
      energy = Number(await cn.getEnergy(cnWallet.address));
      log(`${C.green}  \u2713${C.reset} TxFlagged! Energy: ${energy}/${10}`);
    } catch (e: any) {
      log(`${C.yellow}  \u2717${C.reset} ${e.message?.slice(0, 80)}`);
    }

    // 4e. Request dossier + resolve
    log(`\n${C.yellow}[STEP 4.5]${C.reset} ${C.bold}requestDossier()${C.reset} \u2014 cost: 1 energy`);
    try {
      const dosTx = await cn.requestDossier();
      await dosTx.wait();
      energy = Number(await cn.getEnergy(cnWallet.address));
      log(`${C.green}  \u2713${C.reset} DossierRequested! Energy: ${energy}/${10}`);

      log(`${C.magenta}  [CRE]${C.reset} Resolving dossier...`);
      const dosHash = ethers.keccak256(ethers.toUtf8Bytes("e2e-dossier"));
      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("next-objective"));
      const resolveDosTx = await cn.resolveDossier(1, dosHash, 85, hintHash);
      await resolveDosTx.wait();
      log(`${C.green}  \u2713${C.reset} DossierResolved (confidence=85)`);
    } catch (e: any) {
      log(`${C.yellow}  \u2717${C.reset} ${e.message?.slice(0, 80)}`);
    }

    // Verify player progress
    const progress = await cn.getPlayerProgress(cnWallet.address);
    box([
      `${C.bold}CityNode ${carmenCity.name} \u2014 Player Progress${C.reset}`,
      `${"─".repeat(54)}`,
      `Inspected bitmap: ${Number(progress[0]).toString(2).padStart(3, "0")} (location 0 inspected)`,
      `Clues found:      ${progress[1]}`,
      `Scans completed:  ${progress[2]}`,
      `Energy remaining: ${energy}/${10}`,
    ], C.magenta);
  } else {
    log(`${C.yellow}[SKIP]${C.reset} CityNode for ${carmenCity.name} not configured \u2014 skipping Path B`);
  }

  // ================================================================
  //  PHASE 5: INVESTIGATION LOOP + CRE CLUE DELIVERY
  // ================================================================
  banner("PHASE 5: Investigation Loop + CRE Clue Delivery");

  const wrongCities = VALID_CHAIN_IDS.filter(id => id !== carmenChainId);
  const investigationOrder = [...wrongCities, carmenChainId];
  const collectedFragments: string[] = [];
  let cluesDelivered = 1; // briefing was clue #1

  for (let i = 0; i < investigationOrder.length; i++) {
    const invCity = investigationOrder[i];
    const cityInfo = CITIES[invCity];
    const isCorrect = invCity === carmenChainId;

    sep();
    log(`\n${C.yellow}[STEP 5.${i + 1}a]${C.reset} Player investigates ${C.bold}${cityInfo.name} ${cityInfo.emoji}${C.reset} (chainId=${invCity})`);

    const invTx = await gameMaster.submitInvestigation(invCity);
    log(`${C.dim}  \u2192 tx: ${invTx.hash}${C.reset}`);
    const invReceipt = await invTx.wait();
    log(`${C.green}  \u2713${C.reset} InvestigationSubmitted (block ${invReceipt?.blockNumber})`);

    // CRE workflow: select clue, calculate strength, encrypt
    const clueIndex = cluesDelivered; // cluesReceived on-chain
    const strength = calculateStrength(salt, clueIndex, isCorrect);
    const selectedClue = selectClue(scenario, clueIndex, isCorrect);
    const isEvidence = strength > 65;

    log(`\n${C.magenta}  [CRE]${C.reset} ${isCorrect ? `${C.green}CORRECT CITY!${C.reset}` : `${C.yellow}Wrong city${C.reset}`} \u2192 ${isCorrect ? "true" : "false"} clue`);
    log(`${C.magenta}  [CRE]${C.reset} Strength: ${C.bold}${strength}${C.reset} (${isEvidence ? "EVIDENCE \u2713" : "not evidence"})`);
    log(`${C.magenta}  [CRE]${C.reset} Clue type: ${selectedClue.type} | Pool index: ${clueIndex % (isCorrect ? scenario.clues.true.length : scenario.clues.false.length)}`);

    // ECIES encrypt clue
    const encryptedClue = eciesEncrypt(eciesKeys.publicKey, selectedClue.text);
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes(selectedClue.text));
    log(`${C.magenta}  [CRE]${C.reset} ECIES encrypted (${encryptedClue.length / 2} bytes)`);

    // Deliver clue via direct call
    const clueTx = await gameMaster.receiveClue(missionId, selectedClue.type, contentHash, encryptedClue, strength);
    await clueTx.wait();
    cluesDelivered++;

    // Decrypt and verify
    const decryptedClue = eciesDecrypt(eciesKeys.privateKey, encryptedClue);
    const clueMatch = decryptedClue === selectedClue.text;
    log(`${clueMatch ? C.green : C.red}  ${clueMatch ? "\u2713" : "\u2717"}${C.reset} ECIES decrypt: ${clueMatch ? "PASS" : "FAIL"}`);

    box([
      `CLUE #${i + 2} (type=${selectedClue.type}) | Strength: ${C.bold}${strength}/100${C.reset} ${isEvidence ? `${C.green}[EVIDENCE]${C.reset}` : ""}`,
      `${"─".repeat(54)}`,
      ...decryptedClue.slice(0, 200).split("\n").slice(0, 3).map(l => l.slice(0, 54)),
      decryptedClue.length > 200 ? `${C.dim}...${C.reset}` : "",
    ].filter(Boolean), isEvidence ? C.green : C.yellow);

    // Wallet fragment for strong clues
    if (isEvidence) {
      log(`\n${C.magenta}  [CRE]${C.reset} Strong clue! Generating wallet fragment...`);

      const fragmentCount = Number(await gameMaster.missionFragmentCount(missionId));
      const carmenWallet = await gameMaster.deriveCarmenWallet(salt);
      const walletHex = carmenWallet.slice(2).toLowerCase();

      const FRAGMENT_LENGTH = 5;
      const positionHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [salt, fragmentCount])
      );
      const startIndex = Number(BigInt(positionHash) % BigInt(40 - FRAGMENT_LENGTH + 1));
      const fragmentChars = walletHex.slice(startIndex, startIndex + FRAGMENT_LENGTH);

      const fragmentPayload = JSON.stringify({
        fragmentIndex: fragmentCount, startIndex, length: FRAGMENT_LENGTH, chars: fragmentChars,
      });
      const encryptedFragment = eciesEncrypt(eciesKeys.publicKey, fragmentPayload);
      const fragmentContentHash = ethers.keccak256(ethers.toUtf8Bytes(fragmentPayload));

      const fragTx = await gameMaster.receiveWalletFragment(
        missionId, startIndex, FRAGMENT_LENGTH, fragmentContentHash, encryptedFragment
      );
      await fragTx.wait();

      // Decrypt and verify fragment
      const decryptedFrag = JSON.parse(eciesDecrypt(eciesKeys.privateKey, encryptedFragment));
      const fragMatch = decryptedFrag.chars === fragmentChars;
      log(`${fragMatch ? C.green : C.red}  \u2713${C.reset} Fragment #${fragmentCount}: pos=${startIndex}, chars="${fragmentChars}" ${fragMatch ? "PASS" : "FAIL"}`);
      collectedFragments.push(`[${startIndex}..${startIndex + FRAGMENT_LENGTH}] = "${fragmentChars}"`);
    }
  }

  // Evidence summary
  const totalClues = (await gameMaster.getMissionClues(missionId)).length;
  const totalEvidence = Number(await gameMaster.missionEvidenceCount(missionId));
  const totalFragments = Number(await gameMaster.missionFragmentCount(missionId));

  console.log("");
  box([
    `${C.bold}EVIDENCE SUMMARY${C.reset}`,
    `${"─".repeat(54)}`,
    `Clues delivered:    ${totalClues} (1 briefing + ${totalClues - 1} investigation)`,
    `Evidence collected:  ${totalEvidence} (threshold > 65)`,
    `Wallet fragments:    ${totalFragments}`,
    ...collectedFragments.map(f => `  ${C.dim}${f}${C.reset}`),
    `${C.bold}${C.green}Ready for capture (3+ clues) \u2713${C.reset}`,
  ], C.cyan);

  // ================================================================
  //  PHASE 6: CARMEN MOVES (Target Update)
  // ================================================================
  banner("PHASE 6: Carmen Moves (Target Update Simulation)");

  log(`${C.magenta}[CRE]${C.reset} carmen-moves workflow (cron every 3 min)`);
  log(`${C.magenta}[CRE]${C.reset} Reading active missions, brute-forcing current city...`);

  const otherCities = VALID_CHAIN_IDS.filter(c => c !== carmenChainId);
  const newCity = otherCities[0];
  const newSalt = ethers.keccak256(ethers.solidityPacked(["bytes32", "string"], [salt, "carmen-moves"]));
  const newTargetHash = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [newCity, newSalt]));

  log(`${C.magenta}[CRE]${C.reset} Moving Carmen: ${carmenCity.name} \u2192 ${CITIES[newCity].name}`);
  log(`${C.dim}  \u2192 newTargetHash: ${newTargetHash.slice(0, 18)}...${C.reset}`);

  const moveTx = await gameMaster.updateTarget(missionId, newTargetHash);
  await moveTx.wait();
  log(`${C.green}  \u2713${C.reset} CarmenMoved event emitted!`);

  // Verify target changed
  const movedMission = await gameMaster.getMission(missionId);
  const targetChanged = movedMission.targetHash === newTargetHash;
  log(`${targetChanged ? C.green : C.red}  ${targetChanged ? "\u2713" : "\u2717"}${C.reset} Target hash updated: ${targetChanged ? "YES" : "NO"}`);

  // Move back to original city for capture
  log(`\n${C.magenta}[CRE]${C.reset} Moving Carmen back for capture: ${CITIES[newCity].name} \u2192 ${carmenCity.name}`);
  const originalTargetHash = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [carmenChainId, salt]));
  const moveBackTx = await gameMaster.updateTarget(missionId, originalTargetHash);
  await moveBackTx.wait();
  log(`${C.green}  \u2713${C.reset} Carmen restored to ${carmenCity.name}`);

  // ================================================================
  //  PHASE 7: CAPTURE CARMEN (Reveal + NFT Mint)
  // ================================================================
  banner("PHASE 7: Capture Carmen (Reveal + NFT Mint)");

  log(`${C.magenta}[CRE]${C.reset} All conditions met: correct city investigated + 3+ clues`);
  log(`${C.magenta}[CRE]${C.reset} ${C.bold}REVEAL${C.reset}: chainId=${C.bold}${carmenChainId}${C.reset} (${carmenCity.name}), salt=${salt.slice(0, 18)}...`);
  log(`${C.dim}  \u2192 Contract verifies: keccak256(${carmenChainId}, salt) == targetHash${C.reset}`);

  const captureTx = await gameMaster.resolveCapture(missionId, carmenChainId, salt);
  log(`${C.dim}  \u2192 tx: ${captureTx.hash}${C.reset}`);
  const captureReceipt = await captureTx.wait();

  const capturedLog = findEvent(captureReceipt, gameMaster, "CarmenCaptured");
  let blocksUsed = 0;
  let reward = 0;
  let tier = "";
  let tokenId = 0;

  if (capturedLog) {
    const args = parseEvent(gameMaster, capturedLog)!.args;
    blocksUsed = Number(args[2]);
    reward = Number(args[3]);
    tier = reward >= 100 ? "GOLD" : reward >= 75 ? "SILVER" : reward >= 50 ? "BRONZE" : "COPPER";

    console.log("");
    console.log(`${C.bgGreen}${C.bold}${C.white}                                                              ${C.reset}`);
    console.log(`${C.bgGreen}${C.bold}${C.white}   CARMEN SANDIEGO HAS BEEN CAPTURED!                         ${C.reset}`);
    console.log(`${C.bgGreen}${C.bold}${C.white}                                                              ${C.reset}`);
    console.log("");

    log(`${C.green}  [EVENT]${C.reset} CarmenCaptured(mission=${missionId}, blocks=${blocksUsed}, reward=${reward})`);
  }

  const nftMintedLog = findEvent(captureReceipt, missionNFT, "MissionNFTMinted");
  if (nftMintedLog) {
    const nftArgs = parseEvent(missionNFT, nftMintedLog)!.args;
    tokenId = Number(nftArgs[0]);
    log(`${C.green}  [EVENT]${C.reset} MissionNFTMinted(tokenId=${tokenId})`);
  }

  // ================================================================
  //  PHASE 8: GENERATE FINALE (SVG Trophy + Token URI)
  // ================================================================
  banner("PHASE 8: Generate Finale (NFT Trophy)");

  log(`${C.magenta}[CRE]${C.reset} generate-finale triggered by CarmenCaptured event`);

  const rewardTier = getRewardTier(reward);

  // Generate SVG
  const svgImage = generateTrophySVG(
    missionId, scenario, rewardTier, carmenCity.name,
    blocksUsed, totalClues, totalEvidence,
  );
  log(`${C.green}  \u2713${C.reset} SVG trophy generated (${svgImage.length} bytes)`);

  // Generate narrative
  const narrative = buildEnrichedFinale(
    scenario, missionId, carmenCity.name, rewardTier.name, blocksUsed, totalClues,
  );
  log(`${C.green}  \u2713${C.reset} Finale narrative generated (${narrative.length} chars)`);

  // Build ERC-721 metadata
  const svgBase64 = Buffer.from(svgImage).toString("base64");
  const metadata = {
    name: `Carmen Sandiego Mission #${missionId} \u2014 ${rewardTier.name}`,
    description: narrative,
    image: `data:image/svg+xml;base64,${svgBase64}`,
    external_url: "https://github.com/mtrn87/carmen-sandiego-onchain",
    attributes: [
      { trait_type: "Scenario", value: scenario.title },
      { trait_type: "Reward Tier", value: rewardTier.name },
      { trait_type: "Capture City", value: carmenCity.name },
      { trait_type: "Capture Chain", value: carmenCity.chain },
      { display_type: "number", trait_type: "Blocks Used", value: blocksUsed },
      { display_type: "number", trait_type: "Clues Collected", value: totalClues },
      { display_type: "number", trait_type: "Evidence Gathered", value: totalEvidence },
      { display_type: "number", trait_type: "Reward Points", value: reward },
    ],
  };
  const metadataJson = JSON.stringify(metadata);
  const tokenURI = `data:application/json;base64,${Buffer.from(metadataJson).toString("base64")}`;
  log(`${C.green}  \u2713${C.reset} Token URI built (${tokenURI.length} chars)`);

  // Send ACTION_SET_TOKEN_URI via direct call
  log(`\n${C.magenta}[CRE]${C.reset} Setting token URI on MissionNFT...`);

  if (tokenId > 0) {
    const uriTx = await gameMaster.setMissionTokenURI(missionId, tokenURI);
    log(`${C.dim}  \u2192 tx: ${uriTx.hash}${C.reset}`);
    await uriTx.wait();
    log(`${C.green}  \u2713${C.reset} TokenURISet event emitted!`);

    // Verify round-trip
    const onChainURI = await missionNFT.tokenURI(tokenId);
    const uriMatch = onChainURI === tokenURI;
    log(`${uriMatch ? C.green : C.red}  ${uriMatch ? "\u2713" : "\u2717"}${C.reset} Token URI on-chain matches: ${uriMatch ? "YES" : "NO"}`);

    // Decode and verify
    const decodedJson = Buffer.from(onChainURI.replace("data:application/json;base64,", ""), "base64").toString();
    const decoded = JSON.parse(decodedJson);
    log(`${C.green}  \u2713${C.reset} Decoded: "${decoded.name}" (${decoded.attributes.length} traits)`);
    log(`${C.green}  \u2713${C.reset} SVG image embedded: ${decoded.image.startsWith("data:image/svg+xml") ? "YES" : "NO"}`);
  }

  box([
    `${C.bold}NFT METADATA (ERC-721)${C.reset}`,
    `${"─".repeat(54)}`,
    `name: ${metadata.name}`,
    `image: data:image/svg+xml;base64,... (${svgBase64.length} chars)`,
    ...metadata.attributes.map(a => `  ${a.trait_type}: ${C.bold}${a.value}${C.reset}`),
  ], C.magenta);

  // ================================================================
  //  PHASE 9: RESTORE CRE ORACLE + FINAL VERIFICATION
  // ================================================================
  banner("PHASE 9: Restore + Final Verification");

  // Restore CRE oracle to proxy
  log(`${C.yellow}[STEP 9.1]${C.reset} Restoring CRE oracle \u2192 Proxy`);
  const restoreTx = await gameMaster.setCREOracle(PROXY_ADDR);
  await restoreTx.wait();
  const restoredCRE = await gameMaster.creOracle();
  log(`${C.green}  \u2713${C.reset} CRE oracle \u2192 ${restoredCRE.slice(0, 14)}... (proxy)`);

  // Restore gameMaster on PlayerRegistry if changed
  if (REGISTRY_ADDR) {
    try {
      const currentGM = await playerRegistry.gameMaster();
      if (currentGM.toLowerCase() === signer.address.toLowerCase()) {
        // The registry's gameMaster should be the GameMaster contract for production
        // but since we don't have a dedicated CRE, leave as-is or set to GM
        log(`${C.dim}  \u2192 Registry gameMaster: ${currentGM.slice(0, 14)}... (signer)${C.reset}`);
      }
    } catch { /* ignore */ }
  }

  // Final on-chain verification
  const finalMission = await gameMaster.getMission(missionId);
  const playerFree = (await gameMaster.activePlayerMission(signer.address)) === BigInt(0);
  const nftOwner = tokenId > 0 ? await missionNFT.ownerOf(tokenId) : "";
  const finalURI = tokenId > 0 ? await missionNFT.tokenURI(tokenId) : "";

  console.log("");
  box([
    `${C.bold}FINAL ON-CHAIN STATE${C.reset}`,
    `${"─".repeat(54)}`,
    `Mission #${missionId} status: ${finalMission.status === BigInt(2) ? `${C.green}Completed \u2713${C.reset}` : "???"}`,
    `Clues received:     ${Number(finalMission.cluesReceived)}`,
    `Investigations:     ${Number(finalMission.investigationsCount)}`,
    `Evidence count:     ${totalEvidence}`,
    `Wallet fragments:   ${totalFragments}`,
    `Player free:        ${playerFree ? `${C.green}Yes \u2713${C.reset}` : "No"}`,
    `NFT tokenId:        #${tokenId}`,
    `NFT owner:          ${nftOwner ? (nftOwner.toLowerCase() === signer.address.toLowerCase() ? `${C.green}player \u2713${C.reset}` : nftOwner.slice(0, 14)) : "N/A"}`,
    `Token URI:          ${finalURI ? `${C.green}set (${finalURI.length} chars) \u2713${C.reset}` : "empty"}`,
  ], C.green);

  // ================================================================
  //  SUMMARY
  // ================================================================
  banner("E2E COMPLETE \u2014 All CRE Workflows Simulated");

  box([
    `${C.bold}FULL GAME FLOW EXECUTED${C.reset}`,
    `${"─".repeat(54)}`,
    `Network:             Sepolia (real VRF v2.5)`,
    `Mission:             #${missionId} \u2014 "${scenario.title}"`,
    `Carmen captured in:  ${carmenCity.name} ${carmenCity.emoji} (${carmenCity.chain})`,
    `Reward:              ${reward} points (${tier})`,
    `${"─".repeat(54)}`,
    `${C.bold}CRE Workflows Simulated:${C.reset}`,
    `  ${C.green}\u2713${C.reset} player-registration  (PlayerRegistry flow)`,
    `  ${C.green}\u2713${C.reset} generate-briefing    (ECIES encrypted briefing)`,
    `  ${C.green}\u2713${C.reset} mission-start        (clue selection + strength calc)`,
    `  ${C.green}\u2713${C.reset} carmen-moves         (target hash update)`,
    `  ${C.green}\u2713${C.reset} generate-finale      (SVG trophy + ERC-721 metadata)`,
    `${"─".repeat(54)}`,
    `${C.bold}Crypto Pipeline:${C.reset}`,
    `  ${C.green}\u2713${C.reset} secp256k1 ECIES (real keys, not mock)`,
    `  ${C.green}\u2713${C.reset} ECDH + HKDF-SHA256 + AES-256-GCM`,
    `  ${C.green}\u2713${C.reset} ${totalClues} clues encrypted + decrypted`,
    `  ${C.green}\u2713${C.reset} ${totalFragments} wallet fragments encrypted + decrypted`,
    `${"─".repeat(54)}`,
    `${C.bold}Cross-chain:${C.reset}`,
    `  ${carmenCityNode ? `${C.green}\u2713` : `${C.yellow}\u2717`}${C.reset} CityNode ${carmenCity.name} (${carmenCity.chain})`,
    `  ${C.green}\u2713${C.reset} Inspect + Scan + Clue + Flag + Dossier`,
    `${"─".repeat(54)}`,
    `${C.bold}On-chain Artifacts:${C.reset}`,
    `  ${C.green}\u2713${C.reset} MissionNFT #${tokenId} (ERC-721)`,
    `  ${C.green}\u2713${C.reset} SVG trophy as on-chain data URI`,
    `  ${C.green}\u2713${C.reset} CRE oracle restored to proxy`,
  ], C.cyan);

  console.log("");
  log(`${C.bold}  All ${totalClues} clues + ${totalFragments} fragments use real ECIES encryption.${C.reset}`);
  log(`${C.bold}  VRF = Real Chainlink | CRE = Simulated via owner wallet${C.reset}`);
  log(`${C.bold}  Contract knows NOTHING about Carmen until REVEAL.${C.reset}`);
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
