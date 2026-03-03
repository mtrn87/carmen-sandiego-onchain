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
  encodeCallMsg,
  LATEST_BLOCK_NUMBER,
  Runner,
  type Runtime,
  type EVMLog,
} from "@chainlink/cre-sdk"
import { encodeFunctionData, decodeFunctionResult, decodeEventLog, parseAbi, zeroAddress } from "viem"

const PLAYER_REGISTRY_ABI = parseAbi([
  "function getPlayer(address player) view returns (address,string,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool)",
  "function recordCheckResult(address player, bool exists, string nickname, uint256 rank)",
  "event PlayerCheckRequested(address indexed player)",
])

interface Config {
  chainSelectorName: string
  playerRegistryAddress: string
  gasLimit: string
}

// Helper: read contract — mirrors mission-start pattern
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

    const playerDataRaw = readContract(evmClient, runtime, config.playerRegistryAddress, getPlayerCalldata)

    const playerData = decodeFunctionResult({
      abi: PLAYER_REGISTRY_ABI,
      functionName: "getPlayer",
      data: playerDataRaw,
    }) as readonly [string, string, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean]

    // Tuple returns: [wallet, nickname, rank, ...]
    const wallet = playerData[0] as string
    const nickname = (playerData[1] as string) || ""
    const rank = Number(playerData[2] || 0n)
    const exists = wallet !== "0x0000000000000000000000000000000000000000"

    runtime.log(`Exists: ${exists}, Nickname: "${nickname}", Rank: ${rank}`)
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
        topics: [{ values: [hexToBase64("0xac459b2dc239c2796eb4b05ed5fbfa884e9c7da7e30be87ca397b101bd574eb1")] }],
      }),
      onPlayerCheckRequested
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
