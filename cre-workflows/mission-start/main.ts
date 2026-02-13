/**
 * ================================================================
 *  CRE Workflow: mission-start
 * ================================================================
 *
 *  PURPOSE:
 *    Listens for the on-chain `InvestigationSubmitted` event emitted by
 *    GameMaster.sol whenever a player investigates a city. The workflow
 *    then determines whether the player picked the correct city (where
 *    Carmen is hiding), selects a "true" or "false" clue, encrypts it
 *    with the player's ECIES public key, and delivers the encrypted
 *    clue back on-chain through the GameMasterProxy.
 *
 *    If the player guessed correctly AND has collected at least 3 clues,
 *    the workflow also triggers a capture resolution — ending the
 *    mission and minting a trophy NFT for the player.
 *
 *  HOW CRE WORKS (Chainlink Compute Runtime Environment):
 *    - CRE compiles TypeScript to WASM and runs it off-chain in a
 *      Chainlink DON (Decentralized Oracle Network).
 *    - Workflows are triggered by on-chain events (LogTrigger) or
 *      cron schedules (CronCapability).
 *    - The handler function receives (runtime, eventLog) and must
 *      be SYNCHRONOUS — async/await is not supported in CRE WASM.
 *    - To read on-chain data, use EVMClient.callContract() (EVM Read).
 *    - To write on-chain data, use runtime.report() → evmClient.writeReport().
 *
 *  FLOW:
 *    1. Decode the InvestigationSubmitted(missionId, player, chainId) event
 *    2. Read on-chain: getMissionSalt, getValidCities, getMission, getPlayerPublicKey
 *    3. Brute-force the targetHash to find Carmen's actual city
 *    4. Compare player's investigated city with Carmen's city → true/false
 *    5. Select a clue from the scenario data (rotate through clues by index)
 *    6. ECIES-encrypt the clue with the player's registered public key
 *    7. Send an EVM Write report: ACTION_RECEIVE_CLUE → proxy → GameMaster.receiveClue()
 *    8. If correct city + 3+ clues → also send ACTION_RESOLVE_CAPTURE
 *
 *  AI CLUE GENERATION:
 *    The workflow includes a generateAIClue function (async, for CRE v2)
 *    that creates contextual clues via OpenAI based on the scenario,
 *    city details, and whether the investigation was correct.
 *    Currently uses scenario-based clues as fallback.
 *
 *  CONFIG:
 *    - chainSelectorName, gameMasterAddress, proxyAddress, gasLimit
 *    - openaiApiKey: (optional) for AI-generated clues in CRE v2
 *    - openaiModel: (optional) model name
 *
 *  IMPORTANT CONSTRAINTS:
 *    - @noble/* libs MUST stay on v1.x (v2.x breaks CRE WASM compilation)
 *    - Handler must be synchronous (no async/await inside the handler)
 *    - All EVM reads use .result() which blocks synchronously in CRE
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
  openaiApiKey?: string   // Optional — for AI-generated clues (CRE v2)
  openaiModel?: string    // Optional — model name
}

// ============================================================
//  ABI fragments
// ============================================================
const GameMasterABI = parseAbi([
  "function getMission(uint256) view returns (address,uint256,bytes32,uint8,uint8,uint8)",
  "function getMissionSalt(uint256) view returns (bytes32)",
  "function getValidCities() view returns (uint256[])",
  "function getMissionClues(uint256) view returns ((uint8,bytes32,string,uint256)[])",
  "function getPlayerPublicKey(address) view returns (bytes)",
  "event InvestigationSubmitted(uint256 indexed missionId, address indexed player, uint256 chainId)",
])

// ============================================================
//  Scenarios
// ============================================================
import scenariosData from "../data/scenarios.json"

type ScenarioClue = { type: number; text: string }
type Scenario = {
  id: string
  title: string
  cities: Record<string, { name: string; emoji: string; chain: string }>
  cityClues: Record<string, { landmark: string; culture: string }>
  clues: { true: ScenarioClue[]; false: ScenarioClue[] }
}

function getScenario(missionId: bigint): Scenario {
  const scenarios = scenariosData.scenarios
  if (!scenarios || scenarios.length === 0) {
    throw new Error("No scenarios configured in scenarios.json")
  }
  const index = Number(missionId - BigInt(1)) % scenarios.length
  return scenarios[index] as Scenario
}

// Action codes — must match GameMasterProxy.sol constants
const ACTION_RECEIVE_CLUE = 1
const ACTION_RESOLVE_CAPTURE = 2

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000"

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
//  AI Clue Generation (async — for CRE v2)
//
//  Creates contextual, dynamic clues via OpenAI API based on
//  the scenario, the investigated city, and whether it's correct.
//  Falls back to scenario-based clues when unavailable.
// ============================================================
async function generateAIClue(
  scenario: Scenario,
  carmenCityId: string,
  investigatedCityId: string,
  isCorrect: boolean,
  clueNumber: number,
  apiKey: string,
  model: string,
  log: (msg: string) => void,
): Promise<{ type: number; text: string }> {
  const carmenCity = scenario.cities[carmenCityId]
  const investigatedCity = scenario.cities[investigatedCityId]
  const carmenClue = scenario.cityClues[carmenCityId]
  const investigatedClue = scenario.cityClues[investigatedCityId]

  const systemPrompt = `You are a clue generator for "Carmen Sandiego On-Chain," a blockchain mystery game. You write concise, atmospheric clues in a noir detective style. Each clue should blend real-world cultural details with blockchain/Web3 references. Keep clues under 80 words.`

  let userPrompt: string
  if (isCorrect) {
    userPrompt = `Write a TRUE clue (#${clueNumber + 1}) for a detective game.

Carmen IS in: ${carmenCity?.name || "unknown"} (${carmenCity?.chain || "unknown"})
Landmarks: ${carmenClue?.landmark || "unknown"}, Culture: ${carmenClue?.culture || "unknown"}
Scenario: "${scenario.title}"

The clue should subtly hint at ${carmenCity?.name} through cultural references and blockchain activity. Do NOT name the city directly. Make it feel like intelligence gathered from the field.`
  } else {
    userPrompt = `Write a FALSE (misleading) clue (#${clueNumber + 1}) for a detective game.

Player investigated: ${investigatedCity?.name || "unknown"} — Carmen is NOT here.
City details: ${investigatedClue?.landmark || "unknown"}, ${investigatedClue?.culture || "unknown"}
Scenario: "${scenario.title}"

The clue should suggest Carmen MIGHT be in ${investigatedCity?.name} but include subtle hints it's a dead end. End with a slightly mocking tone.`
  }

  try {
    log(`Calling AI API for ${isCorrect ? "true" : "false"} clue...`)

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
        max_tokens: 200,
        temperature: 0.85,
      }),
    })

    if (!response.ok) throw new Error(`AI API returned ${response.status}`)

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
    }

    const clueText = data.choices?.[0]?.message?.content
    if (!clueText) throw new Error("Empty AI response")

    log(`AI clue generated (${clueText.length} chars)`)
    return { type: 0, text: clueText }
  } catch (err) {
    log(`AI clue generation failed: ${err}. Using scenario clue.`)
    const pool = isCorrect ? scenario.clues.true : scenario.clues.false
    return pool[clueNumber % pool.length]
  }
}

// ============================================================
//  Handler: onInvestigationSubmitted
// ============================================================
const onInvestigationSubmitted = (runtime: Runtime<Config>, log: EVMLog): Record<string, never> => {
  const config = runtime.config

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)
  const gm = config.gameMasterAddress

  // ── Step 1: Decode InvestigationSubmitted event ──
  const topics = log.topics.map((t) => bytesToHex(t)) as [`0x${string}`, ...`0x${string}`[]]
  const data = bytesToHex(log.data)

  const decoded = decodeEventLog({
    abi: GameMasterABI,
    data,
    topics,
  })

  if (decoded.eventName !== "InvestigationSubmitted") {
    throw new Error(`Unexpected event: ${decoded.eventName}`)
  }

  const { missionId, player, chainId: investigatedChainId } = decoded.args
  runtime.log(`Investigation: mission=${missionId}, player=${player}, chainId=${investigatedChainId}`)

  // ── Step 2: Read salt ──
  const saltData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI,
    functionName: "getMissionSalt",
    args: [missionId],
  }))
  const salt = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getMissionSalt",
    data: bytesToHex(saltData),
  }) as `0x${string}`
  runtime.log(`Salt: ${salt}`)

  if (salt === ZERO_HASH) {
    runtime.log("WARN: Salt is zero — VRF not yet fulfilled. Skipping.")
    return {}
  }

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

  // ── Step 4a: Read mission state ──
  const missionData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI,
    functionName: "getMission",
    args: [missionId],
  }))
  const [, , targetHash, cluesReceived, ,] = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getMission",
    data: bytesToHex(missionData),
  }) as [string, bigint, string, number, number, number]
  runtime.log(`TargetHash: ${targetHash}, cluesReceived: ${cluesReceived}`)

  // ── Step 4b: Read player public key ──
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

  // ── Step 5: Brute-force — find Carmen's actual city ──
  let carmenCity: bigint | undefined
  for (const city of cities) {
    const candidateHash = keccak256(
      encodeAbiParameters(parseAbiParameters("uint256, bytes32"), [city, salt])
    )
    if (candidateHash === targetHash) {
      carmenCity = city
      break
    }
  }

  if (carmenCity === undefined) {
    runtime.log(`ERROR: Could not determine Carmen's location.`)
    runtime.log(`  targetHash=${targetHash}, salt=${salt}, cities=[${cities.join(",")}]`)
    return {}
  }
  runtime.log(`Carmen is in city: ${carmenCity}`)

  // ── Step 6: Select clue (true or false) ──
  const isCorrectCity = investigatedChainId === carmenCity
  runtime.log(`Player investigated ${investigatedChainId}, correct=${isCorrectCity}`)

  const scenario = getScenario(missionId)

  // Scenario-based clue selection (AI path ready for CRE v2)
  // TODO: When CRE supports async handlers, replace with:
  // const aiClue = await generateAIClue(scenario, carmenCity.toString(), investigatedChainId.toString(),
  //   isCorrectCity, cluesReceived, config.openaiApiKey!, config.openaiModel!, runtime.log)
  // clueText = aiClue.text; clueType = aiClue.type;
  const cluePool = isCorrectCity ? scenario.clues.true : scenario.clues.false
  const clueIndex = Number(cluesReceived) % cluePool.length
  const selectedClue = cluePool[clueIndex]
  const clueText = selectedClue.text
  const clueType = selectedClue.type

  // ── Step 7: Encrypt clue with ECIES ──
  const contentHash = keccak256(toBytes(clueText))

  const pubKeyBytes = parsePubKey(playerPubKeyHex, runtime.log)
  if (!pubKeyBytes) return {}

  const encryptedClue = eciesEncrypt(pubKeyBytes, clueText)
  runtime.log(`Clue encrypted (${encryptedClue.length} hex chars)`)

  // ── Step 8: Send clue report ──
  const clueData = encodeAbiParameters(
    parseAbiParameters("uint256, uint8, bytes32, string"),
    [missionId, clueType, contentHash as `0x${string}`, encryptedClue]
  )
  const clueReport = encodeAbiParameters(
    parseAbiParameters("uint8, bytes"),
    [ACTION_RECEIVE_CLUE, clueData as `0x${string}`]
  )

  runtime.log("Sending clue report to proxy...")
  const clueReportResponse = runtime
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
      report: clueReportResponse,
      gasConfig: { gasLimit: config.gasLimit },
    })
    .result()

  runtime.log("Clue delivered successfully!")

  // ── Step 9: Check capture conditions ──
  const totalClues = cluesReceived + 1
  runtime.log(`Clues: ${cluesReceived} on-chain + 1 new = ${totalClues} total (need 3)`)

  if (isCorrectCity && totalClues >= 3) {
    runtime.log(`CAPTURE! Player found Carmen in city ${carmenCity} with ${totalClues} clues.`)

    const captureData = encodeAbiParameters(
      parseAbiParameters("uint256, uint256, bytes32"),
      [missionId, carmenCity, salt]
    )
    const captureReport = encodeAbiParameters(
      parseAbiParameters("uint8, bytes"),
      [ACTION_RESOLVE_CAPTURE, captureData as `0x${string}`]
    )

    const captureReportResponse = runtime
      .report({
        encodedPayload: hexToBase64(captureReport),
        encoderName: "evm",
        signingAlgo: "ecdsa",
        hashingAlgo: "keccak256",
      })
      .result()

    evmClient
      .writeReport(runtime, {
        receiver: config.proxyAddress,
        report: captureReportResponse,
        gasConfig: { gasLimit: config.gasLimit },
      })
      .result()

    runtime.log("Carmen captured! Mission complete!")
  }

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
  const eventHash = keccak256(toBytes("InvestigationSubmitted(uint256,address,uint256)"))

  return [
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.gameMasterAddress)],
        topics: [{ values: [hexToBase64(eventHash)] }],
      }),
      onInvestigationSubmitted
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}

// Export for testing
export { generateAIClue }
