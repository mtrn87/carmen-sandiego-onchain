import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Seeds anomaly data and suspects on already-deployed CityNodes.
 * Run after deploy-all.ts if anomaly seeding failed due to checksum issues.
 */

interface CitySeeds {
  name: string;
  chainId: number;
  rpcEnvKey: string;
  networkName: string;
  addressEnvKey: string;
  anomalies: { from: string; to: string; methodSig: string; value: bigint; anomalyType: number }[];
  suspects: { wallet: string; suspicionLevel: number; tagsBitmap: number }[];
  suspicionLevel: number;
}

const CITY_SEEDS: CitySeeds[] = [
  {
    name: "Tokyo",
    chainId: 421614,
    rpcEnvKey: "ARBITRUM_SEPOLIA_RPC_URL",
    networkName: "Arbitrum Sepolia",
    addressEnvKey: "CITYNODE_TOKYO_ADDRESS",
    anomalies: [
      { from: "0xdead000000000000000000000000000000000001", to: "0xdead000000000000000000000000000000000002", methodSig: "0xa9059cbb", value: ethers.parseEther("0.5"), anomalyType: 0 },
      { from: "0xdead000000000000000000000000000000000003", to: "0xdead000000000000000000000000000000000004", methodSig: "0x095ea7b3", value: ethers.parseEther("1.0"), anomalyType: 4 },
    ],
    suspects: [
      { wallet: "0xca12e500000000000000000000000000000f0001", suspicionLevel: 80, tagsBitmap: 0b1101 },
      { wallet: "0xca12e500000000000000000000000000000f0002", suspicionLevel: 45, tagsBitmap: 0b0010 },
    ],
    suspicionLevel: 65,
  },
  {
    name: "Sydney",
    chainId: 51,
    rpcEnvKey: "XDC_APOTHEM_RPC_URL",
    networkName: "XDC Apothem",
    addressEnvKey: "CITYNODE_SYDNEY_ADDRESS",
    anomalies: [
      { from: "0xdead000000000000000000000000000000000009", to: "0xdead00000000000000000000000000000000000a", methodSig: "0xa9059cbb", value: ethers.parseEther("0.3"), anomalyType: 1 },
      { from: "0xdead00000000000000000000000000000000000b", to: "0xdead00000000000000000000000000000000000c", methodSig: "0x095ea7b3", value: ethers.parseEther("5.0"), anomalyType: 5 },
    ],
    suspects: [
      { wallet: "0xca12e500000000000000000000000000000f0005", suspicionLevel: 90, tagsBitmap: 0b1111 },
      { wallet: "0xca12e500000000000000000000000000000f0006", suspicionLevel: 35, tagsBitmap: 0b0001 },
    ],
    suspicionLevel: 55,
  },
];

async function main() {
  const PRIVATE_KEY = process.env.PRIVATE_KEY!;
  const cityNodeArtifactPath = path.join(process.cwd(), "artifacts", "src", "CityNode.sol", "CityNode.json");
  const cityNodeArtifact = JSON.parse(fs.readFileSync(cityNodeArtifactPath, "utf-8"));

  console.log("═══ Seeding CityNode Data ═══\n");

  for (let i = 0; i < CITY_SEEDS.length; i++) {
    const city = CITY_SEEDS[i];
    const rpcUrl = process.env[city.rpcEnvKey];
    const cityNodeAddress = process.env[city.addressEnvKey];

    if (!rpcUrl || !cityNodeAddress) {
      console.log(`⚠ Skipping ${city.name}: missing RPC or address`);
      continue;
    }

    console.log(`Seeding ${city.name} (${cityNodeAddress}) on ${city.networkName}...`);

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      const cityNode = new ethers.Contract(cityNodeAddress, cityNodeArtifact.abi, wallet);

      // Add anomaly tx refs
      for (let j = 0; j < city.anomalies.length; j++) {
        const anom = city.anomalies[j];
        const txRef = {
          refId: (i * 10) + j + 1,
          txHashLike: ethers.keccak256(ethers.toUtf8Bytes(`${city.name}-anomaly-${j}`)),
          from: ethers.getAddress(anom.from),
          to: ethers.getAddress(anom.to),
          methodSigLike: anom.methodSig,
          blockLike: 1000000 + j,
          valueLike: anom.value,
          anomalyType: anom.anomalyType,
        };
        const tx = await cityNode.addAnomalyTxRef(txRef);
        await tx.wait();
        console.log(`  ✓ Anomaly ${j + 1} added`);
      }

      // Add suspect wallets
      for (let j = 0; j < city.suspects.length; j++) {
        const sus = city.suspects[j];
        const suspect = {
          wallet: ethers.getAddress(sus.wallet),
          suspicionLevel: sus.suspicionLevel,
          txRefIds: [(i * 10) + j + 1],
          tagsBitmap: sus.tagsBitmap,
        };
        const tx = await cityNode.addSuspectWallet(suspect);
        await tx.wait();
        console.log(`  ✓ Suspect ${j + 1} added`);
      }

      // Set suspicion index
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(`${city.name} shows elevated blockchain anomaly patterns`));
      const tx = await cityNode.setSuspicionIndex(city.suspicionLevel, reasonHash);
      await tx.wait();
      console.log(`  ✓ Suspicion index set to ${city.suspicionLevel}`);

      console.log(`✓ ${city.name} seeded successfully\n`);
    } catch (err: any) {
      console.log(`✗ ${city.name} seeding failed: ${err.message?.slice(0, 150)}\n`);
    }
  }

  console.log("═══ Seeding Complete ═══");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
