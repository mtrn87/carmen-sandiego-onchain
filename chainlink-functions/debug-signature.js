/**
 * Debug signature verification
 * Test if frontend and server are signing the same way
 */

const { ethers } = require("ethers");

const config = {
  rpcUrl: process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY",
  playerRegistryAddress: "0x40cfae50af62D18480bb588b7554b07d6dFE13e7",
  privateKey: process.env.PRIVATE_KEY || "your_private_key_here",
};

async function debugSignature() {
  console.log("=== Debug Signature Verification ===\n");

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.privateKey, provider);
  const playerAddress = signer.address;

  console.log("Signer Address:", playerAddress);

  // Test data from frontend
  const nickname = "teate";
  const nonce = 0;
  const contractAddress = config.playerRegistryAddress;

  console.log("\n=== Creating Message Hash ===");
  console.log("playerAddress:", playerAddress);
  console.log("nickname:", nickname);
  console.log("nonce:", nonce);
  console.log("contractAddress:", contractAddress);

  // Method 1: Pack and hash (what both frontend and server should do)
  const packed = ethers.solidityPacked(
    ["address", "string", "uint256", "address"],
    [playerAddress, nickname, nonce, contractAddress]
  );
  console.log("\nPacked:", packed);

  const messageHash = ethers.keccak256(packed);
  console.log("Message Hash (keccak256):", messageHash);

  // Method 2: Apply Ethereum prefix (what contract does)
  const ethSignedMessageHash = ethers.hashMessage(ethers.getBytes(messageHash));
  console.log("Eth Signed Message Hash:", ethSignedMessageHash);

  // Method 3: Sign the message (what frontend does with signMessage)
  console.log("\n=== Signing ===");
  const signature = await signer.signMessage(ethers.getBytes(messageHash));
  console.log("Signature:", signature);

  // Method 4: Verify signature
  console.log("\n=== Verifying ===");
  const recoveredAddress = ethers.recoverAddress(ethSignedMessageHash, signature);
  console.log("Recovered Address:", recoveredAddress);
  console.log("Match:", recoveredAddress.toLowerCase() === playerAddress.toLowerCase());

  // Also test with the frontend's signature from the logs
  console.log("\n=== Testing Frontend Signature ===");
  const frontendSignature = "0x737977073d0add0ea9afe36509c511793972c744581951d67230a20a3d542f407ce8b268a51fd9e727a487f601def9b3db962d5dc451998ae12879d70a73b8851c";
  const frontendNickname = "teate";
  const frontendPlayerAddress = "0xabE28095bfcE0Fe12F1BbC8aBe2Fa4149D35B067";

  const frontendPacked = ethers.solidityPacked(
    ["address", "string", "uint256", "address"],
    [frontendPlayerAddress, frontendNickname, 0, contractAddress]
  );
  const frontendMessageHash = ethers.keccak256(frontendPacked);
  const frontendEthSignedHash = ethers.hashMessage(ethers.getBytes(frontendMessageHash));

  console.log("Frontend Message Hash:", frontendMessageHash);
  console.log("Frontend Eth Signed Hash:", frontendEthSignedHash);

  try {
    const frontendRecovered = ethers.recoverAddress(frontendEthSignedHash, frontendSignature);
    console.log("Frontend Recovered Address:", frontendRecovered);
    console.log("Frontend Match:", frontendRecovered.toLowerCase() === frontendPlayerAddress.toLowerCase());
  } catch (e) {
    console.log("Frontend Recovery Error:", e.message);
  }
}

debugSignature().catch(console.error);
