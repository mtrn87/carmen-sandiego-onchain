/**
 * Test script for Chainlink Functions Relayer
 * Simulates a registration request from the frontend
 */

const { ethers } = require("ethers");

// Configuration
const config = {
  rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/cZgx1scPSDR68tWHfflr7",
  playerRegistryAddress: "0x40cfae50af62D18480bb588b7554b07d6dFE13e7",
  privateKey: "92b92ccf8a873edf89831e43332af068192844fffef8ff20f405e3f7b737e3fa",
  relayerUrl: "http://localhost:3001/relay",
};

async function testRelay() {
  console.log("=== Chainlink Functions Relayer Test ===\n");

  try {
    // Initialize provider and signer
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const signer = new ethers.Wallet(config.privateKey, provider);
    const playerAddress = signer.address;

    console.log("Player Address:", playerAddress);
    console.log("Relayer URL:", config.relayerUrl);

    // Get current nonce from contract
    const PlayerRegistryABI = [
      "function nonces(address) public view returns (uint256)",
    ];
    const contract = new ethers.Contract(
      config.playerRegistryAddress,
      PlayerRegistryABI,
      provider
    );

    const nonce = await contract.nonces(playerAddress);
    console.log("Current Nonce:", nonce.toString());

    // Test data
    const nickname = "TestPlayer" + Math.floor(Math.random() * 10000);
    console.log("Test Nickname:", nickname);

    // Create message hash (same as contract: keccak256(abi.encodePacked(...)))
    const packed = ethers.solidityPacked(
      ["address", "string", "uint256", "address"],
      [playerAddress, nickname, nonce, config.playerRegistryAddress]
    );
    
    // Hash it with keccak256
    const messageHash = ethers.keccak256(packed);

    console.log("Packed Data:", packed);
    console.log("Message Hash (keccak256):", messageHash);

    // Sign the hash using toEthSignedMessageHash
    const ethSignedMessageHash = ethers.hashMessage(ethers.getBytes(messageHash));
    const signature = await signer.signMessage(ethers.getBytes(messageHash));
    console.log("Signature:", signature);

    // Prepare relay request
    const relayRequest = {
      playerAddress,
      nickname,
      signature,
      nonce: nonce.toString(),
      contractAddress: config.playerRegistryAddress,
    };

    console.log("\n=== Sending Relay Request ===");
    console.log(JSON.stringify(relayRequest, null, 2));

    // Send relay request
    const response = await fetch(config.relayerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(relayRequest),
    });

    console.log("\n=== Relay Response ===");
    console.log("Status:", response.status);

    const result = await response.json();
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log("\n✅ Test PASSED!");
      console.log("Transaction Hash:", result.txHash);
      console.log("Block Number:", result.blockNumber);
    } else {
      console.log("\n❌ Test FAILED!");
      console.log("Error:", result.error);
    }
  } catch (error) {
    console.error("\n❌ Test ERROR!");
    console.error(error.message);
    process.exit(1);
  }
}

testRelay();
