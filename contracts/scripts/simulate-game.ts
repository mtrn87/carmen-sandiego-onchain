import { ethers } from "hardhat";

// ── ANSI Colors ──────────────────────────────────────────────────────
const C = {
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m",
  magenta: "\x1b[35m", cyan: "\x1b[36m", white: "\x1b[37m", bold: "\x1b[1m",
  dim: "\x1b[2m", reset: "\x1b[0m", bgRed: "\x1b[41m", bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m", bgMagenta: "\x1b[45m", bgYellow: "\x1b[43m",
};

const CITIES: Record<number, { name: string; emoji: string; chain: string }> = {
  421614: { name: "Tokyo", emoji: "\u{1F5FC}", chain: "Arbitrum Sepolia" },
  84532:  { name: "Paris", emoji: "\u{1F5FC}", chain: "Base Sepolia" },
  51:     { name: "London", emoji: "\u{1F3A1}", chain: "XDC Apothem" },
};

// ── Helpers ──────────────────────────────────────────────────────────
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

function findEvent(receipt: any, contract: any, eventName: string) {
  return receipt.logs.find((l: any) => {
    try {
      return contract.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === eventName;
    } catch { return false; }
  });
}

function parseEvent(contract: any, logEntry: any) {
  return contract.interface.parseLog({ topics: [...logEntry.topics], data: logEntry.data });
}

async function sendReportViaProxy(proxy: any, oracle: any, action: number, data: string) {
  const report = ethers.AbiCoder.defaultAbiCoder().encode(["uint8", "bytes"], [action, data]);
  const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes10", "address"],
    [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
  );
  const tx = await proxy.connect(oracle).onReport(metadata, report);
  return (await tx.wait())!;
}

// ── Main Simulation ──────────────────────────────────────────────────
async function main() {
  const [owner, creOracle, player] = await ethers.getSigners();
  const MOCK_PUBLIC_KEY = "0x04" + "ab".repeat(64);

  // ================================================================
  //  PHASE 0: SETUP & DEPLOYMENT
  // ================================================================
  await banner("CARMEN SANDIEGO ON-CHAIN - Simulation v5 (Full NFT Flow)");

  await log(`${C.cyan}[SETUP]${C.reset} Deploying contracts on local Hardhat network...`);

  // VRF Coordinator Mock
  const VRFMock = await ethers.getContractFactory("VRFCoordinatorV2PlusMock");
  const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
  await vrfCoordinator.waitForDeployment();
  const createSubTx = await vrfCoordinator.createSubscription();
  const createSubReceipt = await createSubTx.wait();
  const subCreatedEvent = createSubReceipt?.logs.find((l: any) => {
    try { return vrfCoordinator.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === "SubscriptionCreated"; } catch { return false; }
  });
  const subId = vrfCoordinator.interface.parseLog({ topics: [...subCreatedEvent!.topics], data: subCreatedEvent!.data })!.args[0];
  await vrfCoordinator.fundSubscription(subId, 1000000);
  await log(`${C.green}  \u2713${C.reset} VRF Coordinator Mock + Subscription #${subId}`);

  // GameMaster
  const validChainIds = [421614, 84532, 51];
  const VRF_KEY_HASH = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";
  const GameMasterFactory = await ethers.getContractFactory("GameMaster");
  const gameMaster = await GameMasterFactory.deploy(
    await vrfCoordinator.getAddress(), subId, VRF_KEY_HASH, validChainIds, creOracle.address
  );
  await gameMaster.waitForDeployment();
  await vrfCoordinator.addConsumer(subId, await gameMaster.getAddress());
  await log(`${C.green}  \u2713${C.reset} GameMaster deployed`);

  // GameMasterProxy
  const ProxyFactory = await ethers.getContractFactory("GameMasterProxy");
  const proxy = await ProxyFactory.deploy(creOracle.address, await gameMaster.getAddress());
  await proxy.waitForDeployment();
  await log(`${C.green}  \u2713${C.reset} GameMasterProxy deployed (CRE \u2192 Proxy \u2192 GameMaster)`);

  // MissionNFT
  const MissionNFTFactory = await ethers.getContractFactory("MissionNFT");
  const missionNFT = await MissionNFTFactory.deploy(await gameMaster.getAddress());
  await missionNFT.waitForDeployment();
  await log(`${C.green}  \u2713${C.reset} MissionNFT (ERC-721) deployed`);

  // ** CRITICAL: Link MissionNFT to GameMaster **
  await gameMaster.connect(owner).setMissionNFT(await missionNFT.getAddress());
  await log(`${C.green}  \u2713${C.reset} ${C.bold}gameMaster.setMissionNFT()${C.reset} \u2190 without this, NFTs won't mint!`);

  // CityNodes (3 cities)
  const CityNodeFactory = await ethers.getContractFactory("CityNode");
  await CityNodeFactory.deploy("Tokyo", "JP", 421614, 1, creOracle.address);
  await CityNodeFactory.deploy("Paris", "FR", 84532, 2, creOracle.address);
  await CityNodeFactory.deploy("London", "GB", 51, 3, creOracle.address);
  await log(`${C.green}  \u2713${C.reset} CityNodes: Tokyo (JP) | Paris (FR) | London (GB)`);

  // Set Proxy as CRE Oracle
  await gameMaster.setCREOracle(await proxy.getAddress());
  await log(`${C.green}  \u2713${C.reset} GameMaster.setCREOracle \u2192 Proxy address`);

  await sep();
  await log(`${C.cyan}[INFO]${C.reset} Player:     ${C.bold}${player.address.slice(0, 14)}...${C.reset}`);
  await log(`${C.cyan}[INFO]${C.reset} CRE Oracle: ${C.bold}${creOracle.address.slice(0, 14)}...${C.reset}`);
  await log(`${C.cyan}[INFO]${C.reset} Cities: Tokyo (Arbitrum) | Paris (Base) | London (XDC)`);
  await log(`${C.cyan}[INFO]${C.reset} Evidence threshold: strength > ${C.bold}65${C.reset} counts as evidence`);

  // ================================================================
  //  PHASE 1: PLAYER REGISTRATION
  // ================================================================
  await banner("PHASE 1: Player Registration");

  await log(`${C.yellow}[PLAYER]${C.reset} Generating ECIES key pair (secp256k1)...`);
  await sleep(600);
  await log(`${C.yellow}[PLAYER]${C.reset} Private key stored in browser IndexedDB`);
  await log(`${C.yellow}[PLAYER]${C.reset} Registering public key on-chain...`);

  await gameMaster.connect(player).registerPlayer(MOCK_PUBLIC_KEY);

  const storedKey = await gameMaster.getPlayerPublicKey(player.address);
  await log(`${C.green}[CONTRACT]${C.reset} ${C.bold}PlayerRegistered${C.reset} event emitted!`);
  await log(`${C.dim}  \u2192 Public key: ${MOCK_PUBLIC_KEY.slice(0, 20)}...${C.reset}`);
  await log(`${C.dim}  \u2192 Verified on-chain: ${storedKey.slice(0, 20)}... \u2713${C.reset}`);
  await log(`${C.green}  \u2713${C.reset} Player can now receive ECIES-encrypted clues`);

  // ================================================================
  //  PHASE 2: MISSION BRIEFING (COMMIT)
  // ================================================================
  await banner("PHASE 2: Mission Briefing (Commit)");

  await log(`${C.yellow}[PLAYER]${C.reset} Agent requests a new mission...`);
  await sleep(500);

  const startTx = await gameMaster.connect(player).startMission();
  const startReceipt = await startTx.wait();
  const missionId = 1;
  await log(`${C.green}[CONTRACT]${C.reset} ${C.bold}MissionStarted${C.reset} #${missionId} (block ${startReceipt?.blockNumber})`);

  await log(`\n${C.magenta}[CRE]${C.reset} Workflow triggered \u2192 requesting VRF randomness...`);
  await sleep(600);

  // VRF fulfillment: vrfWord=3 → 3 % 3 = 0 → validChainIds[0] = 421614 = Tokyo
  const vrfWord = 3;
  const gmAddr = await gameMaster.getAddress();
  await vrfCoordinator.fulfillRandomWordsWithOverride(1, gmAddr, [vrfWord]);

  const mission = await gameMaster.getMission(missionId);
  const targetHash = mission.targetHash;
  const actualCity = CITIES[421614];

  await log(`${C.green}[VRF]${C.reset} Random word: ${vrfWord} \u2192 city index: ${vrfWord % 3}`);
  await log(`${C.magenta}[CRE]${C.reset} ${C.bold}COMMIT${C.reset}: targetHash = ${targetHash.slice(0, 18)}...`);
  await log(`${C.dim}  \u2192 The contract does NOT know which city this is!${C.reset}`);
  await log(`${C.magenta}[CRE]${C.reset} CRE knows: Carmen is in ${C.bold}${C.red}${actualCity.name} ${actualCity.emoji}${C.reset}`);

  await sleep(500);
  console.log("");
  console.log(`${C.cyan}${C.bold}  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510${C.reset}`);
  console.log(`${C.cyan}${C.bold}  \u2502  ACME DETECTIVE AGENCY - MISSION BRIEFING       \u2502${C.reset}`);
  console.log(`${C.cyan}${C.bold}  \u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524${C.reset}`);
  console.log(`${C.cyan}  \u2502${C.reset} Scenario: "The Heist of the Lost CryptoPunk"     ${C.cyan}\u2502${C.reset}`);
  console.log(`${C.cyan}  \u2502${C.reset} CryptoPunk #7804 (4,200 ETH) stolen via flash    ${C.cyan}\u2502${C.reset}`);
  console.log(`${C.cyan}  \u2502${C.reset} loan. Carmen is hopping across chains.            ${C.cyan}\u2502${C.reset}`);
  console.log(`${C.cyan}  \u2502${C.reset} Possible locations: Tokyo, Paris, London          ${C.cyan}\u2502${C.reset}`);
  console.log(`${C.cyan}  \u2502${C.reset}                                                   ${C.cyan}\u2502${C.reset}`);
  console.log(`${C.cyan}  \u2502${C.reset} ${C.bold}Contract stores keccak256(chainId, salt)${C.reset}        ${C.cyan}\u2502${C.reset}`);
  console.log(`${C.cyan}  \u2502${C.reset} ${C.dim}Nobody knows Carmen's location until REVEAL${C.reset}      ${C.cyan}\u2502${C.reset}`);
  console.log(`${C.cyan}${C.bold}  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518${C.reset}`);
  console.log("");
  await sleep(600);

  // ================================================================
  //  PHASE 3: INVESTIGATION LOOP (with Evidence System)
  // ================================================================
  await banner("PHASE 3: Investigation Loop (Evidence System)");

  const clueLabels = ["Text", "Audio", "Image"];

  // Helper: send a clue via proxy and display results
  async function deliverClue(
    invCity: number, clueType: number, strength: number,
    content: string, ipfs: string, narrative: string[]
  ) {
    const cityInfo = CITIES[invCity];
    const clueNum = clueType + 1;
    const isCorrectCity = invCity === 421614;
    const isEvidence = strength > 65;

    await log(`\n${C.yellow}[PLAYER]${C.reset} Investigating ${cityInfo.name} ${cityInfo.emoji}...`);
    await gameMaster.connect(player).submitInvestigation(invCity);
    await log(`${C.dim}  \u2192 InvestigationSubmitted(chainId=${invCity})${C.reset}`);

    const matchStr = isCorrectCity
      ? `${cityInfo.name} = Carmen's city!`
      : `${cityInfo.name} \u2260 Tokyo`;
    await log(`${C.magenta}[CRE]${C.reset} ${matchStr} \u2192 generating ${clueLabels[clueType]} clue (strength=${strength})`);

    const contentHash = ethers.keccak256(ethers.toUtf8Bytes(content));
    const data = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint8", "bytes32", "string", "uint8"],
      [missionId, clueType, contentHash, ipfs, strength]
    );
    const receipt = await sendReportViaProxy(proxy, creOracle, 1, data);

    // Check for EvidenceCollected event
    const evidenceLog = findEvent(receipt, gameMaster, "EvidenceCollected");
    const evidenceCount = Number(await gameMaster.missionEvidenceCount(missionId));

    const color = isEvidence ? C.green : C.yellow;
    const evidenceTag = isEvidence
      ? `${C.bold}[EVIDENCE \u2713 strength > 65]${C.reset}`
      : `${C.dim}[not evidence - strength \u2264 65]${C.reset}`;

    console.log(`${color}  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510${C.reset}`);
    console.log(`${color}  \u2502${C.reset}  CLUE #${clueNum} (${clueLabels[clueType]}) | Strength: ${C.bold}${strength}/100${C.reset}  ${evidenceTag}  ${color}\u2502${C.reset}`);
    for (const line of narrative) {
      console.log(`${color}  \u2502${C.reset} ${line.padEnd(48)}${color}\u2502${C.reset}`);
    }
    console.log(`${color}  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518${C.reset}`);

    if (evidenceLog) {
      const args = parseEvent(gameMaster, evidenceLog)!.args;
      await log(`${C.green}  [EVENT]${C.reset} EvidenceCollected(count=${args[1]}, strength=${args[2]})`);
    }
    await log(`${C.dim}  On-chain: clues=${clueNum}, evidence=${evidenceCount}, investigations=${clueNum}${C.reset}`);
    await sleep(400);
  }

  // INV 1: Paris (wrong) → Text, strength=40 (NOT evidence)
  await deliverClue(84532, 0, 40, "false-clue-paris", "", [
    '"A vendor reported seeing her heading south',
    ' on the Eurostar..."',
  ]);

  // INV 2: London (wrong) → Audio, strength=80 (IS evidence)
  await deliverClue(51, 1, 80, "true-clue-audio-tokyo", "QmEncryptedAudioClue", [
    '"Cherry blossoms and neon lights.',
    ' Someone near a bullet train..."',
  ]);

  // INV 3: Tokyo (correct) → Image, strength=90 (IS evidence)
  await deliverClue(421614, 2, 90, "true-clue-image-tokyo", "QmEncryptedImageClue", [
    'Security cam: Shibuya Crossing, woman in red',
    'near NFT kiosk. Coords: 35.66N 139.70E',
  ]);

  // Evidence summary
  const totalClues = (await gameMaster.getMissionClues(missionId)).length;
  const totalEvidence = Number(await gameMaster.missionEvidenceCount(missionId));
  console.log("");
  console.log(`${C.cyan}${C.bold}  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510${C.reset}`);
  console.log(`${C.cyan}${C.bold}  \u2502  EVIDENCE TRACKER                              \u2502${C.reset}`);
  console.log(`${C.cyan}${C.bold}  \u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524${C.reset}`);
  console.log(`${C.cyan}  \u2502${C.reset}  Clue #1 (Text)   Strength 40   [ ]             ${C.cyan}\u2502${C.reset}`);
  console.log(`${C.cyan}  \u2502${C.reset}  Clue #2 (Audio)  Strength 80   ${C.green}[X] Evidence${C.reset}    ${C.cyan}\u2502${C.reset}`);
  console.log(`${C.cyan}  \u2502${C.reset}  Clue #3 (Image)  Strength 90   ${C.green}[X] Evidence${C.reset}    ${C.cyan}\u2502${C.reset}`);
  console.log(`${C.cyan}${C.bold}  \u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524${C.reset}`);
  console.log(`${C.cyan}  \u2502${C.reset}  Total evidence: ${C.bold}${totalEvidence}${C.reset} of ${totalClues} clues${" ".repeat(20)}${C.cyan}\u2502${C.reset}`);
  console.log(`${C.cyan}  \u2502${C.reset}  Threshold: > 65 = evidence                    ${C.cyan}\u2502${C.reset}`);
  console.log(`${C.cyan}  \u2502${C.reset}  ${C.bold}${C.green}CRE can now REVEAL (3+ clues collected) \u2713${C.reset}     ${C.cyan}\u2502${C.reset}`);
  console.log(`${C.cyan}${C.bold}  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518${C.reset}`);
  console.log("");
  await sleep(600);

  // ================================================================
  //  PHASE 4: THE ARREST (Reveal + Capture + NFT Mint)
  // ================================================================
  await banner("PHASE 4: The Arrest (Reveal + Capture + NFT Mint)");

  await log(`${C.yellow}[PLAYER]${C.reset} "Evidence collected. Arrest warrant for Tokyo!"`);
  await log(`${C.magenta}[CRE]${C.reset} Player investigated Tokyo + has ${totalClues} clues + ${totalEvidence} evidence`);
  await log(`${C.magenta}[CRE]${C.reset} All conditions met \u2192 calling ${C.bold}resolveCapture()${C.reset}`);
  await sleep(500);

  // Compute salt the same way the contract did
  const salt = ethers.keccak256(
    ethers.solidityPacked(["uint256", "uint256"], [vrfWord, missionId])
  );

  await log(`\n${C.magenta}[CRE]${C.reset} ${C.bold}REVEAL${C.reset}: chainId=${C.bold}421614${C.reset} (Tokyo), salt=${salt.slice(0, 18)}...`);
  await log(`${C.dim}  \u2192 Contract verifies: keccak256(421614, salt) == targetHash?${C.reset}`);

  // Send ACTION_RESOLVE_CAPTURE (2) via proxy
  const captureData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "bytes32"], [missionId, 421614, salt]
  );
  const captureReceipt = await sendReportViaProxy(proxy, creOracle, 2, captureData);

  // Parse events from capture
  const capturedLog = findEvent(captureReceipt, gameMaster, "CarmenCaptured")!;
  const capturedArgs = parseEvent(gameMaster, capturedLog)!.args;
  const blocksUsed = Number(capturedArgs[2]);
  const reward = Number(capturedArgs[3]);
  const tier = reward === 100 ? "GOLD" : reward === 75 ? "SILVER" : "BRONZE";
  const tierEmoji = reward === 100 ? "\u{1F947}" : reward === 75 ? "\u{1F948}" : "\u{1F949}";

  const nftMintedLog = findEvent(captureReceipt, missionNFT, "MissionNFTMinted")!;
  const nftArgs = parseEvent(missionNFT, nftMintedLog)!.args;
  const tokenId = Number(nftArgs[0]);

  await log(`${C.green}[CONTRACT]${C.reset} Hash match! ${C.bold}REVEAL VALID${C.reset} \u2713`);

  console.log("");
  console.log(`${C.bgGreen}${C.bold}${C.white}                                                              ${C.reset}`);
  console.log(`${C.bgGreen}${C.bold}${C.white}   CARMEN SANDIEGO HAS BEEN CAPTURED!                         ${C.reset}`);
  console.log(`${C.bgGreen}${C.bold}${C.white}                                                              ${C.reset}`);
  console.log("");
  await sleep(600);

  // Parse events
  await log(`${C.green}  [EVENT]${C.reset} CarmenCaptured(mission=${missionId}, blocks=${blocksUsed}, reward=${reward})`);
  await log(`${C.green}  [EVENT]${C.reset} MissionNFTMinted(tokenId=${tokenId}, mission=${missionId}, player=${player.address.slice(0, 14)}...)`);
  await log(`${C.green}  [EVENT]${C.reset} ActionForwarded(action=2, missionId=${missionId})`);

  // On-chain verification
  const finalMission = await gameMaster.getMission(missionId);
  const nftOwner = await missionNFT.ownerOf(tokenId);
  const mappedTokenId = Number(await missionNFT.missionToTokenId(missionId));
  const missionRecord = await missionNFT.getMissionRecord(tokenId);
  const currentURI = await missionNFT.tokenURI(tokenId);
  const playerFree = (await gameMaster.getPlayerActiveMission(player.address)) === BigInt(0);

  await sep();
  await log(`${C.cyan}[VERIFY]${C.reset} On-chain state after capture:`);
  await log(`  Mission status:     ${finalMission.status === BigInt(2) ? `${C.green}Completed \u2713${C.reset}` : "???"}`);
  await log(`  Reward:             ${C.bold}${reward} points (${tier} ${tierEmoji})${C.reset}`);
  await log(`  NFT tokenId:        ${C.bold}${tokenId}${C.reset}`);
  await log(`  NFT owner:          ${nftOwner === player.address ? `${C.green}${player.address.slice(0, 14)}... (player) \u2713${C.reset}` : `${C.red}WRONG${C.reset}`}`);
  await log(`  missionToTokenId:   mission #${missionId} \u2192 token #${mappedTokenId}`);
  await log(`  Mission record:     city=${Number(missionRecord.capturedChainId)}, clues=${missionRecord.cluesCollected}, reward=${Number(missionRecord.reward)}`);
  await log(`  Token URI:          ${currentURI === "" ? `${C.yellow}(empty - awaiting generate-finale)${C.reset}` : currentURI.slice(0, 40)}`);
  await log(`  Player free:        ${playerFree ? `${C.green}Yes \u2713${C.reset}` : "No"}`);
  await sleep(500);

  // ================================================================
  //  PHASE 5: NFT TROPHY GENERATION (generate-finale CRE Workflow)
  // ================================================================
  await banner("PHASE 5: NFT Trophy (generate-finale CRE Workflow)");

  await log(`${C.magenta}[CRE]${C.reset} CarmenCaptured event received \u2192 generate-finale triggered`);
  await log(`${C.magenta}[CRE]${C.reset} Building SVG trophy + ERC-721 metadata...`);
  await sleep(600);

  // Step 1: Generate SVG trophy (simplified version of generateTrophySVG)
  const tierColor = "#FFD700";
  const tierAccent = "#B8860B";
  const svgImage = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a1a"/>
      <stop offset="100%" style="stop-color:#1a0a2e"/>
    </linearGradient>
    <linearGradient id="trophy" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${tierColor}"/>
      <stop offset="100%" style="stop-color:${tierAccent}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="500" fill="url(#bg)" rx="20"/>
  <text x="200" y="50" fill="${tierColor}" font-size="18" font-weight="bold" text-anchor="middle" font-family="monospace">MISSION COMPLETE</text>
  <text x="200" y="80" fill="${tierColor}" font-size="24" font-weight="bold" text-anchor="middle" font-family="monospace">${tier} RANK</text>
  <circle cx="200" cy="160" r="60" fill="none" stroke="url(#trophy)" stroke-width="4"/>
  <text x="200" y="175" fill="${tierColor}" font-size="40" text-anchor="middle">${tierEmoji}</text>
  <text x="200" y="260" fill="#e0e0e0" font-size="14" text-anchor="middle" font-family="monospace">Mission #${missionId}</text>
  <text x="200" y="285" fill="#b0b0b0" font-size="12" text-anchor="middle" font-family="monospace">The Heist of the Lost CryptoPunk</text>
  <text x="200" y="320" fill="#e0e0e0" font-size="13" text-anchor="middle" font-family="monospace">Captured in: ${actualCity.name} (${actualCity.chain})</text>
  <text x="200" y="345" fill="#b0b0b0" font-size="12" text-anchor="middle" font-family="monospace">Blocks: ${blocksUsed} | Clues: ${totalClues} | Evidence: ${totalEvidence}</text>
  <text x="200" y="370" fill="#b0b0b0" font-size="12" text-anchor="middle" font-family="monospace">Reward: ${reward} points</text>
  <line x1="60" y1="410" x2="340" y2="410" stroke="#333" stroke-width="1"/>
  <text x="200" y="440" fill="#666" font-size="10" text-anchor="middle" font-family="monospace">CARMEN SANDIEGO ON-CHAIN</text>
  <text x="200" y="460" fill="#444" font-size="9" text-anchor="middle" font-family="monospace">Chainlink CRE + VRF v2.5</text>
</svg>`;

  await log(`${C.green}  \u2713${C.reset} SVG trophy generated (${svgImage.length} bytes)`);

  // Step 2: Build ERC-721 metadata JSON
  const svgBase64 = Buffer.from(svgImage).toString("base64");
  const svgDataUri = `data:image/svg+xml;base64,${svgBase64}`;

  const narrative = [
    `MISSION #${missionId} - ${tier} RANK`,
    `OPERATION: The Heist of the Lost CryptoPunk`,
    `LOCATION: ${actualCity.name} (${actualCity.chain})`,
    `BLOCKS: ${blocksUsed} | CLUES: ${totalClues} | EVIDENCE: ${totalEvidence}`,
    ``,
    `Carmen Sandiego has been captured!`,
    `Your investigation earned the highest distinction.`,
    `Carmen's last words: "Impressive, detective."`,
  ].join("\n");

  const metadata = {
    name: `Carmen Sandiego Mission #${missionId} - ${tier}`,
    description: narrative,
    image: svgDataUri,
    external_url: "https://github.com/mtrn87/carmen-sandiego-onchain",
    attributes: [
      { trait_type: "Scenario", value: "The Heist of the Lost CryptoPunk" },
      { trait_type: "Reward Tier", value: tier },
      { trait_type: "Capture City", value: actualCity.name },
      { trait_type: "Capture Chain", value: actualCity.chain },
      { display_type: "number", trait_type: "Blocks Used", value: blocksUsed },
      { display_type: "number", trait_type: "Clues Collected", value: totalClues },
      { display_type: "number", trait_type: "Evidence Gathered", value: totalEvidence },
      { display_type: "number", trait_type: "Reward Points", value: reward },
    ],
  };

  const metadataJson = JSON.stringify(metadata);
  const metadataBase64 = Buffer.from(metadataJson).toString("base64");
  const tokenURIDataUri = `data:application/json;base64,${metadataBase64}`;

  await log(`${C.green}  \u2713${C.reset} ERC-721 metadata built (${metadataJson.length} bytes JSON)`);
  await log(`${C.green}  \u2713${C.reset} Token URI: data:application/json;base64,... (${tokenURIDataUri.length} chars)`);

  // Step 3: Display metadata preview
  console.log("");
  console.log(`${C.magenta}${C.bold}  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510${C.reset}`);
  console.log(`${C.magenta}${C.bold}  \u2502  NFT METADATA (ERC-721)                        \u2502${C.reset}`);
  console.log(`${C.magenta}${C.bold}  \u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524${C.reset}`);
  console.log(`${C.magenta}  \u2502${C.reset} name: ${C.bold}${metadata.name}${C.reset}`);
  console.log(`${C.magenta}  \u2502${C.reset} image: data:image/svg+xml;base64,... (${svgBase64.length} chars)`);
  for (const attr of metadata.attributes) {
    const val = "display_type" in attr ? `${attr.value}` : attr.value;
    console.log(`${C.magenta}  \u2502${C.reset}   ${attr.trait_type}: ${C.bold}${val}${C.reset}`);
  }
  console.log(`${C.magenta}${C.bold}  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518${C.reset}`);
  console.log("");
  await sleep(500);

  // Step 4: Send ACTION_SET_TOKEN_URI (6) via proxy
  await log(`${C.magenta}[CRE]${C.reset} Sending ACTION_SET_TOKEN_URI (6) via Proxy...`);

  const uriData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "string"], [missionId, tokenURIDataUri]
  );
  const uriReceipt = await sendReportViaProxy(proxy, creOracle, 6, uriData);

  // Parse events
  const tokenURISetLog = findEvent(uriReceipt, gameMaster, "TokenURISet")!;
  const uriArgs = parseEvent(gameMaster, tokenURISetLog)!.args;
  await log(`${C.green}  [EVENT]${C.reset} TokenURISet(missionId=${Number(uriArgs[0])}, tokenId=${Number(uriArgs[1])})`);
  await log(`${C.green}  [EVENT]${C.reset} ActionForwarded(action=6, missionId=${missionId})`);

  // Step 5: Verify token URI on-chain
  const finalTokenURI = await missionNFT.tokenURI(tokenId);
  const uriMatch = finalTokenURI === tokenURIDataUri;

  await log(`\n${C.cyan}[VERIFY]${C.reset} Token URI on-chain verification:`);
  await log(`  URI set:            ${uriMatch ? `${C.green}Yes \u2713${C.reset}` : `${C.red}MISMATCH${C.reset}`}`);
  await log(`  URI prefix:         data:application/json;base64,...`);
  await log(`  URI length:         ${finalTokenURI.length} chars`);

  // Decode and verify round-trip
  const decodedJson = Buffer.from(finalTokenURI.replace("data:application/json;base64,", ""), "base64").toString();
  const decodedMeta = JSON.parse(decodedJson);
  await log(`  Decoded name:       ${C.bold}${decodedMeta.name}${C.reset}`);
  await log(`  Decoded attributes: ${decodedMeta.attributes.length} traits`);
  await log(`  Image embedded:     ${decodedMeta.image.startsWith("data:image/svg+xml") ? `${C.green}SVG data URI \u2713${C.reset}` : "???"}`);

  // ================================================================
  //  PHASE 6: FINAL SUMMARY
  // ================================================================
  await banner("SIMULATION COMPLETE");

  await sep();
  await log(`${C.bold}  Mission ID:          ${C.reset}#${missionId}`);
  await log(`${C.bold}  Carmen was in:       ${C.reset}${actualCity.name} ${actualCity.emoji} (${actualCity.chain})`);
  await log(`${C.bold}  Investigations:      ${C.reset}3 (Paris \u2717 \u2192 London \u2717 \u2192 Tokyo \u2713)`);
  await log(`${C.bold}  Blocks used:         ${C.reset}${blocksUsed}`);
  await log(`${C.bold}  Reward:              ${C.reset}${reward} points (${tier} ${tierEmoji})`);
  await log(`${C.bold}  Clues collected:     ${C.reset}${totalClues}`);
  await log(`${C.bold}  Evidence collected:  ${C.reset}${totalEvidence} of ${totalClues} (threshold > 65)`);
  await log(`${C.bold}  Privacy:             ${C.reset}Commit-Reveal (hash, no plaintext)`);
  await log(`${C.bold}  NFT tokenId:         ${C.reset}#${tokenId} (owner: player)`);
  await log(`${C.bold}  Token URI:           ${C.reset}On-chain data URI with SVG trophy`);
  await log(`${C.bold}  Metadata traits:     ${C.reset}${decodedMeta.attributes.length} attributes`);
  await sep();

  console.log(`${C.dim}  Full game flow (14 steps):`);
  console.log(`   1.  Player registers ECIES public key on-chain`);
  console.log(`   2.  Starts mission \u2192 VRF picks Carmen's city`);
  console.log(`   3.  VRF COMMITS: targetHash = keccak256(chainId, salt)`);
  console.log(`   4.  Contract stores HASH \u2192 nobody knows where Carmen is!`);
  console.log(`   5.  Player investigates \u2192 CRE reads salt, brute-forces 3 cities`);
  console.log(`   6.  CRE \u2192 Forwarder \u2192 Proxy \u2192 GameMaster.receiveClue(strength)`);
  console.log(`   7.  Strong clues (strength > 65) = evidence collected on-chain`);
  console.log(`   8.  3+ clues gathered \u2192 CRE initiates capture`);
  console.log(`   9.  CRE \u2192 Forwarder \u2192 Proxy \u2192 GameMaster.resolveCapture()`);
  console.log(`  10.  Contract verifies hash \u2192 capture confirmed!`);
  console.log(`  11.  GameMaster mints MissionNFT to player (empty URI)`);
  console.log(`  12.  generate-finale CRE workflow fires on CarmenCaptured`);
  console.log(`  13.  CRE builds SVG trophy + ERC-721 metadata as data URI`);
  console.log(`  14.  CRE \u2192 Forwarder \u2192 Proxy \u2192 setMissionTokenURI()`);
  console.log(`${C.reset}`);
  console.log(`${C.bold}  CRE = Trusted Arbiter | VRF = Commit | Proxy = ReceiverTemplate${C.reset}`);
  console.log(`${C.bold}  NFT minted instantly, trophy image added async by CRE${C.reset}`);
  console.log(`${C.bold}  Contract knows NOTHING about Carmen's location until REVEAL${C.reset}`);
  console.log("");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
