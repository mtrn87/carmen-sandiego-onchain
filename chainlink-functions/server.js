/**
 * Chainlink Functions Relayer & Paymaster Server
 *
 * Gasless experience for players:
 * 1. /faucet  — Auto-funds player wallet with testnet ETH (transparent to player)
 * 2. /relay   — Relays signed registration (server pays gas)
 * 3. /relay/start-mission — Relays startMission (server pays gas)
 * 4. /health  — Server status and balance
 *
 * Architecture: Player signs intent → Server validates → Server submits TX & pays gas
 * In production: Chainlink Functions DON replaces this server for full decentralization
 */

const express = require("express");
const { ethers } = require("ethers");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
// Also load root .env as fallback
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const app = express();
app.use(express.json());
app.use(cors());

// ============================================================
//  Visual Logging for Video Demo — Backend/Relay Layer
// ============================================================

const RESET = "\x1b[0m";
const BOLD  = "\x1b[1m";
const DIM   = "\x1b[2m";
const RED   = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW= "\x1b[33m";
const BLUE  = "\x1b[34m";
const MAGENTA="\x1b[35m";
const CYAN  = "\x1b[36m";
const WHITE = "\x1b[37m";
const BG_BLACK = "\x1b[40m";

const _ts = () => new Date().toISOString().slice(11, 23);
const srvIn    = (...a) => console.log(`${DIM}[${_ts()}]${RESET} ${CYAN}${BOLD}FRONTEND → SERVER  ${RESET}`, ...a);
const srvOut   = (...a) => console.log(`${DIM}[${_ts()}]${RESET} ${GREEN}${BOLD}SERVER  → FRONTEND ${RESET}`, ...a);
const srvBC    = (...a) => console.log(`${DIM}[${_ts()}]${RESET} ${YELLOW}${BOLD}SERVER  → BLOCKCHAIN${RESET}`, ...a);
const srvBCOK  = (...a) => console.log(`${DIM}[${_ts()}]${RESET} ${GREEN}${BOLD}BLOCKCHAIN → SERVER ${RESET}`, ...a);
const srvSign  = (...a) => console.log(`${DIM}[${_ts()}]${RESET} ${MAGENTA}${BOLD}SERVER  🔑 VALIDATE ${RESET}`, ...a);
const srvRate  = (...a) => console.log(`${DIM}[${_ts()}]${RESET} ${BLUE}${BOLD}SERVER  ⏱  RATE-LIM ${RESET}`, ...a);
const srvWarn  = (...a) => console.log(`${DIM}[${_ts()}]${RESET} ${RED}${BOLD}SERVER  ⚠  ERROR   ${RESET}`, ...a);
const srvFaucet= (...a) => console.log(`${DIM}[${_ts()}]${RESET} ${CYAN}${BOLD}FAUCET  💰 ETH     ${RESET}`, ...a);

// PlayerRegistry contract ABI
const PLAYER_REGISTRY_ABI = [
  "function requestRegistrationWithSignature(address playerAddress, string nickname, bytes signature, uint256 nonce) external",
  "function registerPlayer(address playerAddress, string nickname) external",
  "function nonces(address) public view returns (uint256)",
  "function setGameMaster(address _gameMaster) external",
];

// GameMaster contract ABI (for relay)
const GAME_MASTER_ABI = [
  "function startMission() external",
  "function registerPlayer(bytes calldata publicKey) external",
  "function submitInvestigation(uint256 chainId) external",
  "function getPlayerActiveMission(address player) external view returns (uint256)",
  "function getPlayerPublicKey(address player) external view returns (bytes memory)",
];

// CityNode contract ABI (for relay)
const CITY_NODE_ABI = [
  "function inspectLocation(uint8 idx) external",
  "function scanAnomalies(uint8 idx) external",
  "function requestClue(uint8 idx, uint8 clueIndex) external",
  "function requestDossier() external",
  "function requestCapture(address suspectWallet, bytes32 evidenceBundleHash) external",
  "function flagTx(bytes32 refId) external",
];

// Configuration — reads from local .env or root .env
const config = {
  rpcUrl: process.env.SEPOLIA_RPC_URL
    || process.env.VITE_SEPOLIA_RPC_URL
    || "https://rpc.ankr.com/eth_sepolia",
  playerRegistryAddress: process.env.PLAYER_REGISTRY_ADDRESS
    || process.env.VITE_PLAYER_REGISTRY_ADDRESS_SEPOLIA
    || "0x772Ff86AEd36D1fdfFC4764482CdaF2eAe423410",
  gameMasterAddress: process.env.GAME_MASTER_ADDRESS
    || process.env.VITE_GAME_MASTER_ADDRESS
    || "0x84e4af8bf4f2c32276B5F4C32D36756dB0e2a43e",
  privateKey: process.env.CHAINLINK_FUNCTIONS_PRIVATE_KEY
    || process.env.PRIVATE_KEY
    || "",
  port: process.env.RELAY_PORT || process.env.PORT || 3001,
  faucetAmount: process.env.FAUCET_AMOUNT || "0.005", // ETH to send per player
  // CityNode addresses per chain
  cityNodes: {
    421614: {
      address: process.env.CITYNODE_TOKYO_ADDRESS || process.env.VITE_CITYNODE_TOKYO_ADDRESS || "",
      rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    },
    84532: {
      address: process.env.CITYNODE_PARIS_ADDRESS || process.env.VITE_CITYNODE_PARIS_ADDRESS || "",
      rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    },
    51: {
      address: process.env.CITYNODE_SYDNEY_ADDRESS || process.env.CITYNODE_LONDON_ADDRESS || process.env.VITE_CITYNODE_LONDON_ADDRESS || "",
      rpcUrl: process.env.XDC_APOTHEM_RPC_URL || "https://erpc.apothem.network",
    },
  },
};

// Track funded addresses to prevent double-funding
const fundedAddresses = new Set();

// Initialize provider and signer
let provider;
let signer;
let playerRegistryContract;
let gameMasterContract;
const cityNodeContracts = {}; // chainId -> Contract

function initializeProvider() {
  try {
    if (!config.privateKey) {
      console.error("✗ No private key configured (PRIVATE_KEY or CHAINLINK_FUNCTIONS_PRIVATE_KEY)");
      process.exit(1);
    }
    provider = new ethers.JsonRpcProvider(config.rpcUrl);
    signer = new ethers.Wallet(config.privateKey, provider);
    playerRegistryContract = new ethers.Contract(
      config.playerRegistryAddress,
      PLAYER_REGISTRY_ABI,
      signer
    );
    gameMasterContract = new ethers.Contract(
      config.gameMasterAddress,
      GAME_MASTER_ABI,
      signer
    );

    // Initialize CityNode contracts (each on its own chain)
    for (const [chainId, nodeConfig] of Object.entries(config.cityNodes)) {
      if (nodeConfig.address) {
        const nodeProvider = new ethers.JsonRpcProvider(nodeConfig.rpcUrl);
        const nodeSigner = new ethers.Wallet(config.privateKey, nodeProvider);
        cityNodeContracts[chainId] = new ethers.Contract(
          nodeConfig.address,
          CITY_NODE_ABI,
          nodeSigner
        );
        console.log(`✓ CityNode[${chainId}]:`, nodeConfig.address);
      }
    }

    console.log("✓ Provider initialized:", config.rpcUrl);
    console.log("✓ Signer address:", signer.address);
    console.log("✓ PlayerRegistry:", config.playerRegistryAddress);
    console.log("✓ GameMaster:", config.gameMasterAddress);
  } catch (error) {
    console.error("Failed to initialize provider:", error.message);
    process.exit(1);
  }
}

/**
 * Validate a signed relay message.
 * The player signs: keccak256(abi.encodePacked(playerAddress, action, nonce, gameMasterAddress))
 * Returns true if recovered signer matches playerAddress.
 */
function validateRelaySignature(playerAddress, action, nonce, signature) {
  const messageHash = ethers.keccak256(
    ethers.solidityPacked(
      ["address", "string", "uint256", "address"],
      [playerAddress, action, nonce, config.gameMasterAddress]
    )
  );
  const recovered = ethers.verifyMessage(ethers.getBytes(messageHash), signature);
  return recovered.toLowerCase() === playerAddress.toLowerCase();
}

// Simple nonce tracker to prevent replay attacks
const relayNonces = new Map(); // playerAddress -> last seen nonce

// Rate limiting: max requests per address per window
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX = 20; // max 20 relay requests per minute per address
const rateLimitMap = new Map(); // address -> { count, windowStart }

function checkRateLimit(address) {
  const key = address.toLowerCase();
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

// Allowlist of approved CityNode actions
const ALLOWED_CITY_ACTIONS = new Set([
  "inspectLocation",
  "scanAnomalies",
  "requestClue",
  "requestDossier",
  "requestCapture",
  "flagTx",
]);

// ══════════════════════════════════════════════
//  FAUCET — Auto-fund player wallets (gas-free UX)
// ══════════════════════════════════════════════

/**
 * POST /faucet
 * Sends testnet ETH to a player's wallet so they never need to acquire gas.
 * Called transparently on login — player doesn't know about gas.
 */
app.post("/faucet", async (req, res) => {
  try {
    const { address } = req.body;
    srvIn(`POST /faucet — player: ${address?.slice(0, 10)}...`);

    if (!address || !ethers.isAddress(address)) {
      srvWarn("Invalid address");
      return res.status(400).json({ success: false, error: "Invalid address" });
    }

    const normalizedAddr = address.toLowerCase();

    if (fundedAddresses.has(normalizedAddr)) {
      srvFaucet(`Already funded this session — skipping`);
      return res.json({ success: true, message: "Already funded", skipped: true });
    }

    srvBC(`eth_getBalance(${address.slice(0, 10)}...) on Sepolia`);
    const balance = await provider.getBalance(address);
    const balanceEth = parseFloat(ethers.formatEther(balance));
    srvBCOK(`Balance: ${balanceEth.toFixed(6)} ETH`);

    if (balanceEth >= 0.002) {
      srvFaucet(`Sufficient balance (${balanceEth.toFixed(4)} ETH ≥ 0.002) — skipping`);
      fundedAddresses.add(normalizedAddr);
      return res.json({ success: true, message: "Sufficient balance", balance: balanceEth, skipped: true });
    }

    srvFaucet(`Funding ${address.slice(0, 10)}... with ${config.faucetAmount} ETH (gasless UX)`);
    srvBC(`signer.sendTransaction({ to: ${address.slice(0, 10)}..., value: ${config.faucetAmount} ETH })`);
    const tx = await signer.sendTransaction({
      to: address,
      value: ethers.parseEther(config.faucetAmount),
    });
    const receipt = await tx.wait();

    fundedAddresses.add(normalizedAddr);
    srvBCOK(`Funded ✓ tx: ${receipt.hash.slice(0, 22)}... | gas: ${receipt.gasUsed.toString()}`);
    srvOut(`→ { success: true, txHash, amount: ${config.faucetAmount} }`);

    return res.json({
      success: true,
      txHash: receipt.hash,
      amount: config.faucetAmount,
      balance: balanceEth + parseFloat(config.faucetAmount),
    });
  } catch (error) {
    srvWarn(`Faucet error: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ══════════════════════════════════════════════
//  RELAY — Registration (validated signature)
// ══════════════════════════════════════════════

/**
 * POST /relay
 * Relays registration request — validates signature, server pays gas.
 */
app.post("/relay", async (req, res) => {
  try {
    const { playerAddress, nickname, signature, nonce, contractAddress } = req.body;

    srvIn(`POST /relay — Registration Relay`);
    srvIn(`  Player: ${playerAddress} | Nickname: "${nickname}" | Nonce: ${nonce}`);

    if (!playerAddress || !nickname || !signature || nonce === undefined) {
      srvWarn("Missing required fields"); return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    if (!ethers.isAddress(playerAddress)) {
      srvWarn("Invalid player address"); return res.status(400).json({ success: false, error: "Invalid player address" });
    }

    const nonceNum = typeof nonce === 'string' ? BigInt(nonce) : nonce;

    srvSign(`Validating EIP-2771 signature...`);
    srvSign(`  Hash: keccak256(pack(addr, "${nickname}", ${nonceNum}, registry))`);
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "string", "uint256", "address"],
        [playerAddress, nickname, nonceNum, contractAddress]
      )
    );
    const ethSignedMessageHash = ethers.hashMessage(ethers.getBytes(messageHash));
    const recoveredAddress = ethers.recoverAddress(ethSignedMessageHash, signature);

    if (recoveredAddress.toLowerCase() !== playerAddress.toLowerCase()) {
      srvWarn(`Signature INVALID: recovered=${recoveredAddress.slice(0, 10)} ≠ player=${playerAddress.slice(0, 10)}`);
      return res.status(400).json({ success: false, error: "Invalid signature" });
    }
    srvSign(`Signature VALID ✓ (recovered: ${recoveredAddress.slice(0, 10)}...)`);

    srvBC(`PlayerRegistry.registerPlayer(${playerAddress.slice(0, 10)}..., "${nickname}") — SERVER PAYS GAS`);
    const tx = await playerRegistryContract.registerPlayer(playerAddress, nickname);
    const receipt = await tx.wait();
    srvBCOK(`Registration TX confirmed ✓ tx: ${receipt.hash.slice(0, 22)}... | block: ${receipt.blockNumber} | gas: ${receipt.gasUsed.toString()}`);
    srvOut(`→ { success: true, txHash, playerAddress, nickname: "${nickname}" }`);

    return res.json({ success: true, txHash: receipt.hash, blockNumber: receipt.blockNumber, playerAddress, nickname });
  } catch (error) {
    srvWarn(`Registration relay error: ${error.reason || error.message}`);
    return res.status(500).json({ success: false, error: error.reason || error.message });
  }
});

// ══════════════════════════════════════════════
//  RELAY — GameMaster Actions (gasless)
// ══════════════════════════════════════════════

/**
 * Generic relay handler. Validates signature, checks nonce, calls contract.
 * Player signs: keccak256(abi.encodePacked(playerAddress, action, nonce, gameMasterAddress))
 */
function validateAndTrackNonce(playerAddress, action, nonce, signature, res) {
  if (!playerAddress || !signature || nonce === undefined) {
    srvWarn("Missing required fields"); res.status(400).json({ success: false, error: "Missing required fields: playerAddress, signature, nonce" }); return false;
  }
  if (!ethers.isAddress(playerAddress)) {
    srvWarn("Invalid player address"); res.status(400).json({ success: false, error: "Invalid player address" }); return false;
  }

  srvRate(`Rate limit check: ${playerAddress.slice(0, 10)}...`);
  if (!checkRateLimit(playerAddress)) {
    srvRate(`BLOCKED — rate limit exceeded (20/min)`);
    res.status(429).json({ success: false, error: "Rate limit exceeded (max 20 requests/minute)" }); return false;
  }
  const entry = rateLimitMap.get(playerAddress.toLowerCase());
  srvRate(`OK — ${entry?.count || 1}/20 requests this window`);

  const nonceNum = BigInt(nonce);
  const lastNonce = relayNonces.get(playerAddress.toLowerCase()) ?? -1n;
  if (nonceNum <= lastNonce) {
    srvWarn(`Nonce replay: ${nonceNum} ≤ last ${lastNonce}`);
    res.status(400).json({ success: false, error: "Nonce already used (replay protection)" }); return false;
  }

  srvSign(`Validating signature: action="${action}", nonce=${nonceNum}, gm=${config.gameMasterAddress.slice(0, 10)}...`);
  try {
    if (!validateRelaySignature(playerAddress, action, nonceNum, signature)) {
      srvWarn("Signature INVALID"); res.status(400).json({ success: false, error: "Invalid signature" }); return false;
    }
  } catch (sigErr) {
    srvWarn("Malformed signature"); res.status(400).json({ success: false, error: "Malformed signature" }); return false;
  }

  srvSign(`Signature VALID ✓ | Nonce tracked: ${nonceNum}`);
  relayNonces.set(playerAddress.toLowerCase(), nonceNum);
  return true;
}

/**
 * POST /relay/register-player
 * Relays registerPlayer(publicKey) on GameMaster — server pays gas.
 */
app.post("/relay/register-player", async (req, res) => {
  try {
    const { playerAddress, publicKeyHex, signature, nonce } = req.body;

    srvIn(`POST /relay/register-player`);
    srvIn(`  Player: ${playerAddress?.slice(0, 10)}... | PubKey: ${publicKeyHex?.slice(0, 14)}...`);

    if (!validateAndTrackNonce(playerAddress, "registerPlayer", nonce, signature, res)) return;
    if (!publicKeyHex) {
      srvWarn("Missing publicKeyHex"); return res.status(400).json({ success: false, error: "Missing publicKeyHex" });
    }

    srvBC(`GameMaster.registerPlayer(${publicKeyHex.slice(0, 14)}...) — SERVER PAYS GAS`);
    const tx = await gameMasterContract.registerPlayer(publicKeyHex);
    const receipt = await tx.wait();
    srvBCOK(`registerPlayer TX ✓ tx: ${receipt.hash.slice(0, 22)}... | gas: ${receipt.gasUsed.toString()}`);
    srvOut(`→ { success: true, txHash, block: ${receipt.blockNumber} }`);

    return res.json({ success: true, txHash: receipt.hash, blockNumber: receipt.blockNumber });
  } catch (error) {
    srvWarn(`register-player error: ${error.reason || error.message}`);
    return res.status(500).json({ success: false, error: error.reason || error.message });
  }
});

/**
 * POST /relay/start-mission
 * Relays startMission() on GameMaster — server pays gas.
 */
app.post("/relay/start-mission", async (req, res) => {
  try {
    const { playerAddress, signature, nonce } = req.body;

    srvIn(`POST /relay/start-mission`);
    srvIn(`  Player: ${playerAddress?.slice(0, 10)}...`);

    if (!validateAndTrackNonce(playerAddress, "startMission", nonce, signature, res)) return;

    srvBC(`GameMaster.startMission() — triggers Chainlink VRF v2.5 — SERVER PAYS GAS`);
    srvBC(`  VRF will generate random seed → keccak256(chainId, salt) = targetHash (Carmen's city)`);
    const tx = await gameMasterContract.startMission();
    const receipt = await tx.wait();
    srvBCOK(`startMission TX ✓ tx: ${receipt.hash.slice(0, 22)}... | gas: ${receipt.gasUsed.toString()} | events: ${receipt.logs.length}`);
    srvOut(`→ { success: true, txHash, block: ${receipt.blockNumber} }`);

    return res.json({ success: true, txHash: receipt.hash, blockNumber: receipt.blockNumber });
  } catch (error) {
    srvWarn(`start-mission error: ${error.reason || error.message}`);
    return res.status(500).json({ success: false, error: error.reason || error.message });
  }
});

/**
 * POST /relay/submit-investigation
 * Relays submitInvestigation(chainId) on GameMaster — server pays gas.
 */
app.post("/relay/submit-investigation", async (req, res) => {
  try {
    const { playerAddress, chainId, signature, nonce } = req.body;

    srvIn(`POST /relay/submit-investigation`);
    srvIn(`  Player: ${playerAddress?.slice(0, 10)}... | ChainId: ${chainId}`);

    if (!validateAndTrackNonce(playerAddress, `submitInvestigation:${chainId}`, nonce, signature, res)) return;
    if (!chainId) {
      srvWarn("Missing chainId"); return res.status(400).json({ success: false, error: "Missing chainId" });
    }

    srvBC(`GameMaster.submitInvestigation(${chainId}) — CRE WASM evaluates evidence — SERVER PAYS GAS`);
    const tx = await gameMasterContract.submitInvestigation(BigInt(chainId));
    const receipt = await tx.wait();
    srvBCOK(`submitInvestigation TX ✓ tx: ${receipt.hash.slice(0, 22)}... | gas: ${receipt.gasUsed.toString()} | events: ${receipt.logs.length}`);
    srvOut(`→ { success: true, txHash, block: ${receipt.blockNumber} }`);

    return res.json({ success: true, txHash: receipt.hash, blockNumber: receipt.blockNumber });
  } catch (error) {
    srvWarn(`submit-investigation error: ${error.reason || error.message}`);
    return res.status(500).json({ success: false, error: error.reason || error.message });
  }
});

/**
 * POST /relay/city-action
 * Relays CityNode actions (inspectLocation, scanAnomalies, requestClue,
 * requestDossier, requestCapture, flagTx) — server pays gas.
 */
app.post("/relay/city-action", async (req, res) => {
  try {
    const { playerAddress, chainId, action, params, signature, nonce } = req.body;

    srvIn(`POST /relay/city-action`);
    srvIn(`  Player: ${playerAddress?.slice(0, 10)}... | Chain: ${chainId} | Action: ${action} | Params:`, params);

    if (!validateAndTrackNonce(playerAddress, `city:${action}:${chainId}`, nonce, signature, res)) return;

    if (!ALLOWED_CITY_ACTIONS.has(action)) {
      srvWarn(`Action not in allowlist: ${action}`);
      return res.status(400).json({ success: false, error: `Action not allowed: ${action}` });
    }

    const contract = cityNodeContracts[chainId];
    if (!contract) {
      srvWarn(`No CityNode for chain ${chainId}`);
      return res.status(400).json({ success: false, error: `CityNode not configured for chain ${chainId}` });
    }

    srvBC(`CityNode[${chainId}].${action}(${JSON.stringify(params)}) — CROSS-CHAIN TX — SERVER PAYS GAS`);

    let tx;
    switch (action) {
      case "inspectLocation":
        tx = await contract.inspectLocation(params.locationIdx); break;
      case "scanAnomalies":
        tx = await contract.scanAnomalies(params.locationIdx); break;
      case "requestClue":
        srvBC(`  → CRE WASM 'clue-resolver' workflow will process this clue request`);
        tx = await contract.requestClue(params.locationIdx, params.clueIndex); break;
      case "requestDossier":
        srvBC(`  → CRE WASM 'generate-briefing' workflow will generate dossier`);
        tx = await contract.requestDossier(); break;
      case "requestCapture":
        srvBC(`  → CRE WASM 'generate-finale' workflow will evaluate capture attempt`);
        tx = await contract.requestCapture(params.suspectWallet, params.evidenceBundleHash); break;
      case "flagTx":
        tx = await contract.flagTx(params.refId); break;
      default:
        return res.status(400).json({ success: false, error: `Unknown city action: ${action}` });
    }

    const receipt = await tx.wait();
    srvBCOK(`CityNode.${action} TX ✓ tx: ${receipt.hash.slice(0, 22)}... | gas: ${receipt.gasUsed.toString()} | events: ${receipt.logs.length}`);
    srvOut(`→ { success: true, txHash, block: ${receipt.blockNumber}, logs: ${receipt.logs.length} }`);

    return res.json({ success: true, txHash: receipt.hash, blockNumber: receipt.blockNumber, logs: receipt.logs.length });
  } catch (error) {
    srvWarn(`city-action ${req.body?.action} error: ${error.reason || error.message}`);
    return res.status(500).json({ success: false, error: error.reason || error.message });
  }
});

// ══════════════════════════════════════════════
//  HEALTH — Server status
// ══════════════════════════════════════════════

app.get("/health", async (req, res) => {
  try {
    const balance = await provider.getBalance(signer.address);
    return res.json({
      status: "ok",
      signer: signer.address,
      balance: ethers.formatEther(balance),
      playerRegistry: config.playerRegistryAddress,
      gameMaster: config.gameMasterAddress,
      faucetAmount: config.faucetAmount,
      fundedCount: fundedAddresses.size,
    });
  } catch (error) {
    return res.status(500).json({ status: "error", error: error.message });
  }
});

// ══════════════════════════════════════════════
//  START
// ══════════════════════════════════════════════

function start() {
  initializeProvider();

  app.listen(config.port, () => {
    console.log("\n═══════════════════════════════════════════");
    console.log("  Chainlink Functions Paymaster Server");
    console.log("═══════════════════════════════════════════");
    console.log(`  POST /faucet                  — Auto-fund player wallet`);
    console.log(`  POST /relay                   — Relay registration (gasless)`);
    console.log(`  POST /relay/register-player   — Relay GM registerPlayer`);
    console.log(`  POST /relay/start-mission     — Relay GM startMission`);
    console.log(`  POST /relay/submit-investigation — Relay GM submitInvestigation`);
    console.log(`  POST /relay/city-action       — Relay CityNode actions`);
    console.log(`  GET  /health                  — Server status`);
    console.log(`  Listening on  http://localhost:${config.port}`);
    console.log("═══════════════════════════════════════════\n");
  });
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  process.exit(0);
});

// Start the server
start();

module.exports = app;
