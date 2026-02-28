/**
 * ================================================================
 *  CRE Workflow: player-check
 *  CHAINLINK SERVICE: CRE / Keystone (Decentralized Oracle Network)
 * ================================================================
 *
 *  PURPOSE:
 *    Listens for the on-chain `PlayerCheckRequested` event and reads
 *    player data from the PlayerRegistry contract. The workflow then
 *    sends the result back on-chain via a signed CRE callback, allowing
 *    the frontend to verify player status without a centralized API.
 *
 *  CHAINLINK CRE INTEGRATION:
 *    This workflow demonstrates CRE's "read-and-callback" pattern:
 *    an on-chain event triggers off-chain computation in the DON,
 *    which reads contract state and delivers a signed result back
 *    to the blockchain. This replaces the traditional pattern of
 *    a centralized backend querying a database.
 *
 *    WHY DECENTRALIZED:
 *    - Player verification runs inside the Chainlink DON. No
 *      centralized server can fake player existence or rank.
 *    - The signed callback ensures only the authorized CRE workflow
 *      can report player check results to the contract.
 *    - This pattern can be extended to any "query-and-respond"
 *      use case where trustless off-chain reads are needed.
 *
 *  DATA FLOW:
 *    1. Frontend triggers a player check (e.g., on page load)
 *    2. PlayerRegistry emits PlayerCheckRequested(player)
 *    3. CRE DON detects the event via LogTrigger capability
 *    4. DON nodes execute this WASM workflow:
 *       a. Decode PlayerCheckRequested(player)
 *       b. Read getPlayer(player) from PlayerRegistry
 *       c. Extract: exists, nickname, rank
 *       d. Call recordCheckResult(player, exists, nickname, rank)
 *    5. DON consensus produces a signed Keystone report
 *    6. Report delivered to PlayerRegistry via writeReport()
 *
 *  CHAINLINK SERVICES USED:
 *    - CRE/Keystone: WASM execution, LogTrigger, consensus, signed reports
 *    - EVMClient: Reads player data, writes check result
 *
 * ================================================================
 */

import {
  EVMClient,
  handler,
  getNetwork,
  hexToBase64,
  bytesToHex,
  Runner,
  type Runtime,
  type EVMLog,
} from "@chainlink/cre-sdk"
import { encodeFunctionData, decodeFunctionResult, decodeEventLog, parseAbi } from "viem"

const PLAYER_REGISTRY_ABI = parseAbi([
  "function getPlayer(address player) view returns (tuple(address wallet, string nickname, uint256 rank, uint256 missionsCompleted, uint256 missionsAttempted, uint256 totalReward, uint256 totalCluesCollected, uint256 totalInvestigations, uint256 registeredAt, bool isActive))",
  "function recordCheckResult(address player, bool exists, string nickname, uint256 rank)",
  "event PlayerCheckRequested(address indexed player)",
])

interface Config {
  chainSelectorName: string
  playerRegistryAddress: string
  gasLimit: string
}

const onPlayerCheckRequested = (runtime: Runtime<Config>, log: EVMLog): Record<string, never> => {
  const config = runtime.config

  runtime.log("PlayerCheckWorkflow: Started")

  try {
    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName: config.chainSelectorName,
      isTestnet: true,
    })
    if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

    const evmClient = new EVMClient(network.chainSelector.selector)

    // Decode event
    const topics = log.topics.map((t: any) => bytesToHex(t)) as [`0x${string}`, ...`0x${string}`[]]
    const data = bytesToHex(log.data)

    const decoded = decodeEventLog({
      abi: PLAYER_REGISTRY_ABI,
      data,
      topics,
    })

    if (decoded.eventName !== "PlayerCheckRequested") {
      throw new Error(`Unexpected event: ${decoded.eventName}`)
    }

    const { player } = decoded.args as { player: string }
    runtime.log(`Player: ${player}`)

    // Read player data
    const getPlayerCalldata = encodeFunctionData({
      abi: PLAYER_REGISTRY_ABI,
      functionName: "getPlayer",
      args: [player],
    })

    const playerDataRaw = evmClient
      .readContract(runtime, config.playerRegistryAddress, getPlayerCalldata)
      .result()

    const playerData = decodeFunctionResult({
      abi: PLAYER_REGISTRY_ABI,
      functionName: "getPlayer",
      data: playerDataRaw,
    }) as any

    const exists = playerData.wallet !== "0x0000000000000000000000000000000000000000"
    const nickname = playerData.nickname || ""
    const rank = Number(playerData.rank || 0)

    runtime.log(`Exists: ${exists}, Nickname: ${nickname}, Rank: ${rank}`)

    // Send callback
    const callbackCalldata = encodeFunctionData({
      abi: PLAYER_REGISTRY_ABI,
      functionName: "recordCheckResult",
      args: [player, exists, nickname, rank],
    })

    const report = runtime
      .report({
        encodedPayload: hexToBase64(callbackCalldata),
        encoderName: "evm",
        signingAlgo: "ecdsa",
        hashingAlgo: "keccak256",
      })
      .result()

    evmClient
      .writeReport(runtime, {
        receiver: config.playerRegistryAddress,
        report: report,
        gasConfig: { gasLimit: config.gasLimit },
      })
      .result()

    runtime.log("PlayerCheckWorkflow: Completed")
    return {}
  } catch (error) {
    runtime.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)

  return [
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.playerRegistryAddress)],
        topics: [{ values: [hexToBase64("0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925")] }],
      }),
      onPlayerCheckRequested
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
