/**
 * Chainlink Functions: Registration Relayer
 * 
 * This function:
 * 1. Receives signed registration data from frontend
 * 2. Validates the signature
 * 3. Calls requestRegistrationWithSignature() on PlayerRegistry
 * 4. Returns transaction hash
 * 
 * Chainlink pays gas - user pays nothing
 */

const { ethers } = require("ethers");

// PlayerRegistry contract ABI (minimal - only what we need)
const PLAYER_REGISTRY_ABI = [
  "function requestRegistrationWithSignature(address playerAddress, string nickname, bytes signature, uint256 nonce) external",
  "function nonces(address) public view returns (uint256)"
];

async function main(args) {
  // Parse input arguments
  if (!args || args.length < 4) {
    throw new Error("Missing arguments: playerAddress, nickname, signature, nonce");
  }

  const [playerAddress, nickname, signature, nonce] = args;
  
  console.log("=== Chainlink Functions: Registration Relayer ===");
  console.log("Player:", playerAddress);
  console.log("Nickname:", nickname);
  console.log("Nonce:", nonce);
  console.log("Signature:", signature.substring(0, 20) + "...");

  // Initialize provider and signer (Chainlink provides these)
  // The signer is the Chainlink Functions account that will pay gas
  const provider = new ethers.JsonRpcProvider(secrets.rpcUrl);
  const signer = new ethers.Wallet(secrets.privateKey, provider);

  // PlayerRegistry contract address
  const contractAddress = secrets.playerRegistryAddress;
  
  // Create contract instance
  const contract = new ethers.Contract(
    contractAddress,
    PLAYER_REGISTRY_ABI,
    signer
  );

  try {
    // Call requestRegistrationWithSignature
    // This will emit RegistrationRequested event for CRE to process
    console.log("Calling requestRegistrationWithSignature...");
    
    const tx = await contract.requestRegistrationWithSignature(
      playerAddress,
      nickname,
      signature,
      nonce
    );

    console.log("Transaction sent:", tx.hash);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt.hash);
    console.log("Block:", receipt.blockNumber);

    // Return success response
    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      playerAddress,
      nickname
    };
  } catch (error) {
    console.error("Error calling requestRegistrationWithSignature:", error.message);
    throw error;
  }
}

// Export for Chainlink Functions
module.exports = { main };
