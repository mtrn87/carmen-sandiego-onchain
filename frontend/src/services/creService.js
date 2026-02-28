import { ethers } from "ethers";
import { getReadProvider, getSigner } from "./contractService";

// ============================================================
//  Visual Logging for Video Demo — CRE/Keystone Layer
// ============================================================

const _clog = (tag, color, ...args) => {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(
    `%c[${ts}] %c${tag}`,
    "color:#888;font-weight:bold",
    `color:${color};font-weight:bold;font-size:11px`,
    ...args
  )
}
const creFlow  = (...a) => _clog("CRE    ⚙️  WORKFLOW   ", "#d35400", ...a)
const creRead  = (...a) => _clog("CRE    📖 REGISTRY   ", "#3498db", ...a)
const creSign  = (...a) => _clog("CRE    🔑 EIP-2771   ", "#9b59b6", ...a)
const creRelay = (...a) => _clog("CRE    → RELAY      ", "#e67e22", ...a)
const creEvent = (...a) => _clog("CRE    ⚡ EVENT      ", "#f39c12", ...a)
const creOK    = (...a) => _clog("CRE    ✅ RESULT     ", "#27ae60", ...a)
const creWarn  = (...a) => _clog("CRE    ⚠️  WARN      ", "#e74c3c", ...a)

const PLAYER_REGISTRY_ABI = [
  // View functions (simple reads, no CRE needed)
  "function getPlayer(address player) external view returns (tuple(address wallet, string nickname, uint256 rank, uint256 missionsCompleted, uint256 missionsAttempted, uint256 totalReward, uint256 totalCluesCollected, uint256 totalInvestigations, uint256 registeredAt, bool isActive))",
  "function isNicknameAvailable(string nickname) external view returns (bool)",
  "function nonces(address player) external view returns (uint256)",

  // Trigger functions (emit events for CRE to process)
  "function requestRegistration(string calldata nickname) external",
  "function requestRegistrationWithSignature(address playerAddress, string nickname, bytes signature, uint256 nonce) external",

  // Events
  "event RegistrationRequested(address indexed player, string nickname)",
  "event PlayerRegistered(address indexed player, string nickname, uint256 timestamp)",
];

let _playerRegistryContract = null;
let _playerRegistryAddress = null;

/**
 * Initialize PlayerRegistry contract instance
 * Uses read-only provider (no signer needed for initialization)
 */
export async function initializePlayerRegistry(address) {
  if (!address) {
    throw new Error("PlayerRegistry address not provided");
  }

  _playerRegistryAddress = address;

  // Use read-only provider for initialization (no wallet access needed)
  const provider = await getReadProvider();

  _playerRegistryContract = new ethers.Contract(
    address,
    PLAYER_REGISTRY_ABI,
    provider
  );

  creRead(`PlayerRegistry initialized: ${address}`);
}

/**
 * Get PlayerRegistry contract instance
 */
function _getPlayerRegistryContract() {
  if (!_playerRegistryContract) {
    throw new Error("PlayerRegistry not initialized. Call initializePlayerRegistry first.");
  }
  return _playerRegistryContract;
}

/**
 * Get write-capable contract instance (with signer for sending transactions)
 */
async function getPlayerRegistryWriteContract() {
  if (!_playerRegistryAddress) {
    throw new Error("PlayerRegistry address not set");
  }
  const signer = await getSigner();
  return new ethers.Contract(_playerRegistryAddress, PLAYER_REGISTRY_ABI, signer);
}

/**
 * Get read-only contract instance (for view functions)
 */
async function getPlayerRegistryReadContract() {
  if (!_playerRegistryAddress) {
    throw new Error("PlayerRegistry address not set");
  }

  // Use read-only provider (no wallet needed)
  const rpcUrl = import.meta.env.VITE_ALCHEMY_RPC_URL_SEPOLIA
    || import.meta.env.VITE_SEPOLIA_RPC_URL
    || "https://rpc.ankr.com/eth_sepolia";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Contract(_playerRegistryAddress, PLAYER_REGISTRY_ABI, provider);
}

// ============================================================
//  VIEW FUNCTIONS (Simple reads, no CRE needed)
// ============================================================

/**
 * Check if player exists (simple read, no CRE)
 * Returns player data if exists, null if not
 */
export async function getPlayerData(address) {
  try {
    creRead(`PlayerRegistry.getPlayer(${address.slice(0, 10)}...)`);
    const contract = await getPlayerRegistryReadContract();
    const player = await contract.getPlayer(address);

    if (player.wallet === ethers.ZeroAddress) {
      creRead(`Player ${address.slice(0, 10)}... NOT registered (wallet=0x0)`);
      return null;
    }

    creOK(`Player found: nickname="${player.nickname}", rank=${player.rank}, missions=${player.missionsCompleted}`);
    return player;
  } catch (error) {
    creWarn(`Error reading player data: ${error.message}`);
    throw error;
  }
}

/**
 * Check if nickname is available (simple read, no CRE)
 */
export async function isNicknameAvailable(nickname) {
  try {
    creRead(`PlayerRegistry.isNicknameAvailable("${nickname}")`);
    const contract = await getPlayerRegistryReadContract();
    const available = await contract.isNicknameAvailable(nickname);
    creOK(`Nickname "${nickname}" available = ${available}`);
    return available;
  } catch (error) {
    creWarn(`Error checking nickname: ${error.message}`);
    throw error;
  }
}

// ============================================================
//  TRIGGER FUNCTIONS (Frontend calls these, CRE processes)
// ============================================================

/**
 * Sign message for EIP-2771 (Chainlink Functions will relay)
 * Supports both Privy embedded wallet and MetaMask
 * @param {Object} user - Privy user object
 * @param {Object} privySignMessage - Privy's signMessage function from usePrivy hook
 * @param {string} playerAddress - Player's address (from Privy login)
 * @param {string} nickname - Player's nickname
 */
export async function signRegistrationMessage(user, privySignMessage, playerAddress, nickname) {
  creSign("EIP-2771 Registration Signing Flow");
  if (!user) {
    throw new Error("Privy user not available");
  }

  let actualPlayerAddress = playerAddress;
  let signatureMethod = 'privy';

  // Strategy: try window.ethereum (MetaMask/injected) FIRST, fall back to Privy embedded
  if (window.ethereum) {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      actualPlayerAddress = await signer.getAddress();
      signatureMethod = 'metamask';
      creSign(`Detected MetaMask/injected wallet: ${actualPlayerAddress.slice(0, 10)}...`);
    } catch (e) {
      creSign(`window.ethereum available but signer failed (${e.message}) — trying Privy`);
    }
  }

  creSign(`Wallet: ${signatureMethod} | Player: ${actualPlayerAddress.slice(0, 10)}...`);

  const contract = await getPlayerRegistryReadContract();
  const nonceBigInt = await contract.nonces(actualPlayerAddress);
  const nonce = Number(nonceBigInt);
  creSign(`Nonce from PlayerRegistry: ${nonce}`);

  const contractAddress = import.meta.env.VITE_PLAYER_REGISTRY_ADDRESS_SEPOLIA;

  const packed = ethers.solidityPacked(
    ["address", "string", "uint256", "address"],
    [actualPlayerAddress, nickname, nonce, contractAddress]
  );
  const messageHash = ethers.keccak256(packed);
  creSign(`Hash: keccak256(pack(addr, "${nickname}", ${nonce}, registry)) = ${messageHash.slice(0, 18)}...`);

  let signature;
  if (signatureMethod === 'metamask') {
    creSign("Requesting MetaMask/external wallet signature...");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    signature = await signer.signMessage(ethers.getBytes(messageHash));
  } else if (privySignMessage && typeof privySignMessage === 'function') {
    creSign("Requesting Privy embedded wallet signature...");
    signature = await privySignMessage(messageHash);
  } else {
    throw new Error("No signing method available. Connect MetaMask or use Privy embedded wallet.");
  }
  creOK(`Signature: ${signature.slice(0, 18)}... ✓`);

  return { playerAddress: actualPlayerAddress, nickname, nonce: nonce.toString(), signature, contractAddress };
}

/**
 * Call Chainlink Functions to relay registration
 * Chainlink Functions will validate signature and call requestRegistrationWithSignature
 * Chainlink pays gas - user pays nothing
 */
export async function callChainlinkFunctionsForRegistration(signedData) {
  const chainlinkFunctionsUrl = import.meta.env.VITE_CHAINLINK_FUNCTIONS_URL;

  if (!chainlinkFunctionsUrl) {
    throw new Error("Chainlink Functions URL not configured in .env");
  }

  creRelay(`POST ${chainlinkFunctionsUrl}`);
  creRelay(`Payload: player=${signedData.playerAddress.slice(0, 10)}..., nickname="${signedData.nickname}", nonce=${signedData.nonce}`);
  const t0 = performance.now();

  try {
    const response = await fetch(chainlinkFunctionsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerAddress: signedData.playerAddress,
        nickname: signedData.nickname,
        signature: signedData.signature,
        nonce: signedData.nonce,
        contractAddress: signedData.contractAddress,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chainlink Functions error: ${response.statusText}`);
    }

    const result = await response.json();
    const dt = (performance.now() - t0).toFixed(0);

    if (!result.success) {
      creWarn(`Relay FAILED (${dt}ms): ${result.error}`);
      throw new Error(result.error || "Chainlink Functions failed");
    }

    creOK(`Registration relayed (${dt}ms) → tx: ${result.txHash?.slice(0, 18)}...`);
    creFlow("Server validated signature → called PlayerRegistry.registerPlayer() → gas paid by server");
    return result;
  } catch (error) {
    creWarn(`Chainlink Functions call failed: ${error.message}`);
    throw error;
  }
}

/**
 * Trigger: Request player registration (fallback without Chainlink Functions)
 * Emits RegistrationRequested event for CRE to listen and process as paymaster
 * No gas required from user - CRE pays
 */
export async function requestRegistration(nickname) {
  creFlow(`PlayerRegistry.requestRegistration("${nickname}") — emits RegistrationRequested event`);
  creFlow("CRE WASM workflow 'player-registration' will listen and process as paymaster");
  const contract = await getPlayerRegistryWriteContract();
  const tx = await contract.requestRegistration(nickname);
  const receipt = await tx.wait();
  creOK(`requestRegistration confirmed: tx=${receipt.hash.slice(0, 18)}... block=${receipt.blockNumber}`);
  creEvent("RegistrationRequested event emitted → waiting for CRE to process...");
  return receipt;
}

// ============================================================
//  EVENT LISTENERS (poll-based, avoids eth_newFilter)
// ============================================================

/**
 * Listen for PlayerRegistered event via polling (no eth_newFilter).
 */
export async function onPlayerRegistered(callback) {
  const contract = await getPlayerRegistryReadContract();
  creEvent("Setting up PlayerRegistered event poll listener (6s interval)");

  const filter = contract.filters.PlayerRegistered();
  let lastBlock = -1;
  let stopped = false;

  const poll = async () => {
    if (stopped) return;
    try {
      const currentBlock = await contract.runner.provider.getBlockNumber();
      const fromBlock = lastBlock === -1 ? currentBlock : lastBlock + 1;
      if (fromBlock > currentBlock) return;
      const events = await contract.queryFilter(filter, fromBlock, currentBlock);
      lastBlock = currentBlock;
      for (const ev of events) {
        try {
          const parsed = contract.interface.parseLog(ev);
          if (parsed) {
            creEvent(`PlayerRegistered! player=${parsed.args[0].slice(0, 10)}..., nickname="${parsed.args[1]}", ts=${Number(parsed.args[2])}`);
            creFlow("CRE processed registration → player is now on-chain ✓");
            callback({
              player: parsed.args[0],
              nickname: parsed.args[1],
              timestamp: Number(parsed.args[2]),
            });
          }
        } catch { /* skip */ }
      }
    } catch (err) {
      console.warn("[creService] PlayerRegistered poll error:", err.message);
    }
  };

  poll();
  const id = setInterval(poll, 6000);

  return () => {
    creEvent("Removing PlayerRegistered poll listener");
    stopped = true;
    clearInterval(id);
  };
}

// ============================================================
//  HELPER FUNCTIONS
// ============================================================

/**
 * Wait for PlayerRegistered event with timeout (poll-based).
 */
export async function waitForPlayerRegistered(playerAddress, timeoutMs = 60000) {
  const contract = await getPlayerRegistryReadContract();
  const filter = contract.filters.PlayerRegistered(playerAddress);

  return new Promise((resolve, reject) => {
    let lastBlock = -1;
    let stopped = false;

    const timeout = setTimeout(() => {
      stopped = true;
      clearInterval(id);
      reject(new Error("PlayerRegistered timeout"));
    }, timeoutMs);

    const poll = async () => {
      if (stopped) return;
      try {
        const currentBlock = await contract.runner.provider.getBlockNumber();
        const fromBlock = lastBlock === -1 ? currentBlock : lastBlock + 1;
        if (fromBlock > currentBlock) return;
        const events = await contract.queryFilter(filter, fromBlock, currentBlock);
        lastBlock = currentBlock;
        for (const ev of events) {
          try {
            const parsed = contract.interface.parseLog(ev);
            if (parsed && parsed.args[0].toLowerCase() === playerAddress.toLowerCase()) {
              stopped = true;
              clearInterval(id);
              clearTimeout(timeout);
              resolve({
                player: parsed.args[0],
                nickname: parsed.args[1],
                timestamp: Number(parsed.args[2]),
              });
              return;
            }
          } catch { /* skip */ }
        }
      } catch (err) {
        console.warn("[creService] waitForPlayerRegistered poll error:", err.message);
      }
    };

    poll();
    const id = setInterval(poll, 3000);
  });
}

/**
 * Complete flow: Register player with retry
 * Calls requestRegistration() which emits event for CRE to process as paymaster
 * Returns { nickname, timestamp } or throws error
 */
export async function registerPlayerFlow(nickname, playerAddress, maxRetries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      creFlow(`Attempt ${attempt}/${maxRetries}...`);

      // Validate nickname availability first
      const available = await isNicknameAvailable(nickname);
      if (!available) {
        throw new Error("Nickname already taken");
      }

      creFlow("╔══════════════════════════════════════════════════════════╗");
      creFlow("║  CRE Registration Flow — Chainlink Gasless UX          ║");
      creFlow("╚══════════════════════════════════════════════════════════╝");
      creFlow(`Player: ${playerAddress.slice(0, 10)}... | Nickname: "${nickname}"`);

      // Set up listener before sending TX
      const resultPromise = waitForPlayerRegistered(playerAddress, 120000);

      // Send trigger TX (emits RegistrationRequested event for CRE)
      // No gas required from user - CRE will process as paymaster
      await requestRegistration(nickname);

      creFlow("Step 3: Waiting for CRE WASM workflow 'player-registration' to process...");
      creFlow("  CRE listens for RegistrationRequested → validates → calls registerPlayer()");

      // Wait for CRE to process and emit PlayerRegistered
      const result = await resultPromise;

      creOK("╔══════════════════════════════════════════════════════════╗");
      creOK(`║  Registration COMPLETE: "${result.nickname}" is now on-chain!   ║`);
      creOK("╚══════════════════════════════════════════════════════════╝");
      return {
        nickname: result.nickname,
        timestamp: result.timestamp,
      };
    } catch (error) {
      lastError = error;
      creWarn(`Attempt ${attempt} failed: ${error.message}`);

      if (attempt === maxRetries) {
        creWarn(`All ${maxRetries} attempts failed`);
        throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
      }

      const delayMs = Math.pow(2, attempt) * 1000;
      creFlow(`Retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error("Unknown error in registerPlayerFlow");
}
