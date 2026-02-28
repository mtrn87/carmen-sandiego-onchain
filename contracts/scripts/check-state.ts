import { ethers } from "hardhat";

async function main() {
  const addr = "0x84e4af8bf4f2c32276b5f4c32d36756db0e2a43e";
  const gm = await ethers.getContractAt("GameMaster", addr);
  const owner = (await ethers.getSigners())[0];
  console.log("Signer:", owner.address);

  const nextId = await gm.nextMissionId();
  const count = Number(nextId) - 1;
  console.log("Total missions:", count);

  for (let i = 1; i <= count && i <= 5; i++) {
    const m = await gm.missions(i);
    console.log(`\nMission ${i}:`);
    console.log(`  player: ${m.player}`);
    console.log(`  status: ${m.status} (0=none, 1=active, 2=completed, 3=failed)`);
    console.log(`  targetHash: ${m.targetHash}`);

    const active = await gm.getPlayerActiveMission(m.player);
    console.log(`  playerActiveMission: ${active}`);

    const clues = await gm.getMissionClues(i);
    console.log(`  clueCount: ${clues.length}`);
    for (const c of clues) {
      console.log(`    clue: type=${c.clueType} strength=${c.strength} ipfs=${c.ipfsPointer?.slice(0, 30)}...`);
    }

    const pubKey = await gm.getPlayerPublicKey(m.player);
    console.log(`  pubKey: ${pubKey.slice(0, 20)}... (${(pubKey.length - 2) / 2} bytes)`);
  }
}

main().catch(console.error);
