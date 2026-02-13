import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Carmen Sandiego On-Chain — Full Deploy ===");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // --- Config ---
  const VRF_COORDINATOR_ADDR = process.env.VRF_COORDINATOR_SEPOLIA || "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B";
  const VRF_KEY_HASH = process.env.VRF_KEY_HASH_SEPOLIA || "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";
  const KEYSTONE_FORWARDER = process.env.KEYSTONE_FORWARDER_SEPOLIA || "0x15fC6ae953E024d975e77382eEeC56A9101f9F88";
  const NATIVE_FUND_AMOUNT = ethers.parseEther("0.1"); // 0.1 ETH for VRF native payment

  const validChainIds = [
    421614,  // Arbitrum Sepolia → Tokyo
    84532,   // Base Sepolia → Paris
    51,      // XDC Apothem → London
  ];

  // --- VRF Coordinator ---
  const vrfCoordinator = new ethers.Contract(
    VRF_COORDINATOR_ADDR,
    [
      "function createSubscription() external returns (uint256 subId)",
      "function addConsumer(uint256 subId, address consumer) external",
      "event SubscriptionCreated(uint256 indexed subId, address owner)",
    ],
    deployer
  );

  // --- 0. Get or create VRF subscription ---
  let subId: string;
  if (process.env.VRF_SUBSCRIPTION_ID) {
    subId = process.env.VRF_SUBSCRIPTION_ID;
    console.log("0. Using existing VRF subscription:", subId);
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
  }

  // --- 1. Deploy GameMaster ---
  console.log("1. Deploying GameMaster...");
  const GameMaster = await ethers.getContractFactory("GameMaster");
  const gameMaster = await GameMaster.deploy(
    VRF_COORDINATOR_ADDR,
    subId,
    VRF_KEY_HASH,
    validChainIds,
    deployer.address // temp CRE oracle, will be updated to proxy
  );
  await gameMaster.waitForDeployment();
  const gmAddress = await gameMaster.getAddress();
  console.log("   GameMaster:", gmAddress);

  // --- 1b. Add GameMaster as VRF consumer ---
  console.log("1b. Adding GameMaster as VRF consumer...");
  const txAdd = await vrfCoordinator.addConsumer(subId, gmAddress);
  await txAdd.wait();
  console.log("   GameMaster added as VRF consumer");

  // --- 1c. Fund VRF subscription with native ETH ---
  console.log("1c. Funding VRF subscription with 0.1 ETH (native payment)...");
  const vrfFunder = new ethers.Contract(
    VRF_COORDINATOR_ADDR,
    ["function fundSubscriptionWithNative(uint256 subId) external payable"],
    deployer
  );
  const txFund = await vrfFunder.fundSubscriptionWithNative(subId, { value: NATIVE_FUND_AMOUNT });
  await txFund.wait();
  console.log("   Subscription funded with 0.1 ETH");

  // --- 2. Deploy GameMasterProxy ---
  console.log("2. Deploying GameMasterProxy...");
  const ProxyFactory = await ethers.getContractFactory("GameMasterProxy");
  const proxy = await ProxyFactory.deploy(KEYSTONE_FORWARDER, gmAddress);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log("   GameMasterProxy:", proxyAddress);

  // --- 3. Set proxy as CRE oracle ---
  console.log("3. Setting proxy as CRE oracle...");
  const tx1 = await gameMaster.setCREOracle(proxyAddress);
  await tx1.wait();
  console.log("   CRE oracle set to:", proxyAddress);

  // --- 4. Deploy MissionNFT ---
  console.log("4. Deploying MissionNFT...");
  const MissionNFT = await ethers.getContractFactory("MissionNFT");
  const missionNFT = await MissionNFT.deploy(gmAddress);
  await missionNFT.waitForDeployment();
  const nftAddress = await missionNFT.getAddress();
  console.log("   MissionNFT:", nftAddress);

  // --- 5. Connect MissionNFT to GameMaster ---
  console.log("5. Setting MissionNFT on GameMaster...");
  const tx2 = await gameMaster.setMissionNFT(nftAddress);
  await tx2.wait();
  console.log("   MissionNFT linked to GameMaster");

  // --- Summary ---
  console.log("\n=== DEPLOYED ADDRESSES ===");
  console.log(`GameMaster:      ${gmAddress}`);
  console.log(`GameMasterProxy: ${proxyAddress}`);
  console.log(`MissionNFT:      ${nftAddress}`);
  console.log(`VRF Coordinator: ${VRF_COORDINATOR_ADDR}`);
  console.log(`Forwarder:       ${KEYSTONE_FORWARDER}`);

  // --- Auto-generate config files ---
  const rootDir = path.resolve(process.cwd(), "..");
  const creDir = path.join(rootDir, "cre-workflows");

  // Helper: write JSON config
  function writeJsonConfig(filePath: string, config: Record<string, string>) {
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
    console.log(`   Generated: ${path.relative(rootDir, filePath)}`);
  }

  console.log("\n=== GENERATING CONFIG FILES ===");

  // Root .env — append/update deployed addresses block
  const rootEnvPath = path.join(rootDir, ".env");
  const marker = "# --- Deployed Contract Addresses (auto-generated by deploy-all.ts) ---";
  const addressBlock = [
    marker,
    `GAME_MASTER_ADDRESS=${gmAddress}`,
    `GAME_MASTER_PROXY_ADDRESS=${proxyAddress}`,
    `MISSION_NFT_ADDRESS=${nftAddress}`,
  ].join("\n");

  if (fs.existsSync(rootEnvPath)) {
    let envContent = fs.readFileSync(rootEnvPath, "utf-8");
    if (envContent.includes(marker)) {
      // Replace existing block (from marker to next blank line or EOF)
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

  // frontend/.env
  const frontendEnvPath = path.join(rootDir, "frontend", ".env");
  fs.writeFileSync(frontendEnvPath, `VITE_GAME_MASTER_ADDRESS=${gmAddress}\n`);
  console.log("   Generated: frontend/.env");

  // CRE configs — base config (mission-start, carmen-moves)
  const baseConfig = {
    chainSelectorName: "ethereum-testnet-sepolia",
    gameMasterAddress: gmAddress,
    proxyAddress: proxyAddress,
    gasLimit: "500000",
  };

  // CRE configs — briefing config (generate-briefing, includes OpenAI fields)
  const briefingConfig = {
    ...baseConfig,
    openaiApiKey: process.env.OPENAI_API_KEY || "YOUR_OPENAI_API_KEY",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  };

  writeJsonConfig(path.join(creDir, "mission-start", "config.staging.json"), baseConfig);
  writeJsonConfig(path.join(creDir, "mission-start", "config.production.json"), baseConfig);
  writeJsonConfig(path.join(creDir, "carmen-moves", "config.staging.json"), baseConfig);
  writeJsonConfig(path.join(creDir, "carmen-moves", "config.production.json"), baseConfig);
  writeJsonConfig(path.join(creDir, "generate-briefing", "config.staging.json"), briefingConfig);
  writeJsonConfig(path.join(creDir, "generate-briefing", "config.production.json"), briefingConfig);

  console.log("\n=== NEXT STEPS ===");
  console.log("1. Deploy CRE workflows: cre workflow deploy mission-start --target staging-settings");
  console.log("2. Fund VRF subscription if needed: https://vrf.chain.link");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
