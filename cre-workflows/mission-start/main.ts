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
  "function getMissionClues(uint256) view returns ((uint8,bytes32,string,uint256)[])",
  "event InvestigationSubmitted(uint256 indexed missionId, address indexed player, uint256 chainId)",
])

// ============================================================
//  Scenarios (loaded from scenarios.json)
// ============================================================
import scenariosData from "../data/scenarios.json"

type ScenarioClue = { type: number; text: string }
type Scenario = {
  id: string
  clues: { true: ScenarioClue[]; false: ScenarioClue[] }
}

function getScenario(missionId: bigint): Scenario {
  const scenarios = scenariosData.scenarios
  const index = Number(missionId - BigInt(1)) % scenarios.length
  return scenarios[index] as Scenario
}

// Action codes matching GameMasterProxy.sol
const ACTION_RECEIVE_CLUE = 1
const ACTION_RESOLVE_CAPTURE = 2

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

  // --- 1. Decode the InvestigationSubmitted event ---
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

  // --- 2. EVMRead: getMissionSalt ---
  const saltCallData = encodeFunctionData({
    abi: GameMasterABI,
    functionName: "getMissionSalt",
    args: [missionId],
  })
  const saltResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.gameMasterAddress as `0x${string}`,
        data: saltCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()

  const salt = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getMissionSalt",
    data: bytesToHex(saltResult.data),
  })
  runtime.log(`Salt: ${salt}`)

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

  // --- 4. EVMRead: getMission → targetHash + cluesReceived ---
  const missionCallData = encodeFunctionData({
    abi: GameMasterABI,
    functionName: "getMission",
    args: [missionId],
  })
  const missionResultData = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.gameMasterAddress as `0x${string}`,
        data: missionCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()

  const [, , targetHash, cluesReceived, ,] = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getMission",
    data: bytesToHex(missionResultData.data),
  }) as [string, bigint, string, number, number, number]
  runtime.log(`TargetHash: ${targetHash}, cluesReceived: ${cluesReceived}`)

  // --- 5. Brute-force: find Carmen's city ---
  let carmenCity: bigint | undefined
  for (const city of cities) {
    const candidateHash = keccak256(
      encodeAbiParameters(parseAbiParameters("uint256, bytes32"), [city, salt as `0x${string}`])
    )
    if (candidateHash === targetHash) {
      carmenCity = city
      break;
    }
  }

  if (carmenCity === undefined) {
    runtime.log("ERROR: Could not determine Carmen's location from salt + cities")
    return {}
  }
  runtime.log(`Carmen is in city: ${carmenCity}`)

  // --- 6. Decide: true or false clue ---
  const isCorrectCity = investigatedChainId === carmenCity
  runtime.log(`Player investigated ${investigatedChainId}, correct=${isCorrectCity}`)

  // Select clue from scenario data
  const scenario = getScenario(missionId)
  const cluePool = isCorrectCity ? scenario.clues.true : scenario.clues.false
  const clueIndex = Number(cluesReceived) % cluePool.length
  const selectedClue = cluePool[clueIndex]
  const clueText = selectedClue.text
  const clueType = selectedClue.type

  // --- 7. Compute contentHash ---
  const contentHash = keccak256(toBytes(clueText))

  // --- 8. writeReport → proxy → GameMaster.receiveClue() ---
  const clueData = encodeAbiParameters(
    parseAbiParameters("uint256, uint8, bytes32, string"),
    [missionId, clueType, contentHash as `0x${string}`, clueText]
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

  // --- 9. If correct city + enough clues → resolve capture ---
  const totalClues = cluesReceived + 1 // including the one we just sent
  if (isCorrectCity && totalClues >= 3) {
    runtime.log("Capture conditions met! Resolving capture...")

    const captureData = encodeAbiParameters(
      parseAbiParameters("uint256, uint256, bytes32"),
      [missionId, carmenCity, salt as `0x${string}`]
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

  // Listen for InvestigationSubmitted events from GameMaster
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
