import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const DEPLOYER = "0xb19eE81581AE385F56D702d412D92d70fb65b9F7";

const NETWORKS = [
  {
    name: "Ethereum Sepolia",
    city: "HQ Central",
    rpc: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
    symbol: "ETH",
    faucet: "https://faucets.chain.link",
    linkToken: "0x779877A7B0D9E8603169DdbD7836e478b4624789",
  },
  {
    name: "Arbitrum Sepolia",
    city: "Tokyo",
    rpc: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    symbol: "ETH",
    faucet: "https://faucets.chain.link",
    linkToken: null,
  },
  {
    name: "Base Sepolia",
    city: "Paris",
    rpc: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    symbol: "ETH",
    faucet: "https://faucets.chain.link",
    linkToken: null,
  },
  {
    name: "Polygon Amoy",
    city: "Mumbai",
    rpc: process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
    symbol: "POL",
    faucet: "https://faucets.chain.link",
    linkToken: null,
  },
  {
    name: "BNB Testnet",
    city: "Singapore",
    rpc: process.env.BNB_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545",
    symbol: "tBNB",
    faucet: "https://www.bnbchain.org/en/testnet-faucet",
    linkToken: null,
  },
  {
    name: "XDC Apothem",
    city: "London",
    rpc: process.env.XDC_APOTHEM_RPC_URL || "https://erpc.apothem.network",
    symbol: "XDC",
    faucet: "https://faucet.apothem.network",
    linkToken: null,
  },
  {
    name: "Worldchain Sepolia",
    city: "World",
    rpc: process.env.WORLDCHAIN_SEPOLIA_RPC_URL || "https://worldchain-sepolia.g.alchemy.com/v2/demo",
    symbol: "ETH",
    faucet: "https://faucets.chain.link",
    linkToken: null,
  },
];

const ERC20_BALANCE_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
];

async function main() {
  console.log("=".repeat(60));
  console.log("  CARMEN SANDIEGO - WALLET BALANCE CHECK");
  console.log("=".repeat(60));
  console.log(`\n  Deployer: ${DEPLOYER}\n`);

  let allFunded = true;

  for (const net of NETWORKS) {
    try {
      const provider = new ethers.JsonRpcProvider(net.rpc);
      const balance = await provider.getBalance(DEPLOYER);
      const formatted = ethers.formatEther(balance);
      const hasFunds = balance > 0n;

      const status = hasFunds ? "OK" : "EMPTY";
      const icon = hasFunds ? "+" : "x";

      console.log(`  [${icon}] ${net.name} (${net.city})`);
      console.log(`      ${formatted} ${net.symbol} - ${status}`);

      // Check LINK balance on Sepolia
      if (net.linkToken) {
        try {
          const linkContract = new ethers.Contract(net.linkToken, ERC20_BALANCE_ABI, provider);
          const linkBalance = await linkContract.balanceOf(DEPLOYER);
          const linkFormatted = ethers.formatEther(linkBalance);
          const hasLink = linkBalance > 0n;
          const linkIcon = hasLink ? "+" : "x";
          console.log(`      ${linkFormatted} LINK - ${hasLink ? "OK" : "NEEDED for VRF"} [${linkIcon}]`);
          if (!hasLink) allFunded = false;
        } catch {
          console.log(`      LINK: could not check`);
        }
      }

      if (!hasFunds) {
        console.log(`      Faucet: ${net.faucet}`);
        allFunded = false;
      }

      console.log();
    } catch (e: any) {
      console.log(`  [!] ${net.name} (${net.city})`);
      console.log(`      RPC error: ${e.message?.slice(0, 60)}`);
      console.log(`      RPC URL: ${net.rpc?.slice(0, 40)}...`);
      console.log();
      allFunded = false;
    }
  }

  console.log("=".repeat(60));
  if (allFunded) {
    console.log("  All wallets funded! Ready to deploy.");
  } else {
    console.log("  Some wallets need funding. Check faucets above.");
  }
  console.log("=".repeat(60));
}

main().catch(console.error);