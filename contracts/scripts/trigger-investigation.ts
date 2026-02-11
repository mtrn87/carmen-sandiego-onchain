import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const GAME_MASTER = "0xB6E2A9DEd3352E1a1B4a501c6F110813883F4cEB";
  const MOCK_PUBLIC_KEY = "0x04" + "ab".repeat(64);

  const gameMaster = await ethers.getContractAt("GameMaster", GAME_MASTER);

  // 1. Register player
  console.log("1. Registering player...");
  const tx1 = await gameMaster.registerPlayer(MOCK_PUBLIC_KEY);
  await tx1.wait();
  console.log("   Player registered:", deployer.address);

  // 2. Start mission
  console.log("2. Starting mission (requesting VRF)...");
  const tx2 = await gameMaster.startMission();
  const receipt2 = await tx2.wait();
  console.log("   Mission start tx:", receipt2?.hash);

  // Check if VRF callback was received (on testnet it takes time)
  const missionId = await gameMaster.getPlayerActiveMission(deployer.address);
  console.log("   Active mission ID:", missionId.toString());

  if (missionId === BigInt(0)) {
    console.log("\n   VRF callback not yet received. Wait ~30s and run:");
    console.log("   npx hardhat run scripts/trigger-investigation.ts --network sepolia");
    console.log("   (Script will skip registration next time)");
    return;
  }

  // 3. Submit investigation to Paris (Base Sepolia = 84532)
  console.log("3. Submitting investigation to Paris (chainId=84532)...");
  const tx3 = await gameMaster.submitInvestigation(84532);
  const receipt3 = await tx3.wait();
  console.log("   Investigation tx:", receipt3?.hash);

  // Find the event
  const event = receipt3?.logs.find((l: any) => {
    try {
      return gameMaster.interface.parseLog({ topics: [...l.topics], data: l.data })?.name === "InvestigationSubmitted";
    } catch { return false; }
  });

  if (event) {
    console.log("\n=== CRE SIMULATION INPUT ===");
    console.log(`TX Hash: ${receipt3?.hash}`);
    console.log(`Event Index: ${receipt3?.logs.indexOf(event)}`);
    console.log("\nRun:");
    console.log(`cre workflow simulate mission-start --target staging-settings --non-interactive --evm-tx-hash ${receipt3?.hash} --evm-event-index ${receipt3?.logs.indexOf(event)}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
