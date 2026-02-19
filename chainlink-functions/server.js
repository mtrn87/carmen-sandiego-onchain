const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const PLAYER_REGISTRY_ADDRESS = process.env.PLAYER_REGISTRY_ADDRESS;
const PRIVATE_KEY = process.env.CHAINLINK_FUNCTIONS_PRIVATE_KEY;

// Validate configuration
if (!SEPOLIA_RPC_URL || !PLAYER_REGISTRY_ADDRESS || !PRIVATE_KEY) {
  console.error('ERROR: Missing required environment variables');
  console.error('Required: SEPOLIA_RPC_URL, PLAYER_REGISTRY_ADDRESS, CHAINLINK_FUNCTIONS_PRIVATE_KEY');
  process.exit(1);
}

// Initialize ethers provider and signer
const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

console.log('=== Chainlink Functions Relayer Server ===');
console.log(`Relayer Address: ${signer.address}`);
console.log(`Network: Sepolia`);
console.log(`PlayerRegistry: ${PLAYER_REGISTRY_ADDRESS}`);
console.log('');

// PlayerRegistry ABI (minimal)
const PLAYER_REGISTRY_ABI = [
  'function registerPlayer(address playerAddress, string memory nickname, bytes memory signature) public',
  'function players(address) public view returns (address, string memory, bool)',
  'function isRegistered(address) public view returns (bool)'
];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    relayerAddress: signer.address,
    network: 'sepolia',
    timestamp: new Date().toISOString()
  });
});

// Relay registration endpoint
app.post('/relay', async (req, res) => {
  try {
    const { playerAddress, nickname, signature } = req.body;

    // Validate input
    if (!playerAddress || !nickname || !signature) {
      return res.status(400).json({
        error: 'Missing required fields: playerAddress, nickname, signature'
      });
    }

    // Validate address format
    if (!ethers.isAddress(playerAddress)) {
      return res.status(400).json({
        error: 'Invalid player address'
      });
    }

    console.log(`[${new Date().toISOString()}] Relay request:`);
    console.log(`  Player: ${playerAddress}`);
    console.log(`  Nickname: ${nickname}`);
    console.log(`  Signature: ${signature.substring(0, 20)}...`);

    // Create contract instance
    const contract = new ethers.Contract(
      PLAYER_REGISTRY_ADDRESS,
      PLAYER_REGISTRY_ABI,
      signer
    );

    // Check if already registered
    try {
      const isRegistered = await contract.isRegistered(playerAddress);
      if (isRegistered) {
        return res.status(400).json({
          error: 'Player already registered'
        });
      }
    } catch (e) {
      console.log('  Note: Could not check registration status');
    }

    // Send transaction
    console.log('  Sending transaction...');
    const tx = await contract.registerPlayer(playerAddress, nickname, signature);
    
    console.log(`  TX Hash: ${tx.hash}`);
    console.log('  Waiting for confirmation...');

    // Wait for confirmation
    const receipt = await tx.wait();

    console.log(`  Confirmed in block ${receipt.blockNumber}`);
    console.log(`  Gas used: ${receipt.gasUsed.toString()}`);

    res.json({
      success: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      message: 'Player registered successfully'
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error.message);
    
    res.status(500).json({
      error: 'Registration failed',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
  console.log(`✓ POST /relay - Relay registration requests`);
  console.log(`✓ GET /health - Health check`);
  console.log('');
  console.log('Waiting for requests...');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});
