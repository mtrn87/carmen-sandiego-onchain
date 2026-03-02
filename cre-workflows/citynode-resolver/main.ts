/**
 * ================================================================
 *  CRE Workflow: citynode-resolver
 *  CHAINLINK SERVICE: CRE / Keystone (Decentralized Oracle Network)
 * ================================================================
 *
 *  PURPOSE:
 *    Listens for on-chain events emitted by CityNode contracts on
 *    remote chains (Arbitrum Sepolia, Base Sepolia, XDC Apothem) and
 *    resolves them by calling the corresponding GameMaster functions
 *    on Ethereum Sepolia via GameMasterProxy.
 *
 *    Events monitored:
 *    - ClueRequested      → resolveClueOnCity()   (action 7)
 *    - DossierRequested   → resolveDossierOnCity() (action 8)
 *    - CaptureRequested   → resolveCaptureOnCity() (action 9)
 *
 *  DATA FLOW:
 *    1. Player calls requestClue() on CityNode (Arbitrum/Base/XDC)
 *    2. CityNode emits ClueRequested event
 *    3. CRE DON detects the event via LogTrigger capability
 *    4. DON nodes execute this WASM workflow:
 *       a. Decode the request event
 *       b. Read on-chain state from GameMaster (mission salt, cities)
 *       c. Generate resolution data (clue type, strength, hashes)
 *       d. Call resolve*OnCity() on GameMaster via proxy action 7/8/9
 *    5. GameMaster.resolveClueOnCity() calls CityNode.resolveClue()
 *    6. CityNode emits ClueUnlocked event → frontend picks it up
 *
 *  IMPORTANT CONSTRAINTS:
 *    - Handler must be synchronous (no async/await inside the handler)
 *    - All EVM reads use .result() which blocks synchronously in CRE
 *    - @noble/* libs MUST stay on v1.x (v2.x breaks CRE WASM compilation)
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

// ============================================================
//  Config — populated from workflow.yaml target settings
// ============================================================
type Config = {
  chainSelectorName: string
  gameMasterAddress: string
  proxyAddress: string
  gasLimit: string
}

// ============================================================
//  ABI fragments
// ============================================================
const GameMasterABI = parseAbi([
  "function getMission(uint256) view returns (address,uint256,bytes32,uint8,uint8,uint8)",
  "function getMissionSalt(uint256) view returns (bytes32)",
  "function getValidCities() view returns (uint256[])",
  "function getPlayerPublicKey(address) view returns (bytes)",
  "function getMissionClues(uint256) view returns ((uint8,bytes32,string,uint256,uint8)[])",
  "function getPlayerActiveMission(address) view returns (uint256)",
])

const CityNodeABI = parseAbi([
  "event ClueRequested(uint256 indexed requestId, address indexed player, uint8 idx, uint8 clueIndex)",
  "event DossierRequested(uint256 indexed requestId, address indexed player, uint256 cityId)",
  "event CaptureRequested(uint256 indexed requestId, address indexed player, address suspectWallet, bytes32 evidenceBundleHash)",
])

// GameMasterProxy action codes (match GameMasterProxy._processReport)
const ACTION_RESOLVE_CLUE_ON_CITY = 7
const ACTION_RESOLVE_DOSSIER_ON_CITY = 8
const ACTION_RESOLVE_CAPTURE_ON_CITY = 9
const ACTION_TRACK_PLAYER_CLUE = 10

// ============================================================
//  Scenario data (imported at build time)
// ============================================================
import scenariosData from "../data/scenarios.json"
const scenarios = scenariosData.scenarios

// ============================================================
//  Helpers
// ============================================================

function getScenario(missionId: number) {
  if (!scenarios.length) return null
  const idx = (missionId - 1) % scenarios.length
  return scenarios[idx]
}

function calculateStrength(salt: string, missionId: number, isCorrectCity: boolean): number {
  const hash = keccak256(toBytes(`${salt}-${missionId}-strength`))
  const raw = parseInt(hash.slice(2, 10), 16)
  if (isCorrectCity) return 40 + (raw % 56) // 40–95
  return 20 + (raw % 36) // 20–55
}

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
//  Event handler
// ============================================================

const onCityNodeEvent = (runtime: Runtime<Config>, log: EVMLog): Record<string, never> => {
  const config = runtime.config

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)
  const gm = config.gameMasterAddress

  // Determine event type from topic0
  const topics = log.topics.map((t) => bytesToHex(t)) as [`0x${string}`, ...`0x${string}`[]]
  const topic0 = topics[0]
  const data = bytesToHex(log.data)
  const cityNodeAddress = bytesToHex(log.address)

  const clueRequestedTopic = keccak256(toBytes("ClueRequested(uint256,address,uint8,uint8)"))
  const dossierRequestedTopic = keccak256(toBytes("DossierRequested(uint256,address,uint256)"))
  const captureRequestedTopic = keccak256(toBytes("CaptureRequested(uint256,address,address,bytes32)"))

  if (topic0 === clueRequestedTopic) {
    handleClueRequested(runtime, evmClient, config, gm, cityNodeAddress, topics, data)
  } else if (topic0 === dossierRequestedTopic) {
    handleDossierRequested(runtime, evmClient, config, gm, cityNodeAddress, topics, data)
  } else if (topic0 === captureRequestedTopic) {
    handleCaptureRequested(runtime, evmClient, config, gm, cityNodeAddress, topics, data)
  } else {
    runtime.log(`Unknown event topic: ${topic0}, skipping.`)
  }

  return {}
}

// ── ClueRequested handler ──
function handleClueRequested(
  runtime: Runtime<Config>,
  evmClient: EVMClient,
  config: Config,
  gm: string,
  cityNodeAddress: string,
  topics: [`0x${string}`, ...`0x${string}`[]],
  data: string,
) {
  const decoded = decodeEventLog({
    abi: CityNodeABI,
    data: data as `0x${string}`,
    topics,
  })
  const { requestId, player, idx, clueIndex } = decoded.args as {
    requestId: bigint; player: string; idx: number; clueIndex: number
  }

  // Lookup missionId from player's active mission
  const missionIdData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI, functionName: "getPlayerActiveMission", args: [player as `0x${string}`],
  }))
  const missionId = decodeFunctionResult({
    abi: GameMasterABI, functionName: "getPlayerActiveMission", data: bytesToHex(missionIdData),
  }) as bigint
  const mid = Number(missionId)

  runtime.log(`ClueRequested: mission=${mid}, requestId=${requestId}, player=${player.slice(0, 10)}..., loc=${idx}, clue=${clueIndex}`)

  if (mid === 0) {
    runtime.log(`Player ${player.slice(0, 10)}... has no active mission, skipping.`)
    return
  }

  // Read mission status
  const missionData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI, functionName: "getMission", args: [missionId],
  }))
  const [, , targetHash, status] = decodeFunctionResult({
    abi: GameMasterABI, functionName: "getMission", data: bytesToHex(missionData),
  }) as [string, bigint, string, number, number, number]

  if (status !== 1) {
    runtime.log(`Mission ${mid} not active (status=${status}), skipping.`)
    return
  }

  // Read salt
  const saltData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI, functionName: "getMissionSalt", args: [missionId],
  }))
  const salt = decodeFunctionResult({
    abi: GameMasterABI, functionName: "getMissionSalt", data: bytesToHex(saltData),
  }) as string

  // Determine if CityNode is on Carmen's chain
  const citiesData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI, functionName: "getValidCities",
  }))
  const validCities = decodeFunctionResult({
    abi: GameMasterABI, functionName: "getValidCities", data: bytesToHex(citiesData),
  }) as bigint[]

  let isCorrectCity = false
  for (const cityChainId of validCities) {
    const candidateHash = keccak256(
      encodeAbiParameters(parseAbiParameters("uint256,bytes32"), [cityChainId, salt as `0x${string}`])
    )
    if (candidateHash === targetHash) {
      isCorrectCity = true
      break
    }
  }

  // Generate clue resolution data
  const strength = calculateStrength(salt, mid, isCorrectCity)
  const scenario = getScenario(mid)
  const cluePool = scenario
    ? (isCorrectCity ? scenario.clues.true : scenario.clues.false)
    : []
  const clueHash = keccak256(toBytes(`${salt}-${mid}-clue-${idx}-${clueIndex}`))
  const clueType = cluePool.length > 0
    ? cluePool[parseInt(clueHash.slice(2, 10), 16) % cluePool.length].type
    : 0
  const clueDataHash = keccak256(toBytes(`${salt}-cluedata-${mid}-${idx}-${clueIndex}`))
  const anomalyRefId = keccak256(toBytes(`${salt}-anomaly-${mid}-${idx}`))

  // Build proxy payload: resolveClueOnCity(address cityNode, uint256 requestId, uint8 clueType, bytes32 clueDataHash, bytes32 anomalyRefId)
  const innerData = encodeAbiParameters(
    parseAbiParameters("address, uint256, uint8, bytes32, bytes32"),
    [
      cityNodeAddress as `0x${string}`,
      requestId,
      clueType,
      clueDataHash as `0x${string}`,
      anomalyRefId as `0x${string}`,
    ]
  )
  const reportPayload = encodeAbiParameters(
    parseAbiParameters("uint8, bytes"),
    [ACTION_RESOLVE_CLUE_ON_CITY, innerData as `0x${string}`]
  )

  // Send resolveClueOnCity report
  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportPayload),
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

  // Send trackPlayerClue report (action 10) for global progress tracking
  const cityNodeId = keccak256(toBytes(cityNodeAddress))
  const identityCommitHash = clueType === 2 ? clueDataHash : "0x0000000000000000000000000000000000000000000000000000000000000000"
  const trackData = encodeAbiParameters(
    parseAbiParameters("address, bytes32, bytes32"),
    [
      player as `0x${string}`,
      cityNodeId as `0x${string}`,
      identityCommitHash as `0x${string}`,
    ]
  )
  const trackPayload = encodeAbiParameters(
    parseAbiParameters("uint8, bytes"),
    [ACTION_TRACK_PLAYER_CLUE, trackData as `0x${string}`]
  )

  const trackReportResponse = runtime
    .report({
      encodedPayload: hexToBase64(trackPayload),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result()

  evmClient
    .writeReport(runtime, {
      receiver: config.proxyAddress,
      report: trackReportResponse,
      gasConfig: { gasLimit: config.gasLimit },
    })
    .result()

  runtime.log(`Clue resolved: mission=${mid}, type=${clueType}, correct=${isCorrectCity}, strength=${strength}, tracked=true`)
}

// ── DossierRequested handler ──
function handleDossierRequested(
  runtime: Runtime<Config>,
  evmClient: EVMClient,
  config: Config,
  gm: string,
  cityNodeAddress: string,
  topics: [`0x${string}`, ...`0x${string}`[]],
  data: string,
) {
  const decoded = decodeEventLog({
    abi: CityNodeABI,
    data: data as `0x${string}`,
    topics,
  })
  const { requestId, player, cityId } = decoded.args as {
    requestId: bigint; player: string; cityId: bigint
  }

  // Lookup missionId from player's active mission
  const missionIdData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI, functionName: "getPlayerActiveMission", args: [player as `0x${string}`],
  }))
  const missionId = decodeFunctionResult({
    abi: GameMasterABI, functionName: "getPlayerActiveMission", data: bytesToHex(missionIdData),
  }) as bigint
  const mid = Number(missionId)

  runtime.log(`DossierRequested: mission=${mid}, requestId=${requestId}, cityId=${cityId}`)

  if (mid === 0) {
    runtime.log(`Player ${player.slice(0, 10)}... has no active mission, skipping.`)
    return
  }

  // Read salt for deterministic confidence
  const saltData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI, functionName: "getMissionSalt", args: [missionId],
  }))
  const salt = decodeFunctionResult({
    abi: GameMasterABI, functionName: "getMissionSalt", data: bytesToHex(saltData),
  }) as string

  // Deterministic confidence from salt + cityId
  const confHash = keccak256(toBytes(`${salt}-dossier-${cityId}`))
  const confidence = 30 + (parseInt(confHash.slice(2, 10), 16) % 61) // 30–90

  const dossierHash = keccak256(toBytes(`${salt}-dossier-content-${mid}-${cityId}`))
  const nextObjectiveHintHash = keccak256(toBytes(`${salt}-next-objective-${mid}`))

  // Build proxy payload: resolveDossierOnCity(address cityNode, uint256 requestId, bytes32 dossierHash, uint8 confidence, bytes32 nextObjectiveHintHash)
  const innerData = encodeAbiParameters(
    parseAbiParameters("address, uint256, bytes32, uint8, bytes32"),
    [
      cityNodeAddress as `0x${string}`,
      requestId,
      dossierHash as `0x${string}`,
      confidence,
      nextObjectiveHintHash as `0x${string}`,
    ]
  )
  const reportPayload = encodeAbiParameters(
    parseAbiParameters("uint8, bytes"),
    [ACTION_RESOLVE_DOSSIER_ON_CITY, innerData as `0x${string}`]
  )

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportPayload),
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

  runtime.log(`Dossier resolved: mission=${mid}, confidence=${confidence}`)
}

// ── CaptureRequested handler ──
function handleCaptureRequested(
  runtime: Runtime<Config>,
  evmClient: EVMClient,
  config: Config,
  gm: string,
  cityNodeAddress: string,
  topics: [`0x${string}`, ...`0x${string}`[]],
  data: string,
) {
  const decoded = decodeEventLog({
    abi: CityNodeABI,
    data: data as `0x${string}`,
    topics,
  })
  const { requestId, player, suspectWallet, evidenceBundleHash } = decoded.args as {
    requestId: bigint; player: string; suspectWallet: string; evidenceBundleHash: string
  }

  // Lookup missionId from player's active mission
  const missionIdData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI, functionName: "getPlayerActiveMission", args: [player as `0x${string}`],
  }))
  const missionId = decodeFunctionResult({
    abi: GameMasterABI, functionName: "getPlayerActiveMission", data: bytesToHex(missionIdData),
  }) as bigint
  const mid = Number(missionId)

  runtime.log(`CaptureRequested: mission=${mid}, requestId=${requestId}, player=${player.slice(0, 10)}...`)

  if (mid === 0) {
    runtime.log(`Player ${player.slice(0, 10)}... has no active mission, skipping.`)
    return
  }

  // Read mission target
  const missionData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI, functionName: "getMission", args: [missionId],
  }))
  const [, , targetHash] = decodeFunctionResult({
    abi: GameMasterABI, functionName: "getMission", data: bytesToHex(missionData),
  }) as [string, bigint, string, number, number, number]

  // Read salt
  const saltData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI, functionName: "getMissionSalt", args: [missionId],
  }))
  const salt = decodeFunctionResult({
    abi: GameMasterABI, functionName: "getMissionSalt", data: bytesToHex(saltData),
  }) as string

  // Read valid cities and check if CityNode chain matches Carmen's location
  const citiesData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI, functionName: "getValidCities",
  }))
  const validCities = decodeFunctionResult({
    abi: GameMasterABI, functionName: "getValidCities", data: bytesToHex(citiesData),
  }) as bigint[]

  let captureSuccess = false
  for (const cityChainId of validCities) {
    const candidateHash = keccak256(
      encodeAbiParameters(parseAbiParameters("uint256,bytes32"), [cityChainId, salt as `0x${string}`])
    )
    if (candidateHash === targetHash) {
      captureSuccess = true
      break
    }
  }

  // CaptureReasonCode: 0=OK, 3=WRONG_CITY
  const reasonCode = captureSuccess ? 0 : 3
  const gmNoteHash = keccak256(toBytes(
    captureSuccess
      ? `${salt}-capture-success-${mid}`
      : `${salt}-capture-wrong-city-${mid}`
  ))

  // Build proxy payload: resolveCaptureOnCity(address cityNode, uint256 requestId, bool success, uint8 reasonCode, bytes32 gmNoteHash)
  const innerData = encodeAbiParameters(
    parseAbiParameters("address, uint256, bool, uint8, bytes32"),
    [
      cityNodeAddress as `0x${string}`,
      requestId,
      captureSuccess,
      reasonCode,
      gmNoteHash as `0x${string}`,
    ]
  )
  const reportPayload = encodeAbiParameters(
    parseAbiParameters("uint8, bytes"),
    [ACTION_RESOLVE_CAPTURE_ON_CITY, innerData as `0x${string}`]
  )

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportPayload),
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

  runtime.log(`Capture resolved: mission=${mid}, success=${captureSuccess}, reason=${reasonCode}`)
}

// ============================================================
//  Workflow init + Runner
// ============================================================
const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)

  // Listen for all 3 CityNode event types
  const clueRequestedTopic = keccak256(toBytes("ClueRequested(uint256,address,uint8,uint8)"))
  const dossierRequestedTopic = keccak256(toBytes("DossierRequested(uint256,address,uint256)"))
  const captureRequestedTopic = keccak256(toBytes("CaptureRequested(uint256,address,address,bytes32)"))

  return [
    handler(
      evmClient.logTrigger({
        addresses: [], // Listen on all CityNode addresses
        topics: [{
          values: [
            hexToBase64(clueRequestedTopic),
            hexToBase64(dossierRequestedTopic),
            hexToBase64(captureRequestedTopic),
          ],
        }],
      }),
      onCityNodeEvent
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
