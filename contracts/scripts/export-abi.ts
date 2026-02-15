import * as fs from "fs";
import * as path from "path";

/**
 * Exports CityNode and GameMaster ABIs to frontend/src/abi/ for consumption.
 * Usage: npx hardhat run scripts/export-abi.ts
 */

const ARTIFACTS_DIR = path.resolve(__dirname, "../artifacts/src");
const OUTPUT_DIR = path.resolve(__dirname, "../../frontend/src/abi");

const CONTRACTS = ["CityNode", "GameMaster", "MissionNFT"];

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const name of CONTRACTS) {
    const artifactPath = path.join(ARTIFACTS_DIR, `${name}.sol`, `${name}.json`);
    if (!fs.existsSync(artifactPath)) {
      console.warn(`  SKIP: ${name} artifact not found at ${artifactPath}`);
      continue;
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    const output = { contractName: name, abi: artifact.abi };
    const outPath = path.join(OUTPUT_DIR, `${name}.json`);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`  OK: ${name} → ${outPath} (${artifact.abi.length} entries)`);
  }

  console.log("\nABI export complete.");
}

main();
