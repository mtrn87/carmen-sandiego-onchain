import { ethers } from "hardhat";

/**
 * Seed script: deploys 3 CityNodes on local hardhat network and populates
 * them with a complete playable investigation case.
 *
 * Aligned with scenarios.json "heist-of-cryptopunk":
 *   - Tokyo  (421614 / Arbitrum Sepolia) — Carmen IS HERE (hot trail)
 *   - Paris  (84532  / Base Sepolia)     — partial trail
 *   - London (51     / XDC Apothem)      — cold trail / red herring
 *
 * Each city gets:
 *   - 3 locations (with description, category, fakeLevel, riskLevel)
 *   - 3–5 anomaly tx refs
 *   - 2–4 suspect wallets
 *   - Suspicion index
 *   - 3 hints per location (9 per city = 3 locations x 3 clues)
 *   - Clue schema
 *
 * Usage: npx hardhat run scripts/seed-case.ts
 */

// --- Deterministic test addresses ---
const CARMEN_WALLET  = "0xca43e5a0d1e60000000000000000000000000001";
const DECOY_WALLET_1 = "0xdec0100000000000000000000000000000000001";
const DECOY_WALLET_2 = "0xdec0200000000000000000000000000000000002";
const DECOY_WALLET_3 = "0xdec0300000000000000000000000000000000003";
const FUNDER_WALLET  = "0xf00d3e0000000000000000000000000000000001";
const CEX_WALLET     = "0xcee0000000000000000000000000000000000001";

// --- Case identity ---
const CASE_SALT = ethers.keccak256(ethers.toUtf8Bytes("carmen-case-001"));
const CARMEN_IDENTITY_COMMIT = ethers.keccak256(
  ethers.solidityPacked(["address", "bytes32"], [CARMEN_WALLET, CASE_SALT])
);

function h(text: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(text));
}

// ClueType enum values from ICityNode.sol
const ClueType = {
  BEHAVIOR_FINGERPRINT: 0,
  RELATIONSHIP: 1,
  IDENTITY_COMMIT: 2,
  FUNDING_TRAIL: 3,
  TECHNICAL_SIGNATURE: 4,
  DEAD_END: 5,
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Seeding case data with deployer:", deployer.address);

  const CityNodeFactory = await ethers.getContractFactory("CityNode");

  // ============================================================
  //           DEPLOY 3 CITYNODES (matching scenarios.json)
  // ============================================================

  console.log("\n--- Deploying CityNodes ---");

  const tokyo = await CityNodeFactory.deploy("Tokyo", "JP", 421614, 1, deployer.address);
  await tokyo.waitForDeployment();
  console.log("Tokyo  CityNode:", await tokyo.getAddress());

  const paris = await CityNodeFactory.deploy("Paris", "FR", 84532, 2, deployer.address);
  await paris.waitForDeployment();
  console.log("Paris  CityNode:", await paris.getAddress());

  const london = await CityNodeFactory.deploy("London", "GB", 51, 3, deployer.address);
  await london.waitForDeployment();
  console.log("London CityNode:", await london.getAddress());

  // ============================================================
  //  CITY 1: TOKYO (421614) — HOT TRAIL — Carmen IS here
  //  Scenario: "The Heist of the Lost CryptoPunk"
  //  Carmen fled to Tokyo with the stolen CryptoPunk #7804
  // ============================================================

  console.log("\n--- Seeding Tokyo (HOT trail — Carmen is here) ---");

  await tokyo.setupLocations([
    {
      name: "Shibuya Crossing Signal Hub",
      descriptionHash: h("massive network traffic intersection with encrypted packet relay — suspicion of cross-chain bridge activity"),
      category: 1, // landmark
      fakeLevel: 0, // REAL — has Carmen's trail
      riskLevel: 3,
    },
    {
      name: "Akihabara Electronics Market",
      descriptionHash: h("underground hardware wallet shop with suspicious inventory — wallet serial numbers link to known Carmen aliases"),
      category: 2, // commercial
      fakeLevel: 0, // REAL — has evidence
      riskLevel: 2,
    },
    {
      name: "Narita Airport Terminal 2",
      descriptionHash: h("cross-chain egress point with encrypted departures — NRT destination codes found in tx metadata"),
      category: 3, // transport
      fakeLevel: 1, // FAKE — arrived but this location is a dead end
      riskLevel: 1,
    },
  ]);

  // --- Anomaly tx refs (5 txs pointing to Carmen in Tokyo) ---
  await tokyo.addAnomalyTxRef({
    refId: 101,
    txHashLike: h("tokyo-tx-bridge-deposit"),
    from: CARMEN_WALLET,
    to: FUNDER_WALLET,
    methodSigLike: "0xa9059cbb", // transfer
    blockLike: 52884410,
    valueLike: 7000000n,
    anomalyType: 0, // UNUSUAL_GAS
  });
  await tokyo.addAnomalyTxRef({
    refId: 102,
    txHashLike: h("tokyo-tx-nonce-burst"),
    from: CARMEN_WALLET,
    to: DECOY_WALLET_1,
    methodSigLike: "0x23b872dd", // transferFrom
    blockLike: 52884412,
    valueLike: 14000000n,
    anomalyType: 1, // BURST_NONCE
  });
  await tokyo.addAnomalyTxRef({
    refId: 103,
    txHashLike: h("tokyo-tx-precise-val"),
    from: FUNDER_WALLET,
    to: CARMEN_WALLET,
    methodSigLike: "0x095ea7b3", // approve
    blockLike: 52884415,
    valueLike: 7777777n,
    anomalyType: 2, // PRECISE_VALUE
  });
  await tokyo.addAnomalyTxRef({
    refId: 104,
    txHashLike: h("tokyo-tx-recurring"),
    from: DECOY_WALLET_2,
    to: DECOY_WALLET_1,
    methodSigLike: "0xa9059cbb",
    blockLike: 52884420,
    valueLike: 500000n,
    anomalyType: 3, // RECURRING_COUNTERPARTY
  });
  await tokyo.addAnomalyTxRef({
    refId: 105,
    txHashLike: h("tokyo-tx-nft-bridge"),
    from: CARMEN_WALLET,
    to: "0xb41d63c000ace000000000000000000000000001",
    methodSigLike: "0xd0e30db0", // deposit (bridge)
    blockLike: 52884425,
    valueLike: 21000000n,
    anomalyType: 4, // BRIDGE_USAGE
  });

  // --- Suspect wallets (4 wallets, one is Carmen's) ---
  await tokyo.addSuspectWallet({
    wallet: CARMEN_WALLET,
    suspicionLevel: 9,
    txRefIds: [101, 102, 103, 105],
    tagsBitmap: 31, // 0b11111 = all tags
  });
  await tokyo.addSuspectWallet({
    wallet: DECOY_WALLET_1,
    suspicionLevel: 4,
    txRefIds: [102, 104],
    tagsBitmap: 3,
  });
  await tokyo.addSuspectWallet({
    wallet: DECOY_WALLET_2,
    suspicionLevel: 2,
    txRefIds: [104],
    tagsBitmap: 1,
  });
  await tokyo.addSuspectWallet({
    wallet: FUNDER_WALLET,
    suspicionLevel: 6,
    txRefIds: [101, 103],
    tagsBitmap: 5,
  });

  await tokyo.setSuspicionIndex(8, h("multiple anomalous tx patterns, bridge usage, precise value transfers — strong Carmen fingerprint"));

  // --- Hints: 3 locations x 3 clues each = 9 hints ---
  // Location 0: Shibuya Crossing (REAL)
  await tokyo.setHint(0, 0, h("gas prices always multiples of 7 gwei — Carmen's known signature"), 85);
  await tokyo.setHint(0, 1, h("wallet interacts with a Shibuya-based NFT gallery — CryptoPunk spotted"), 90);
  await tokyo.setHint(0, 2, CARMEN_IDENTITY_COMMIT, 95);
  // Location 1: Akihabara (REAL)
  await tokyo.setHint(1, 0, h("hardware wallet serial numbers trace back to a known Carmen alias"), 80);
  await tokyo.setHint(1, 1, h("freshly minted token used as payment — same pattern as the heist"), 75);
  await tokyo.setHint(1, 2, h("NFT provenance trail shows transfer to cold wallet labeled sakura-vault"), 70);
  // Location 2: Narita Airport (FAKE)
  await tokyo.setHint(2, 0, h("departure records show movement but destination encrypted"), 15);
  await tokyo.setHint(2, 1, h("NRT codes in tx metadata appear planted — classic misdirection"), 20);
  await tokyo.setHint(2, 2, h("no outbound bridge activity from this terminal — dead end"), 10);

  // --- Clue schema ---
  await tokyo.setClueSchema([
    ClueType.BEHAVIOR_FINGERPRINT,
    ClueType.FUNDING_TRAIL,
    ClueType.IDENTITY_COMMIT,
  ]);

  console.log("  -> 3 locations, 5 anomaly txs, 4 suspect wallets, 9 hints, suspicion=8");

  // ============================================================
  //  CITY 2: PARIS (84532) — PARTIAL TRAIL
  //  Some evidence of Carmen passing through, but she moved on
  // ============================================================

  console.log("\n--- Seeding Paris (PARTIAL trail) ---");

  await paris.setupLocations([
    {
      name: "Eiffel Tower Relay Station",
      descriptionHash: h("monitoring beacon with bridge ingress traces from multiple chains — partial traffic logs"),
      category: 1, // landmark
      fakeLevel: 1, // FAKE — no real evidence
      riskLevel: 2,
    },
    {
      name: "Louvre Museum Vault",
      descriptionHash: h("underground digital asset custody vault with partial evidence trail — CEX funding pattern detected"),
      category: 2, // commercial
      fakeLevel: 0, // REAL — has partial evidence
      riskLevel: 3,
    },
    {
      name: "Gare du Nord Terminal",
      descriptionHash: h("cross-chain egress point with heavy traffic masking — Eurostar departures to multiple cities"),
      category: 3, // transport
      fakeLevel: 1, // FAKE — dead end
      riskLevel: 1,
    },
  ]);

  // --- Anomaly tx refs (4 txs, partially useful) ---
  await paris.addAnomalyTxRef({
    refId: 201,
    txHashLike: h("paris-tx-cex-funding"),
    from: CEX_WALLET,
    to: CARMEN_WALLET,
    methodSigLike: "0xa9059cbb",
    blockLike: 48000100,
    valueLike: 5000000n,
    anomalyType: 2, // PRECISE_VALUE
  });
  await paris.addAnomalyTxRef({
    refId: 202,
    txHashLike: h("paris-tx-create2"),
    from: CARMEN_WALLET,
    to: ethers.ZeroAddress,
    methodSigLike: "0x00000000", // contract creation
    blockLike: 48000105,
    valueLike: 0n,
    anomalyType: 5, // CREATE2_DEPLOY
  });
  await paris.addAnomalyTxRef({
    refId: 203,
    txHashLike: h("paris-tx-decoy-recurring"),
    from: DECOY_WALLET_2,
    to: DECOY_WALLET_3,
    methodSigLike: "0xa9059cbb",
    blockLike: 48000110,
    valueLike: 300000n,
    anomalyType: 3, // RECURRING_COUNTERPARTY
  });
  await paris.addAnomalyTxRef({
    refId: 204,
    txHashLike: h("paris-tx-bridge-out"),
    from: CARMEN_WALLET,
    to: "0xb41d63c000ace000000000000000000000000002",
    methodSigLike: "0xd0e30db0", // deposit (bridge)
    blockLike: 48000120,
    valueLike: 4200000n, // 4200 pattern — CryptoPunk value hint
    anomalyType: 4, // BRIDGE_USAGE
  });

  // --- Suspect wallets (3 wallets) ---
  await paris.addSuspectWallet({
    wallet: DECOY_WALLET_2,
    suspicionLevel: 4,
    txRefIds: [203],
    tagsBitmap: 2,
  });
  await paris.addSuspectWallet({
    wallet: CEX_WALLET,
    suspicionLevel: 5,
    txRefIds: [201],
    tagsBitmap: 4,
  });
  await paris.addSuspectWallet({
    wallet: DECOY_WALLET_3,
    suspicionLevel: 3,
    txRefIds: [203],
    tagsBitmap: 1,
  });

  await paris.setSuspicionIndex(5, h("partial evidence trail — CEX funding pattern and CREATE2 deployments, Carmen passed through"));

  // --- Hints: 3 locations x 3 clues each = 9 hints ---
  // Location 0: Eiffel Tower (FAKE)
  await paris.setHint(0, 0, h("beacon detects bridge relays but no direct match to suspect"), 25);
  await paris.setHint(0, 1, h("Eurostar booking data shows no red-coat passenger — likely misdirection"), 15);
  await paris.setHint(0, 2, h("relay traffic is legitimate cross-chain activity — not anomalous"), 10);
  // Location 1: Louvre Vault (REAL — partial)
  await paris.setHint(1, 0, h("funded from CEX with specific amount pattern matching Carmen — 4200 ETH reference"), 65);
  await paris.setHint(1, 1, h("uses CREATE2 with salt containing cityId — infrastructure fingerprint"), 75);
  await paris.setHint(1, 2, h("bridge outbound tx shows movement EAST — she left Paris heading to Tokyo"), 80);
  // Location 2: Gare du Nord (FAKE)
  await paris.setHint(2, 0, h("departure records are heavily masked, no useful forensic data"), 5);
  await paris.setHint(2, 1, h("cross-chain egress traffic is normal volume — no anomaly"), 10);
  await paris.setHint(2, 2, h("ticket purchases don't match any known Carmen alias — dead end"), 8);

  // --- Clue schema ---
  await paris.setClueSchema([
    ClueType.FUNDING_TRAIL,
    ClueType.TECHNICAL_SIGNATURE,
    ClueType.RELATIONSHIP,
  ]);

  console.log("  -> 3 locations, 4 anomaly txs, 3 suspect wallets, 9 hints, suspicion=5");

  // ============================================================
  //  CITY 3: LONDON (51) — COLD TRAIL / RED HERRING
  //  Carmen was never here — all evidence is misleading
  // ============================================================

  console.log("\n--- Seeding London (COLD trail — red herring) ---");

  await london.setupLocations([
    {
      name: "Big Ben Clock Tower Node",
      descriptionHash: h("encrypted broadcast tower with timing signals — block timestamps synchronized but no anomalies"),
      category: 1, // landmark
      fakeLevel: 1, // FAKE
      riskLevel: 1,
    },
    {
      name: "Thames River Trading Port",
      descriptionHash: h("waterfront exchange with suspicious liquidity pools — high volume but legitimate MEV activity"),
      category: 2, // commercial
      fakeLevel: 1, // FAKE
      riskLevel: 1,
    },
    {
      name: "Heathrow Departure Gate",
      descriptionHash: h("international transit hub with cross-chain bridge endpoints — heavy masking of departures"),
      category: 3, // transport
      fakeLevel: 1, // FAKE
      riskLevel: 1,
    },
  ]);

  // --- Anomaly tx refs (3 txs, all red herrings) ---
  await london.addAnomalyTxRef({
    refId: 301,
    txHashLike: h("london-tx-decoy-transfer"),
    from: DECOY_WALLET_3,
    to: DECOY_WALLET_1,
    methodSigLike: "0xa9059cbb",
    blockLike: 19284700,
    valueLike: 100000n,
    anomalyType: 3, // RECURRING_COUNTERPARTY
  });
  await london.addAnomalyTxRef({
    refId: 302,
    txHashLike: h("london-tx-decoy-precise"),
    from: DECOY_WALLET_1,
    to: DECOY_WALLET_3,
    methodSigLike: "0xa9059cbb",
    blockLike: 19284705,
    valueLike: 200000n,
    anomalyType: 2, // PRECISE_VALUE
  });
  await london.addAnomalyTxRef({
    refId: 303,
    txHashLike: h("london-tx-planted-gas"),
    from: DECOY_WALLET_2,
    to: FUNDER_WALLET,
    methodSigLike: "0x095ea7b3",
    blockLike: 19284710,
    valueLike: 7000000n, // planted 7 gwei pattern to mislead
    anomalyType: 0, // UNUSUAL_GAS
  });

  // --- Suspect wallets (2 wallets, neither is Carmen) ---
  await london.addSuspectWallet({
    wallet: DECOY_WALLET_3,
    suspicionLevel: 2,
    txRefIds: [301],
    tagsBitmap: 1,
  });
  await london.addSuspectWallet({
    wallet: DECOY_WALLET_1,
    suspicionLevel: 3,
    txRefIds: [301, 302],
    tagsBitmap: 2,
  });

  await london.setSuspicionIndex(2, h("low activity, cold trail — planted evidence to mislead investigators"));

  // --- Hints: 3 locations x 3 clues each = 9 hints ---
  // Location 0: Big Ben (FAKE)
  await london.setHint(0, 0, h("network traffic is normal here, no anomalies detected"), 10);
  await london.setHint(0, 1, h("timing signals are legitimate — standard block production"), 8);
  await london.setHint(0, 2, h("broadcast data shows no encrypted relays to suspects"), 5);
  // Location 1: Thames Port (FAKE)
  await london.setHint(1, 0, h("liquidity pool activity is legitimate MEV — no Carmen signature"), 12);
  await london.setHint(1, 1, h("trade records show standard DeFi activity — nothing anomalous"), 10);
  await london.setHint(1, 2, h("wallet fragments here don't match any known Carmen pattern"), 15);
  // Location 2: Heathrow (FAKE)
  await london.setHint(2, 0, h("departure records show no red-coat passenger — planted evidence"), 8);
  await london.setHint(2, 1, h("bridge endpoints are dormant — no recent cross-chain activity"), 5);
  await london.setHint(2, 2, h("transit hub is a dead end — Carmen never came through London"), 3);

  // --- Clue schema ---
  await london.setClueSchema([
    ClueType.DEAD_END,
    ClueType.RELATIONSHIP,
    ClueType.BEHAVIOR_FINGERPRINT,
  ]);

  console.log("  -> 3 locations, 3 anomaly txs, 2 suspect wallets, 9 hints, suspicion=2");

  // ============================================================
  //           VALIDATION
  // ============================================================

  console.log("\n--- Validating seed data ---");

  // Validate each city has 3 locations configured
  for (const [name, city] of [["Tokyo", tokyo], ["Paris", paris], ["London", london]] as const) {
    const info = await city.cityInfo();
    console.log(`  ${name}: city=${info[0]}, country=${info[1]}, chain=${info[2]}, id=${info[3]}`);

    const locs = await city.getLocations();
    console.log(`    Locations: ${locs.map((l: { name: string }) => l.name).join(", ")}`);

    const schema = await city.getClueSchema();
    console.log(`    Clue schema: ${schema[0]} types configured`);
  }

  // ============================================================
  //           SUMMARY
  // ============================================================

  console.log("\n============================================================");
  console.log("  SEED COMPLETE — Playable Case Ready");
  console.log("  Scenario: The Heist of the Lost CryptoPunk");
  console.log("============================================================");
  console.log("\nCarmen's wallet:", CARMEN_WALLET);
  console.log("Case salt:", CASE_SALT);
  console.log("Carmen identity commit:", CARMEN_IDENTITY_COMMIT);
  console.log("\nTokyo  (HOT)    :", await tokyo.getAddress(), "— chainId 421614");
  console.log("Paris  (PARTIAL):", await paris.getAddress(), "— chainId 84532");
  console.log("London (COLD)   :", await london.getAddress(), "— chainId 51");
  console.log("\nGameplay guide:");
  console.log("  1. Start in any city — investigate locations, scan anomalies");
  console.log("  2. Paris Louvre Vault has partial clues pointing EAST to Tokyo");
  console.log("  3. Tokyo Shibuya Crossing has the strongest trail (suspicion=8)");
  console.log("  4. London is a cold trail — all evidence is planted red herrings");
  console.log("  5. Carmen's wallet:", CARMEN_WALLET);
  console.log("  6. Identity commit at Tokyo Shibuya clue slot [0][2]");
  console.log("\nCity data per scenarios.json alignment:");
  console.log("  421614 (Arbitrum Sepolia) = Tokyo  — matches scenarios.json");
  console.log("  84532  (Base Sepolia)     = Paris  — matches scenarios.json");
  console.log("  51     (XDC Apothem)      = London — matches scenarios.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
