import { ethers } from "hardhat";

const C = {
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m",
  magenta: "\x1b[35m", cyan: "\x1b[36m", white: "\x1b[37m", bold: "\x1b[1m",
  dim: "\x1b[2m", reset: "\x1b[0m", bgRed: "\x1b[41m", bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m", bgMagenta: "\x1b[45m", bgYellow: "\x1b[43m",
};

const CITIES: Record<number, { name: string; emoji: string; chain: string }> = {
  421614: { name: "Tokyo", emoji: "🗼", chain: "Arbitrum Sepolia" },
  84532:  { name: "Paris", emoji: "🗼", chain: "Base Sepolia" },
  51:     { name: "London", emoji: "🎡", chain: "XDC Apothem" },
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = async (msg: string, d = 400) => { console.log(msg); await sleep(d); };
const sep = async () => { console.log(`${C.dim}${"─".repeat(60)}${C.reset}`); await sleep(200); };
const banner = async (text: string) => {
  console.log("");
  console.log(`${C.bold}${C.bgBlue}${C.white} ${"═".repeat(58)} ${C.reset}`);
  console.log(`${C.bold}${C.bgBlue}${C.white}  ${text.padEnd(57)}${C.reset}`);
  console.log(`${C.bold}${C.bgBlue}${C.white} ${"═".repeat(58)} ${C.reset}`);
  console.log(""); await sleep(600);
};

async function main() {
  const [owner, creOracle, player] = await ethers.getSigners();
  const MOCK_PUBLIC_KEY = "0x04" + "ab".repeat(64);

  // ============================================================
  //  SETUP
  // ============================================================
  await banner("CARMEN SANDIEGO ON-CHAIN - Live Simulation v3 (Commit-Reveal)");

  await log(`${C.cyan}[SETUP]${C.reset} Deploying contracts on local Hardhat network...`);

  const VRFMock = await ethers.getContractFactory("VRFCoordinatorV2PlusMock");
  const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
  await vrfCoordinator.waitForDeployment();
  await log(`${C.green}  ✓${C.reset} VRF Coordinator Mock`);

  const createSubTx = await vrfCoordinator.createSubscription();
  const createSubReceipt = await createSubTx.wait();
  const subCreatedEvent = createSubReceipt?.logs.find((l: any) => {
    try { return vrfCoordinator.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === "SubscriptionCreated"; } catch { return false; }
  });
  const subId = vrfCoordinator.interface.parseLog({ topics: [...subCreatedEvent!.topics], data: subCreatedEvent!.data })!.args[0];
  await vrfCoordinator.fundSubscription(subId, 1000000);
  await log(`${C.green}  ✓${C.reset} VRF Subscription #${subId} funded`);

  const validChainIds = [421614, 84532, 51];
  const VRF_KEY_HASH = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";
  const GameMasterFactory = await ethers.getContractFactory("GameMaster");
  const gameMaster = await GameMasterFactory.deploy(
    await vrfCoordinator.getAddress(), subId, VRF_KEY_HASH, validChainIds, creOracle.address
  );
  await gameMaster.waitForDeployment();
  await vrfCoordinator.addConsumer(subId, await gameMaster.getAddress());
  await log(`${C.green}  ✓${C.reset} GameMaster deployed`);

  const MissionNFTFactory = await ethers.getContractFactory("MissionNFT");
  const missionNFT = await MissionNFTFactory.deploy(await gameMaster.getAddress());
  await missionNFT.waitForDeployment();
  await log(`${C.green}  ✓${C.reset} MissionNFT (ERC-721) deployed`);

  const CityNodeFactory = await ethers.getContractFactory("CityNode");
  await CityNodeFactory.deploy("Tokyo", 421614, creOracle.address);
  await log(`${C.green}  ✓${C.reset} CityNodes: Tokyo | Paris | London`);

  await sep();
  await log(`${C.cyan}[INFO]${C.reset} Player:     ${C.bold}${player.address.slice(0, 14)}...${C.reset}`);
  await log(`${C.cyan}[INFO]${C.reset} CRE Oracle: ${C.bold}${creOracle.address.slice(0, 14)}...${C.reset}`);
  await log(`${C.cyan}[INFO]${C.reset} Cities: Tokyo (Arbitrum) | Paris (Base) | London (XDC)`);

  // ============================================================
  //  PLAYER REGISTRATION
  // ============================================================
  await banner("PHASE 0: Player Registration");

  await log(`${C.yellow}[PLAYER]${C.reset} 🔑 Generating ECIES key pair (secp256k1)...`);
  await sleep(800);
  await log(`${C.yellow}[PLAYER]${C.reset} 💾 Private key stored in browser IndexedDB`);
  await log(`${C.yellow}[PLAYER]${C.reset} 📝 Registering public key on-chain...`);

  await gameMaster.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
  await log(`${C.green}[CONTRACT]${C.reset} ${C.bold}PlayerRegistered${C.reset} event emitted!`);
  await log(`${C.dim}  → Public key: ${MOCK_PUBLIC_KEY.slice(0, 20)}...${C.reset}`);
  await log(`${C.green}  ✓${C.reset} Player can now receive encrypted clues`);

  // ============================================================
  //  MISSION START (with COMMIT)
  // ============================================================
  await banner("PHASE 1: Mission Briefing (Commit)");

  await log(`${C.yellow}[PLAYER]${C.reset} Agent requests a new mission...`);
  await sleep(600);

  const startTx = await gameMaster.connect(player).startMission();
  const startReceipt = await startTx.wait();
  const missionId = 1;
  await log(`${C.green}[CONTRACT]${C.reset} ${C.bold}MissionStarted${C.reset} #${missionId} (block ${startReceipt?.blockNumber})`);

  await log(`\n${C.magenta}[CRE]${C.reset} 🔗 Workflow triggered → requesting VRF...`);
  await sleep(800);

  // VRF fulfillment → COMMIT (hash stored, not chainId)
  const vrfWord = 3; // 3 % 3 = 0 → Tokyo
  const gmAddr = await gameMaster.getAddress();
  await vrfCoordinator.fulfillRandomWordsWithOverride(1, gmAddr, [vrfWord]);

  const mission = await gameMaster.getMission(missionId);
  const targetHash = mission.targetHash;

  // CRE knows the real city (it can recompute from VRF)
  const actualCity = CITIES[421614]; // Tokyo — CRE knows, contract doesn't!

  await log(`${C.green}[VRF]${C.reset} 🎲 Random word: ${vrfWord} → city index: ${vrfWord % 3}`);
  await log(`${C.magenta}[CRE]${C.reset} 🔒 ${C.bold}COMMIT${C.reset}: targetHash = ${targetHash.slice(0, 18)}...`);
  await log(`${C.dim}  → The contract does NOT know which city this is!${C.reset}`);
  await log(`${C.magenta}[CRE]${C.reset} 🕵️ CRE knows: Carmen is in ${C.bold}${C.red}${actualCity.name} ${actualCity.emoji}${C.reset}`);

  await sleep(600);
  await log(`${C.magenta}[CRE]${C.reset} 🤖 Generating AI briefing (Gemini API)...`);
  await log(`${C.magenta}[CRE]${C.reset} 🔐 Encrypting with player's public key (ECIES)...`);

  console.log("");
  console.log(`${C.cyan}${C.bold}  ┌──────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.cyan}${C.bold}  │  ACME DETECTIVE AGENCY - MISSION BRIEFING       │${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ├──────────────────────────────────────────────────┤${C.reset}`);
  console.log(`${C.cyan}  │${C.reset} Carmen's gang stole CryptoPunk #7804 (4,200 ETH) ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}  │${C.reset} from "The Vault" via a coordinated flash loan.   ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}  │${C.reset} She fled across chains. Could be in Tokyo, Paris  ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}  │${C.reset} or London.                                        ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}  │${C.reset}                                                   ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}  │${C.reset} ${C.bold}Collect clues and let CRE validate your arrest.${C.reset} ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}  │${C.reset} ${C.dim}Contract only stores hashes — total privacy!${C.reset}    ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}${C.bold}  └──────────────────────────────────────────────────┘${C.reset}`);
  console.log("");
  await sleep(800);

  // ============================================================
  //  INVESTIGATION LOOP
  // ============================================================
  await banner("PHASE 2: Investigation Loop");

  // --- INV 1: Paris (wrong) → clue delivered (contract doesn't know true/false) ---
  await log(`${C.yellow}[PLAYER]${C.reset} 🔍 Investigating Paris...`);
  await gameMaster.connect(player).submitInvestigation(84532);
  await log(`${C.magenta}[CRE]${C.reset} 📡 Event received → Paris ≠ Tokyo → generating FALSE clue`);
  await log(`${C.dim}  → Contract only sees: InvestigationSubmitted(chainId=84532)${C.reset}`);
  await sleep(500);

  const clue1Hash = ethers.keccak256(ethers.toUtf8Bytes("false-clue-paris"));
  await gameMaster.connect(creOracle).receiveClue(missionId, 0, clue1Hash, "");

  console.log(`${C.yellow}  ┌─────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.yellow}  │  CLUE #1 (Text) ${C.dim}[CRE knows: MISLEADING]${C.reset}${C.yellow}        │${C.reset}`);
  console.log(`${C.yellow}  │${C.reset} "A vendor reported seeing her heading south     ${C.yellow}│${C.reset}`);
  console.log(`${C.yellow}  │${C.reset}  on the Eurostar..."                             ${C.yellow}│${C.reset}`);
  console.log(`${C.yellow}  └─────────────────────────────────────────────────┘${C.reset}`);
  await log(`${C.dim}  Contract state: cluesReceived=1 | isTrue? CONTRACT DOESN'T KNOW${C.reset}`);
  await sleep(600);

  // --- INV 2: London (wrong) → TRUE audio clue ---
  await log(`\n${C.yellow}[PLAYER]${C.reset} 🔍 "Heading south... London?"`);
  await gameMaster.connect(player).submitInvestigation(51);
  await log(`${C.magenta}[CRE]${C.reset} 📡 London ≠ Tokyo → generating TRUE audio clue`);

  await log(`${C.magenta}[CRE]${C.reset} 🎤 ElevenLabs TTS → 🔐 ECIES encrypt → 📤 IPFS upload`);
  const clue2Hash = ethers.keccak256(ethers.toUtf8Bytes("true-clue-audio-tokyo"));
  await gameMaster.connect(creOracle).receiveClue(missionId, 1, clue2Hash, "QmEncryptedAudioClue");

  console.log(`${C.green}  ┌─────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.green}  │  CLUE #2 (Audio) ${C.bold}[CRE knows: TRUE]${C.reset}${C.green}              │${C.reset}`);
  console.log(`${C.green}  │${C.reset} 🔊 Decrypted: "Cherry blossoms and neon lights. ${C.green}│${C.reset}`);
  console.log(`${C.green}  │${C.reset}  Someone near a bullet train..."                 ${C.green}│${C.reset}`);
  console.log(`${C.green}  └─────────────────────────────────────────────────┘${C.reset}`);
  await log(`${C.dim}  Contract state: cluesReceived=2 | isTrue? CONTRACT DOESN'T KNOW${C.reset}`);
  await sleep(600);

  // --- INV 3: Tokyo (correct but CRE hasn't resolved yet) ---
  await log(`\n${C.yellow}[PLAYER]${C.reset} 💡 "Cherry blossoms... TOKYO!"`);
  await gameMaster.connect(player).submitInvestigation(421614);

  await log(`${C.bgYellow}${C.bold}  ⚠ submitInvestigation does NOT capture anymore! ${C.reset}`);
  await log(`${C.dim}  → Contract just emits event. CRE decides off-chain.${C.reset}`);
  await log(`${C.dim}  → Need 3+ clues before CRE can call resolveCapture()${C.reset}`);
  await sleep(600);

  await log(`\n${C.magenta}[CRE]${C.reset} 🤖 Generating TRUE image clue...`);
  await log(`${C.magenta}[CRE]${C.reset} 🖼️ DALL-E → 🔐 ECIES encrypt → 📤 IPFS upload`);
  const clue3Hash = ethers.keccak256(ethers.toUtf8Bytes("true-clue-image-tokyo"));
  await gameMaster.connect(creOracle).receiveClue(missionId, 2, clue3Hash, "QmEncryptedImageClue");

  console.log(`${C.green}  ┌─────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.green}  │  CLUE #3 (Image) ${C.bold}[CRE knows: TRUE]${C.reset}${C.green}              │${C.reset}`);
  console.log(`${C.green}  │${C.reset} 🖼️ Security cam: Shibuya Crossing, woman in red ${C.green}│${C.reset}`);
  console.log(`${C.green}  │${C.reset}  near NFT kiosk. Coords: 35.66°N 139.70°E       ${C.green}│${C.reset}`);
  console.log(`${C.green}  └─────────────────────────────────────────────────┘${C.reset}`);
  await log(`${C.bold}${C.green}  cluesReceived: 3 | CRE can now REVEAL! ✓${C.reset}`);
  await sleep(800);

  // ============================================================
  //  CAPTURE (REVEAL)
  // ============================================================
  await banner("PHASE 3: The Arrest (Reveal)");

  await log(`${C.yellow}[PLAYER]${C.reset} 🎯 "Evidence collected. Arrest warrant for Tokyo!"${C.reset}`);
  await log(`${C.magenta}[CRE]${C.reset} 📡 Player investigated Tokyo + has 3 clues + 2 true`);
  await log(`${C.magenta}[CRE]${C.reset} ✅ All conditions met → calling ${C.bold}resolveCapture()${C.reset}`);
  await sleep(600);

  // Compute salt the same way the contract did
  const salt = ethers.keccak256(
    ethers.solidityPacked(["uint256", "uint256"], [vrfWord, missionId])
  );

  await log(`\n${C.magenta}[CRE]${C.reset} 🔓 ${C.bold}REVEAL${C.reset}: chainId=${C.bold}421614${C.reset} (Tokyo), salt=${salt.slice(0, 18)}...`);
  await log(`${C.dim}  → Contract verifies: keccak256(421614, salt) == targetHash?${C.reset}`);

  const captureTx = await gameMaster.connect(creOracle).resolveCapture(missionId, 421614, salt);
  const captureReceipt = await captureTx.wait();

  const capturedEvent = captureReceipt?.logs.find((l: any) => {
    try { return gameMaster.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === "CarmenCaptured"; } catch { return false; }
  });
  const capturedArgs = gameMaster.interface.parseLog({ topics: [...capturedEvent!.topics], data: capturedEvent!.data })!.args;

  const blocksUsed = Number(capturedArgs[2]);
  const reward = Number(capturedArgs[3]);
  const tier = reward === 100 ? "GOLD 🥇" : reward === 75 ? "SILVER 🥈" : "BRONZE 🥉";

  await log(`${C.green}[CONTRACT]${C.reset} ✅ Hash match! ${C.bold}REVEAL VALID${C.reset}`);

  console.log("");
  console.log(`${C.bgGreen}${C.bold}${C.white}                                                              ${C.reset}`);
  console.log(`${C.bgGreen}${C.bold}${C.white}   🎉  CARMEN SANDIEGO HAS BEEN CAPTURED!  🎉                ${C.reset}`);
  console.log(`${C.bgGreen}${C.bold}${C.white}                                                              ${C.reset}`);
  console.log("");
  await sleep(800);

  await sep();
  await log(`${C.bold}  Mission ID:       ${C.reset}#${missionId}`);
  await log(`${C.bold}  Carmen was in:    ${C.reset}${actualCity.name} ${actualCity.emoji} (${actualCity.chain})`);
  await log(`${C.bold}  Investigations:   ${C.reset}3 (Paris ❌ → London ❌ → Tokyo ✅)`);
  await log(`${C.bold}  Blocks used:      ${C.reset}${blocksUsed}`);
  await log(`${C.bold}  Reward:           ${C.reset}${reward} points (${tier})`);
  await log(`${C.bold}  Clues collected:  ${C.reset}3 (contract doesn't know which are true!)`);
  await log(`${C.bold}  Privacy:          ${C.reset}Commit-Reveal (targetHash, no plaintext)`);
  await log(`${C.bold}  Encrypted:        ${C.reset}ECIES secp256k1 → IPFS`);
  await sep();

  const finalMission = await gameMaster.getMission(missionId);
  const finalClues = await gameMaster.getMissionClues(missionId);

  await log(`\n${C.cyan}[STATE]${C.reset} On-chain verification:`);
  await log(`  Status:         ${finalMission.status === BigInt(2) ? `${C.green}Completed ✓${C.reset}` : "???"}`);
  await log(`  targetHash:     ${C.dim}${targetHash.slice(0, 22)}... (hash, NOT chainId)${C.reset}`);
  await log(`  Clues on-chain: ${finalClues.length} (no isTrue field!)`);
  await log(`  Player free:    ${(await gameMaster.getPlayerActiveMission(player.address)) === BigInt(0) ? `${C.green}Yes ✓${C.reset}` : "No"}`);

  await banner("SIMULATION COMPLETE");

  console.log(`${C.dim}  Commit-Reveal game flow:`);
  console.log(`  1. Player registers ECIES public key on-chain`);
  console.log(`  2. Starts mission → VRF picks Carmen's city`);
  console.log(`  3. VRF COMMITS: targetHash = keccak256(chainId, salt)`);
  console.log(`  4. Contract stores HASH → nobody knows where Carmen is!`);
  console.log(`  5. Player investigates → CRE generates encrypted clues`);
  console.log(`  6. Clues delivered WITHOUT isTrue → contract is blind`);
  console.log(`  7. CRE REVEALS: resolveCapture(chainId, salt)`);
  console.log(`  8. Contract verifies hash → capture confirmed!`);
  console.log(`  9. NFT trophy minted for the player`);
  console.log(`${C.reset}`);
  console.log(`${C.bold}  CRE = Trusted Arbiter | VRF = Commit | ECIES = Privacy${C.reset}`);
  console.log(`${C.bold}  Contract knows NOTHING about Carmen's location until REVEAL${C.reset}`);
  console.log("");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
