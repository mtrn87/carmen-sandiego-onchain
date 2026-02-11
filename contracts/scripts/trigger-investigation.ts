import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const GAME_MASTER = "0xB6E2A9DEd3352E1a1B4a501c6F110813883F4cEB";
  const MOCK_PUBLIC_KEY = "0x04" + "ab".repeat(64);

  const gameMaster = await ethers.getContractAt("GameMaster", GAME_MASTER);

  // 1. Register player (skip if already registered)
  const existingKey = await gameMaster.getPlayerPublicKey(deployer.address);
  if (existingKey === "0x") {
    console.log("1. Registering player...");
    const tx1 = await gameMaster.registerPlayer(MOCK_PUBLIC_KEY);
    await tx1.wait();
    console.log("   Player registered:", deployer.address);
  } else {
    console.log("1. Player already registered:", deployer.address);
  }

  // 2. Start mission (skip if already on a mission)
  let missionId = await gameMaster.getPlayerActiveMission(deployer.address);
  if (missionId === BigInt(0)) {
    console.log("2. Starting mission (requesting VRF)...");
    const tx2 = await gameMaster.startMission();
    const receipt2 = await tx2.wait();
    console.log("   Mission start tx:", receipt2?.hash);

    // Wait for VRF callback
    missionId = await gameMaster.getPlayerActiveMission(deployer.address);
    if (missionId === BigInt(0)) {
      console.log("\n   VRF callback not yet received. Wait ~30s and re-run.");
      return;
    }
  }
  console.log("   Active mission ID:", missionId.toString());

  // 3. Submit investigation to Paris (Base Sepolia = 84532)
  console.log("3. Submitting investigation to Paris (chainId=84532)...");
  const tx3 = await gameMaster.submitInvestigation(84532);
  const receipt3 = await tx3.wait();
  console.log("   Investigation tx:", receipt3?.hash);

  // Find the event index
  let eventIndex = -1;
  for (let i = 0; i < (receipt3?.logs.length ?? 0); i++) {
    try {
      const parsed = gameMaster.interface.parseLog({ topics: [...receipt3!.logs[i].topics], data: receipt3!.logs[i].data });
      if (parsed?.name === "InvestigationSubmitted") { eventIndex = i; break; }
    } catch {}
  }

  console.log("\n=== CRE SIMULATION INPUT ===");
  console.log(`TX Hash: ${receipt3?.hash}`);
  console.log(`Event Index: ${eventIndex}`);
  console.log("\nRun:");
  console.log(`cre workflow simulate mission-start --target staging-settings --non-interactive --evm-tx-hash ${receipt3?.hash} --evm-event-index ${eventIndex} --trigger-index 0`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
