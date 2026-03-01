import { ethers, network } from "hardhat";

// city configs per network — each network can have multiple CityNodes
const CITY_CONFIG: Record<string, Array<{ name: string; countryCode: string; chainId: number; cityId: number }>> = {
  arbitrumSepolia: [
    { name: "Tokyo",  countryCode: "JP", chainId: 421614, cityId: 421614  },
    { name: "Ottawa", countryCode: "CA", chainId: 421614, cityId: 4216141 },
  ],
  baseSepolia: [
    { name: "Paris", countryCode: "FR", chainId: 84532, cityId: 84532  },
    { name: "Rome",  countryCode: "IT", chainId: 84532, cityId: 845321 },
  ],
  xdcApothem: [
    { name: "Sydney",       countryCode: "AU", chainId: 51, cityId: 51  },
    { name: "Nairobi",      countryCode: "KE", chainId: 51, cityId: 511 },
    { name: "Rio de Janeiro", countryCode: "BR", chainId: 51, cityId: 512 },
  ],
  polygonAmoy: [
    { name: "Santiago", countryCode: "CL", chainId: 80002, cityId: 80002  },
    { name: "Dakar",    countryCode: "SN", chainId: 80002, cityId: 800021 },
    { name: "Moscow",   countryCode: "RU", chainId: 80002, cityId: 800022 },
  ],
  bnbTestnet: [
    { name: "London",    countryCode: "GB", chainId: 97, cityId: 97  },
    { name: "Shanghai",  countryCode: "CN", chainId: 97, cityId: 98  },
    { name: "Reykjavík", countryCode: "IS", chainId: 97, cityId: 99  },
    { name: "Berlin",    countryCode: "DE", chainId: 97, cityId: 971 },
  ],
  sepolia: [
    { name: "New York City", countryCode: "US", chainId: 11155111, cityId: 11155111 },
    { name: "Mexico City",   countryCode: "MX", chainId: 11155111, cityId: 11155112 },
    { name: "Dubai",         countryCode: "AE", chainId: 11155111, cityId: 11155113 },
  ],
  // Hardhat local: all 6 representative cities as virtual CityNodes on chainId 31337
  hardhat: [
    { name: "Tokyo",         countryCode: "JP", chainId: 31337, cityId: 421614   },
    { name: "London",        countryCode: "GB", chainId: 31337, cityId: 97       },
    { name: "Paris",         countryCode: "FR", chainId: 31337, cityId: 84532    },
    { name: "Sydney",        countryCode: "AU", chainId: 31337, cityId: 51       },
    { name: "Santiago",      countryCode: "CL", chainId: 31337, cityId: 80002    },
    { name: "New York City", countryCode: "US", chainId: 31337, cityId: 11155111 },
  ],
  localhost: [
    { name: "Tokyo",         countryCode: "JP", chainId: 31337, cityId: 421614   },
    { name: "London",        countryCode: "GB", chainId: 31337, cityId: 97       },
    { name: "Paris",         countryCode: "FR", chainId: 31337, cityId: 84532    },
    { name: "Sydney",        countryCode: "AU", chainId: 31337, cityId: 51       },
    { name: "Santiago",      countryCode: "CL", chainId: 31337, cityId: 80002    },
    { name: "New York City", countryCode: "US", chainId: 31337, cityId: 11155111 },
  ],
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  const citiesConfig = CITY_CONFIG[networkName];
  if (!citiesConfig) {
    throw new Error(`No city config for network: ${networkName}. Valid: ${Object.keys(CITY_CONFIG).join(", ")}`);
  }

  console.log(`\nDeploying ${citiesConfig.length} CityNode(s) on ${networkName}`);
  console.log(`Deployer: ${deployer.address}\n`);

  const gameMaster = process.env.GAMEMASTER_ADDRESS || deployer.address;
  const ccipRouter = process.env.CCIP_ROUTER_ADDRESS || ethers.ZeroAddress;
  const deployedNodes: Array<{ name: string; cityId: number; address: string }> = [];

  for (const cityConfig of citiesConfig) {
    console.log(`▶ Deploying CityNode: ${cityConfig.name} (cityId=${cityConfig.cityId})...`);

    const CityNode = await ethers.getContractFactory("CityNode");
    const cityNode = await CityNode.deploy(
      cityConfig.name,
      cityConfig.countryCode,
      cityConfig.chainId,
      cityConfig.cityId,
      gameMaster,
      ccipRouter
    );

    await cityNode.waitForDeployment();
    const address = await cityNode.getAddress();
    deployedNodes.push({ name: cityConfig.name, cityId: cityConfig.cityId, address });

    console.log(`  ✓ ${cityConfig.name}: ${address}`);
    console.log(`    chainId=${cityConfig.chainId}, cityId=${cityConfig.cityId}\n`);
  }

  console.log("─── Summary ───");
  for (const node of deployedNodes) {
    // Hardhat env var hint
    if (networkName === "hardhat" || networkName === "localhost") {
      console.log(`VITE_HARDHAT_CITYNODE_${node.cityId}_ADDRESS=${node.address}`);
    } else {
      console.log(`${node.name}: ${node.address}`);
    }
  }

  console.log("\n--- Next Steps ---");
  console.log("1. Copy the addresses above to your frontend .env");
  console.log("2. Run seed-case.ts to populate game data");
  console.log("3. Set correct GameMaster address if using deployer as placeholder");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
