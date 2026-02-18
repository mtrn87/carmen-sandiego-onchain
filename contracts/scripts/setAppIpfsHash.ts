import { ethers } from "hardhat";

async function main() {
  const GAME_MASTER_ADDRESS = process.env.GAME_MASTER_ADDRESS || "0x40cfae50af62D18480bb588b7554b07d6dFE13e7";
  const IPFS_HASH = process.env.IPFS_HASH || "QmSnX1nY8wiJSRAcS1fxcUJNW81b5tqzRRrm9yHFJeKzXb";

  if (!IPFS_HASH) {
    throw new Error("IPFS_HASH environment variable is required");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Setting IPFS hash with account:", deployer.address);

  // Get GameMaster contract
  const gameMaster = await ethers.getContractAt("GameMaster", GAME_MASTER_ADDRESS);

  // Check if setAppIpfsHash function exists
  try {
    const tx = await gameMaster.setAppIpfsHash(IPFS_HASH);
    const receipt = await tx.wait();

    console.log(`✅ IPFS hash updated successfully`);
    console.log(`📝 Hash: ${IPFS_HASH}`);
    console.log(`🔗 Transaction: ${receipt?.hash}`);
    console.log(`📊 Block: ${receipt?.blockNumber}`);
    console.log("");
    console.log("🌐 App URLs:");
    console.log(`   https://ipfs.io/ipfs/${IPFS_HASH}/`);
    console.log(`   https://cloudflare-ipfs.com/ipfs/${IPFS_HASH}/`);
    console.log(`   https://gateway.pinata.cloud/ipfs/${IPFS_HASH}/`);
  } catch (error: any) {
    if (error.message.includes("setAppIpfsHash is not a function")) {
      console.warn("⚠️  GameMaster contract does not have setAppIpfsHash function");
      console.warn("This is expected if the contract hasn't been updated yet");
      console.warn("You can manually store the IPFS hash or update the contract");
    } else {
      throw error;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
