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

// ============================================================
//  Config
// ============================================================
type Config = {
  chainSelectorName: string
  gameMasterAddress: string
  proxyAddress: string
  gasLimit: string
}

// ============================================================
//  ABI
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
}

function getScenario(missionId: bigint): ScenarioData {
  const scenarios = scenariosData.scenarios
  const index = Number(missionId - BigInt(1)) % scenarios.length
  return scenarios[index] as ScenarioData
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

  // --- 1. Decode the MissionStarted event ---
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

  // --- 2. EVMRead: getPlayerPublicKey ---
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

  const publicKey = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getPlayerPublicKey",
    data: bytesToHex(pubKeyResult.data),
  })
  runtime.log(`Player public key: ${(publicKey as string).slice(0, 20)}...`)

  // --- 3. EVMRead: getValidCities ---
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

  // --- 4. Select scenario based on missionId ---
  const scenario = getScenario(missionId)
  runtime.log(`Scenario: "${scenario.title}"`)

  // --- 5. Build briefing ---
  const cityNames = cities
    .map((c) => {
      const cityInfo = scenario.cities[c.toString()]
      return cityInfo ? `${cityInfo.name} ${cityInfo.emoji}` : `Chain ${c}`
    })
    .join(", ")

  const briefingText = [
    `=== ACME DETECTIVE AGENCY ===`,
    `Mission #${missionId}: ${scenario.title}`,
    ``,
    scenario.briefing,
    ``,
    `Possible locations: ${cityNames}`,
    ``,
    `Collect clues, investigate cities, and capture Carmen Sandiego!`,
    `Your ECIES public key is registered — encrypted clues will be sent directly to you.`,
  ].join("\n")

  runtime.log(`Briefing generated (${briefingText.length} chars)`)
  runtime.log(`--- BRIEFING START ---`)
  runtime.log(briefingText)
  runtime.log(`--- BRIEFING END ---`)

  // NOTE: In production, this would:
  // 1. Call Gemini API to generate a dynamic briefing
  // 2. Encrypt the briefing with the player's ECIES public key
  // 3. Upload encrypted briefing to IPFS
  // 4. Deliver IPFS CID to the player via an on-chain event or direct message
  // For MVP, the briefing is logged and the frontend reads it from scenario data

  return {}
}

// ============================================================
//  Workflow init
// ============================================================
const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)

  // Listen for MissionStarted events from GameMaster
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
