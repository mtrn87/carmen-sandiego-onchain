import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== PlayerRegistry Deploy ===");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // --- Deploy PlayerRegistry ---
  console.log("Deploying PlayerRegistry...");
  const PlayerRegistry = await ethers.getContractFactory("PlayerRegistry");
  const playerRegistry = await PlayerRegistry.deploy();
  await playerRegistry.waitForDeployment();
  const prAddress = await playerRegistry.getAddress();
  console.log("✓ PlayerRegistry deployed:", prAddress);

  // --- Save addresses to .env.local ---
  const envPath = path.join(__dirname, "..", ".env.local");
  let envContent = "";

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
  }

  // Update or add PLAYER_REGISTRY address based on network
  const network = (await ethers.provider.getNetwork()).name;
  let envKey = "VITE_PLAYER_REGISTRY_ADDRESS";

  if (network === "sepolia") {
    envKey = "VITE_PLAYER_REGISTRY_ADDRESS_SEPOLIA";
  } else if (network === "arbitrumSepolia") {
    envKey = "VITE_PLAYER_REGISTRY_ADDRESS_ARBITRUM";
  } else if (network === "baseSepolia") {
    envKey = "VITE_PLAYER_REGISTRY_ADDRESS_BASE";
  }

  // Replace or add the key
  const regex = new RegExp(`^${envKey}=.*$`, "m");
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${envKey}=${prAddress}`);
  } else {
    envContent += `\n${envKey}=${prAddress}`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log(`✓ Saved to .env.local: ${envKey}=${prAddress}`);

  console.log("\n=== Deployment Summary ===");
  console.log(`Network: ${network}`);
  console.log(`PlayerRegistry: ${prAddress}`);
  console.log("\nNext steps:");
  console.log("1. Copy the address above");
  console.log("2. Update your .env file with the PlayerRegistry address");
  console.log("3. Set GameMaster address in PlayerRegistry: playerRegistry.setGameMaster(gameMasterAddress)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
