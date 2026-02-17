import { ethers } from "ethers";

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
  const rpcUrl = "https://eth-sepolia.g.alchemy.com/v2/cZgx1scPSDR68tWHfflr7";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  _playerRegistryContract = new ethers.Contract(
    address,
    PLAYER_REGISTRY_ABI,
    provider
  );

  console.log("[creService] PlayerRegistry initialized:", address);
}

/**
 * Get PlayerRegistry contract instance
 */
function getPlayerRegistryContract() {
  if (!_playerRegistryContract) {
    throw new Error("PlayerRegistry not initialized. Call initializePlayerRegistry first.");
  }
  return _playerRegistryContract;
}

/**
 * Get read-only contract instance (for view functions)
 */
async function getPlayerRegistryReadContract() {
  if (!_playerRegistryAddress) {
    throw new Error("PlayerRegistry address not set");
  }

  // Use read-only provider (no wallet needed)
  const rpcUrl = "https://eth-sepolia.g.alchemy.com/v2/cZgx1scPSDR68tWHfflr7";
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
    const contract = await getPlayerRegistryReadContract();
    console.log("[creService] Reading player data for:", address);
    const player = await contract.getPlayer(address);
    
    // Check if player exists (wallet != 0x0)
    if (player.wallet === ethers.ZeroAddress) {
      console.log("[creService] Player does not exist");
      return null;
    }
    
    console.log("[creService] Player exists:", player);
    return player;
  } catch (error) {
    console.error("[creService] Error reading player data:", error);
    throw error;
  }
}

/**
 * Check if nickname is available (simple read, no CRE)
 */
export async function isNicknameAvailable(nickname) {
  try {
    const contract = await getPlayerRegistryReadContract();
    console.log("[creService] Checking nickname availability:", nickname);
    const available = await contract.isNicknameAvailable(nickname);
    console.log("[creService] Nickname available:", available);
    return available;
  } catch (error) {
    console.error("[creService] Error checking nickname:", error);
    throw error;
  }
}

// ============================================================
//  TRIGGER FUNCTIONS (Frontend calls these, CRE processes)
// ============================================================

/**
 * Sign message for EIP-2771 (Chainlink Functions will relay)
 * Uses Privy's embedded wallet to sign - no MetaMask required
 * @param {Object} privySignMessage - Privy's signMessage function from usePrivy hook
 * @param {string} playerAddress - Player's address (from Privy login)
 * @param {string} nickname - Player's nickname
 */
export async function signRegistrationMessage(privySignMessage, playerAddress, nickname) {
  if (!privySignMessage || typeof privySignMessage !== 'function') {
    throw new Error("Privy signMessage function not available");
  }

  // Use the player address (from Privy login) as the signer address
  const actualPlayerAddress = playerAddress;
  console.log("[creService] Using Privy wallet address:", actualPlayerAddress);
  console.log("[creService] Player address:", playerAddress);

  // Get current nonce from contract
  const contract = getPlayerRegistryContract();
  const nonceBigInt = await contract.nonces(actualPlayerAddress);
  const nonce = Number(nonceBigInt);  // Convert BigInt to number

  console.log("[creService] Signing registration message:", { actualPlayerAddress, nickname, nonce });

  // Create message hash: keccak256(abi.encodePacked(playerAddress, nickname, nonce, contractAddress))
  const contractAddress = import.meta.env.VITE_PLAYER_REGISTRY_ADDRESS_SEPOLIA;

  // Step 1: Pack the data (nonce must be a number, not BigInt or string)
  const packed = ethers.solidityPacked(
    ["address", "string", "uint256", "address"],
    [actualPlayerAddress, nickname, nonce, contractAddress]
  );

  // Step 2: Hash it with keccak256
  const messageHash = ethers.keccak256(packed);

  console.log("[creService] Message hash:", messageHash);

  // Step 3: Sign the hash with Privy's embedded wallet using Privy's signMessage
  // Privy's signMessage expects a string, not bytes
  const signature = await privySignMessage(messageHash);

  console.log("[creService] Message signed with Privy wallet:", signature);

  return {
    playerAddress: actualPlayerAddress,
    nickname,
    nonce: nonce.toString(),
    signature,
    contractAddress
  };
}

/**
 * Call Chainlink Functions to relay registration
 * Chainlink Functions will validate signature and call requestRegistrationWithSignature
 * Chainlink pays gas - user pays nothing
 */
export async function callChainlinkFunctionsForRegistration(signedData) {
  console.log("[creService] Calling Chainlink Functions with signed data:", signedData);
  
  const chainlinkFunctionsUrl = import.meta.env.VITE_CHAINLINK_FUNCTIONS_URL;
  
  if (!chainlinkFunctionsUrl) {
    throw new Error("Chainlink Functions URL not configured in .env");
  }
  
  try {
    // Call Chainlink Functions API
    const response = await fetch(chainlinkFunctionsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
    console.log("[creService] Chainlink Functions response:", result);

    if (!result.success) {
      throw new Error(result.error || "Chainlink Functions failed");
    }

    console.log("[creService] Registration relayed via Chainlink Functions:", result.txHash);
    return result;
  } catch (error) {
    console.error("[creService] Chainlink Functions call failed:", error);
    throw error;
  }
}

/**
 * Trigger: Request player registration (fallback without Chainlink Functions)
 * Emits RegistrationRequested event for CRE to listen and process as paymaster
 * No gas required from user - CRE pays
 */
export async function requestRegistration(nickname) {
  const contract = getPlayerRegistryContract();
  console.log("[creService] Calling requestRegistration for nickname:", nickname);
  const tx = await contract.requestRegistration(nickname);
  const receipt = await tx.wait();
  console.log("[creService] requestRegistration TX confirmed:", receipt.hash);
  return receipt;
}

// ============================================================
//  EVENT LISTENERS
// ============================================================

/**
 * Listen for PlayerRegistered event
 * Called when player is registered (CRE processed the registration)
 */
export async function onPlayerRegistered(callback) {
  const contract = await getPlayerRegistryReadContract();
  console.log("[creService] Setting up PlayerRegistered listener");

  const filter = contract.filters.PlayerRegistered();
  const handler = (player, nickname, timestamp, event) => {
    console.log("[creService] PlayerRegistered received:", {
      player,
      nickname,
      timestamp: Number(timestamp),
    });
    callback({
      player,
      nickname,
      timestamp: Number(timestamp),
      event,
    });
  };

  contract.on(filter, handler);

  return () => {
    console.log("[creService] Removing PlayerRegistered listener");
    contract.off(filter, handler);
  };
}

// ============================================================
//  HELPER FUNCTIONS
// ============================================================

/**
 * Wait for PlayerRegistered event with timeout
 */
export async function waitForPlayerRegistered(playerAddress, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("PlayerRegistered timeout"));
    }, timeoutMs);

    const unsubscribe = onPlayerRegistered((result) => {
      if (result.player.toLowerCase() === playerAddress.toLowerCase()) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(result);
      }
    }).catch(reject);
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
      console.log(`[creService] registerPlayerFlow attempt ${attempt}/${maxRetries}`);

      // Validate nickname availability first
      const available = await isNicknameAvailable(nickname);
      if (!available) {
        throw new Error("Nickname already taken");
      }

      console.log(`[creService] Requesting registration for: ${playerAddress} with nickname: ${nickname}`);

      // Set up listener before sending TX
      const resultPromise = waitForPlayerRegistered(playerAddress, 120000);

      // Send trigger TX (emits RegistrationRequested event for CRE)
      // No gas required from user - CRE will process as paymaster
      await requestRegistration(nickname);

      console.log(`[creService] RegistrationRequested event emitted, waiting for CRE to process...`);

      // Wait for CRE to process and emit PlayerRegistered
      const result = await resultPromise;

      console.log("[creService] registerPlayerFlow completed:", result);
      return {
        nickname: result.nickname,
        timestamp: result.timestamp,
      };
    } catch (error) {
      lastError = error;
      console.warn(`[creService] Attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        console.error(`[creService] All ${maxRetries} attempts failed`);
        throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
      }

      // Exponential backoff: 2^attempt * 1000ms
      const delayMs = Math.pow(2, attempt) * 1000;
      console.log(`[creService] Retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error("Unknown error in registerPlayerFlow");
}
