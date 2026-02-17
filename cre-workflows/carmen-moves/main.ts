/**
 * ================================================================
 *  CRE Workflow: carmen-moves
 * ================================================================
 *
 *  PURPOSE:
 *    Runs on a cron schedule (every 3 minutes) to periodically move
 *    Carmen Sandiego to a different city. This creates time pressure
 *    for the player — if they take too long investigating, Carmen
 *    relocates and previous clues become less useful.
 *
 *  MULTI-MISSION SUPPORT:
 *    Calls getActiveMissionIds() on-chain to get only currently active
 *    mission IDs in a single read. This allows multiple players to have
 *    concurrent missions with independent Carmen movement — no hardcoded
 *    mission IDs, no wasted reads on completed/failed missions.
 *
 *  HOW IT WORKS:
 *    1. CronCapability triggers this handler every 3 minutes
 *    2. Read getActiveMissionIds() — returns only active mission IDs
 *    3. Read getValidCities once (shared across all missions)
 *    4. For each active mission ID:
 *       a. Read getMission — get targetHash
 *       b. Read getMissionSalt — skip if zero (VRF pending)
 *       c. Brute-force targetHash to find Carmen's current city
 *       d. Pick a new city (different from current) deterministically
 *       e. Compute newTargetHash = keccak256(newCity, salt)
 *       f. Send ACTION_UPDATE_TARGET via proxy → GameMaster.updateTarget()
 *    5. Log summary of moves executed
 *
 *  CONFIG:
 *    - chainSelectorName: "ethereum-testnet-sepolia"
 *    - gameMasterAddress: GameMaster contract on Sepolia
 *    - proxyAddress: GameMasterProxy (CRE report receiver)
 *    - gasLimit: gas limit for each on-chain write
 *
 *  IMPORTANT CONSTRAINTS:
 *    - Synchronous handler (no async/await)
 *    - .result() for blocking EVM reads/writes
 * ================================================================
 */

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
//  Config — populated from workflow.yaml target settings
// ============================================================
type Config = {
  chainSelectorName: string   // e.g. "ethereum-testnet-sepolia"
  gameMasterAddress: string    // GameMaster.sol deployment address
  proxyAddress: string         // GameMasterProxy.sol (CRE report receiver)
  gasLimit: string             // Gas limit for writeReport transactions
}

// ============================================================
//  ABI fragments — view functions for reading game state
// ============================================================
const GameMasterABI = parseAbi([
  // getActiveMissionIds returns only currently active mission IDs
  "function getActiveMissionIds() view returns (uint256[])",
  // getMission returns: (player, startBlock, targetHash, cluesReceived, investigationsCount, status)
  "function getMission(uint256) view returns (address,uint256,bytes32,uint8,uint8,uint8)",
  // getMissionSalt returns the VRF-derived random salt
  "function getMissionSalt(uint256) view returns (bytes32)",
  // getValidCities returns the array of valid city chain IDs
  "function getValidCities() view returns (uint256[])",
])

// Action code — must match GameMasterProxy.sol constant
const ACTION_UPDATE_TARGET = 3

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
//  Core: move Carmen for a single active mission
//  Returns true if Carmen was moved, false if skipped
// ============================================================
function moveCarmenForMission(
  runtime: Runtime<Config>,
  evmClient: EVMClient,
  missionId: bigint,
  targetHash: string,
  salt: `0x${string}`,
  cities: bigint[],
): boolean {
  const config = runtime.config

  // Brute-force current city from targetHash
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
    runtime.log(`  [${missionId}] ERROR: cannot determine current city (targetHash=${targetHash})`)
    return false
  }

  // Pick a new city (must be different from current)
  // Uses targetHash as entropy — changes each move, producing different selections
  const otherCities = cities.filter((c) => c !== currentCity)
  if (otherCities.length === 0) {
    runtime.log(`  [${missionId}] ERROR: no other cities to move to`)
    return false
  }
  const hashNum = BigInt(targetHash as `0x${string}`)
  const newCityIndex = Number(hashNum % BigInt(otherCities.length))
  const newCity = otherCities[newCityIndex]

  // Compute new targetHash = keccak256(newCity, salt) — same salt, new city
  const newTargetHash = keccak256(
    encodeAbiParameters(parseAbiParameters("uint256, bytes32"), [newCity, salt])
  )

  // Send updateTarget report via GameMasterProxy
  const updateData = encodeAbiParameters(
    parseAbiParameters("uint256, bytes32"),
    [missionId, newTargetHash]
  )
  const updateReport = encodeAbiParameters(
    parseAbiParameters("uint8, bytes"),
    [ACTION_UPDATE_TARGET, updateData as `0x${string}`]
  )

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

  runtime.log(`  [${missionId}] Carmen moved: ${currentCity} -> ${newCity}`)
  return true
}

// ============================================================
//  Handler: onCronTrigger
//  Called every 3 minutes by CRE's CronCapability
// ============================================================
const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): Record<string, never> => {
  const config = runtime.config

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)
  const gm = config.gameMasterAddress

  runtime.log("=== Carmen Moves — Cron Trigger ===")

  // ── Step 1: Read active mission IDs (single on-chain call) ──
  const activeIdsData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI,
    functionName: "getActiveMissionIds",
  }))
  const activeMissionIds = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getActiveMissionIds",
    data: bytesToHex(activeIdsData),
  }) as bigint[]

  runtime.log(`Active missions: [${activeMissionIds.join(", ")}] (${activeMissionIds.length} total)`)

  if (activeMissionIds.length === 0) {
    runtime.log("No active missions, nothing to do")
    return {}
  }

  // ── Step 2: Read valid cities once (shared across all missions) ──
  const citiesData = readContract(evmClient, runtime, gm, encodeFunctionData({
    abi: GameMasterABI,
    functionName: "getValidCities",
  }))
  const cities = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getValidCities",
    data: bytesToHex(citiesData),
  }) as bigint[]

  runtime.log(`Cities: [${cities.join(", ")}]`)

  // ── Step 3: Move Carmen for each active mission ──
  let movedCount = 0

  for (const missionId of activeMissionIds) {
    // Read mission state (targetHash)
    const missionData = readContract(evmClient, runtime, gm, encodeFunctionData({
      abi: GameMasterABI,
      functionName: "getMission",
      args: [missionId],
    }))
    const [, , targetHash] = decodeFunctionResult({
      abi: GameMasterABI,
      functionName: "getMission",
      data: bytesToHex(missionData),
    }) as [string, bigint, string, number, number, number]

    // Read salt for this mission
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

    // Skip if VRF not yet fulfilled
    if (salt === ZERO_HASH) {
      runtime.log(`  [${missionId}] VRF pending, skipping`)
      continue
    }

    // Move Carmen for this mission
    const moved = moveCarmenForMission(runtime, evmClient, missionId, targetHash, salt, cities)
    if (moved) movedCount++
  }

  runtime.log(`=== Done: ${activeMissionIds.length} active, ${movedCount} moved ===`)
  return {}
}

// ============================================================
//  Workflow initialization — sets up the cron trigger
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

/**
 * Entry point — CRE calls main() when the workflow is deployed.
 */
export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
