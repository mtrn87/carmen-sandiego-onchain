import { ethers } from "hardhat";

/**
 * Seed script: deploys 3 CityNodes on local hardhat network and populates
 * them with a complete playable investigation case.
 *
 * Carmen's trail: Dubai (hot) -> Paris (partial) -> Tokyo (cold)
 * Carmen's wallet is hidden in Dubai.
 *
 * Usage: npx hardhat run scripts/seed-case.ts
 */

// --- Deterministic test addresses (lowercase = no checksum validation) ---
const CARMEN_WALLET  = "0xca43e5a0d1e60000000000000000000000000001";
const DECOY_WALLET_1 = "0xdec0100000000000000000000000000000000001";
const DECOY_WALLET_2 = "0xdec0200000000000000000000000000000000002";
const DECOY_WALLET_3 = "0xdec0300000000000000000000000000000000003";
const FUNDER_WALLET  = "0xf00d3e0000000000000000000000000000000001";

// --- Case salt for identity commits ---
const CASE_SALT = ethers.keccak256(ethers.toUtf8Bytes("carmen-case-001"));
const CARMEN_IDENTITY_COMMIT = ethers.keccak256(
  ethers.solidityPacked(["address", "bytes32"], [CARMEN_WALLET, CASE_SALT])
);

function h(text: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(text));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Seeding case data with deployer:", deployer.address);

  const CityNodeFactory = await ethers.getContractFactory("CityNode");

  // ============================================================
  //           DEPLOY 3 CITYNODES
  // ============================================================

  console.log("\n--- Deploying CityNodes ---");

  const dubai = await CityNodeFactory.deploy("Dubai", "AE", 421614, 1, deployer.address);
  await dubai.waitForDeployment();
  console.log("Dubai CityNode:", await dubai.getAddress());

  const tokyo = await CityNodeFactory.deploy("Tokyo", "JP", 84532, 2, deployer.address);
  await tokyo.waitForDeployment();
  console.log("Tokyo CityNode:", await tokyo.getAddress());

  const paris = await CityNodeFactory.deploy("Paris", "FR", 51, 3, deployer.address);
  await paris.waitForDeployment();
  console.log("Paris CityNode:", await paris.getAddress());

  // ============================================================
  //           CITY 1: DUBAI — HAS CARMEN'S TRAIL
  // ============================================================

  console.log("\n--- Seeding Dubai (HOT trail) ---");

  await dubai.setupLocations([
    {
      name: "Burj Khalifa Observatory",
      descriptionHash: h("panoramic view of dubai's financial district with encrypted relay antennas"),
      category: 1, // landmark
      fakeLevel: 0, // REAL - has Carmen's trail
      riskLevel: 3,
    },
    {
      name: "Dubai Mall Trading Floor",
      descriptionHash: h("underground crypto exchange with suspicious high-frequency trading bots"),
      category: 2, // commercial
      fakeLevel: 1, // FAKE - dead end
      riskLevel: 2,
    },
    {
      name: "Dubai International Airport Terminal 3",
      descriptionHash: h("cross-chain bridge relay station disguised as departure gate"),
      category: 3, // transport
      fakeLevel: 1, // FAKE - dead end
      riskLevel: 1,
    },
  ]);

  // anomaly tx refs — 5 txs, some pointing to Carmen
  await dubai.addAnomalyTxRef({
    refId: 101,
    txHashLike: h("dubai-tx-bridge-deposit"),
    from: CARMEN_WALLET,
    to: FUNDER_WALLET,
    methodSigLike: "0xa9059cbb", // transfer
    blockLike: 52884410,
    valueLike: 7000000n, // 7 gwei multiples pattern
    anomalyType: 0, // UNUSUAL_GAS
  });
  await dubai.addAnomalyTxRef({
    refId: 102,
    txHashLike: h("dubai-tx-nonce-burst"),
    from: CARMEN_WALLET,
    to: DECOY_WALLET_1,
    methodSigLike: "0x23b872dd", // transferFrom
    blockLike: 52884412,
    valueLike: 14000000n,
    anomalyType: 1, // BURST_NONCE
  });
  await dubai.addAnomalyTxRef({
    refId: 103,
    txHashLike: h("dubai-tx-precise-val"),
    from: FUNDER_WALLET,
    to: CARMEN_WALLET,
    methodSigLike: "0x095ea7b3", // approve
    blockLike: 52884415,
    valueLike: 7777777n, // precise repeating pattern
    anomalyType: 2, // PRECISE_VALUE
  });
  await dubai.addAnomalyTxRef({
    refId: 104,
    txHashLike: h("dubai-tx-recurring"),
    from: DECOY_WALLET_2,
    to: DECOY_WALLET_1,
    methodSigLike: "0xa9059cbb",
    blockLike: 52884420,
    valueLike: 500000n,
    anomalyType: 3, // RECURRING_COUNTERPARTY
  });
  await dubai.addAnomalyTxRef({
    refId: 105,
    txHashLike: h("dubai-tx-bridge"),
    from: CARMEN_WALLET,
    to: "0xb41d63c000ace000000000000000000000000001",
    methodSigLike: "0xd0e30db0", // deposit
    blockLike: 52884425,
    valueLike: 21000000n,
    anomalyType: 4, // BRIDGE_USAGE
  });

  // suspect wallets — 4 wallets, one is Carmen's
  await dubai.addSuspectWallet({
    wallet: CARMEN_WALLET,
    suspicionLevel: 9,
    txRefIds: [101, 102, 103, 105],
    tagsBitmap: 31, // 0b11111 = all tags
  });
  await dubai.addSuspectWallet({
    wallet: DECOY_WALLET_1,
    suspicionLevel: 4,
    txRefIds: [102, 104],
    tagsBitmap: 3,
  });
  await dubai.addSuspectWallet({
    wallet: DECOY_WALLET_2,
    suspicionLevel: 2,
    txRefIds: [104],
    tagsBitmap: 1,
  });
  await dubai.addSuspectWallet({
    wallet: FUNDER_WALLET,
    suspicionLevel: 6,
    txRefIds: [101, 103],
    tagsBitmap: 5,
  });

  await dubai.setSuspicionIndex(8, h("multiple anomalous tx patterns, bridge usage, precise value transfers"));

  // hints for Dubai
  await dubai.setHint(0, 0, h("gas prices always multiples of 7 gwei"), 85);
  await dubai.setHint(0, 1, h("interacts with FeeSink contract at 0xB3..."), 70);
  await dubai.setHint(0, 2, CARMEN_IDENTITY_COMMIT, 95); // identity commit
  await dubai.setHint(1, 0, h("no trail here, but notice bridge activity to the east"), 20);
  await dubai.setHint(2, 0, h("departure records show movement but destination unclear"), 15);

  console.log("  -> 3 locations, 5 anomaly txs, 4 suspect wallets, suspicion=8");

  // ============================================================
  //           CITY 2: TOKYO — NO TRAIL (cold)
  // ============================================================

  console.log("\n--- Seeding Tokyo (COLD trail) ---");

  await tokyo.setupLocations([
    {
      name: "Shibuya Crossing Signal Hub",
      descriptionHash: h("massive network traffic intersection with encrypted packet relay"),
      category: 1,
      fakeLevel: 1, // all fake
      riskLevel: 1,
    },
    {
      name: "Tokyo Tower Antenna Array",
      descriptionHash: h("broadcast antenna relaying encrypted signals across east asia"),
      category: 2,
      fakeLevel: 1,
      riskLevel: 1,
    },
    {
      name: "Akihabara Electronics Market",
      descriptionHash: h("underground hardware wallet shop with suspicious inventory"),
      category: 3,
      fakeLevel: 1,
      riskLevel: 1,
    },
  ]);

  // red herring txs
  await tokyo.addAnomalyTxRef({
    refId: 201,
    txHashLike: h("tokyo-tx-normal-1"),
    from: DECOY_WALLET_3,
    to: DECOY_WALLET_1,
    methodSigLike: "0xa9059cbb",
    blockLike: 19284700,
    valueLike: 100000n,
    anomalyType: 3, // RECURRING_COUNTERPARTY
  });
  await tokyo.addAnomalyTxRef({
    refId: 202,
    txHashLike: h("tokyo-tx-normal-2"),
    from: DECOY_WALLET_1,
    to: DECOY_WALLET_3,
    methodSigLike: "0xa9059cbb",
    blockLike: 19284705,
    valueLike: 200000n,
    anomalyType: 2, // PRECISE_VALUE
  });

  // suspect wallets - none is Carmen's
  await tokyo.addSuspectWallet({
    wallet: DECOY_WALLET_3,
    suspicionLevel: 2,
    txRefIds: [201],
    tagsBitmap: 1,
  });
  await tokyo.addSuspectWallet({
    wallet: DECOY_WALLET_1,
    suspicionLevel: 3,
    txRefIds: [201, 202],
    tagsBitmap: 2,
  });

  await tokyo.setSuspicionIndex(2, h("low activity, likely cold trail with red herrings"));

  // consolation hints pointing toward Dubai
  await tokyo.setHint(0, 0, h("network traffic is normal here, no anomalies detected"), 10);
  await tokyo.setHint(1, 0, h("antenna signals show encrypted relays bouncing toward the middle east"), 30);
  await tokyo.setHint(2, 0, h("hardware wallet serial numbers trace back to a dubai supplier"), 45);

  console.log("  -> 3 locations, 2 anomaly txs, 2 suspect wallets, suspicion=2");

  // ============================================================
  //           CITY 3: PARIS — PARTIAL TRAIL
  // ============================================================

  console.log("\n--- Seeding Paris (PARTIAL trail) ---");

  await paris.setupLocations([
    {
      name: "Eiffel Tower Relay Station",
      descriptionHash: h("monitoring beacon with bridge ingress traces from multiple chains"),
      category: 1,
      fakeLevel: 1, // fake
      riskLevel: 2,
    },
    {
      name: "Louvre Museum Vault",
      descriptionHash: h("underground digital asset custody vault with partial evidence trail"),
      category: 2,
      fakeLevel: 0, // REAL - has partial evidence
      riskLevel: 3,
    },
    {
      name: "Charles de Gaulle Departure Gate",
      descriptionHash: h("cross-chain egress point with heavy traffic masking"),
      category: 3,
      fakeLevel: 1, // fake
      riskLevel: 1,
    },
  ]);

  // partially useful txs
  await paris.addAnomalyTxRef({
    refId: 301,
    txHashLike: h("paris-tx-cex-funding"),
    from: "0xcee0000000000000000000000000000000000001",
    to: CARMEN_WALLET,
    methodSigLike: "0xa9059cbb",
    blockLike: 48000100,
    valueLike: 5000000n,
    anomalyType: 2, // PRECISE_VALUE
  });
  await paris.addAnomalyTxRef({
    refId: 302,
    txHashLike: h("paris-tx-create2"),
    from: CARMEN_WALLET,
    to: ethers.ZeroAddress,
    methodSigLike: "0x00000000", // contract creation
    blockLike: 48000105,
    valueLike: 0n,
    anomalyType: 5, // CREATE2_DEPLOY
  });
  await paris.addAnomalyTxRef({
    refId: 303,
    txHashLike: h("paris-tx-decoy"),
    from: DECOY_WALLET_2,
    to: DECOY_WALLET_3,
    methodSigLike: "0xa9059cbb",
    blockLike: 48000110,
    valueLike: 300000n,
    anomalyType: 3, // RECURRING_COUNTERPARTY
  });

  // suspect wallets - none is Carmen's directly but infrastructure overlap
  await paris.addSuspectWallet({
    wallet: DECOY_WALLET_2,
    suspicionLevel: 4,
    txRefIds: [303],
    tagsBitmap: 2,
  });
  await paris.addSuspectWallet({
    wallet: "0xfa415f00d3e00000000000000000000000000001",
    suspicionLevel: 5,
    txRefIds: [301],
    tagsBitmap: 4,
  });
  await paris.addSuspectWallet({
    wallet: DECOY_WALLET_3,
    suspicionLevel: 3,
    txRefIds: [303],
    tagsBitmap: 1,
  });

  await paris.setSuspicionIndex(5, h("partial evidence trail, CEX funding pattern and CREATE2 deployments"));

  // hints for Paris - Louvre has useful clues
  await paris.setHint(0, 0, h("beacon detects bridge relays but no direct match to suspect"), 25);
  await paris.setHint(1, 0, h("funded from CEX with specific amount pattern matching Carmen"), 65);
  await paris.setHint(1, 1, h("uses CREATE2 with salt containing cityId - infrastructure fingerprint"), 75);
  await paris.setHint(1, 2, h("dead end - vault records encrypted beyond current capabilities"), 10);
  await paris.setHint(2, 0, h("departure records are heavily masked, no useful data"), 5);

  console.log("  -> 3 locations, 3 anomaly txs, 3 suspect wallets, suspicion=5");

  // ============================================================
  //           SUMMARY
  // ============================================================

  console.log("\n============================================================");
  console.log("  SEED COMPLETE - Playable Case Ready");
  console.log("============================================================");
  console.log("\nCarmen's wallet:", CARMEN_WALLET);
  console.log("Case salt:", CASE_SALT);
  console.log("Carmen identity commit:", CARMEN_IDENTITY_COMMIT);
  console.log("\nDubai (HOT):", await dubai.getAddress());
  console.log("Tokyo (COLD):", await tokyo.getAddress());
  console.log("Paris (PARTIAL):", await paris.getAddress());
  console.log("\nGameplay hint:");
  console.log("  1. Start at any city");
  console.log("  2. Inspect locations, scan for anomalies");
  console.log("  3. Dubai Burj Khalifa has the strongest trail (suspicion=8)");
  console.log("  4. Carmen's wallet: " + CARMEN_WALLET);
  console.log("  5. Identity commit at Dubai Burj Khalifa clue slot [0][2]");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
