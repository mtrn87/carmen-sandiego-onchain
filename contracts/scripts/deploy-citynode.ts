import { ethers, network } from "hardhat";

// City config per network (updated for new constructor)
const CITY_CONFIG: Record<string, { name: string; countryCode: string; chainId: number; cityId: number }> = {
  arbitrumSepolia: { name: "Tokyo", countryCode: "JP", chainId: 421614, cityId: 1 },
  baseSepolia: { name: "Paris", countryCode: "FR", chainId: 84532, cityId: 2 },
  xdcApothem: { name: "London", countryCode: "GB", chainId: 51, cityId: 3 },
  hardhat: { name: "Dubai", countryCode: "AE", chainId: 31337, cityId: 4 },
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  const cityConfig = CITY_CONFIG[networkName];
  if (!cityConfig) {
    throw new Error(`No city config for network: ${networkName}. Valid: ${Object.keys(CITY_CONFIG).join(", ")}`);
  }

  console.log(`Deploying CityNode (${cityConfig.name}) on ${networkName} with account:`, deployer.address);

  // GameMaster address (will be updated after GameMaster deployment)
  const gameMaster = process.env.GAMEMASTER_ADDRESS || deployer.address;

  const CityNode = await ethers.getContractFactory("CityNode");
  const cityNode = await CityNode.deploy(
    cityConfig.name,
    cityConfig.countryCode,
    cityConfig.chainId,
    cityConfig.cityId,
    gameMaster
  );

  await cityNode.waitForDeployment();
  const address = await cityNode.getAddress();

  console.log(`CityNode (${cityConfig.name}) deployed to:`, address);
  console.log("Chain ID:", cityConfig.chainId);
  console.log("City ID:", cityConfig.cityId);
  console.log("GameMaster:", gameMaster);

  console.log("\n--- Next Steps ---");
  console.log("1. Run seed-case.ts to populate with game data");
  console.log("2. Set correct GameMaster address if using deployer as placeholder");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
