import { ethers, network } from "hardhat";

// City config per network
const CITY_CONFIG: Record<string, { name: string; chainId: number }> = {
  arbitrumSepolia: { name: "Tokyo", chainId: 421614 },
  baseSepolia: { name: "Paris", chainId: 84532 },
  xdcApothem: { name: "London", chainId: 51 },
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  const cityConfig = CITY_CONFIG[networkName];
  if (!cityConfig) {
    throw new Error(`No city config for network: ${networkName}. Valid: ${Object.keys(CITY_CONFIG).join(", ")}`);
  }

  console.log(`Deploying CityNode (${cityConfig.name}) on ${networkName} with account:`, deployer.address);

  // CRE oracle address (will be updated after CRE workflow deployment)
  const creOracle = deployer.address; // Temporary: use deployer for testing

  const CityNode = await ethers.getContractFactory("CityNode");
  const cityNode = await CityNode.deploy(
    cityConfig.name,
    cityConfig.chainId,
    creOracle
  );

  await cityNode.waitForDeployment();
  const address = await cityNode.getAddress();

  console.log(`CityNode (${cityConfig.name}) deployed to:`, address);
  console.log("Chain ID:", cityConfig.chainId);

  console.log("\n--- Next Steps ---");
  console.log("1. Update CRE oracle address after workflow deployment");
  console.log("2. Register this CityNode address in the GameMaster contract");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});