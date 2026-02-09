import { ethers } from "hardhat";

/**
 * Carmen Sandiego On-Chain - Wallet & Network Setup Guide
 *
 * This script checks balances across all networks and provides
 * instructions for funding wallets via faucets.
 *
 * Usage: npx hardhat run scripts/setup-wallets.ts
 */

// ============================================================
//  WALLETS NEEDED
// ============================================================
//
//  1. DEPLOYER WALLET (single wallet, same on all chains)
//     - Deploys GameMaster.sol on Sepolia
//     - Deploys CityNode.sol on Arbitrum Sepolia, Base Sepolia, XDC Apothem
//     - Becomes contract owner
//     - Needs: ETH on all 4 chains + LINK on Sepolia (for VRF)
//
//  2. CRE ORACLE WALLET (set after CRE workflow deployment)
//     - The address authorized to call receiveClue() and updateCarmenPresence()
//     - This is the CRE DON address, configured after workflow deploy
//     - No funding needed (CRE pays its own gas)
//
//  3. PLAYER WALLET(S) (for testing)
//     - Any wallet that connects via frontend
//     - Needs: ETH on Sepolia (to call startMission/submitInvestigation)
//
// ============================================================

interface NetworkInfo {
  name: string;
  chainId: number;
  city: string;
  contract: string;
  faucet: string;
  rpcUrl: string;
  explorer: string;
  needsLINK: boolean;
}

const NETWORKS: NetworkInfo[] = [
  {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    city: "HQ Central",
    contract: "GameMaster.sol",
    faucet: "https://faucets.chain.link (ETH + LINK)",
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY",
    explorer: "https://sepolia.etherscan.io",
    needsLINK: true,
  },
  {
    name: "Arbitrum Sepolia",
    chainId: 421614,
    city: "Tokyo",
    contract: "CityNode.sol",
    faucet: "https://faucets.chain.link (select Arbitrum Sepolia)",
    rpcUrl: "https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY",
    explorer: "https://sepolia.arbiscan.io",
    needsLINK: false,
  },
  {
    name: "Base Sepolia",
    chainId: 84532,
    city: "Paris",
    contract: "CityNode.sol",
    faucet: "https://faucets.chain.link (select Base Sepolia)",
    rpcUrl: "https://base-sepolia.g.alchemy.com/v2/YOUR_KEY",
    explorer: "https://sepolia.basescan.org",
    needsLINK: false,
  },
  {
    name: "XDC Apothem (Testnet)",
    chainId: 51,
    city: "London",
    contract: "CityNode.sol",
    faucet: "https://faucet.apothem.network",
    rpcUrl: "https://erpc.apothem.network",
    explorer: "https://explorer.apothem.network",
    needsLINK: false,
  },
];

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("  CARMEN SANDIEGO ON-CHAIN - WALLET SETUP");
  console.log("=".repeat(60));
  console.log();
  console.log(`  Deployer address: ${deployer.address}`);
  console.log();

  // Check balance on current network
  const balance = await ethers.provider.getBalance(deployer.address);
  const network = await ethers.provider.getNetwork();
  console.log(`  Current network: ${network.name} (chainId: ${network.chainId})`);
  console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);
  console.log();

  console.log("=".repeat(60));
  console.log("  NETWORKS & FAUCETS");
  console.log("=".repeat(60));

  for (const net of NETWORKS) {
    console.log();
    console.log(`  ${net.city} | ${net.name} (chainId: ${net.chainId})`);
    console.log(`  ${"─".repeat(50)}`);
    console.log(`  Contract:  ${net.contract}`);
    console.log(`  Explorer:  ${net.explorer}`);
    console.log(`  Faucet:    ${net.faucet}`);
    if (net.needsLINK) {
      console.log(`  LINK:      REQUIRED (for VRF v2.5 subscription)`);
    }
  }

  console.log();
  console.log("=".repeat(60));
  console.log("  SETUP CHECKLIST");
  console.log("=".repeat(60));
  console.log();
  console.log("  [ ] 1. Get testnet ETH on all 4 networks (faucets above)");
  console.log("  [ ] 2. Get testnet LINK on Sepolia (Chainlink faucet)");
  console.log("  [ ] 3. Create VRF v2.5 Subscription at https://vrf.chain.link");
  console.log("  [ ] 4. Fund VRF subscription with 2-5 LINK");
  console.log("  [ ] 5. Create Alchemy apps for Sepolia, Arbitrum Sepolia, Base Sepolia");
  console.log("  [ ] 6. Copy .env.example to .env and fill in all values");
  console.log("  [ ] 7. Run: npx hardhat run scripts/deploy-gamemaster.ts --network sepolia");
  console.log("  [ ] 8. Add GameMaster address as VRF consumer in subscription");
  console.log("  [ ] 9. Run: npx hardhat run scripts/deploy-citynode.ts --network arbitrumSepolia");
  console.log("  [ ] 10. Run: npx hardhat run scripts/deploy-citynode.ts --network baseSepolia");
  console.log("  [ ] 11. Run: npx hardhat run scripts/deploy-citynode.ts --network xdcApothem");
  console.log();

  console.log("=".repeat(60));
  console.log("  DEPLOY ORDER");
  console.log("=".repeat(60));
  console.log();
  console.log("  1st: GameMaster.sol  -> Sepolia       (needs VRF sub ID)");
  console.log("  2nd: CityNode.sol    -> Arbitrum       (Tokyo)");
  console.log("  3rd: CityNode.sol    -> Base Sepolia   (Paris)");
  console.log("  4th: CityNode.sol    -> XDC Apothem    (London)");
  console.log("  5th: Add GameMaster as VRF consumer in subscription");
  console.log("  6th: Update CRE oracle address on all contracts");
  console.log();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});