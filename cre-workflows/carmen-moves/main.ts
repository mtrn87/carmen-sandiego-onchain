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
 *  HOW IT WORKS:
 *    1. A CronCapability triggers this handler every 3 minutes
 *    2. The handler checks if the mission is still active (status == 1)
 *    3. If active, it brute-forces the current targetHash to find
 *       Carmen's current city (same technique as mission-start)
 *    4. It picks a new city (different from current) deterministically
 *       based on the salt value
 *    5. Computes a new targetHash = keccak256(newCity, salt)
 *    6. Sends ACTION_UPDATE_TARGET via the proxy to GameMaster.updateTarget()
 *
 *  CRE TRIGGER TYPE:
 *    Unlike mission-start (which uses LogTrigger for events), this
 *    workflow uses CronCapability — a time-based trigger. The cron
 *    expression "0 * /3 * * * *" fires every 3 minutes.
 *    The handler receives a CronPayload (unused) instead of an EVMLog.
 *
 *  CONFIG:
 *    - chainSelectorName: "ethereum-testnet-sepolia"
 *    - gameMasterAddress: GameMaster contract on Sepolia
 *    - proxyAddress: GameMasterProxy (CRE report receiver)
 *    - gasLimit: gas limit for the on-chain write
 *    - activeMissionId: which mission to monitor (set in workflow.yaml)
 *
 *  NOTE:
 *    The activeMissionId is a config value, meaning this workflow
 *    monitors a specific mission. For production, this would need to
 *    iterate over all active missions or use a different trigger
 *    mechanism.
 *
 *  IMPORTANT CONSTRAINTS:
 *    - Same CRE constraints as mission-start: synchronous handler,
 *      @noble/* v1.x only, .result() for blocking reads
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
  activeMissionId: string      // The mission ID to monitor (as string, converted to BigInt)
}

// ============================================================
//  ABI fragments — only the view functions needed for reading
//  game state. No events here since this workflow uses cron,
//  not LogTrigger.
// ============================================================
const GameMasterABI = parseAbi([
  // getMission returns: (player, startBlock, targetHash, cluesReceived, investigationsCount, status)
  "function getMission(uint256) view returns (address,uint256,bytes32,uint8,uint8,uint8)",
  // getMissionSalt returns the VRF-derived random salt (access-controlled to CRE)
  "function getMissionSalt(uint256) view returns (bytes32)",
  // getValidCities returns the array of valid city chain IDs
  "function getValidCities() view returns (uint256[])",
])

// Action code — must match GameMasterProxy.sol constant
// ACTION_UPDATE_TARGET = 3 tells the proxy to call GameMaster.updateTarget()
const ACTION_UPDATE_TARGET = 3

// ============================================================
//  Handler: onCronTrigger
//  Called every 3 minutes by CRE's CronCapability
// ============================================================
const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): Record<string, never> => {
  const config = runtime.config
  const missionId = BigInt(config.activeMissionId)

  // Resolve the Sepolia network for EVM reads/writes
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)

  runtime.log(`Carmen Moves check: mission=${missionId}`)

  // ── Step 1: EVM Read — getMission to check if mission is still active ──
  // Mission status: 0=None, 1=Active, 2=Completed, 3=Failed
  // We only move Carmen if the mission is active (status == 1)
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

  // Early exit if mission is not active (completed, failed, or not started)
  if (status !== 1) {
    runtime.log(`Mission ${missionId} is not active (status=${status}), skipping`)
    return {}
  }

  // ── Step 2: EVM Read — getMissionSalt ──
  // The salt is needed to: (a) brute-force current city, (b) compute new hash
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

  // If salt is zero, VRF callback hasn't arrived yet — mission just started
  if (salt === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    runtime.log("Salt is zero — VRF not yet fulfilled, skipping")
    return {}
  }

  // ── Step 3: EVM Read — getValidCities ──
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

  // ── Step 4: Brute-force current city from targetHash ──
  // Same technique as mission-start: try each city with the salt
  // and compare the resulting hash to targetHash
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
    runtime.log(`ERROR: Could not determine current city from targetHash.`)
    runtime.log(`  targetHash=${targetHash}, salt=${salt}, cities=[${cities.join(",")}]`)
    return {}
  }
  runtime.log(`Current city: ${currentCity}`)

  // ── Step 5: Pick a new city (must be different from current) ──
  // Uses targetHash as entropy source. Since targetHash changes each time
  // Carmen moves, this produces a different selection each cycle — avoiding
  // the predictable pattern that would result from using the static salt.
  const otherCities = cities.filter((c) => c !== currentCity)
  const hashNum = BigInt(targetHash as `0x${string}`)
  const newCityIndex = Number(hashNum % BigInt(otherCities.length))
  const newCity = otherCities[newCityIndex]

  runtime.log(`Carmen moves: ${currentCity} → ${newCity}`)

  // ── Step 6: Compute new targetHash ──
  // The new hash is keccak256(newCityChainId, salt) — same salt, different city
  const newTargetHash = keccak256(
    encodeAbiParameters(parseAbiParameters("uint256, bytes32"), [newCity, salt])
  )
  runtime.log(`New targetHash: ${newTargetHash}`)

  // ── Step 7: EVM Write — send updateTarget via GameMasterProxy ──
  // ACTION_UPDATE_TARGET = 3 tells the proxy to call GameMaster.updateTarget()
  // which updates the mission's targetHash to the new value.
  // The frontend detects this via the CarmenMoved event and alerts the player.
  const updateData = encodeAbiParameters(
    parseAbiParameters("uint256, bytes32"),
    [missionId, newTargetHash]
  )
  const updateReport = encodeAbiParameters(
    parseAbiParameters("uint8, bytes"),
    [ACTION_UPDATE_TARGET, updateData as `0x${string}`]
  )

  // Create DON-signed report and deliver to proxy contract
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
//  Workflow initialization — sets up the cron trigger
// ============================================================

/**
 * initWorkflow configures the CronCapability trigger.
 *
 * Unlike LogTrigger (used in mission-start and generate-briefing),
 * CronCapability fires on a time schedule regardless of on-chain events.
 *
 * Cron format: "second minute hour dayOfMonth month dayOfWeek"
 *   "0 * /3 * * * *" = at second 0 of every 3rd minute
 *
 * The handler receives a CronPayload (which contains schedule metadata)
 * but we don't use it — we read everything from on-chain state.
 */
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
 * Same pattern as all CRE workflows: create Runner, run with initWorkflow.
 */
export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
