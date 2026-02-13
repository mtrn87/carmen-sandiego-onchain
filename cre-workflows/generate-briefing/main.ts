/**
 * ================================================================
 *  CRE Workflow: generate-briefing
 * ================================================================
 *
 *  PURPOSE:
 *    Listens for the on-chain `MissionStarted` event emitted when a
 *    player starts a new mission. The workflow generates a narrative
 *    briefing (AI-generated or from enriched scenario templates),
 *    encrypts it with the player's ECIES public key, and delivers
 *    it on-chain as the first "clue" (clueType=0 / Text).
 *
 *  HOW IT DIFFERS FROM mission-start:
 *    - Trigger: MissionStarted (not InvestigationSubmitted)
 *    - No brute-force needed (we don't check Carmen's location)
 *    - Generates narrative content (briefing text) instead of clues
 *    - Always sends ACTION_RECEIVE_CLUE with clueType=0
 *    - Has AI generation capability (OpenAI integration ready)
 *
 *  FLOW:
 *    1. Decode MissionStarted(missionId, player, startBlock) event
 *    2. Read on-chain: getPlayerPublicKey, getValidCities
 *    3. Select a scenario based on missionId
 *    4. Generate briefing text (AI with fallback to enriched template)
 *    5. ECIES-encrypt the briefing with the player's public key
 *    6. Compute contentHash and send via ACTION_RECEIVE_CLUE
 *
 *  AI GENERATION:
 *    The workflow includes a full OpenAI integration (generateAIBriefing)
 *    that creates unique noir-style briefings for each mission. CRE WASM
 *    currently doesn't support async/await in handlers, so the AI path
 *    uses buildEnrichedBriefing as fallback. When CRE v2 supports async
 *    handlers, the AI path can be enabled with a one-line change.
 *
 *  CONFIG:
 *    - chainSelectorName, gameMasterAddress, proxyAddress, gasLimit
 *    - openaiApiKey: OpenAI API key (optional — empty = use fallback)
 *    - openaiModel: model to use (e.g. "gpt-4o-mini")
 *
 *  NOTE ON ecies.ts DUPLICATION:
 *    This workflow has its own copy of ecies.ts (encrypt-only) rather
 *    than importing from mission-start. CRE compiles each workflow into
 *    a self-contained WASM module — cross-workflow imports are not supported.
 *
 *  IMPORTANT CONSTRAINTS:
 *    - @noble/* libs MUST stay on v1.x (v2.x breaks CRE WASM)
 *    - Handler must be synchronous (async AI calls are behind TODO)
 *    - .result() for blocking EVM reads
 * ================================================================
 */

import {
  EVMClient,
  handler,
  Runner,
  getNetwork,
  hexToBase64,
  bytesToHex,
  encodeCallMsg,
  LATEST_BLOCK_NUMBER,
  type Runtime,
  type EVMLog,
} from "@chainlink/cre-sdk"
import {
  keccak256,
  toBytes,
  encodeFunctionData,
  decodeFunctionResult,
  decodeEventLog,
  encodeAbiParameters,
  parseAbiParameters,
  parseAbi,
  zeroAddress,
} from "viem"
import { eciesEncrypt } from "./ecies"

// ============================================================
//  Config — populated from workflow.yaml target settings
// ============================================================
type Config = {
  chainSelectorName: string
  gameMasterAddress: string
  proxyAddress: string
  gasLimit: string
  openaiApiKey: string    // OpenAI API key (optional — empty = use fallback)
  openaiModel: string     // OpenAI model name (e.g. "gpt-4o-mini")
}

// ============================================================
//  ABI fragments
// ============================================================
const GameMasterABI = parseAbi([
  "function getMission(uint256) view returns (address,uint256,bytes32,uint8,uint8,uint8)",
  "function getMissionSalt(uint256) view returns (bytes32)",
  "function getValidCities() view returns (uint256[])",
  "function getPlayerPublicKey(address) view returns (bytes)",
  "event MissionStarted(uint256 indexed missionId, address indexed player, uint256 startBlock)",
])

// ============================================================
//  Scenarios
// ============================================================
import scenariosData from "../data/scenarios.json"

type ScenarioData = {
  id: string
  title: string
  briefing: string
  cities: Record<string, { name: string; emoji: string; chain: string }>
  cityClues: Record<string, { landmark: string; culture: string }>
}

function getScenario(missionId: bigint): ScenarioData {
  const scenarios = scenariosData.scenarios
  if (!scenarios || scenarios.length === 0) {
    throw new Error("No scenarios configured in scenarios.json")
  }
  const index = Number(missionId - BigInt(1)) % scenarios.length
  return scenarios[index] as ScenarioData
}

const ACTION_RECEIVE_CLUE = 1

// ============================================================
//  Helper: read contract — reduces boilerplate for EVM reads
// ============================================================
function readContract(
  evmClient: EVMClient,
  runtime: Runtime<Config>,
  address: string,
  callData: `0x${string}`,
): Uint8Array {
  return evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: address as `0x${string}`,
        data: callData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()
    .data
}

// ============================================================
//  Helper: convert hex public key to Uint8Array
// ============================================================
function parsePubKey(pubKeyHex: string, log: (msg: string) => void): Uint8Array | null {
  const clean = pubKeyHex.startsWith("0x") ? pubKeyHex.slice(2) : pubKeyHex
  if (clean.length !== 130 || !/^[0-9a-fA-F]+$/.test(clean)) {
    log(`ERROR: Invalid public key format (length=${clean.length})`)
    return null
  }
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// ============================================================
//  AI Briefing Generation (async — for CRE v2)
//
//  Creates unique noir-style briefings via OpenAI API.
//  Currently cannot be called from the synchronous handler.
//  When CRE v2 supports async handlers, enable with one-line change.
// ============================================================
async function generateAIBriefing(
  scenario: ScenarioData,
  missionId: bigint,
  cities: bigint[],
  apiKey: string,
  model: string,
  log: (msg: string) => void,
): Promise<string> {
  const cityDescriptions = cities
    .map((c) => {
      const info = scenario.cities[c.toString()]
      const clue = scenario.cityClues?.[c.toString()]
      if (!info) return `Chain ${c}`
      return `${info.name} (${info.chain}) — landmark: ${clue?.landmark || "unknown"}, known for: ${clue?.culture || "unknown"}`
    })
    .join("\n    ")

  const systemPrompt = `You are the narrator for "Carmen Sandiego On-Chain," a blockchain mystery game. You write immersive, suspenseful mission briefings in the style of a Cold War intelligence dossier crossed with cyberpunk noir. Keep it under 250 words. Use vivid language. Address the player as "detective" or "agent." Reference blockchain terminology naturally (hashes, wallets, bridges, protocols). End with urgency — Carmen is on the move.`

  const userPrompt = `Write a unique mission briefing for Mission #${missionId}.

SCENARIO: "${scenario.title}"

BASE PLOT: ${scenario.briefing}

AVAILABLE CITIES TO INVESTIGATE:
    ${cityDescriptions}

Requirements:
- Open with a dramatic hook about the heist
- Mention specific blockchain details (the exploit method, the stolen asset)
- Name the cities as possible hiding locations
- Create a sense of urgency and ticking clock
- End with a line that motivates the detective
- Do NOT reveal which city Carmen is actually in
- Write in English with a noir detective tone`

  try {
    log("Calling AI API for dynamic briefing...")

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.9,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      log(`AI API error (${response.status}): ${errText}`)
      throw new Error(`AI API returned ${response.status}`)
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
    }

    const briefingText = data.choices?.[0]?.message?.content
    if (!briefingText) throw new Error("Empty AI response")

    log(`AI briefing generated (${briefingText.length} chars)`)
    return briefingText
  } catch (err) {
    log(`AI generation failed: ${err}. Using enriched template.`)
    return buildEnrichedBriefing(scenario, missionId, cities)
  }
}

// ============================================================
//  Enriched Briefing Generation (synchronous fallback)
//
//  Builds a detailed, noir-style briefing using scenario data,
//  city landmarks, culture details, and blockchain context.
//  Richer than a basic template — includes formatted intel sections.
// ============================================================
function buildEnrichedBriefing(
  scenario: ScenarioData,
  missionId: bigint,
  cities: bigint[],
): string {
  const cityIntel = cities
    .map((c) => {
      const info = scenario.cities[c.toString()]
      const clue = scenario.cityClues?.[c.toString()]
      if (!info) return `  - Chain ${c}: Unknown location`
      const landmark = clue?.landmark ? ` (near ${clue.landmark})` : ""
      return `  - ${info.emoji} ${info.name}${landmark} — ${info.chain}`
    })
    .join("\n")

  const cultureHints = cities
    .map((c) => {
      const clue = scenario.cityClues?.[c.toString()]
      const info = scenario.cities[c.toString()]
      if (!clue || !info) return null
      return `${info.name}: ${clue.culture}`
    })
    .filter(Boolean)
    .join(" | ")

  return [
    `╔══════════════════════════════════════════════╗`,
    `║     ACME DETECTIVE AGENCY — CLASSIFIED       ║`,
    `╚══════════════════════════════════════════════╝`,
    ``,
    `MISSION #${missionId}: ${scenario.title.toUpperCase()}`,
    `CLASSIFICATION: TOP SECRET / BLOCKCHAIN-SENSITIVE`,
    `PRIORITY: CRITICAL — TIME-SENSITIVE`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `SITUATION BRIEFING:`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    scenario.briefing,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `SUSPECT LOCATIONS — ACTIVE CHAINS:`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    cityIntel,
    ``,
    `CULTURAL INTEL: ${cultureHints}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `OPERATIONAL DETAILS:`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Your ECIES encryption keys are active. All clues will be`,
    `encrypted with your public key — only you can decrypt them.`,
    ``,
    `PROCEDURE:`,
    `  1. Select a city to investigate`,
    `  2. Submit investigation on-chain (costs gas)`,
    `  3. CRE oracle will analyze and deliver encrypted clue`,
    `  4. Collect 3+ clues to enable capture`,
    `  5. Investigate the correct city to capture Carmen`,
    ``,
    `WARNING: Carmen relocates every 3 minutes. Previous clues`,
    `may become stale. Move fast, detective.`,
    ``,
    `MAX INVESTIGATIONS: 10 | MAX BLOCKS: 50`,
    ``,
    `The clock is ticking. Carmen won't wait.`,
    `Good luck, detective.`,
    ``,
    `— Chief, ACME Detective Agency`,
  ].join("\n")
}

// ============================================================
//  Handler: onMissionStarted
// ============================================================
const onMissionStarted = (runtime: Runtime<Config>, log: EVMLog): Record<string, never> => {
  const config = runtime.config

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)
  const gm = config.gameMasterAddress

  // ── Step 1: Decode MissionStarted event ──
  const topics = log.topics.map((t) => bytesToHex(t)) as [`0x${string}`, ...`0x${string}`[]]
  const data = bytesToHex(log.data)

  const decoded = decodeEventLog({
    abi: GameMasterABI,
    data,
    topics,
  })

  if (decoded.eventName !== "MissionStarted") {
    throw new Error(`Unexpected event: ${decoded.eventName}`)
  }

  const { missionId, player } = decoded.args
  runtime.log(`MissionStarted: mission=${missionId}, player=${player}`)

  // ── Step 2: Read player's ECIES public key ──
  const pubKeyData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI,
    functionName: "getPlayerPublicKey",
    args: [player],
  }))
  const playerPubKeyHex = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getPlayerPublicKey",
    data: bytesToHex(pubKeyData),
  }) as `0x${string}`
  runtime.log(`Player public key: ${playerPubKeyHex.slice(0, 20)}...`)

  // ── Step 3: Read valid cities ──
  const citiesData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI,
    functionName: "getValidCities",
  }))
  const cities = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getValidCities",
    data: bytesToHex(citiesData),
  }) as bigint[]
  runtime.log(`Valid cities: ${cities.join(", ")}`)

  // ── Step 4: Generate briefing text ──
  const scenario = getScenario(missionId)
  runtime.log(`Scenario: "${scenario.title}"`)

  let briefingText: string

  if (config.openaiApiKey && config.openaiApiKey !== "" && config.openaiApiKey !== "YOUR_OPENAI_API_KEY") {
    try {
      briefingText = buildEnrichedBriefing(scenario, missionId, cities)
      runtime.log("Using enriched briefing (async AI planned for CRE v2)")
      // TODO: When CRE supports async handlers, replace with:
      // briefingText = await generateAIBriefing(scenario, missionId, cities, config.openaiApiKey, config.openaiModel, runtime.log)
    } catch {
      briefingText = buildEnrichedBriefing(scenario, missionId, cities)
    }
  } else {
    briefingText = buildEnrichedBriefing(scenario, missionId, cities)
    runtime.log("No AI API key — using enriched scenario briefing")
  }

  runtime.log(`Briefing ready (${briefingText.length} chars)`)

  // ── Step 5: ECIES-encrypt the briefing ──
  const pubKeyBytes = parsePubKey(playerPubKeyHex, runtime.log)
  if (!pubKeyBytes) return {}

  const encryptedBriefing = eciesEncrypt(pubKeyBytes, briefingText)
  runtime.log(`Briefing encrypted (${encryptedBriefing.length} hex chars)`)

  // ── Step 6: Compute contentHash and send report ──
  const contentHash = keccak256(toBytes(briefingText))

  const clueData = encodeAbiParameters(
    parseAbiParameters("uint256, uint8, bytes32, string"),
    [missionId, 0, contentHash as `0x${string}`, encryptedBriefing]
  )
  const clueReport = encodeAbiParameters(
    parseAbiParameters("uint8, bytes"),
    [ACTION_RECEIVE_CLUE, clueData as `0x${string}`]
  )

  runtime.log("Sending encrypted briefing to proxy...")
  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(clueReport),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result()

  evmClient
    .writeReport(runtime, {
      receiver: config.proxyAddress,
      report: reportResponse,
      gasConfig: { gasLimit: config.gasLimit },
    })
    .result()

  runtime.log("Encrypted briefing delivered on-chain!")

  return {}
}

// ============================================================
//  Workflow initialization
// ============================================================
const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)
  const eventHash = keccak256(toBytes("MissionStarted(uint256,address,uint256)"))

  return [
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.gameMasterAddress)],
        topics: [{ values: [hexToBase64(eventHash)] }],
      }),
      onMissionStarted
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}

// Export for testing
export { generateAIBriefing, buildEnrichedBriefing }
