import { ethers } from "hardhat";

// ANSI colors for terminal
const COLORS = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
};

const C = COLORS;

const CITIES: Record<number, { name: string; emoji: string; chain: string }> = {
  421614: { name: "Tokyo", emoji: "🗼", chain: "Arbitrum Sepolia" },
  84532:  { name: "Paris", emoji: "🗼", chain: "Base Sepolia" },
  51:     { name: "London", emoji: "🎡", chain: "XDC Apothem" },
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function log(msg: string, delay = 400) {
  console.log(msg);
  await sleep(delay);
}

async function separator() {
  console.log(`${C.dim}${"─".repeat(60)}${C.reset}`);
  await sleep(200);
}

async function banner(text: string) {
  console.log("");
  console.log(`${C.bold}${C.bgBlue}${C.white} ${"═".repeat(58)} ${C.reset}`);
  console.log(`${C.bold}${C.bgBlue}${C.white}  ${text.padEnd(57)}${C.reset}`);
  console.log(`${C.bold}${C.bgBlue}${C.white} ${"═".repeat(58)} ${C.reset}`);
  console.log("");
  await sleep(600);
}

async function main() {
  const [owner, creOracle, player] = await ethers.getSigners();

  // ============================================================
  //  SETUP
  // ============================================================
  await banner("CARMEN SANDIEGO ON-CHAIN - Live Simulation");

  await log(`${C.cyan}[SETUP]${C.reset} Deploying contracts on local Hardhat network...`);

  // Deploy VRF Mock
  const VRFMock = await ethers.getContractFactory("VRFCoordinatorV2PlusMock");
  const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
  await vrfCoordinator.waitForDeployment();
  await log(`${C.green}  ✓${C.reset} VRF Coordinator Mock: ${C.dim}${await vrfCoordinator.getAddress()}${C.reset}`);

  // Create & fund subscription
  const createSubTx = await vrfCoordinator.createSubscription();
  const createSubReceipt = await createSubTx.wait();
  const subCreatedEvent = createSubReceipt?.logs.find((l: any) => {
    try { return vrfCoordinator.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === "SubscriptionCreated"; } catch { return false; }
  });
  const subId = vrfCoordinator.interface.parseLog({ topics: [...subCreatedEvent!.topics], data: subCreatedEvent!.data })!.args[0];
  await vrfCoordinator.fundSubscription(subId, 1000000);
  await log(`${C.green}  ✓${C.reset} VRF Subscription #${subId} created & funded`);

  // Deploy GameMaster
  const validChainIds = [421614, 84532, 51];
  const VRF_KEY_HASH = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";
  const GameMasterFactory = await ethers.getContractFactory("GameMaster");
  const gameMaster = await GameMasterFactory.deploy(
    await vrfCoordinator.getAddress(), subId, VRF_KEY_HASH, validChainIds, creOracle.address
  );
  await gameMaster.waitForDeployment();
  await vrfCoordinator.addConsumer(subId, await gameMaster.getAddress());
  await log(`${C.green}  ✓${C.reset} GameMaster:           ${C.dim}${await gameMaster.getAddress()}${C.reset}`);

  // Deploy CityNodes
  const CityNodeFactory = await ethers.getContractFactory("CityNode");
  const cityTokyo = await CityNodeFactory.deploy("Tokyo", 421614, creOracle.address);
  const cityParis = await CityNodeFactory.deploy("Paris", 84532, creOracle.address);
  const cityLondon = await CityNodeFactory.deploy("London", 51, creOracle.address);
  await log(`${C.green}  ✓${C.reset} CityNode Tokyo:       ${C.dim}${await cityTokyo.getAddress()}${C.reset}`);
  await log(`${C.green}  ✓${C.reset} CityNode Paris:       ${C.dim}${await cityParis.getAddress()}${C.reset}`);
  await log(`${C.green}  ✓${C.reset} CityNode London:      ${C.dim}${await cityLondon.getAddress()}${C.reset}`);

  await separator();
  await log(`${C.cyan}[INFO]${C.reset} Player wallet:  ${C.bold}${player.address}${C.reset}`);
  await log(`${C.cyan}[INFO]${C.reset} CRE Oracle:     ${C.bold}${creOracle.address}${C.reset}`);
  await log(`${C.cyan}[INFO]${C.reset} Cities: Tokyo (Arbitrum) | Paris (Base) | London (XDC)`);

  // ============================================================
  //  MISSION START
  // ============================================================
  await banner("PHASE 1: Mission Briefing");

  await log(`${C.yellow}[PLAYER]${C.reset} Agent connects wallet and requests a new mission...`);
  await sleep(800);

  const startTx = await gameMaster.connect(player).startMission();
  const startReceipt = await startTx.wait();
  const missionId = 1;

  await log(`${C.green}[CONTRACT]${C.reset} ${C.bold}MissionStarted${C.reset} event emitted!`);
  await log(`${C.dim}  → Mission ID: #${missionId}${C.reset}`);
  await log(`${C.dim}  → Block: ${startReceipt?.blockNumber}${C.reset}`);
  await log(`${C.dim}  → TX: ${startReceipt?.hash?.slice(0, 20)}...${C.reset}`);

  await sleep(600);
  await log(`\n${C.magenta}[CRE]${C.reset} 🔗 Workflow triggered by MissionStarted event...`);
  await log(`${C.magenta}[CRE]${C.reset} 🎲 Requesting VRF randomness for Carmen's location...`);

  await sleep(1000);

  // VRF callback - Carmen hides in Tokyo (word=3, 3%3=0 → index 0 → Tokyo)
  const gmAddr = await gameMaster.getAddress();
  await vrfCoordinator.fulfillRandomWordsWithOverride(1, gmAddr, [3]);

  const mission = await gameMaster.getMission(missionId);
  const targetCity = CITIES[Number(mission.targetChainId)];

  await log(`${C.green}[VRF]${C.reset} 🎲 Random word received! Carmen's location determined.`);
  await log(`${C.red}[SECRET]${C.reset} 🕵️ Carmen is hiding in... ${C.bold}${C.red}${targetCity.name} ${targetCity.emoji}${C.reset} ${C.dim}(chain: ${targetCity.chain})${C.reset}`);

  // CRE updates city presence
  await sleep(600);
  await log(`\n${C.magenta}[CRE]${C.reset} 📡 EVM Write → Updating Carmen presence on ${targetCity.chain}...`);
  await cityTokyo.connect(creOracle).updateCarmenPresence(missionId, true);
  await log(`${C.green}[CRE]${C.reset} ✓ Carmen marked as present in Tokyo`);

  // CRE generates briefing
  await sleep(800);
  await log(`\n${C.magenta}[CRE]${C.reset} 🤖 HTTP Fetch → Calling OpenAI for mission briefing...`);
  await sleep(1200);
  console.log("");
  console.log(`${C.cyan}${C.bold}  ┌──────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.cyan}${C.bold}  │           MISSION BRIEFING FROM HQ               │${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ├──────────────────────────────────────────────────┤${C.reset}`);
  console.log(`${C.cyan}  │${C.reset} Agent, Carmen Sandiego has struck again!         ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}  │${C.reset} A priceless NFT - "The Digital Mona Lisa" -     ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}  │${C.reset} has been stolen from the Ethereum Museum.        ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}  │${C.reset}                                                  ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}  │${C.reset} Intelligence suggests she fled across chains.    ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}  │${C.reset} She could be in Tokyo, Paris, or London.         ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}  │${C.reset}                                                  ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}  │${C.reset} ${C.bold}You have 10 investigations. Choose wisely.${C.reset}      ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}${C.bold}  └──────────────────────────────────────────────────┘${C.reset}`);
  console.log("");
  await sleep(1000);

  // ============================================================
  //  INVESTIGATION 1: Paris (WRONG)
  // ============================================================
  await banner("PHASE 2: Investigation Loop");

  await log(`${C.yellow}[PLAYER]${C.reset} 🔍 "I'll start by investigating Paris..." `);
  await sleep(800);

  const inv1Tx = await gameMaster.connect(player).submitInvestigation(84532);
  const inv1Receipt = await inv1Tx.wait();
  await log(`${C.green}[CONTRACT]${C.reset} ${C.bold}InvestigationSubmitted${C.reset} → Paris (Base Sepolia)`);
  await log(`${C.dim}  → Investigation #1 of 10${C.reset}`);
  await log(`${C.dim}  → Block: ${inv1Receipt?.blockNumber}${C.reset}`);
  await log(`${C.red}  → Carmen is NOT in Paris!${C.reset}`);

  await sleep(800);
  await log(`\n${C.magenta}[CRE]${C.reset} 🔗 Workflow triggered by InvestigationSubmitted...`);
  await log(`${C.magenta}[CRE]${C.reset} 📖 EVM Read → Checking Carmen's real location...`);
  await log(`${C.magenta}[CRE]${C.reset} 🤖 HTTP Fetch → Generating misleading clue via OpenAI...`);
  await sleep(1000);

  // CRE delivers false clue
  const falseClueHash = ethers.keccak256(ethers.toUtf8Bytes("A witness saw Carmen near the Eiffel Tower..."));
  await gameMaster.connect(creOracle).receiveClue(
    missionId, 0, falseClueHash, "",
    "A local vendor reported seeing a woman in red boarding the Eurostar. She seemed to be heading south...",
    false
  );

  await log(`${C.green}[CONTRACT]${C.reset} ${C.bold}ClueReceived${C.reset} → Text clue delivered!`);
  console.log("");
  console.log(`${C.yellow}  ┌──────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.yellow}  │  CLUE #1 (Text) ${C.dim}${C.yellow}[⚠ MISLEADING]${C.reset}${C.yellow}                    │${C.reset}`);
  console.log(`${C.yellow}  ├──────────────────────────────────────────────────┤${C.reset}`);
  console.log(`${C.yellow}  │${C.reset} "A local vendor reported seeing a woman in red   ${C.yellow}│${C.reset}`);
  console.log(`${C.yellow}  │${C.reset}  boarding the Eurostar. She seemed to be heading  ${C.yellow}│${C.reset}`);
  console.log(`${C.yellow}  │${C.reset}  south..."                                        ${C.yellow}│${C.reset}`);
  console.log(`${C.yellow}  └──────────────────────────────────────────────────┘${C.reset}`);
  console.log("");
  await sleep(1200);

  // ============================================================
  //  INVESTIGATION 2: London (WRONG)
  // ============================================================
  await log(`${C.yellow}[PLAYER]${C.reset} 🔍 "Heading south... Maybe London? Let me check!"`);
  await sleep(800);

  const inv2Tx = await gameMaster.connect(player).submitInvestigation(51);
  const inv2Receipt = await inv2Tx.wait();
  await log(`${C.green}[CONTRACT]${C.reset} ${C.bold}InvestigationSubmitted${C.reset} → London (XDC Apothem)`);
  await log(`${C.dim}  → Investigation #2 of 10${C.reset}`);
  await log(`${C.red}  → Carmen is NOT in London!${C.reset}`);

  await sleep(800);
  await log(`\n${C.magenta}[CRE]${C.reset} 🔗 Workflow triggered...`);
  await log(`${C.magenta}[CRE]${C.reset} 🤖 Generating TRUE clue this time (70% chance)...`);
  await log(`${C.magenta}[CRE]${C.reset} 🎤 HTTP Fetch → ElevenLabs TTS generating audio...`);
  await sleep(1000);
  await log(`${C.magenta}[CRE]${C.reset} 📤 HTTP Fetch → Uploading audio to IPFS via Pinata...`);
  await sleep(800);

  // CRE delivers true audio clue
  const trueClueHash = ethers.keccak256(ethers.toUtf8Bytes("audio-clue-tokyo-hint"));
  await gameMaster.connect(creOracle).receiveClue(
    missionId, 1, trueClueHash,
    "QmXyZ789audioCarmenTokyoHint",
    "", true
  );

  await log(`${C.green}[CONTRACT]${C.reset} ${C.bold}ClueReceived${C.reset} → Audio clue delivered!`);
  console.log("");
  console.log(`${C.green}  ┌──────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.green}  │  CLUE #2 (Audio) ${C.bold}[✓ TRUE CLUE]${C.reset}${C.green}                   │${C.reset}`);
  console.log(`${C.green}  ├──────────────────────────────────────────────────┤${C.reset}`);
  console.log(`${C.green}  │${C.reset} 🔊 Playing audio from IPFS...                    ${C.green}│${C.reset}`);
  console.log(`${C.green}  │${C.reset} CID: QmXyZ789audioCarmenTokyoHint                ${C.green}│${C.reset}`);
  console.log(`${C.green}  │${C.reset}                                                   ${C.green}│${C.reset}`);
  console.log(`${C.green}  │${C.reset} 🎙️ "Intercepted radio chatter mentions cherry     ${C.green}│${C.reset}`);
  console.log(`${C.green}  │${C.reset}  blossoms and neon lights. Someone matching her    ${C.green}│${C.reset}`);
  console.log(`${C.green}  │${C.reset}  description was seen near a bullet train..."      ${C.green}│${C.reset}`);
  console.log(`${C.green}  └──────────────────────────────────────────────────┘${C.reset}`);
  console.log("");
  await sleep(1500);

  // ============================================================
  //  INVESTIGATION 3: Tokyo (CORRECT!)
  // ============================================================
  await banner("PHASE 3: The Capture!");

  await log(`${C.yellow}[PLAYER]${C.reset} 💡 "Cherry blossoms and bullet trains... TOKYO!"`);
  await sleep(1000);
  await log(`${C.yellow}[PLAYER]${C.reset} 🎯 Submitting investigation → Tokyo (Arbitrum Sepolia)`);
  await sleep(600);

  const captureTx = await gameMaster.connect(player).submitInvestigation(421614);
  const captureReceipt = await captureTx.wait();

  // Parse CarmenCaptured event
  const capturedEvent = captureReceipt?.logs.find((l: any) => {
    try { return gameMaster.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === "CarmenCaptured"; } catch { return false; }
  });
  const capturedArgs = gameMaster.interface.parseLog({ topics: [...capturedEvent!.topics], data: capturedEvent!.data })!.args;

  const blocksUsed = Number(capturedArgs[2]);
  const reward = Number(capturedArgs[3]);
  const rewardTier = reward === 100 ? "GOLD 🥇" : reward === 75 ? "SILVER 🥈" : "BRONZE 🥉";

  await sleep(800);
  console.log("");
  console.log(`${C.bgGreen}${C.bold}${C.white}                                                              ${C.reset}`);
  console.log(`${C.bgGreen}${C.bold}${C.white}   🎉  CARMEN SANDIEGO HAS BEEN CAPTURED!  🎉                ${C.reset}`);
  console.log(`${C.bgGreen}${C.bold}${C.white}                                                              ${C.reset}`);
  console.log("");
  await sleep(1000);

  await log(`${C.green}[CONTRACT]${C.reset} ${C.bold}CarmenCaptured${C.reset} event emitted!`);
  await separator();
  await log(`${C.bold}  Mission ID:      ${C.reset}#${missionId}`);
  await log(`${C.bold}  Agent:           ${C.reset}${player.address.slice(0, 10)}...`);
  await log(`${C.bold}  Carmen was in:   ${C.reset}${targetCity.name} ${targetCity.emoji} (${targetCity.chain})`);
  await log(`${C.bold}  Investigations:  ${C.reset}3 (Paris ❌ → London ❌ → Tokyo ✅)`);
  await log(`${C.bold}  Blocks used:     ${C.reset}${blocksUsed}`);
  await log(`${C.bold}  Reward:          ${C.reset}${reward} points (${rewardTier})`);
  await log(`${C.bold}  Clues received:  ${C.reset}2 (1 text misleading, 1 audio true)`);
  await separator();

  // Final state verification
  const finalMission = await gameMaster.getMission(missionId);
  const finalClues = await gameMaster.getMissionClues(missionId);
  const playerActive = await gameMaster.getPlayerActiveMission(player.address);

  await sleep(600);
  await log(`\n${C.cyan}[STATE]${C.reset} Final on-chain verification:`);
  await log(`  Mission status:    ${finalMission.status === BigInt(2) ? `${C.green}Completed ✓${C.reset}` : `${C.red}???${C.reset}`}`);
  await log(`  Clues on-chain:    ${finalClues.length}`);
  await log(`  Player free:       ${playerActive === BigInt(0) ? `${C.green}Yes ✓${C.reset}` : `${C.red}No${C.reset}`}`);

  // CityNode status
  const tokyoStatus = await cityTokyo.getCarmenStatus(missionId);
  const parisStatus = await cityParis.getCarmenStatus(missionId);
  const londonStatus = await cityLondon.getCarmenStatus(missionId);
  await log(`\n${C.cyan}[CITIES]${C.reset} CityNode status (mission #${missionId}):`);
  await log(`  Tokyo:   ${tokyoStatus ? `${C.red}Carmen HERE${C.reset}` : "Clear"}`);
  await log(`  Paris:   ${parisStatus ? `${C.red}Carmen HERE${C.reset}` : "Clear"}`);
  await log(`  London:  ${londonStatus ? `${C.red}Carmen HERE${C.reset}` : "Clear"}`);

  // Summary
  await banner("SIMULATION COMPLETE");

  console.log(`${C.dim}  This simulation demonstrated the full game loop:`);
  console.log(`  1. Player starts mission → Contract emits event`);
  console.log(`  2. VRF provides random location for Carmen`);
  console.log(`  3. CRE workflow reacts → generates AI briefing`);
  console.log(`  4. Player investigates wrong city → CRE generates misleading clue`);
  console.log(`  5. Player investigates wrong city → CRE generates true audio clue`);
  console.log(`  6. Player follows clue → captures Carmen!`);
  console.log(`  7. Smart contract calculates reward based on blocks used`);
  console.log(`${C.reset}`);
  console.log(`${C.bold}  All interactions are on-chain. CRE is the autonomous Game Master.${C.reset}`);
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
