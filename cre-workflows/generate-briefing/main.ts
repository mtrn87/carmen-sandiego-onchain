/**
 * ================================================================
 *  CRE Workflow: generate-briefing
 * ================================================================
 *
 *  PURPOSE:
 *    Listens for the on-chain `MissionStarted` event emitted when a
 *    player starts a new mission. The workflow generates a narrative
 *    briefing (either AI-generated or from scenario templates),
 *    encrypts it with the player's ECIES public key, and delivers
 *    it on-chain as the first "clue" (clueType=0 / Text).
 *
 *    The frontend recognizes early clues as briefings and displays
 *    them in the MissionBriefing screen.
 *
 *  HOW IT DIFFERS FROM mission-start:
 *    - Trigger: MissionStarted (not InvestigationSubmitted)
 *    - No brute-force needed (we don't check Carmen's location)
 *    - Generates narrative content (briefing text) instead of clues
 *    - Always sends ACTION_RECEIVE_CLUE with clueType=0
 *    - Has AI generation capability (currently using fallback due to
 *      CRE WASM async limitations)
 *
 *  FLOW:
 *    1. Decode MissionStarted(missionId, player, startBlock) event
 *    2. Read on-chain: getPlayerPublicKey, getValidCities
 *    3. Select a scenario based on missionId
 *    4. Generate briefing text (AI with fallback to template)
 *    5. ECIES-encrypt the briefing with the player's public key
 *    6. Compute contentHash and send via ACTION_RECEIVE_CLUE
 *
 *  AI GENERATION:
 *    The workflow includes a full OpenAI integration (generateAIBriefing)
 *    that creates unique noir-style briefings for each mission. However,
 *    CRE WASM currently doesn't support async/await in handlers, so the
 *    AI path falls back to buildFallbackBriefing which uses scenario data.
 *    When CRE v2 supports async handlers, the AI path can be enabled.
 *
 *  CONFIG:
 *    - chainSelectorName: "ethereum-testnet-sepolia"
 *    - gameMasterAddress: GameMaster contract
 *    - proxyAddress: GameMasterProxy (CRE report receiver)
 *    - gasLimit: gas limit for the on-chain write
 *    - openaiApiKey: OpenAI API key (optional, for AI briefings)
 *    - openaiModel: model to use (e.g. "gpt-4o-mini")
 *
 *  DEPENDENCIES:
 *    - @chainlink/cre-sdk: CRE runtime, EVM client, encoding
 *    - viem: ABI encoding/decoding, keccak256, event parsing
 *    - ./ecies.ts: ECIES encryption (encrypt-only copy from mission-start)
 *    - ../data/scenarios.json: scenario templates for fallback briefings
 *
 *  NOTE ON ecies.ts DUPLICATION:
 *    This workflow has its own copy of ecies.ts (encrypt-only) rather
 *    than importing from mission-start. This is because CRE workflows
 *    are compiled independently — each is a self-contained WASM module.
 *    Cross-workflow imports are not supported in CRE's build system.
 *    Both copies use identical encryption logic.
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
  chainSelectorName: string   // e.g. "ethereum-testnet-sepolia"
  gameMasterAddress: string    // GameMaster.sol deployment address
  proxyAddress: string         // GameMasterProxy.sol (CRE report receiver)
  gasLimit: string             // Gas limit for writeReport transactions
  openaiApiKey: string         // OpenAI API key (optional — empty string = use fallback)
  openaiModel: string          // OpenAI model name (e.g. "gpt-4o-mini")
}

// ============================================================
//  ABI fragments — view functions + the event we listen for
// ============================================================
const GameMasterABI = parseAbi([
  // View functions for reading game state
  "function getMission(uint256) view returns (address,uint256,bytes32,uint8,uint8,uint8)",
  "function getMissionSalt(uint256) view returns (bytes32)",
  "function getValidCities() view returns (uint256[])",
  "function getPlayerPublicKey(address) view returns (bytes)",
  // The event we listen for — emitted when a player starts a new mission
  "event MissionStarted(uint256 indexed missionId, address indexed player, uint256 startBlock)",
])

// ============================================================
//  Scenarios — game content with city details for briefings
//  Each scenario has a title, briefing template, and per-city info
// ============================================================
import scenariosData from "../data/scenarios.json"

type ScenarioData = {
  id: string
  title: string
  briefing: string
  cities: Record<string, { name: string; emoji: string; chain: string }>
  cityClues: Record<string, { landmark: string; culture: string }>
}

/**
 * Select a scenario based on missionId (cycles through available scenarios).
 * Same logic as mission-start — ensures consistency across workflows.
 */
function getScenario(missionId: bigint): ScenarioData {
  const scenarios = scenariosData.scenarios
  if (!scenarios || scenarios.length === 0) {
    throw new Error("No scenarios configured in scenarios.json")
  }
  const index = Number(missionId - BigInt(1)) % scenarios.length
  return scenarios[index] as ScenarioData
}

// Action code — must match GameMasterProxy.sol
const ACTION_RECEIVE_CLUE = 1  // → GameMaster.receiveClue()

// ============================================================
//  AI Briefing Generation
//  Currently behind a TODO due to CRE WASM async limitations.
//  When CRE supports async handlers, this function can be called
//  directly in the handler instead of buildFallbackBriefing.
// ============================================================

/**
 * Generate a unique mission briefing using OpenAI API.
 *
 * This function is ASYNC — it uses fetch() to call the OpenAI API.
 * CRE WASM handlers are currently SYNCHRONOUS, so this function
 * cannot be called directly in the handler. It's kept here for
 * future use when CRE v2 supports async handlers.
 *
 * @param scenario - The scenario data with city details
 * @param missionId - The on-chain mission ID
 * @param cities - Array of valid city chain IDs
 * @param apiKey - OpenAI API key
 * @param model - OpenAI model name
 * @param log - CRE runtime logger function
 * @returns The AI-generated briefing text
 */
async function generateAIBriefing(
  scenario: ScenarioData,
  missionId: bigint,
  cities: bigint[],
  apiKey: string,
  model: string,
  log: (msg: string) => void,
): Promise<string> {
  // Build city descriptions for the prompt context
  const cityDescriptions = cities
    .map((c) => {
      const info = scenario.cities[c.toString()]
      const clueInfo = scenario.cityClues?.[c.toString()]
      if (!info) return `Chain ${c}`
      return `${info.name} (${info.chain}) — landmark: ${clueInfo?.landmark || "unknown"}, known for: ${clueInfo?.culture || "unknown"}`
    })
    .join("\n    ")

  // System prompt sets the narrator's persona
  const systemPrompt = `You are the narrator for "Carmen Sandiego On-Chain," a blockchain mystery game. You write immersive, suspenseful mission briefings in the style of a Cold War intelligence dossier crossed with cyberpunk noir. Keep it under 250 words. Use vivid language. Address the player as "detective" or "agent." Reference blockchain terminology naturally (hashes, wallets, bridges, protocols). End with urgency — Carmen is on the move.`

  // User prompt provides mission-specific context
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
    log("Calling AI API to generate dynamic briefing...")

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
    log(`AI generation failed: ${err}. Falling back to scenario data.`)
    return buildFallbackBriefing(scenario, missionId, cities)
  }
}

/**
 * Build a briefing from scenario template data (no API call needed).
 * Used as fallback when AI generation is unavailable or fails.
 * Produces a structured, professional briefing using the scenario's
 * pre-written content and city names.
 */
function buildFallbackBriefing(
  scenario: ScenarioData,
  missionId: bigint,
  cities: bigint[],
): string {
  const cityNames = cities
    .map((c) => {
      const info = scenario.cities[c.toString()]
      return info ? `${info.name} ${info.emoji}` : `Chain ${c}`
    })
    .join(", ")

  return [
    `=== ACME DETECTIVE AGENCY ===`,
    `CLASSIFIED — Mission #${missionId}: ${scenario.title}`,
    ``,
    scenario.briefing,
    ``,
    `Intel suggests Carmen may be hiding in one of these locations: ${cityNames}`,
    ``,
    `Your ECIES encryption keys are active. All clues will be encrypted — only you can read them.`,
    `Investigate cities, collect clues, and capture Carmen before she escapes.`,
    `The clock is ticking, detective. Move fast.`,
  ].join("\n")
}

// ============================================================
//  Handler: onMissionStarted
//  Called by CRE when a MissionStarted event is detected
// ============================================================
const onMissionStarted = (runtime: Runtime<Config>, log: EVMLog): Record<string, never> => {
  const config = runtime.config

  // Resolve the chain network
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)

  // ── Step 1: Decode the MissionStarted event from the raw log ──
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

  // ── Step 2: EVM Read — getPlayerPublicKey ──
  // Needed to encrypt the briefing so only the player can read it
  const pubKeyCallData = encodeFunctionData({
    abi: GameMasterABI,
    functionName: "getPlayerPublicKey",
    args: [player],
  })
  const pubKeyResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.gameMasterAddress as `0x${string}`,
        data: pubKeyCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()

  const playerPubKeyHex = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getPlayerPublicKey",
    data: bytesToHex(pubKeyResult.data),
  }) as `0x${string}`
  runtime.log(`Player public key: ${playerPubKeyHex.slice(0, 20)}...`)

  // ── Step 3: EVM Read — getValidCities ──
  // We need city IDs to include city names in the briefing text
  const citiesCallData = encodeFunctionData({
    abi: GameMasterABI,
    functionName: "getValidCities",
  })
  const citiesResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.gameMasterAddress as `0x${string}`,
        data: citiesCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()

  const cities = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getValidCities",
    data: bytesToHex(citiesResult.data),
  }) as bigint[]
  runtime.log(`Valid cities: ${cities.join(", ")}`)

  // ── Step 4: Select scenario and generate briefing text ──
  const scenario = getScenario(missionId)
  runtime.log(`Scenario: "${scenario.title}"`)

  let briefingText: string

  // Check if AI generation is configured
  if (config.openaiApiKey && config.openaiApiKey !== "" && config.openaiApiKey !== "YOUR_OPENAI_API_KEY") {
    // AI path — currently falls back to template because CRE WASM
    // doesn't support async/await in handler functions
    try {
      briefingText = buildFallbackBriefing(scenario, missionId, cities)
      runtime.log("Using scenario-based briefing (async AI call planned for CRE v2)")

      // TODO: When CRE supports async handlers, replace the line above with:
      // briefingText = await generateAIBriefing(scenario, missionId, cities, config.openaiApiKey, config.openaiModel, runtime.log)
    } catch {
      briefingText = buildFallbackBriefing(scenario, missionId, cities)
    }
  } else {
    // No API key configured — use scenario template directly
    briefingText = buildFallbackBriefing(scenario, missionId, cities)
    runtime.log("No AI API key configured — using scenario data")
  }

  runtime.log(`Briefing ready (${briefingText.length} chars)`)

  // ── Step 5: ECIES-encrypt the briefing ──
  // Convert the player's hex public key to bytes
  const pubKeyClean = playerPubKeyHex.startsWith("0x") ? playerPubKeyHex.slice(2) : playerPubKeyHex
  if (pubKeyClean.length !== 130 || !/^[0-9a-fA-F]+$/.test(pubKeyClean)) {
    runtime.log(`ERROR: Invalid public key format (length=${pubKeyClean.length})`)
    return {}
  }
  const pubKeyBytes = new Uint8Array(pubKeyClean.length / 2)
  for (let i = 0; i < pubKeyBytes.length; i++) {
    pubKeyBytes[i] = parseInt(pubKeyClean.slice(i * 2, i * 2 + 2), 16)
  }

  const encryptedBriefing = eciesEncrypt(pubKeyBytes, briefingText)
  runtime.log(`Briefing encrypted (${encryptedBriefing.length} hex chars)`)

  // ── Step 6: Compute contentHash ──
  // Hash of the plaintext briefing — stored on-chain for verification
  const contentHash = keccak256(toBytes(briefingText))

  // ── Step 7: EVM Write — deliver encrypted briefing via GameMasterProxy ──
  // Delivered as clueType=0 (Text) — the frontend recognizes early clues
  // (before any investigation) as the mission briefing.
  const clueData = encodeAbiParameters(
    parseAbiParameters("uint256, uint8, bytes32, string"),
    [missionId, 0, contentHash as `0x${string}`, encryptedBriefing]
  )
  const clueReport = encodeAbiParameters(
    parseAbiParameters("uint8, bytes"),
    [ACTION_RECEIVE_CLUE, clueData as `0x${string}`]
  )

  // Create DON-signed report and deliver to proxy
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
//  Workflow initialization — sets up the event trigger
// ============================================================

/**
 * initWorkflow configures the LogTrigger to listen for MissionStarted events.
 * Same pattern as mission-start but watches for a different event.
 */
const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)

  // Topic hash for MissionStarted(uint256,address,uint256)
  const eventHash = keccak256(toBytes("MissionStarted(uint256,address,uint256)"))

  return [
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.gameMasterAddress)],  // Only from GameMaster
        topics: [{ values: [hexToBase64(eventHash)] }],      // Only MissionStarted
      }),
      onMissionStarted
    ),
  ]
}

/**
 * Entry point — CRE calls main() when the workflow is deployed.
 */
export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}

// Export for testing
export { generateAIBriefing, buildFallbackBriefing }
