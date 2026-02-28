import { ethers, network } from "hardhat";

// ── ANSI Colors ──────────────────────────────────────────────────────
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
const VALID_CHAIN_IDS = [421614, 84532, 51];

// Clue narratives per city (wrong city = misleading, right city = accurate)
const CLUE_NARRATIVES: Record<string, { text: string[]; audio: string[]; image: string[] }> = {
  wrong: {
    text: [
      '"A vendor reported seeing a woman matching the',
      ' description heading toward the train station..."',
    ],
    audio: [
      '"Intercepted comms mention a rendezvous at',
      ' a local exchange. Signal trace inconclusive."',
    ],
    image: [
      'Surveillance still: crowded market, partial match',
      'on facial recognition. Confidence: LOW.',
    ],
  },
  right: {
    text: [
      '"Confirmed sighting — red coat, laptop bag.',
      ' Subject seen near a crypto ATM at 14:32 local."',
    ],
    audio: [
      '"Voice match 94.7%. Subject discussing cross-chain',
      ' bridge operations. Background: bullet train chime."',
    ],
    image: [
      'Security cam: woman in red near NFT kiosk.',
      'Coords match. Facial recognition: HIGH confidence.',
    ],
  },
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = (msg: string) => console.log(msg);
const sep = () => console.log(`${C.dim}${"─".repeat(60)}${C.reset}`);

const banner = (text: string) => {
  console.log("");
  console.log(`${C.bold}${C.bgBlue}${C.white} ${"═".repeat(58)} ${C.reset}`);
  console.log(`${C.bold}${C.bgBlue}${C.white}  ${text.padEnd(57)}${C.reset}`);
  console.log(`${C.bold}${C.bgBlue}${C.white} ${"═".repeat(58)} ${C.reset}`);
  console.log("");
};

const box = (lines: string[], color: string = C.cyan) => {
  const width = 52;
  console.log(`${color}${C.bold}  ┌${"─".repeat(width)}┐${C.reset}`);
  for (const line of lines) {
    // strip ANSI to calculate padding
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
    const pad = Math.max(0, width - stripped.length);
    console.log(`${color}  │${C.reset} ${line}${" ".repeat(pad)}${color}│${C.reset}`);
  }
  console.log(`${color}${C.bold}  └${"─".repeat(width)}┘${C.reset}`);
};

const txLink = (hash: string) =>
  `https://sepolia.etherscan.io/tx/${hash}`;

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

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  if (network.name === "hardhat" || network.name === "localhost") {
    console.error(`${C.red}ERROR: This script is for TESTNET only. Use --network sepolia${C.reset}`);
    console.error(`Usage: npx hardhat run scripts/simulate-testnet.ts --network sepolia`);
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();

  // ── Load deployed addresses from env ──
  const GM_ADDR = process.env.GAME_MASTER_ADDRESS;
  const PROXY_ADDR = process.env.GAME_MASTER_PROXY_ADDRESS;
  const NFT_ADDR = process.env.MISSION_NFT_ADDRESS;

  if (!GM_ADDR || !PROXY_ADDR || !NFT_ADDR) {
    console.error(`${C.red}ERROR: Missing contract addresses in .env${C.reset}`);
    console.error("Required: GAME_MASTER_ADDRESS, GAME_MASTER_PROXY_ADDRESS, MISSION_NFT_ADDRESS");
    process.exit(1);
  }

  banner("CARMEN SANDIEGO ON-CHAIN — Testnet Simulation (Real VRF)");

  box([
    `${C.bold}Network${C.reset}      Ethereum Sepolia (chainId 11155111)`,
    `${C.bold}Signer${C.reset}       ${signer.address}`,
    `${C.bold}GameMaster${C.reset}   ${GM_ADDR}`,
    `${C.bold}Proxy${C.reset}        ${PROXY_ADDR}`,
    `${C.bold}MissionNFT${C.reset}   ${NFT_ADDR}`,
  ]);

  const balance = await ethers.provider.getBalance(signer.address);
  log(`${C.cyan}[BALANCE]${C.reset} ${C.bold}${ethers.formatEther(balance)} ETH${C.reset}`);
  sep();

  // ── Connect to deployed contracts ──
  const gameMaster = await ethers.getContractAt("GameMaster", GM_ADDR, signer);
  const missionNFT = await ethers.getContractAt("MissionNFT", NFT_ADDR, signer);

  // Check current CRE oracle
  const currentCRE = await gameMaster.creOracle();
  const isProxy = currentCRE.toLowerCase() === PROXY_ADDR!.toLowerCase();
  const isOurWallet = currentCRE.toLowerCase() === signer.address.toLowerCase();
  log(`${C.cyan}[INFO]${C.reset} CRE oracle: ${C.bold}${currentCRE.slice(0, 14)}...${C.reset} (${isProxy ? "proxy" : isOurWallet ? "our wallet" : "unknown"})`);

  // ================================================================
  //  PHASE 1: PLAYER REGISTRATION
  // ================================================================
  banner("PHASE 1: Player Registration (ECIES Key Pair)");

  log(`${C.dim}  The player must register an ECIES public key so the CRE can${C.reset}`);
  log(`${C.dim}  encrypt clues that only the player can decrypt (secp256k1).${C.reset}`);
  console.log("");

  const existingKey = await gameMaster.getPlayerPublicKey(signer.address);
  const MOCK_PUBLIC_KEY = "0x04" + "ab".repeat(64);

  if (existingKey && existingKey !== "0x") {
    log(`${C.green}  ✓${C.reset} Player already registered on-chain`);
    log(`${C.dim}  → Public key: ${existingKey.slice(0, 30)}...${C.reset}`);
    log(`${C.dim}  → Contract: GameMaster.playerPublicKeys(${signer.address.slice(0, 10)}...)${C.reset}`);
  } else {
    log(`${C.yellow}[STEP 1.1]${C.reset} Calling ${C.bold}GameMaster.registerPlayer(publicKey)${C.reset}...`);
    const regTx = await gameMaster.registerPlayer(MOCK_PUBLIC_KEY);
    log(`${C.dim}  → tx: ${regTx.hash}${C.reset}`);
    log(`${C.dim}  → ${txLink(regTx.hash)}${C.reset}`);
    await regTx.wait();
    log(`${C.green}  ✓${C.reset} ${C.bold}PlayerRegistered${C.reset} event emitted!`);
    log(`${C.dim}  → Key stored: ${MOCK_PUBLIC_KEY.slice(0, 20)}... (${MOCK_PUBLIC_KEY.length / 2 - 1} bytes)${C.reset}`);
  }

  // ================================================================
  //  PHASE 2: START MISSION → REAL VRF
  // ================================================================
  banner("PHASE 2: Start Mission → Chainlink VRF v2.5");

  log(`${C.dim}  startMission() triggers a VRF v2.5 randomness request.${C.reset}`);
  log(`${C.dim}  The VRF callback picks a random city and creates a COMMIT:${C.reset}`);
  log(`${C.dim}  targetHash = keccak256(chainId, salt) — nobody knows the city!${C.reset}`);
  console.log("");

  // Check if there's an active mission with VRF already fulfilled
  let missionId = Number(await gameMaster.activePlayerMission(signer.address));
  let mission: any;
  let skipStartMission = false;

  if (missionId > 0) {
    mission = await gameMaster.getMission(missionId);
    const currentBlock = await ethers.provider.getBlockNumber();
    const blocksElapsed = currentBlock - Number(mission.startBlock);
    const isActive = mission.status === BigInt(1);
    const hasVRF = mission.targetHash !== ethers.ZeroHash;
    const hasBlockBudget = blocksElapsed < 40; // leave 10 blocks buffer

    if (isActive && hasVRF && hasBlockBudget) {
      log(`${C.green}  ✓${C.reset} Resuming active mission #${missionId}`);
      log(`${C.dim}  → VRF already fulfilled, ${50 - blocksElapsed} blocks remaining${C.reset}`);
      skipStartMission = true;
    } else if (isActive) {
      const reason = !hasVRF ? "VRF still pending" : `only ${50 - blocksElapsed} blocks left`;
      log(`${C.yellow}[INFO]${C.reset} Mission #${missionId} exists but ${reason} — starting fresh`);
    }
  }

  if (!skipStartMission) {
    log(`${C.yellow}[STEP 2.1]${C.reset} Calling ${C.bold}GameMaster.startMission()${C.reset}...`);
    const startTx = await gameMaster.startMission();
    log(`${C.dim}  → tx: ${startTx.hash}${C.reset}`);
    log(`${C.dim}  → ${txLink(startTx.hash)}${C.reset}`);
    const startReceipt = await startTx.wait();
    log(`${C.green}  ✓${C.reset} Confirmed in block ${C.bold}${startReceipt?.blockNumber}${C.reset}`);

    // Parse MissionStarted event
    const missionStartedLog = findEvent(startReceipt, gameMaster, "MissionStarted");
    if (missionStartedLog) {
      const parsed = parseEvent(gameMaster, missionStartedLog);
      missionId = Number(parsed!.args[0]);
    } else {
      missionId = Number(await gameMaster.activePlayerMission(signer.address));
    }

    log(`${C.green}  [EVENT]${C.reset} ${C.bold}MissionStarted${C.reset}(missionId=${missionId}, player=${signer.address.slice(0, 14)}...)`);
    console.log("");

    log(`${C.yellow}[STEP 2.2]${C.reset} Waiting for ${C.bold}Chainlink VRF v2.5${C.reset} fulfillment...`);
    box([
      `VRF Coordinator: 0x9DdfaCa8...3168B1B (Sepolia)`,
      `Request confirmations: ${C.bold}3 blocks${C.reset} (~36 seconds)`,
      `Callback gas limit: ${C.bold}200,000${C.reset}`,
      `Payment method: ${C.bold}Native ETH${C.reset} (not LINK)`,
      ``,
      `${C.dim}The VRF oracle node picks up the request,${C.reset}`,
      `${C.dim}generates a provably random number, and calls${C.reset}`,
      `${C.dim}fulfillRandomWords() on GameMaster.${C.reset}`,
    ], C.magenta);

    // Poll for VRF fulfillment
    mission = await gameMaster.getMission(missionId);
    let attempts = 0;
    const maxAttempts = 60;

    while (mission.targetHash === ethers.ZeroHash && attempts < maxAttempts) {
      attempts++;
      const dots = ".".repeat((attempts % 3) + 1).padEnd(3);
      process.stdout.write(`\r${C.yellow}  ⏳ Waiting for VRF${dots} (${attempts * 5}s)${C.reset}  `);
      await sleep(5000);
      mission = await gameMaster.getMission(missionId);
    }
    console.log("");

    if (mission.targetHash === ethers.ZeroHash) {
      console.error(`\n${C.red}ERROR: VRF did not respond after ${maxAttempts * 5}s.${C.reset}`);
      console.error(`${C.yellow}TIP: Re-run — the script will resume the active mission.${C.reset}`);
      process.exit(1);
    }
  }

  log(`\n${C.green}[STEP 2.3]${C.reset} ${C.bold}VRF FULFILLED!${C.reset}`);
  log(`${C.dim}  → fulfillRandomWords() called by VRF oracle${C.reset}`);
  log(`${C.dim}  → targetHash = ${mission.targetHash}${C.reset}`);

  // ── Brute-force Carmen's location (same as CRE would) ──
  const salt = await gameMaster.missionSalts(missionId);

  log(`\n${C.yellow}[STEP 2.4]${C.reset} CRE brute-forces Carmen's location:`);
  log(`${C.dim}  → Reading missionSalts(${missionId}) from chain...${C.reset}`);
  log(`${C.dim}  → Salt: ${salt}${C.reset}`);

  let carmenChainId = 0;
  for (const cid of VALID_CHAIN_IDS) {
    const hash = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]));
    const match = hash === mission.targetHash;
    const cityName = CITIES[cid].name;
    log(`${C.dim}  → keccak256(${cid}, salt) = ${hash.slice(0, 18)}... ${match ? `${C.green}${C.bold}MATCH ✓${C.reset}` : `${C.dim}✗${C.reset}`}  [${cityName}]${C.reset}`);
    if (match) carmenChainId = cid;
  }

  if (carmenChainId === 0) {
    console.error(`${C.red}ERROR: Could not determine Carmen's location from targetHash${C.reset}`);
    process.exit(1);
  }

  const carmenCity = CITIES[carmenChainId];
  console.log("");
  box([
    `${C.bold}COMMIT-REVEAL: Carmen's location decoded${C.reset}`,
    ``,
    `Carmen is hiding in: ${C.bold}${C.red}${carmenCity.name} ${carmenCity.emoji}${C.reset} (${carmenCity.chain})`,
    `ChainId: ${C.bold}${carmenChainId}${C.reset}`,
    ``,
    `${C.dim}The contract still only has the hash — it does NOT${C.reset}`,
    `${C.dim}know where Carmen is. Only the CRE knows.${C.reset}`,
    `${C.dim}This is revealed only at capture time (Phase 4).${C.reset}`,
  ], C.red);

  // ================================================================
  //  PHASE 3: INVESTIGATION + CLUE DELIVERY
  // ================================================================
  banner("PHASE 3: Investigation Loop + Clue Delivery");

  log(`${C.dim}  Player submits investigations (guesses cities).${C.reset}`);
  log(`${C.dim}  CRE reads the result off-chain, generates a clue,${C.reset}`);
  log(`${C.dim}  and calls receiveClue(). Strong clues = evidence.${C.reset}`);
  log(`${C.dim}  Evidence threshold: strength > ${C.bold}65${C.reset}${C.dim} counts as evidence.${C.reset}`);
  console.log("");

  // Set CRE oracle to our wallet (so we can call receiveClue directly)
  const creNow = await gameMaster.creOracle();
  if (creNow.toLowerCase() !== signer.address.toLowerCase()) {
    log(`${C.cyan}[SETUP]${C.reset} Setting CRE oracle → our wallet (to simulate CRE calls)`);
    log(`${C.dim}  → GameMaster.setCREOracle(${signer.address.slice(0, 14)}...)${C.reset}`);
    const setCRETx = await gameMaster.setCREOracle(signer.address);
    await setCRETx.wait();
    log(`${C.green}  ✓${C.reset} CRE oracle updated`);
  } else {
    log(`${C.green}  ✓${C.reset} CRE oracle already set to our wallet`);
  }

  // ── Investigations ──
  const clueLabels = ["Text", "Audio", "Image"];
  const investigationOrder = VALID_CHAIN_IDS.filter(id => id !== carmenChainId);
  investigationOrder.push(carmenChainId); // investigate correct city last

  for (let i = 0; i < investigationOrder.length; i++) {
    const invCity = investigationOrder[i];
    const cityInfo = CITIES[invCity];
    const isCorrect = invCity === carmenChainId;
    const clueType = i; // 0=Text, 1=Audio, 2=Image
    const strength = isCorrect ? 90 : (i === 0 ? 40 : 80);
    const isEvidence = strength > 65;
    const narrativeKey = isCorrect ? "right" : "wrong";
    const narrativeType = (["text", "audio", "image"] as const)[clueType];
    const narrative = CLUE_NARRATIVES[narrativeKey][narrativeType];

    sep();
    log(`\n${C.yellow}[STEP 3.${i + 1}a]${C.reset} ${C.bold}Player investigates ${cityInfo.name} ${cityInfo.emoji}${C.reset} (chainId=${invCity})`);
    log(`${C.dim}  → GameMaster.submitInvestigation(${invCity})${C.reset}`);

    const invTx = await gameMaster.submitInvestigation(invCity);
    log(`${C.dim}  → tx: ${invTx.hash}${C.reset}`);
    log(`${C.dim}  → ${txLink(invTx.hash)}${C.reset}`);
    const invReceipt = await invTx.wait();
    log(`${C.green}  ✓${C.reset} Confirmed in block ${invReceipt?.blockNumber}`);

    const invEvent = findEvent(invReceipt, gameMaster, "InvestigationSubmitted");
    if (invEvent) {
      const invArgs = parseEvent(gameMaster, invEvent)!.args;
      log(`${C.green}  [EVENT]${C.reset} InvestigationSubmitted(missionId=${Number(invArgs[0])}, player=..., chainId=${Number(invArgs[2])})`);
    }

    // CRE delivers clue
    const matchStr = isCorrect
      ? `${C.green}${C.bold}${cityInfo.name} = Carmen's city!${C.reset}`
      : `${C.yellow}${cityInfo.name} ≠ ${carmenCity.name}${C.reset}`;

    console.log("");
    log(`${C.yellow}[STEP 3.${i + 1}b]${C.reset} ${C.bold}CRE generates clue${C.reset}`);
    log(`${C.magenta}  [CRE]${C.reset} Comparing: ${matchStr}`);
    log(`${C.magenta}  [CRE]${C.reset} Generating ${C.bold}${clueLabels[clueType]}${C.reset} clue (strength=${C.bold}${strength}${C.reset})`);
    log(`${C.dim}  → GameMaster.receiveClue(${missionId}, ${clueType}, contentHash, ipfs, ${strength})${C.reset}`);

    const contentHash = ethers.keccak256(ethers.toUtf8Bytes(`clue-${missionId}-${i}`));
    const clueTx = await gameMaster.receiveClue(missionId, clueType, contentHash, `QmClue${missionId}_${i}`, strength);
    log(`${C.dim}  → tx: ${clueTx.hash}${C.reset}`);
    const clueReceipt = await clueTx.wait();

    // Parse events
    const clueEvent = findEvent(clueReceipt, gameMaster, "ClueReceived");
    if (clueEvent) {
      log(`${C.green}  [EVENT]${C.reset} ClueReceived(missionId=${missionId}, type=${clueLabels[clueType]}, strength=${strength})`);
    }
    const evidenceEvent = findEvent(clueReceipt, gameMaster, "EvidenceCollected");
    if (evidenceEvent) {
      const evArgs = parseEvent(gameMaster, evidenceEvent)!.args;
      log(`${C.green}  [EVENT]${C.reset} ${C.bold}EvidenceCollected${C.reset}(count=${Number(evArgs[1])}, strength=${Number(evArgs[2])})`);
    }

    // Display clue card
    const evidenceTag = isEvidence
      ? `${C.bold}[EVIDENCE ✓ strength > 65]${C.reset}`
      : `${C.dim}[not evidence — strength ≤ 65]${C.reset}`;
    const cardColor = isEvidence ? C.green : C.yellow;

    console.log("");
    box([
      `CLUE #${i + 1} (${clueLabels[clueType]}) | Strength: ${C.bold}${strength}/100${C.reset}  ${evidenceTag}`,
      ...narrative,
    ], cardColor);
  }

  // Evidence summary
  const totalClues = (await gameMaster.getMissionClues(missionId)).length;
  const totalEvidence = Number(await gameMaster.missionEvidenceCount(missionId));

  console.log("");
  box([
    `${C.bold}EVIDENCE TRACKER${C.reset}`,
    `${"─".repeat(50)}`,
    ...investigationOrder.map((cid, i) => {
      const strength = (cid === carmenChainId) ? 90 : (i === 0 ? 40 : 80);
      const isEv = strength > 65;
      const evMark = isEv ? `${C.green}[X] Evidence${C.reset}` : `[ ]`;
      return `Clue #${i + 1} (${clueLabels[i].padEnd(5)})  Strength ${String(strength).padEnd(3)}  ${evMark}`;
    }),
    `${"─".repeat(50)}`,
    `Total evidence: ${C.bold}${totalEvidence}${C.reset} of ${totalClues} clues`,
    `Threshold: strength > 65 = evidence`,
    `${C.bold}${C.green}CRE can REVEAL (3+ clues collected) ✓${C.reset}`,
  ], C.cyan);

  // ================================================================
  //  PHASE 4: CAPTURE (REVEAL)
  // ================================================================
  banner("PHASE 4: The Arrest (Reveal + Capture + NFT Mint)");

  log(`${C.dim}  CRE has enough evidence. It now REVEALS Carmen's location${C.reset}`);
  log(`${C.dim}  by calling resolveCapture(missionId, chainId, salt).${C.reset}`);
  log(`${C.dim}  The contract verifies: keccak256(chainId, salt) == targetHash${C.reset}`);
  log(`${C.dim}  If valid → CarmenCaptured + MissionNFT minted to player!${C.reset}`);
  console.log("");

  log(`${C.yellow}[STEP 4.1]${C.reset} ${C.bold}CRE calls resolveCapture()${C.reset}`);
  log(`${C.magenta}  [CRE]${C.reset} REVEAL: chainId=${C.bold}${carmenChainId}${C.reset} (${carmenCity.name})`);
  log(`${C.dim}  → salt: ${salt}${C.reset}`);
  log(`${C.dim}  → Contract verifies: keccak256(${carmenChainId}, salt) == targetHash?${C.reset}`);

  const captureTx = await gameMaster.resolveCapture(missionId, carmenChainId, salt);
  log(`${C.dim}  → tx: ${captureTx.hash}${C.reset}`);
  log(`${C.dim}  → ${txLink(captureTx.hash)}${C.reset}`);
  const captureReceipt = await captureTx.wait();

  log(`${C.green}  ✓${C.reset} Hash match! ${C.bold}REVEAL VALID${C.reset}`);

  // Parse CarmenCaptured event
  const capturedLog = findEvent(captureReceipt, gameMaster, "CarmenCaptured");
  let blocksUsed = 0;
  let reward = 0;
  let tier = "";
  let tierEmoji = "";

  if (capturedLog) {
    const args = parseEvent(gameMaster, capturedLog)!.args;
    blocksUsed = Number(args[2]);
    reward = Number(args[3]);
    tier = reward === 100 ? "GOLD" : reward === 75 ? "SILVER" : "BRONZE";
    tierEmoji = reward === 100 ? "🥇" : reward === 75 ? "🥈" : "🥉";

    console.log("");
    console.log(`${C.bgGreen}${C.bold}${C.white}                                                              ${C.reset}`);
    console.log(`${C.bgGreen}${C.bold}${C.white}   🎉 CARMEN SANDIEGO HAS BEEN CAPTURED! 🎉                   ${C.reset}`);
    console.log(`${C.bgGreen}${C.bold}${C.white}                                                              ${C.reset}`);
    console.log("");

    log(`${C.green}  [EVENT]${C.reset} CarmenCaptured(mission=${missionId}, blocks=${blocksUsed}, reward=${reward})`);
    log(`${C.green}  [RANK]${C.reset}  ${C.bold}${tier} ${tierEmoji}${C.reset}`);
  }

  // Check NFT
  let tokenId = 0;
  const nftMintedLog = findEvent(captureReceipt, missionNFT, "MissionNFTMinted");

  if (nftMintedLog) {
    const nftArgs = parseEvent(missionNFT, nftMintedLog)!.args;
    tokenId = Number(nftArgs[0]);
    const nftOwner = await missionNFT.ownerOf(tokenId);
    const isPlayer = nftOwner.toLowerCase() === signer.address.toLowerCase();

    log(`${C.green}  [EVENT]${C.reset} MissionNFTMinted(tokenId=${tokenId}, missionId=${missionId})`);
    log(`${C.green}  [NFT]${C.reset}   Owner: ${isPlayer ? `${C.green}${signer.address.slice(0, 14)}... (player) ✓${C.reset}` : nftOwner}`);
  }

  // ================================================================
  //  PHASE 5: VERIFY ON-CHAIN STATE
  // ================================================================
  banner("PHASE 5: On-Chain Verification");

  log(`${C.dim}  Reading final state from the blockchain to verify everything${C.reset}`);
  log(`${C.dim}  was stored correctly.${C.reset}`);
  console.log("");

  const finalMission = await gameMaster.getMission(missionId);
  const playerFree = (await gameMaster.activePlayerMission(signer.address)) === BigInt(0);
  const mappedTokenId = tokenId > 0 ? Number(await missionNFT.missionToTokenId(missionId)) : 0;
  const missionRecord = tokenId > 0 ? await missionNFT.getMissionRecord(tokenId) : null;
  const tokenURI = tokenId > 0 ? await missionNFT.tokenURI(tokenId) : "";

  box([
    `${C.bold}MISSION #${missionId} — FINAL ON-CHAIN STATE${C.reset}`,
    `${"─".repeat(50)}`,
    `Status:            ${finalMission.status === BigInt(2) ? `${C.green}Completed ✓${C.reset}` : `${C.red}${finalMission.status}${C.reset}`}`,
    `Player:            ${finalMission.player.slice(0, 14)}...`,
    `Start block:       ${Number(finalMission.startBlock)}`,
    `Blocks used:       ${C.bold}${blocksUsed}${C.reset} of 50 max`,
    `Investigations:    ${Number(finalMission.investigationsCount)} of 10 max`,
    `Clues received:    ${Number(finalMission.cluesReceived)}`,
    `Evidence count:    ${totalEvidence}`,
    `Reward:            ${C.bold}${reward} points (${tier} ${tierEmoji})${C.reset}`,
    `${"─".repeat(50)}`,
    `NFT tokenId:       ${C.bold}#${tokenId}${C.reset}`,
    `missionToTokenId:  mission #${missionId} → token #${mappedTokenId}`,
    ...(missionRecord ? [
      `NFT record:        city=${Number(missionRecord.capturedChainId)}, clues=${missionRecord.cluesCollected}, reward=${Number(missionRecord.reward)}`,
    ] : []),
    `Token URI:         ${tokenURI ? `${C.green}set${C.reset} (${tokenURI.length} chars)` : `${C.yellow}(empty — awaiting generate-finale)${C.reset}`}`,
    `Player free:       ${playerFree ? `${C.green}Yes ✓${C.reset}` : `${C.red}No${C.reset}`}`,
  ], C.cyan);

  // ================================================================
  //  PHASE 6: RESTORE CRE ORACLE → PROXY
  // ================================================================
  banner("PHASE 6: Restore CRE Oracle → Proxy");

  log(`${C.dim}  Restoring the CRE oracle to the GameMasterProxy so that${C.reset}`);
  log(`${C.dim}  Chainlink CRE workflows can operate normally.${C.reset}`);
  console.log("");

  log(`${C.yellow}[STEP 6.1]${C.reset} Calling ${C.bold}GameMaster.setCREOracle(proxy)${C.reset}`);
  const restoreTx = await gameMaster.setCREOracle(PROXY_ADDR!);
  log(`${C.dim}  → tx: ${restoreTx.hash}${C.reset}`);
  await restoreTx.wait();
  const restoredCRE = await gameMaster.creOracle();
  log(`${C.green}  ✓${C.reset} CRE oracle → ${restoredCRE}`);
  log(`${C.green}  ✓${C.reset} Proxy restored: ${restoredCRE.toLowerCase() === PROXY_ADDR!.toLowerCase() ? `${C.green}YES ✓${C.reset}` : `${C.red}NO ✗${C.reset}`}`);

  // ================================================================
  //  SUMMARY
  // ================================================================
  banner("SIMULATION COMPLETE — Real VRF on Sepolia ✓");

  box([
    `${C.bold}MISSION SUMMARY${C.reset}`,
    `${"─".repeat(50)}`,
    `Network:           Sepolia (chainId 11155111)`,
    `Mission ID:        #${missionId}`,
    `Carmen was in:     ${carmenCity.name} ${carmenCity.emoji} (${carmenCity.chain})`,
    `VRF:               ${C.green}Real Chainlink VRF v2.5 ✓${C.reset}`,
    `Investigations:    ${investigationOrder.map(id => {
      const c = CITIES[id];
      const mark = id === carmenChainId ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
      return `${c.name} ${mark}`;
    }).join(" → ")}`,
    `Clues collected:   ${totalClues}`,
    `Evidence:          ${totalEvidence} of ${totalClues} (threshold > 65)`,
    `Blocks used:       ${blocksUsed} of 50`,
    `Reward:            ${reward} points (${tier} ${tierEmoji})`,
    `NFT:               tokenId #${tokenId} → player`,
    `Privacy:           Commit-Reveal (hash only on-chain)`,
  ], C.green);

  console.log("");
  log(`${C.dim}  Full game flow executed on Sepolia:${C.reset}`);
  log(`${C.dim}   1. Player registered ECIES public key on-chain${C.reset}`);
  log(`${C.dim}   2. startMission() → VRF v2.5 request (real Chainlink oracle)${C.reset}`);
  log(`${C.dim}   3. fulfillRandomWords() → COMMIT: targetHash = keccak256(city, salt)${C.reset}`);
  log(`${C.dim}   4. CRE reads salt, brute-forces 3 cities → finds Carmen${C.reset}`);
  log(`${C.dim}   5. Player submits 3 investigations → CRE delivers clues${C.reset}`);
  log(`${C.dim}   6. Strong clues (strength > 65) = evidence collected on-chain${C.reset}`);
  log(`${C.dim}   7. resolveCapture() → REVEAL: contract verifies hash → CAPTURED!${C.reset}`);
  log(`${C.dim}   8. MissionNFT minted to player (ERC-721)${C.reset}`);
  log(`${C.dim}   9. CRE oracle restored to proxy for production use${C.reset}`);
  console.log("");
  log(`${C.bold}  All transactions were real on-chain operations on Sepolia.${C.reset}`);
  log(`${C.bold}  VRF = Chainlink | CRE simulated via owner wallet | NFT = ERC-721${C.reset}`);
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
