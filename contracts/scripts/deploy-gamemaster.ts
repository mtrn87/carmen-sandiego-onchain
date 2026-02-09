import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying GameMaster with account:", deployer.address);

  // Chainlink VRF v2.5 config for Sepolia
  const VRF_COORDINATOR = process.env.VRF_COORDINATOR_SEPOLIA || "0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625";
  const VRF_SUBSCRIPTION_ID = process.env.VRF_SUBSCRIPTION_ID || "0";
  const VRF_KEY_HASH = process.env.VRF_KEY_HASH_SEPOLIA || "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";

  // City chain IDs
  const validChainIds = [
    421614,  // Arbitrum Sepolia - Tokyo
    84532,   // Base Sepolia - Paris
    51,      // XDC Apothem - London
  ];

  // CRE oracle address (will be updated after CRE workflow deployment)
  const creOracle = deployer.address; // Temporary: use deployer for testing

  const GameMaster = await ethers.getContractFactory("GameMaster");
  const gameMaster = await GameMaster.deploy(
    VRF_COORDINATOR,
    VRF_SUBSCRIPTION_ID,
    VRF_KEY_HASH,
    validChainIds,
    creOracle
  );

  await gameMaster.waitForDeployment();
  const address = await gameMaster.getAddress();

  console.log("GameMaster deployed to:", address);
  console.log("VRF Coordinator:", VRF_COORDINATOR);
  console.log("Valid cities (chain IDs):", validChainIds);

  console.log("\n--- Next Steps ---");
  console.log("1. Add GameMaster address as VRF consumer in subscription");
  console.log("2. Update CRE oracle address after workflow deployment");
  console.log("3. Deploy CityNode contracts on Arbitrum Sepolia, Base Sepolia, and XDC Apothem");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});