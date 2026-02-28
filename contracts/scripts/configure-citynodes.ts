import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Configure already-deployed CityNodes with anomalies, suspects, and suspicion indices.
 * Run after deploy-all.ts when CityNode config phase fails.
 *
 * Usage: npx hardhat run scripts/configure-citynodes.ts --network sepolia
 */

// Read deployed addresses from .env
const rootDir = path.resolve(process.cwd(), "..");

interface CityConfig {
  name: string;
  address: string;
  rpcUrl: string;
  anomalies: { from: string; to: string; methodSig: string; value: bigint; anomalyType: number }[];
  suspects: { wallet: string; suspicionLevel: number; tagsBitmap: number }[];
  suspicionLevel: number;
}

async function main() {
  const PRIVATE_KEY = process.env.PRIVATE_KEY!;

  // Use properly checksummed addresses (all lowercase hex = valid)
  const cities: CityConfig[] = [
    {
      name: "Tokyo",
      address: process.env.CITYNODE_TOKYO_ADDRESS || "",
      rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || "",
      anomalies: [
        {
          from: ethers.getAddress("0x000000000000000000000000000000000000dead"),
          to: ethers.getAddress("0x0000000000000000000000000000000000001234"),
          methodSig: "0xa9059cbb",
          value: ethers.parseEther("0.5"),
          anomalyType: 0, // UNUSUAL_GAS
        },
        {
          from: ethers.getAddress("0x0000000000000000000000000000000000002345"),
          to: ethers.getAddress("0x0000000000000000000000000000000000003456"),
          methodSig: "0x095ea7b3",
          value: ethers.parseEther("1.0"),
          anomalyType: 4, // BRIDGE_USAGE
        },
      ],
      suspects: [
        {
          wallet: ethers.getAddress("0x000000000000000000000000000000000000ca01"),
          suspicionLevel: 80,
          tagsBitmap: 0b1101,
        },
        {
          wallet: ethers.getAddress("0x000000000000000000000000000000000000ca02"),
          suspicionLevel: 45,
          tagsBitmap: 0b0010,
        },
      ],
      suspicionLevel: 65,
    },
    {
      name: "Paris",
      address: process.env.CITYNODE_PARIS_ADDRESS || "",
      rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "",
      anomalies: [
        {
          from: ethers.getAddress("0x0000000000000000000000000000000000004567"),
          to: ethers.getAddress("0x0000000000000000000000000000000000005678"),
          methodSig: "0x23b872dd",
          value: ethers.parseEther("2.0"),
          anomalyType: 2, // PRECISE_VALUE
        },
        {
          from: ethers.getAddress("0x0000000000000000000000000000000000006789"),
          to: ethers.getAddress("0x000000000000000000000000000000000000789a"),
          methodSig: "0xa9059cbb",
          value: ethers.parseEther("0.1"),
          anomalyType: 3, // RECURRING_COUNTERPARTY
        },
      ],
      suspects: [
        {
          wallet: ethers.getAddress("0x000000000000000000000000000000000000ca03"),
          suspicionLevel: 70,
          tagsBitmap: 0b0111,
        },
        {
          wallet: ethers.getAddress("0x000000000000000000000000000000000000ca04"),
          suspicionLevel: 55,
          tagsBitmap: 0b1010,
        },
      ],
      suspicionLevel: 75,
    },
    {
      name: "Sydney",
      address: process.env.CITYNODE_SYDNEY_ADDRESS || "",
      rpcUrl: process.env.XDC_APOTHEM_RPC_URL || "",
      anomalies: [
        {
          from: ethers.getAddress("0x000000000000000000000000000000000000abcd"),
          to: ethers.getAddress("0x000000000000000000000000000000000000bcde"),
          methodSig: "0xa9059cbb",
          value: ethers.parseEther("0.3"),
          anomalyType: 1, // BURST_NONCE
        },
        {
          from: ethers.getAddress("0x000000000000000000000000000000000000cdef"),
          to: ethers.getAddress("0x000000000000000000000000000000000000def0"),
          methodSig: "0x095ea7b3",
          value: ethers.parseEther("5.0"),
          anomalyType: 5, // CREATE2_DEPLOY
        },
      ],
      suspects: [
        {
          wallet: ethers.getAddress("0x000000000000000000000000000000000000ca05"),
          suspicionLevel: 90,
          tagsBitmap: 0b1111,
        },
        {
          wallet: ethers.getAddress("0x000000000000000000000000000000000000ca06"),
          suspicionLevel: 35,
          tagsBitmap: 0b0001,
        },
      ],
      suspicionLevel: 55,
    },
  ];

  // CityNode ABI (subset for configuration)
  const cityNodeArtifactPath = path.join(process.cwd(), "artifacts", "src", "CityNode.sol", "CityNode.json");
  const cityNodeArtifact = JSON.parse(fs.readFileSync(cityNodeArtifactPath, "utf-8"));

  console.log("=== Configure CityNodes ===\n");

  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];

    if (!city.address || !city.rpcUrl) {
      console.log(`Skipping ${city.name}: missing address or RPC URL`);
      continue;
    }

    console.log(`--- ${city.name} (${city.address}) ---`);

    try {
      const provider = new ethers.JsonRpcProvider(city.rpcUrl);
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      const cityNode = new ethers.Contract(city.address, cityNodeArtifact.abi, wallet);

      // Check if locations are already configured
      const locConfigured = await cityNode.locationsConfigured();
      console.log(`  Locations configured: ${locConfigured}`);

      // Add anomaly tx refs
      for (let j = 0; j < city.anomalies.length; j++) {
        const anom = city.anomalies[j];
        const txRef = {
          refId: (i * 10) + j + 1,
          txHashLike: ethers.keccak256(ethers.toUtf8Bytes(`${city.name}-anomaly-${j}`)),
          from: anom.from,
          to: anom.to,
          methodSigLike: anom.methodSig,
          blockLike: 1000000 + j,
          valueLike: anom.value,
          anomalyType: anom.anomalyType,
        };

        try {
          const tx = await cityNode.addAnomalyTxRef(txRef);
          await tx.wait();
          console.log(`  ✓ Anomaly ${j + 1} added`);
        } catch (e: any) {
          if (e.message?.includes("Duplicate refId")) {
            console.log(`  - Anomaly ${j + 1} already exists, skipping`);
          } else {
            console.log(`  ✗ Anomaly ${j + 1} failed: ${e.message?.slice(0, 80)}`);
          }
        }
      }

      // Add suspect wallets
      for (let j = 0; j < city.suspects.length; j++) {
        const sus = city.suspects[j];
        const suspect = {
          wallet: sus.wallet,
          suspicionLevel: sus.suspicionLevel,
          txRefIds: [(i * 10) + j + 1],
          tagsBitmap: sus.tagsBitmap,
        };

        try {
          const tx = await cityNode.addSuspectWallet(suspect);
          await tx.wait();
          console.log(`  ✓ Suspect ${j + 1} added`);
        } catch (e: any) {
          if (e.message?.includes("Duplicate wallet")) {
            console.log(`  - Suspect ${j + 1} already exists, skipping`);
          } else {
            console.log(`  ✗ Suspect ${j + 1} failed: ${e.message?.slice(0, 80)}`);
          }
        }
      }

      // Set suspicion index
      try {
        const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(`${city.name} shows elevated blockchain anomaly patterns`));
        const tx = await cityNode.setSuspicionIndex(city.suspicionLevel, reasonHash);
        await tx.wait();
        console.log(`  ✓ Suspicion index set to ${city.suspicionLevel}`);
      } catch (e: any) {
        console.log(`  ✗ Suspicion index failed: ${e.message?.slice(0, 80)}`);
      }

      console.log(`  ✓ ${city.name} configuration complete\n`);
    } catch (e: any) {
      console.log(`  ✗ ${city.name} failed: ${e.message?.slice(0, 100)}\n`);
    }
  }

  console.log("=== Configuration Complete ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
