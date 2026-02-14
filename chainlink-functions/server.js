/**
 * Chainlink Functions Relayer Server
 * 
 * Simple Express server that:
 * 1. Receives signed registration data from frontend
 * 2. Calls requestRegistrationWithSignature() on PlayerRegistry
 * 3. Returns transaction hash
 * 
 * This server runs with a wallet that has ETH for gas
 * Chainlink pays gas - user pays nothing
 */

const express = require("express");
const { ethers } = require("ethers");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// PlayerRegistry contract ABI
const PLAYER_REGISTRY_ABI = [
  "function requestRegistrationWithSignature(address playerAddress, string nickname, bytes signature, uint256 nonce) external",
  "function nonces(address) public view returns (uint256)",
];

// Configuration
const config = {
  rpcUrl: process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
  playerRegistryAddress: process.env.PLAYER_REGISTRY_ADDRESS || "0x40cfae50af62D18480bb588b7554b07d6dFE13e7",
  privateKey: process.env.CHAINLINK_FUNCTIONS_PRIVATE_KEY || "",
  port: process.env.PORT || 3001,
};

// Initialize provider and signer
let provider;
let signer;
let contract;

function initializeProvider() {
  try {
    provider = new ethers.JsonRpcProvider(config.rpcUrl);
    signer = new ethers.Wallet(config.privateKey, provider);
    contract = new ethers.Contract(
      config.playerRegistryAddress,
      PLAYER_REGISTRY_ABI,
      signer
    );
    console.log("✓ Provider initialized");
    console.log("✓ Signer address:", signer.address);
  } catch (error) {
    console.error("Failed to initialize provider:", error.message);
    process.exit(1);
  }
}

/**
 * POST /relay
 * Relays registration request to blockchain
 */
app.post("/relay", async (req, res) => {
  try {
    const { playerAddress, nickname, signature, nonce, contractAddress } = req.body;

    console.log("\n=== Registration Relay Request ===");
    console.log("Player:", playerAddress);
    console.log("Nickname:", nickname);
    console.log("Nonce:", nonce);

    // Validate input
    if (!playerAddress || !nickname || !signature || nonce === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: playerAddress, nickname, signature, nonce",
      });
    }

    // Validate address format
    if (!ethers.isAddress(playerAddress)) {
      return res.status(400).json({
        success: false,
        error: "Invalid player address",
      });
    }

    // Convert nonce to number if it's a string
    const nonceNum = typeof nonce === 'string' ? BigInt(nonce) : nonce;

    // Call requestRegistrationWithSignature
    console.log("Calling requestRegistrationWithSignature...");

    const tx = await contract.requestRegistrationWithSignature(
      playerAddress,
      nickname,
      signature,
      nonceNum
    );

    console.log("✓ Transaction sent:", tx.hash);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log("✓ Transaction confirmed:", receipt.hash);
    console.log("✓ Block:", receipt.blockNumber);

    // Return success response
    return res.json({
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      playerAddress,
      nickname,
    });
  } catch (error) {
    console.error("Error:", error.message);

    // Check for specific error types
    let errorMessage = error.message;
    if (error.code === "INSUFFICIENT_FUNDS") {
      errorMessage = "Insufficient funds for gas";
    } else if (error.reason) {
      errorMessage = error.reason;
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get("/health", async (req, res) => {
  try {
    const balance = await signer.provider.getBalance(signer.address);
    const balanceEth = ethers.formatEther(balance);

    return res.json({
      status: "ok",
      signer: signer.address,
      balance: balanceEth,
      playerRegistry: config.playerRegistryAddress,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      error: error.message,
    });
  }
});

/**
 * Start server
 */
function start() {
  initializeProvider();

  app.listen(config.port, () => {
    console.log("\n=== Chainlink Functions Relayer Server ===");
    console.log(`✓ Server running on http://localhost:${config.port}`);
    console.log(`✓ POST /relay - Relay registration requests`);
    console.log(`✓ GET /health - Health check`);
    console.log("\nWaiting for requests...\n");
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
