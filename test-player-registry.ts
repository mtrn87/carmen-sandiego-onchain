import { ethers } from "ethers";

// PlayerRegistry ABI
const PLAYER_REGISTRY_ABI = [
  "function registerPlayer(string nickname) external",
  "function getPlayer(address player) external view returns (tuple(address wallet, string nickname, uint256 rank, uint256 missionsCompleted, uint256 missionsAttempted, uint256 totalReward, uint256 totalCluesCollected, uint256 totalInvestigations, uint256 registeredAt, bool isActive))",
  "function isNicknameAvailable(string nickname) external view returns (bool)",
  "event PlayerRegistered(address indexed player, string nickname, uint256 timestamp)",
];

async function testPlayerRegistry() {
  try {
    // Connect to Sepolia
    const provider = new ethers.JsonRpcProvider(
      process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY"
    );

    // Use a test account (you'll need to replace with your actual private key)
    const privateKey = process.env.TEST_PRIVATE_KEY || "0x" + "0".repeat(64);
    const signer = new ethers.Wallet(privateKey, provider);

    const playerRegistryAddress = "0xD004e782DbEeAe2EDE648Bb86a64e4Da89320f0b";
    const contract = new ethers.Contract(
      playerRegistryAddress,
      PLAYER_REGISTRY_ABI,
      signer
    );

    console.log("=== Testing PlayerRegistry ===\n");
    console.log("Signer address:", signer.address);
    console.log("PlayerRegistry address:", playerRegistryAddress);
    console.log("");

    // Test 1: Check if player exists (should not exist initially)
    console.log("Test 1: Check if player exists (before registration)");
    try {
      const playerBefore = await contract.getPlayer(signer.address);
      console.log("Player data:", {
        wallet: playerBefore.wallet,
        nickname: playerBefore.nickname,
        rank: playerBefore.rank.toString(),
        isActive: playerBefore.isActive,
      });
      
      if (playerBefore.wallet === ethers.ZeroAddress) {
        console.log("✓ Player does NOT exist (wallet is zero address)\n");
      } else {
        console.log("✓ Player EXISTS\n");
      }
    } catch (error: any) {
      console.error("✗ Error reading player:", error.message, "\n");
    }

    // Test 2: Check nickname availability
    console.log("Test 2: Check nickname availability");
    const testNickname = "TestAgent_" + Math.random().toString(36).substring(7);
    try {
      const available = await contract.isNicknameAvailable(testNickname);
      console.log(`Nickname "${testNickname}" available:`, available);
      console.log("");
    } catch (error: any) {
      console.error("✗ Error checking nickname:", error.message, "\n");
    }

    // Test 3: Register player
    console.log("Test 3: Register player");
    try {
      console.log(`Registering with nickname: "${testNickname}"`);
      const tx = await contract.registerPlayer(testNickname);
      console.log("TX hash:", tx.hash);
      console.log("Waiting for confirmation...");
      const receipt = await tx.wait();
      console.log("✓ Registration confirmed at block:", receipt?.blockNumber);
      console.log("");
    } catch (error: any) {
      console.error("✗ Registration error:", error.message, "\n");
      return;
    }

    // Test 4: Check if player exists (after registration)
    console.log("Test 4: Check if player exists (after registration)");
    try {
      const playerAfter = await contract.getPlayer(signer.address);
      console.log("Player data:", {
        wallet: playerAfter.wallet,
        nickname: playerAfter.nickname,
        rank: playerAfter.rank.toString(),
        missionsCompleted: playerAfter.missionsCompleted.toString(),
        isActive: playerAfter.isActive,
        registeredAt: new Date(Number(playerAfter.registeredAt) * 1000).toISOString(),
      });
      console.log("✓ Player EXISTS after registration\n");
    } catch (error: any) {
      console.error("✗ Error reading player:", error.message, "\n");
    }

    // Test 5: Try to register again with same nickname (should fail)
    console.log("Test 5: Try to register again with same nickname");
    try {
      const tx = await contract.registerPlayer(testNickname);
      await tx.wait();
      console.log("✗ Should have failed but succeeded\n");
    } catch (error: any) {
      console.log("✓ Registration failed as expected:", error.reason || error.message, "\n");
    }

    console.log("=== Tests Complete ===");
  } catch (error: any) {
    console.error("Fatal error:", error);
  }
}

testPlayerRegistry();
