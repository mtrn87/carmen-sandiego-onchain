import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ============================================================
//  City definitions for CityNode deployment + configuration
// ============================================================

// ClueType enum values from ICityNode.sol
const ClueType = {
  BEHAVIOR_FINGERPRINT: 0,
  RELATIONSHIP: 1,
  IDENTITY_COMMIT: 2,
  FUNDING_TRAIL: 3,
  TECHNICAL_SIGNATURE: 4,
  DEAD_END: 5,
};

function h(text: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(text));
}

interface CityDef {
  name: string;
  countryCode: string;
  chainId: number;
  cityId: number;
  rpcEnvKey: string;
  networkName: string;
  locations: { name: string; description: string; category: number; fakeLevel: number; riskLevel: number }[];
  anomalies: { from: string; to: string; methodSig: string; value: bigint; anomalyType: number }[];
  suspects: { wallet: string; suspicionLevel: number; tagsBitmap: number }[];
  hints: { locationIdx: number; clueIndex: number; hash: string; strength: number }[];
  clueSchema: number[];
}

const CITY_DEFS: CityDef[] = [
  {
    name: "Tokyo",
    countryCode: "JP",
    chainId: 421614,
    cityId: 421614,
    rpcEnvKey: "ARBITRUM_SEPOLIA_RPC_URL",
    networkName: "Arbitrum Sepolia",
    locations: [
      { name: "Senso-ji Temple Node", description: "Ancient relay pulsing with cross-chain traffic.", category: 0, fakeLevel: 1, riskLevel: 3 },
      { name: "Tokyo Tower Beacon", description: "High-altitude signal bouncing encrypted bursts.", category: 1, fakeLevel: 2, riskLevel: 2 },
      { name: "Chochin Market", description: "Token swaps masking asset movements.", category: 2, fakeLevel: 1, riskLevel: 4 },
    ],
    anomalies: [
      { from: "0xdead000000000000000000000000000000000001", to: "0xdead000000000000000000000000000000000002", methodSig: "0xa9059cbb", value: ethers.parseEther("0.5"), anomalyType: 0 }, // UNUSUAL_GAS
      { from: "0xdead000000000000000000000000000000000003", to: "0xdead000000000000000000000000000000000004", methodSig: "0x095ea7b3", value: ethers.parseEther("1.0"), anomalyType: 4 }, // BRIDGE_USAGE
    ],
    suspects: [
      { wallet: "0xca12e500000000000000000000000000000f0001", suspicionLevel: 80, tagsBitmap: 0b1101 },
      { wallet: "0xca12e500000000000000000000000000000f0002", suspicionLevel: 45, tagsBitmap: 0b0010 },
    ],
    hints: [
      // Location 0: Senso-ji Temple Node
      { locationIdx: 0, clueIndex: 0, hash: h("gas prices always multiples of 7 gwei — Carmen's known signature"), strength: 85 },
      { locationIdx: 0, clueIndex: 1, hash: h("wallet interacts with a temple-based NFT gallery — CryptoPunk spotted"), strength: 90 },
      { locationIdx: 0, clueIndex: 2, hash: h("identity commit hash links to known Carmen alias on Arbitrum"), strength: 95 },
      // Location 1: Tokyo Tower Beacon
      { locationIdx: 1, clueIndex: 0, hash: h("hardware wallet serial numbers trace back to a known Carmen alias"), strength: 80 },
      { locationIdx: 1, clueIndex: 1, hash: h("freshly minted token used as payment — same pattern as the heist"), strength: 75 },
      { locationIdx: 1, clueIndex: 2, hash: h("NFT provenance trail shows transfer to cold wallet labeled sakura-vault"), strength: 70 },
      // Location 2: Chochin Market
      { locationIdx: 2, clueIndex: 0, hash: h("departure records show movement but destination encrypted"), strength: 15 },
      { locationIdx: 2, clueIndex: 1, hash: h("token swap patterns appear planted — classic misdirection"), strength: 20 },
      { locationIdx: 2, clueIndex: 2, hash: h("no outbound bridge activity from this market — dead end"), strength: 10 },
    ],
    clueSchema: [ClueType.BEHAVIOR_FINGERPRINT, ClueType.FUNDING_TRAIL, ClueType.IDENTITY_COMMIT],
  },
  {
    name: "Paris",
    countryCode: "FR",
    chainId: 84532,
    cityId: 84532,
    rpcEnvKey: "BASE_SEPOLIA_RPC_URL",
    networkName: "Base Sepolia",
    locations: [
      { name: "Eiffel Tower Relay", description: "Monitoring beacon with bridge ingress traces.", category: 1, fakeLevel: 1, riskLevel: 3 },
      { name: "Louvre Custody Router", description: "High-value custody operations detected.", category: 2, fakeLevel: 2, riskLevel: 4 },
      { name: "Notre-Dame Gate", description: "Base traffic converges at this relay.", category: 0, fakeLevel: 1, riskLevel: 2 },
    ],
    anomalies: [
      { from: "0xdead000000000000000000000000000000000005", to: "0xdead000000000000000000000000000000000006", methodSig: "0x23b872dd", value: ethers.parseEther("2.0"), anomalyType: 2 }, // PRECISE_VALUE
      { from: "0xdead000000000000000000000000000000000007", to: "0xdead000000000000000000000000000000000008", methodSig: "0xa9059cbb", value: ethers.parseEther("0.1"), anomalyType: 3 }, // RECURRING_COUNTERPARTY
    ],
    suspects: [
      { wallet: "0xca12e500000000000000000000000000000f0003", suspicionLevel: 70, tagsBitmap: 0b0111 },
      { wallet: "0xca12e500000000000000000000000000000f0004", suspicionLevel: 55, tagsBitmap: 0b1010 },
    ],
    hints: [
      // Location 0: Eiffel Tower Relay
      { locationIdx: 0, clueIndex: 0, hash: h("beacon detects bridge relays but no direct match to suspect"), strength: 25 },
      { locationIdx: 0, clueIndex: 1, hash: h("Eurostar booking data shows no red-coat passenger — likely misdirection"), strength: 15 },
      { locationIdx: 0, clueIndex: 2, hash: h("relay traffic is legitimate cross-chain activity — not anomalous"), strength: 10 },
      // Location 1: Louvre Custody Router
      { locationIdx: 1, clueIndex: 0, hash: h("funded from CEX with specific amount pattern matching Carmen — 4200 ETH reference"), strength: 65 },
      { locationIdx: 1, clueIndex: 1, hash: h("uses CREATE2 with salt containing cityId — infrastructure fingerprint"), strength: 75 },
      { locationIdx: 1, clueIndex: 2, hash: h("bridge outbound tx shows movement EAST — she left Paris heading to Tokyo"), strength: 80 },
      // Location 2: Notre-Dame Gate
      { locationIdx: 2, clueIndex: 0, hash: h("departure records are heavily masked, no useful forensic data"), strength: 5 },
      { locationIdx: 2, clueIndex: 1, hash: h("cross-chain egress traffic is normal volume — no anomaly"), strength: 10 },
      { locationIdx: 2, clueIndex: 2, hash: h("ticket purchases don't match any known Carmen alias — dead end"), strength: 8 },
    ],
    clueSchema: [ClueType.FUNDING_TRAIL, ClueType.TECHNICAL_SIGNATURE, ClueType.RELATIONSHIP],
  },
  {
    name: "Sydney",
    countryCode: "AU",
    chainId: 51,
    cityId: 51,
    rpcEnvKey: "XDC_APOTHEM_RPC_URL",
    networkName: "XDC Apothem",
    locations: [
      { name: "Opera House Node", description: "XDC transmissions intensify after dusk.", category: 1, fakeLevel: 2, riskLevel: 3 },
      { name: "Harbour Bridge Relay", description: "Cross-chain drips forming a trail.", category: 0, fakeLevel: 1, riskLevel: 3 },
      { name: "Bondi Beach Market", description: "Unusual swaps mask the stolen assets.", category: 2, fakeLevel: 1, riskLevel: 2 },
    ],
    anomalies: [
      { from: "0xdead000000000000000000000000000000000009", to: "0xdead00000000000000000000000000000000000a", methodSig: "0xa9059cbb", value: ethers.parseEther("0.3"), anomalyType: 1 }, // BURST_NONCE
      { from: "0xdead00000000000000000000000000000000000b", to: "0xdead00000000000000000000000000000000000c", methodSig: "0x095ea7b3", value: ethers.parseEther("5.0"), anomalyType: 5 }, // CREATE2_DEPLOY
    ],
    suspects: [
      { wallet: "0xca12e500000000000000000000000000000f0005", suspicionLevel: 90, tagsBitmap: 0b1111 },
      { wallet: "0xca12e500000000000000000000000000000f0006", suspicionLevel: 35, tagsBitmap: 0b0001 },
    ],
    hints: [
      // Location 0: Opera House Node
      { locationIdx: 0, clueIndex: 0, hash: h("network traffic is normal here, no anomalies detected"), strength: 10 },
      { locationIdx: 0, clueIndex: 1, hash: h("timing signals are legitimate — standard block production"), strength: 8 },
      { locationIdx: 0, clueIndex: 2, hash: h("broadcast data shows no encrypted relays to suspects"), strength: 5 },
      // Location 1: Harbour Bridge Relay
      { locationIdx: 1, clueIndex: 0, hash: h("liquidity pool activity is legitimate MEV — no Carmen signature"), strength: 12 },
      { locationIdx: 1, clueIndex: 1, hash: h("trade records show standard DeFi activity — nothing anomalous"), strength: 10 },
      { locationIdx: 1, clueIndex: 2, hash: h("wallet fragments here don't match any known Carmen pattern"), strength: 15 },
      // Location 2: Bondi Beach Market
      { locationIdx: 2, clueIndex: 0, hash: h("departure records show no red-coat passenger — planted evidence"), strength: 8 },
      { locationIdx: 2, clueIndex: 1, hash: h("bridge endpoints are dormant — no recent cross-chain activity"), strength: 5 },
      { locationIdx: 2, clueIndex: 2, hash: h("transit hub is a dead end — Carmen never came through Sydney"), strength: 3 },
    ],
    clueSchema: [ClueType.DEAD_END, ClueType.RELATIONSHIP, ClueType.BEHAVIOR_FINGERPRINT],
  },
];

// ============================================================
//  Main deploy script
// ============================================================

async function main() {
  const [deployer] = await ethers.getSigners();
  const rootDir = path.resolve(process.cwd(), "..");
  const creDir = path.join(rootDir, "cre-workflows");
  const PRIVATE_KEY = process.env.PRIVATE_KEY!;

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   Carmen Sandiego On-Chain — Full Path B Deploy     ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log("Deployer:", deployer.address);
  console.log("Balance (Sepolia):", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // ─── Config ───
  const VRF_COORDINATOR_ADDR = process.env.VRF_COORDINATOR_SEPOLIA || "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B";
  const VRF_KEY_HASH = process.env.VRF_KEY_HASH_SEPOLIA || "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";
  const KEYSTONE_FORWARDER = process.env.KEYSTONE_FORWARDER_SEPOLIA || "0x15fC6ae953E024d975e77382eEeC56A9101f9F88";

  const validChainIds = [421614, 84532, 51];

  // ─── VRF Coordinator interface ───
  const vrfCoordinator = new ethers.Contract(
    VRF_COORDINATOR_ADDR,
    [
      "function createSubscription() external returns (uint256 subId)",
      "function addConsumer(uint256 subId, address consumer) external",
      "function fundSubscriptionWithNative(uint256 subId) external payable",
      "event SubscriptionCreated(uint256 indexed subId, address owner)",
    ],
    deployer
  );

  // ══════════════════════════════════════════════════════════
  //  PHASE 1: Sepolia Contracts
  // ══════════════════════════════════════════════════════════
  console.log("═══ PHASE 1: Sepolia Contracts ═══\n");

  // 0. VRF Subscription
  let subId: string;
  if (process.env.VRF_SUBSCRIPTION_ID) {
    subId = process.env.VRF_SUBSCRIPTION_ID;
    console.log("0. Reusing VRF subscription:", subId.slice(0, 20) + "...");
  } else {
    console.log("0. Creating VRF subscription...");
    const txSub = await vrfCoordinator.createSubscription();
    const receipt = await txSub.wait();
    const event = receipt.logs.find((l: any) => {
      try {
        return vrfCoordinator.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === "SubscriptionCreated";
      } catch { return false; }
    });
    const parsed = vrfCoordinator.interface.parseLog({ topics: [...event!.topics], data: event!.data });
    subId = parsed!.args[0].toString();
    console.log("   VRF Subscription created:", subId);

    // Fund new subscription
    console.log("   Funding VRF subscription with 0.1 ETH...");
    const txFund = await vrfCoordinator.fundSubscriptionWithNative(subId, { value: ethers.parseEther("0.1") });
    await txFund.wait();
    console.log("   Subscription funded");
  }

  // 1. GameMaster
  console.log("1. Deploying GameMaster...");
  const GameMaster = await ethers.getContractFactory("GameMaster");
  const gameMaster = await GameMaster.deploy(
    VRF_COORDINATOR_ADDR, subId, VRF_KEY_HASH, validChainIds, deployer.address
  );
  await gameMaster.waitForDeployment();
  const gmAddress = await gameMaster.getAddress();
  console.log("   GameMaster:", gmAddress);

  // 1b. Add as VRF consumer
  console.log("1b. Adding GameMaster as VRF consumer...");
  const txAdd = await vrfCoordinator.addConsumer(subId, gmAddress);
  await txAdd.wait();
  console.log("   Added as VRF consumer");

  // 2. GameMasterProxy
  console.log("2. Deploying GameMasterProxy...");
  const ProxyFactory = await ethers.getContractFactory("GameMasterProxy");
  const proxy = await ProxyFactory.deploy(KEYSTONE_FORWARDER, gmAddress);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log("   GameMasterProxy:", proxyAddress);

  // 3. Set proxy as CRE oracle
  console.log("3. Setting proxy as CRE oracle...");
  const tx1 = await gameMaster.setCREOracle(proxyAddress);
  await tx1.wait();
  console.log("   CRE oracle → proxy");

  // 4. MissionNFT
  console.log("4. Deploying MissionNFT...");
  const MissionNFT = await ethers.getContractFactory("MissionNFT");
  const missionNFT = await MissionNFT.deploy(gmAddress);
  await missionNFT.waitForDeployment();
  const nftAddress = await missionNFT.getAddress();
  console.log("   MissionNFT:", nftAddress);

  // 5. Link MissionNFT
  console.log("5. Linking MissionNFT to GameMaster...");
  const tx2 = await gameMaster.setMissionNFT(nftAddress);
  await tx2.wait();
  console.log("   MissionNFT linked");

  // 6. PlayerRegistry
  console.log("6. Deploying PlayerRegistry...");
  const PlayerRegistry = await ethers.getContractFactory("PlayerRegistry");
  const playerRegistry = await PlayerRegistry.deploy();
  await playerRegistry.waitForDeployment();
  const registryAddress = await playerRegistry.getAddress();
  console.log("   PlayerRegistry:", registryAddress);

  // 6b. Set GameMaster on PlayerRegistry
  console.log("6b. Setting GameMaster on PlayerRegistry...");
  const tx3 = await playerRegistry.setGameMaster(gmAddress);
  await tx3.wait();
  console.log("   PlayerRegistry.gameMaster → GameMaster");

  console.log("\n   ✓ Sepolia deployment complete\n");

  // ══════════════════════════════════════════════════════════
  //  PHASE 2: CityNode Deployment (cross-chain)
  // ══════════════════════════════════════════════════════════
  console.log("═══ PHASE 2: CityNode Deployment (cross-chain) ═══\n");

  // Read CityNode artifact for raw ethers deployment
  const cityNodeArtifactPath = path.join(process.cwd(), "artifacts", "src", "CityNode.sol", "CityNode.json");
  const cityNodeArtifact = JSON.parse(fs.readFileSync(cityNodeArtifactPath, "utf-8"));

  const cityNodeAddresses: Record<string, string> = {};

  for (let i = 0; i < CITY_DEFS.length; i++) {
    const city = CITY_DEFS[i];
    const rpcUrl = process.env[city.rpcEnvKey];

    if (!rpcUrl) {
      console.log(`   ⚠ Skipping ${city.name}: ${city.rpcEnvKey} not set`);
      continue;
    }

    console.log(`7${String.fromCharCode(97 + i)}. Deploying CityNode ${city.name} on ${city.networkName}...`);

    try {
      // Create provider + wallet for target chain
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      const balance = await provider.getBalance(wallet.address);
      console.log(`   Balance on ${city.networkName}: ${ethers.formatEther(balance)}`);

      if (balance === 0n) {
        console.log(`   ⚠ No funds on ${city.networkName}, skipping...`);
        continue;
      }

      // Deploy CityNode
      // gameMaster = deployer address (for cross-chain, deployer acts as GM for resolve calls)
      const factory = new ethers.ContractFactory(cityNodeArtifact.abi, cityNodeArtifact.bytecode, wallet);
      const cityNode = await factory.deploy(city.name, city.countryCode, city.chainId, city.cityId, wallet.address, ethers.ZeroAddress);
      await cityNode.waitForDeployment();
      const cityNodeAddress = await cityNode.getAddress();
      cityNodeAddresses[city.name] = cityNodeAddress;
      console.log(`   CityNode ${city.name}: ${cityNodeAddress}`);

      // ─── Configure locations ───
      console.log(`   Configuring ${city.name} locations...`);
      const locationInfos = city.locations.map((loc) => ({
        name: loc.name,
        descriptionHash: ethers.keccak256(ethers.toUtf8Bytes(loc.description)),
        category: loc.category,
        fakeLevel: loc.fakeLevel,
        riskLevel: loc.riskLevel,
      }));

      const txLoc = await cityNode.setupLocations(locationInfos);
      await txLoc.wait();
      console.log(`   ✓ ${city.name}: 3 locations configured`);

      // ─── Add anomaly tx refs ───
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
        const txAnom = await cityNode.addAnomalyTxRef(txRef);
        await txAnom.wait();
      }
      console.log(`   ✓ ${city.name}: ${city.anomalies.length} anomalies added`);

      // ─── Add suspect wallets ───
      for (let j = 0; j < city.suspects.length; j++) {
        const sus = city.suspects[j];
        const suspect = {
          wallet: ethers.getAddress(sus.wallet),
          suspicionLevel: sus.suspicionLevel,
          txRefIds: [(i * 10) + j + 1], // link to anomaly
          tagsBitmap: sus.tagsBitmap,
        };
        const txSus = await cityNode.addSuspectWallet(suspect);
        await txSus.wait();
      }
      console.log(`   ✓ ${city.name}: ${city.suspects.length} suspects added`);

      // ─── Set suspicion index ───
      const suspicionLevel = city.name === "Tokyo" ? 65 : city.name === "Paris" ? 75 : 55;
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(`${city.name} shows elevated blockchain anomaly patterns`));
      const txSusp = await cityNode.setSuspicionIndex(suspicionLevel, reasonHash);
      await txSusp.wait();
      console.log(`   ✓ ${city.name}: suspicion index set to ${suspicionLevel}`);

      // ─── Set hints (3 locations x 3 clues = 9 hints) ───
      console.log(`   Configuring ${city.name} hints...`);
      for (const hint of city.hints) {
        const txHint = await cityNode.setHint(hint.locationIdx, hint.clueIndex, hint.hash, hint.strength);
        await txHint.wait();
      }
      console.log(`   ✓ ${city.name}: ${city.hints.length} hints configured`);

      // ─── Set clue schema ───
      const txSchema = await cityNode.setClueSchema(city.clueSchema);
      await txSchema.wait();
      console.log(`   ✓ ${city.name}: clue schema set (${city.clueSchema.length} types)`);

      // ─── Set GameMaster address (for cross-chain resolve calls) ───
      const txGM = await cityNode.setGameMaster(gmAddress);
      await txGM.wait();
      console.log(`   ✓ ${city.name}: gameMaster set to ${gmAddress}`);

    } catch (err: any) {
      console.log(`   ✗ ${city.name} deployment failed: ${err.message?.slice(0, 100)}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  PHASE 3: Summary
  // ══════════════════════════════════════════════════════════
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║              DEPLOYED ADDRESSES                     ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║ GameMaster:      ${gmAddress} ║`);
  console.log(`║ GameMasterProxy: ${proxyAddress} ║`);
  console.log(`║ MissionNFT:      ${nftAddress} ║`);
  console.log(`║ PlayerRegistry:  ${registryAddress} ║`);
  console.log("╠──────────────────────────────────────────────────────╣");
  for (const [name, addr] of Object.entries(cityNodeAddresses)) {
    const padName = (name + ":").padEnd(17);
    console.log(`║ ${padName}${addr} ║`);
  }
  console.log(`║ VRF Coordinator: ${VRF_COORDINATOR_ADDR} ║`);
  console.log(`║ Forwarder:       ${KEYSTONE_FORWARDER} ║`);
  console.log("╚══════════════════════════════════════════════════════╝");

  // ══════════════════════════════════════════════════════════
  //  PHASE 4: Auto-generate config files
  // ══════════════════════════════════════════════════════════
  console.log("\n═══ PHASE 4: Generating Config Files ═══\n");

  function writeJsonConfig(filePath: string, config: Record<string, any>) {
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
    console.log(`   Generated: ${path.relative(rootDir, filePath)}`);
  }

  // ── Root .env ──
  const rootEnvPath = path.join(rootDir, ".env");
  const marker = "# --- Deployed Contract Addresses (auto-generated by deploy-all.ts) ---";
  const addressLines = [
    marker,
    `GAME_MASTER_ADDRESS=${gmAddress}`,
    `GAME_MASTER_PROXY_ADDRESS=${proxyAddress}`,
    `MISSION_NFT_ADDRESS=${nftAddress}`,
    `PLAYER_REGISTRY_ADDRESS=${registryAddress}`,
  ];

  if (cityNodeAddresses["Tokyo"]) addressLines.push(`CITYNODE_TOKYO_ADDRESS=${cityNodeAddresses["Tokyo"]}`);
  if (cityNodeAddresses["Paris"]) addressLines.push(`CITYNODE_PARIS_ADDRESS=${cityNodeAddresses["Paris"]}`);
  if (cityNodeAddresses["Sydney"]) addressLines.push(`CITYNODE_SYDNEY_ADDRESS=${cityNodeAddresses["Sydney"]}`);

  const addressBlock = addressLines.join("\n");

  if (fs.existsSync(rootEnvPath)) {
    let envContent = fs.readFileSync(rootEnvPath, "utf-8");
    if (envContent.includes(marker)) {
      envContent = envContent.replace(
        new RegExp(`${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=\\n\\n|\\n#|$)`),
        addressBlock
      );
    } else {
      envContent = envContent.trimEnd() + "\n\n" + addressBlock + "\n";
    }
    fs.writeFileSync(rootEnvPath, envContent);
  } else {
    fs.writeFileSync(rootEnvPath, addressBlock + "\n");
  }
  console.log("   Updated:   .env (deployed addresses)");

  // ── frontend/.env ──
  const frontendEnvPath = path.join(rootDir, "frontend", ".env");
  const frontendEnvLines = [`VITE_GAME_MASTER_ADDRESS=${gmAddress}`];
  if (cityNodeAddresses["Tokyo"]) frontendEnvLines.push(`VITE_CITYNODE_TOKYO_ADDRESS=${cityNodeAddresses["Tokyo"]}`);
  if (cityNodeAddresses["Paris"]) frontendEnvLines.push(`VITE_CITYNODE_PARIS_ADDRESS=${cityNodeAddresses["Paris"]}`);
  if (cityNodeAddresses["Sydney"]) frontendEnvLines.push(`VITE_CITYNODE_SYDNEY_ADDRESS=${cityNodeAddresses["Sydney"]}`);
  frontendEnvLines.push(`VITE_PLAYER_REGISTRY_ADDRESS=${registryAddress}`);
  fs.writeFileSync(frontendEnvPath, frontendEnvLines.join("\n") + "\n");
  console.log("   Generated: frontend/.env");

  // ── CRE configs ──
  // IMPORTANT: Never write real API keys to config files
  const baseConfig: Record<string, string> = {
    chainSelectorName: "ethereum-testnet-sepolia",
    gameMasterAddress: gmAddress,
    proxyAddress: proxyAddress,
    gasLimit: "500000",
  };

  const briefingConfig: Record<string, string> = {
    ...baseConfig,
    openaiApiKey: "YOUR_OPENAI_API_KEY",
    openaiModel: "gpt-4o-mini",
    elevenLabsApiKey: "YOUR_ELEVENLABS_API_KEY",
  };

  const playerRegistryConfig: Record<string, any> = {
    chainSelectorName: "ethereum-testnet-sepolia",
    playerRegistryAddress: registryAddress,
    gasLimit: "500000",
  };

  // mission-start & carmen-moves
  writeJsonConfig(path.join(creDir, "mission-start", "config.staging.json"), baseConfig);
  writeJsonConfig(path.join(creDir, "mission-start", "config.production.json"), baseConfig);
  writeJsonConfig(path.join(creDir, "carmen-moves", "config.staging.json"), baseConfig);
  writeJsonConfig(path.join(creDir, "carmen-moves", "config.production.json"), baseConfig);

  // generate-briefing & generate-finale (include OpenAI placeholder)
  writeJsonConfig(path.join(creDir, "generate-briefing", "config.staging.json"), briefingConfig);
  writeJsonConfig(path.join(creDir, "generate-briefing", "config.production.json"), briefingConfig);
  writeJsonConfig(path.join(creDir, "generate-finale", "config.staging.json"), briefingConfig);
  writeJsonConfig(path.join(creDir, "generate-finale", "config.production.json"), briefingConfig);

  // citynode-resolver
  writeJsonConfig(path.join(creDir, "citynode-resolver", "config.staging.json"), baseConfig);
  writeJsonConfig(path.join(creDir, "citynode-resolver", "config.production.json"), baseConfig);

  // player-check & player-registration
  writeJsonConfig(path.join(creDir, "player-check", "config.staging.json"), playerRegistryConfig);
  writeJsonConfig(path.join(creDir, "player-check", "config.production.json"), playerRegistryConfig);
  writeJsonConfig(path.join(creDir, "player-registration", "config.staging.json"), playerRegistryConfig);
  writeJsonConfig(path.join(creDir, "player-registration", "config.production.json"), playerRegistryConfig);

  console.log("\n═══ DEPLOYMENT COMPLETE ═══");
  console.log("Next steps:");
  console.log("  1. Deploy CRE workflows");
  console.log("  2. Fund VRF if needed: https://vrf.chain.link");
  console.log("  3. Test: npx hardhat run scripts/simulate-testnet.ts --network sepolia");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
