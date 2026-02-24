/**
 * Chainlink Functions Configuration
 * 
 * This file contains the configuration for Chainlink Functions
 * including the function ID, subscription ID, and other settings
 */

module.exports = {
  // Sepolia network configuration
  sepolia: {
    // Chainlink Functions Router address on Sepolia
    routerAddress: "0xb83E47C2bC239B3bf370bc41e1459A34b41238D0",
    
    // Chainlink Functions Subscription ID (you need to create this)
    // Go to https://functions.chain.link/ and create a subscription
    subscriptionId: process.env.CHAINLINK_FUNCTIONS_SUBSCRIPTION_ID || "0",
    
    // Gas limit for the function execution
    gasLimit: 300000,
    
    // Callback gas limit
    callbackGasLimit: 300000,
    
    // PlayerRegistry contract address on Sepolia
    playerRegistryAddress: "0x40cfae50af62D18480bb588b7554b07d6dFE13e7",
    
    // RPC URL
    rpcUrl: "https://sepolia.infura.io/v3/" + (process.env.INFURA_API_KEY || ""),
    
    // Private key for Chainlink Functions account (must have ETH for gas)
    privateKey: process.env.CHAINLINK_FUNCTIONS_PRIVATE_KEY || "",
  },

  // Function source code (JavaScript)
  functionSource: `
const { ethers } = require("ethers");

const PLAYER_REGISTRY_ABI = [
  "function requestRegistrationWithSignature(address playerAddress, string nickname, bytes signature, uint256 nonce) external",
];

async function main(args) {
  if (!args || args.length < 4) {
    throw new Error("Missing arguments: playerAddress, nickname, signature, nonce");
  }

  const [playerAddress, nickname, signature, nonce] = args;
  
  console.log("Relaying registration for:", playerAddress, nickname);

  const provider = new ethers.JsonRpcProvider(secrets.rpcUrl);
  const signer = new ethers.Wallet(secrets.privateKey, provider);

  const contract = new ethers.Contract(
    secrets.playerRegistryAddress,
    PLAYER_REGISTRY_ABI,
    signer
  );

  const tx = await contract.requestRegistrationWithSignature(
    playerAddress,
    nickname,
    signature,
    nonce
  );

  const receipt = await tx.wait();
  
  return {
    success: true,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

module.exports = { main };
  `,
};
