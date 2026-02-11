import {
  CronCapability,
  EVMClient,
  handler,
  Runner,
  getNetwork,
  hexToBase64,
  bytesToHex,
  encodeCallMsg,
  LATEST_BLOCK_NUMBER,
  type Runtime,
  type CronPayload,
} from "@chainlink/cre-sdk"
import {
  keccak256,
  encodeFunctionData,
  decodeFunctionResult,
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
  activeMissionId: string
}

// ============================================================
//  ABI
// ============================================================
const GameMasterABI = parseAbi([
  "function getMission(uint256) view returns (address,uint256,bytes32,uint8,uint8,uint8)",
  "function getMissionSalt(uint256) view returns (bytes32)",
  "function getValidCities() view returns (uint256[])",
])

// Action codes matching GameMasterProxy.sol
const ACTION_UPDATE_TARGET = 3

// ============================================================
//  Handler: onCronTrigger — Move Carmen every 3 minutes
// ============================================================
const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): Record<string, never> => {
  const config = runtime.config
  const missionId = BigInt(config.activeMissionId)

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)

  runtime.log(`Carmen Moves check: mission=${missionId}`)

  // --- 1. EVMRead: getMission → check if mission is still active ---
  const missionCallData = encodeFunctionData({
    abi: GameMasterABI,
    functionName: "getMission",
    args: [missionId],
  })
  const missionResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.gameMasterAddress as `0x${string}`,
        data: missionCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()

  const [, , targetHash, , , status] = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getMission",
    data: bytesToHex(missionResult.data),
  }) as [string, bigint, string, number, number, number]

  // Status 1 = Active, anything else = skip
  if (status !== 1) {
    runtime.log(`Mission ${missionId} is not active (status=${status}), skipping`)
    return {}
  }

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
  }) as `0x${string}`

  if (salt === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    runtime.log("Salt is zero — VRF not yet fulfilled, skipping")
    return {}
  }

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

  // --- 4. Find current city (brute-force from targetHash) ---
  let currentCity: bigint | undefined
  for (const city of cities) {
    const candidateHash = keccak256(
      encodeAbiParameters(parseAbiParameters("uint256, bytes32"), [city, salt])
    )
    if (candidateHash === targetHash) {
      currentCity = city
      break
    }
  }

  if (currentCity === undefined) {
    runtime.log("ERROR: Could not determine current city from targetHash")
    return {}
  }
  runtime.log(`Current city: ${currentCity}`)

  // --- 5. Pick a new city (different from current) ---
  const otherCities = cities.filter((c) => c !== currentCity)
  // Deterministic selection based on missionId + salt to avoid same city each time
  const saltNum = BigInt(salt)
  const newCityIndex = Number(saltNum % BigInt(otherCities.length))
  const newCity = otherCities[newCityIndex]

  runtime.log(`Carmen moves: ${currentCity} → ${newCity}`)

  // --- 6. Compute new targetHash ---
  const newTargetHash = keccak256(
    encodeAbiParameters(parseAbiParameters("uint256, bytes32"), [newCity, salt])
  )
  runtime.log(`New targetHash: ${newTargetHash}`)

  // --- 7. writeReport → proxy → GameMaster.updateTarget() ---
  const updateData = encodeAbiParameters(
    parseAbiParameters("uint256, bytes32"),
    [missionId, newTargetHash]
  )
  const updateReport = encodeAbiParameters(
    parseAbiParameters("uint8, bytes"),
    [ACTION_UPDATE_TARGET, updateData as `0x${string}`]
  )

  runtime.log("Sending updateTarget report to proxy...")
  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(updateReport),
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

  runtime.log(`Carmen moved successfully! ${currentCity} → ${newCity}`)

  return {}
}

// ============================================================
//  Workflow init
// ============================================================
const initWorkflow = (config: Config) => {
  const cron = new CronCapability()

  return [
    handler(
      cron.trigger({ schedule: "0 */3 * * * *" }), // Every 3 minutes
      onCronTrigger
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
