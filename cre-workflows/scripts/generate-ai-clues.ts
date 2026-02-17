import OpenAI from "openai";
import { config } from "dotenv";
import { readFileSync, writeFileSync, copyFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env from project root ──────────────────────────────────────
config({ path: resolve(__dirname, "../../.env") });

// ── Types ────────────────────────────────────────────────────────────
type ScenarioClue = { type: number; text: string };
type CityInfo = { name: string; emoji: string; chain: string };
type CityClue = { landmark: string; culture: string };
type Scenario = {
  id: string;
  title: string;
  briefing: string;
  cities: Record<string, CityInfo>;
  cityClues: Record<string, CityClue>;
  clues: { true: ScenarioClue[]; false: ScenarioClue[] };
  captureMessage: string;
  failureMessage: string;
};

// ── CLI Args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const TARGET_COUNT = parseInt(args[args.indexOf("--count") + 1]) || 15;
const TARGET_SCENARIO = args.includes("--scenario")
  ? args[args.indexOf("--scenario") + 1]
  : null;
const MODEL = args.includes("--model")
  ? args[args.indexOf("--model") + 1]
  : process.env.OPENAI_MODEL || "gpt-4o-mini";

// ── Paths ────────────────────────────────────────────────────────────
const SCENARIOS_PATH = resolve(__dirname, "../data/scenarios.json");
const BACKUP_PATH = resolve(__dirname, "../data/scenarios.backup.json");

// ── Colors ───────────────────────────────────────────────────────────
const C = {
  green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m",
  red: "\x1b[31m", dim: "\x1b[2m", bold: "\x1b[1m", reset: "\x1b[0m",
};

// ── System Prompt ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a clue generator for "Carmen Sandiego On-Chain," a blockchain mystery game.
You write atmospheric clues in a noir detective meets cyberpunk style. Each clue blends
real-world cultural/geographic details with blockchain/Web3 references (wallets, hashes,
chains, protocols, NFTs, bridges, smart contracts).

WORLD RULES:
- Carmen Sandiego steals digital assets and hops across blockchain networks
- Players are ACME detectives tracking her via on-chain evidence
- Cities mapped to chains: Tokyo=Arbitrum Sepolia, Paris=Base Sepolia, London=XDC Apothem
- Clues are encrypted and delivered to players on-chain
- The game uses commit-reveal: Carmen's location is stored as a hash

CLUE FORMAT:
- Each clue is 50-150 words
- Never name the target city directly in TRUE clues — use cultural/landmark hints only
- Always include at least one blockchain/Web3 detail
- Vary the source: witness reports, security footage, on-chain forensics, intercepted comms, informant tips, marketplace listings

OUTPUT: Return a JSON object with a "clues" array. Each element has:
  "type": <number 0, 1, or 2>,
  "text": "<the clue text>"

Type 0 = Text clue (detective report, witness statement, intercepted message)
Type 1 = Audio description (describe an overheard conversation, radio intercept, voicemail recording)
Type 2 = Image description (describe surveillance camera footage, document scan, satellite imagery)

IMPORTANT: Return ONLY valid JSON. No markdown, no code fences, no explanation.`;

// ── Prompt Builders ──────────────────────────────────────────────────
function buildTrueCluePrompt(
  scenario: Scenario, carmenCityId: string, count: number
): string {
  const city = scenario.cities[carmenCityId];
  const clue = scenario.cityClues[carmenCityId];

  return `Generate ${count} TRUE clues for this scenario.

Scenario: "${scenario.title}"
Context: ${scenario.briefing}
Carmen is ACTUALLY in: ${city.name} (${city.chain})
Local landmarks/culture: ${clue.landmark}, ${clue.culture}

Requirements for TRUE clues:
- Subtly hint at ${city.name} through cultural references and blockchain activity
- Do NOT name the city directly — use cultural/geographic/culinary/architectural hints
- Include blockchain details: wallet activity, transaction patterns, NFT metadata, bridge usage
- Mix of types: roughly 60% type 0 (text), 25% type 1 (audio), 15% type 2 (image)
- Make each clue unique — different angles, evidence sources, and specificity levels
- Some should reference the specific heist from the scenario
- Noir detective meets cyberpunk tone

Return a JSON object: { "clues": [ { "type": 0, "text": "..." }, ... ] }`;
}

function buildFalseCluePrompt(
  scenario: Scenario, wrongCityId: string, count: number
): string {
  const city = scenario.cities[wrongCityId];
  const clue = scenario.cityClues[wrongCityId];

  return `Generate ${count} FALSE (misleading) clues for this scenario.

Scenario: "${scenario.title}"
Carmen is NOT in: ${city.name} — the player is searching the wrong place
City to use as bait: ${city.name} (${city.chain})
Landmarks to reference: ${clue.landmark}, ${clue.culture}

Requirements for FALSE clues:
- Suggest Carmen MIGHT be in ${city.name} but include subtle hints it's a dead end
- Reference ${city.name} landmarks and culture as bait
- Include blockchain details that seem suspicious but lead nowhere
- End with a mocking/taunting tone aimed at the detective
- Mix of types: roughly 60% type 0 (text), 25% type 1 (audio), 15% type 2 (image)
- Make each clue unique — different angles and misdirection strategies
- Noir detective meets cyberpunk tone

Return a JSON object: { "clues": [ { "type": 0, "text": "..." }, ... ] }`;
}

// ── Validation ───────────────────────────────────────────────────────
function validateClue(
  clue: ScenarioClue, isTrue: boolean, cityName: string
): string[] {
  const errors: string[] = [];
  const words = clue.text.split(/\s+/).length;

  if (words < 25) errors.push(`Too short (${words} words, min 25)`);
  if (words > 250) errors.push(`Too long (${words} words, max 250)`);
  if (![0, 1, 2].includes(clue.type)) errors.push(`Invalid type: ${clue.type}`);

  if (clue.type === 1 && !/recording|voice|audio|heard|overheard|radio|intercept|static|crackle|conversation|phone|call|whisper|murmur|speaker/i.test(clue.text)) {
    errors.push("Type 1 (audio) missing audio-related language");
  }
  if (clue.type === 2 && !/camera|footage|surveillance|image|photo|satellite|document|screen|visual|captured|shows|scan|feed|CCTV|monitor/i.test(clue.text)) {
    errors.push("Type 2 (image) missing visual-related language");
  }

  if (!/wallet|chain|transaction|hash|NFT|token|bridge|protocol|contract|block|DeFi|DEX|swap|mint|oracle|validator|liquidity|staking|yield|eth|gwei|smart contract|on-chain/i.test(clue.text)) {
    errors.push("Missing blockchain/Web3 reference");
  }

  // True clues must NOT name the target city
  if (isTrue) {
    const cityRegex = new RegExp(`\\b${cityName}\\b`, "i");
    if (cityRegex.test(clue.text)) {
      errors.push(`City name leak: "${cityName}" found in true clue`);
    }
  }

  return errors;
}

// ── OpenAI Call ──────────────────────────────────────────────────────
async function generateClues(
  openai: OpenAI, prompt: string, model: string
): Promise<ScenarioClue[]> {
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.9,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");

  const parsed = JSON.parse(content);
  const clues: ScenarioClue[] = parsed.clues || parsed;

  if (!Array.isArray(clues)) {
    throw new Error(`Expected array, got ${typeof clues}`);
  }

  return clues.map((c) => ({
    type: Number(c.type) || 0,
    text: String(c.text).trim(),
  }));
}

// ── Rate Limiter ─────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.cyan}CARMEN SANDIEGO — AI Clue Generator${C.reset}`);
  console.log(`${C.dim}Model: ${MODEL} | Count: ${TARGET_COUNT} per category | Dry run: ${DRY_RUN}${C.reset}\n`);

  if (!process.env.OPENAI_API_KEY && !DRY_RUN) {
    console.error(`${C.red}Error: OPENAI_API_KEY not found in .env${C.reset}`);
    console.error(`Set it in ${resolve(__dirname, "../../.env")}`);
    process.exit(1);
  }

  const openai = DRY_RUN
    ? (null as unknown as OpenAI)
    : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Read scenarios
  const data = JSON.parse(readFileSync(SCENARIOS_PATH, "utf-8"));
  const scenarios: Scenario[] = data.scenarios;

  const filteredScenarios = TARGET_SCENARIO
    ? scenarios.filter((s) => s.id === TARGET_SCENARIO)
    : scenarios;

  if (filteredScenarios.length === 0) {
    console.error(`${C.red}Scenario "${TARGET_SCENARIO}" not found${C.reset}`);
    console.error(`Available: ${scenarios.map((s) => s.id).join(", ")}`);
    process.exit(1);
  }

  let totalGenerated = 0;
  let totalRejected = 0;
  let totalApiCalls = 0;
  const typeDistribution = { 0: 0, 1: 0, 2: 0 };

  for (let si = 0; si < filteredScenarios.length; si++) {
    const scenario = filteredScenarios[si];
    const cityIds = Object.keys(scenario.cities);
    const originalTrue = scenario.clues.true.length;
    const originalFalse = scenario.clues.false.length;

    console.log(`${C.bold}[${si + 1}/${filteredScenarios.length}] ${scenario.title}${C.reset}`);
    console.log(`${C.dim}  Current: ${originalTrue} true + ${originalFalse} false clues${C.reset}`);

    // ── TRUE clues: each scenario has one correct city ──
    // In the game, VRF picks which city. We generate true clues
    // hinting at each city (since any could be the answer).
    // For simplicity, we use the first city as the "canonical" true city
    // and rotate through all 3 for variety.
    for (let ci = 0; ci < cityIds.length; ci++) {
      const cityId = cityIds[ci];
      const cityName = scenario.cities[cityId].name;
      const trueCount = Math.ceil(TARGET_COUNT / cityIds.length);

      console.log(`  ${C.green}[TRUE]${C.reset} Generating ${trueCount} clues hinting at ${cityName}...`);

      if (!DRY_RUN) {
        try {
          const prompt = buildTrueCluePrompt(scenario, cityId, trueCount);
          const clues = await generateClues(openai, prompt, MODEL);
          totalApiCalls++;

          let accepted = 0;
          for (const clue of clues) {
            const errors = validateClue(clue, true, cityName);
            if (errors.length === 0) {
              scenario.clues.true.push(clue);
              typeDistribution[clue.type as 0 | 1 | 2]++;
              accepted++;
              totalGenerated++;
            } else {
              totalRejected++;
              console.log(`    ${C.red}Rejected:${C.reset} ${errors.join(", ")}`);
            }
          }
          console.log(`    ${C.green}${accepted}/${clues.length} accepted${C.reset}`);

          await sleep(2000); // rate limit
        } catch (err: any) {
          console.error(`    ${C.red}Error: ${err.message}${C.reset}`);
        }
      } else {
        console.log(`    ${C.dim}(dry run — skipped)${C.reset}`);
      }
    }

    // ── FALSE clues: one batch per wrong city ──
    for (let ci = 0; ci < cityIds.length; ci++) {
      const wrongCityId = cityIds[ci];
      const wrongCityName = scenario.cities[wrongCityId].name;
      const falseCount = Math.ceil(TARGET_COUNT / cityIds.length);

      console.log(`  ${C.yellow}[FALSE]${C.reset} Generating ${falseCount} clues baiting toward ${wrongCityName}...`);

      if (!DRY_RUN) {
        try {
          const prompt = buildFalseCluePrompt(scenario, wrongCityId, falseCount);
          const clues = await generateClues(openai, prompt, MODEL);
          totalApiCalls++;

          let accepted = 0;
          for (const clue of clues) {
            const errors = validateClue(clue, false, wrongCityName);
            if (errors.length === 0) {
              scenario.clues.false.push(clue);
              typeDistribution[clue.type as 0 | 1 | 2]++;
              accepted++;
              totalGenerated++;
            } else {
              totalRejected++;
              console.log(`    ${C.red}Rejected:${C.reset} ${errors.join(", ")}`);
            }
          }
          console.log(`    ${C.green}${accepted}/${clues.length} accepted${C.reset}`);

          await sleep(2000); // rate limit
        } catch (err: any) {
          console.error(`    ${C.red}Error: ${err.message}${C.reset}`);
        }
      } else {
        console.log(`    ${C.dim}(dry run — skipped)${C.reset}`);
      }
    }

    const newTrue = scenario.clues.true.length;
    const newFalse = scenario.clues.false.length;
    console.log(`  ${C.cyan}Result: ${originalTrue}→${newTrue} true, ${originalFalse}→${newFalse} false${C.reset}\n`);
  }

  // ── Write output ───────────────────────────────────────────────────
  if (!DRY_RUN && totalGenerated > 0) {
    // Backup
    copyFileSync(SCENARIOS_PATH, BACKUP_PATH);
    console.log(`${C.dim}Backup saved: scenarios.backup.json${C.reset}`);

    // Write updated scenarios
    writeFileSync(SCENARIOS_PATH, JSON.stringify(data, null, 2) + "\n");
    console.log(`${C.green}Updated: scenarios.json${C.reset}`);
  }

  // ── Summary ────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.cyan}Summary${C.reset}`);
  console.log(`  API calls:      ${totalApiCalls}`);
  console.log(`  Clues generated: ${totalGenerated}`);
  console.log(`  Clues rejected:  ${totalRejected}`);
  console.log(`  Type 0 (Text):   ${typeDistribution[0]}`);
  console.log(`  Type 1 (Audio):  ${typeDistribution[1]}`);
  console.log(`  Type 2 (Image):  ${typeDistribution[2]}`);

  if (DRY_RUN) {
    console.log(`\n${C.yellow}Dry run — no files were modified.${C.reset}`);
    console.log(`Run without --dry-run to generate and save clues.`);
  }

  // Show final pool sizes
  console.log(`\n${C.bold}Pool sizes per scenario:${C.reset}`);
  for (const s of filteredScenarios) {
    console.log(`  ${s.id}: ${s.clues.true.length} true + ${s.clues.false.length} false`);
  }

  console.log("");
}

main().catch((err) => {
  console.error(`${C.red}Fatal: ${err.message}${C.reset}`);
  process.exit(1);
});
