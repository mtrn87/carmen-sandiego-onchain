import { ethers } from "hardhat";

async function main() {
  const gmAddress = process.env.GAMEMASTER_ADDRESS || "0x55276b775818480CEEbdBDd537da507791681e90";
  const gm = await ethers.getContractAt("GameMaster", gmAddress);

  const newChains = [421614n, 84532n, 51n, 80002n, 97n, 11155111n];
  console.log("Updating validChainIds to:", newChains.map(String).join(", "));

  const tx = await gm.setValidChainIds(newChains);
  await tx.wait();
  console.log("✓ setValidChainIds confirmed — tx:", tx.hash);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
