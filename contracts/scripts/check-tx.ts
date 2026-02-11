import { ethers } from "hardhat";

async function main() {
  const gm = await ethers.getContractAt("GameMaster", "0xB6E2A9DEd3352E1a1B4a501c6F110813883F4cEB");

  const TX = "0x966146d01affc0bd69f2b3657dd1cf93e14dfb6ea1194f7a5df5a220e594287b";
  const receipt = await ethers.provider.getTransactionReceipt(TX);
  if (!receipt) { console.log("No receipt"); return; }
  console.log("Logs count:", receipt.logs.length);
  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i];
    console.log(`Log ${i}: topic0=${log.topics[0]?.slice(0, 18)}...`);
    try {
      const parsed = gm.interface.parseLog({ topics: [...log.topics], data: log.data });
      console.log(`  -> ${parsed?.name}`);
    } catch { console.log(`  -> (not GameMaster event)`); }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
