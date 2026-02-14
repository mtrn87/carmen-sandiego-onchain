/**
 * ================================================================
 *  CRE Workflow: player-registration
 * ================================================================
 *
 *  PURPOSE:
 *    Listens for the on-chain `RegistrationRequested` event emitted by
 *    PlayerRegistry.sol when a player submits a registration request.
 *    The workflow validates the nickname and registers the player.
 *
 *  FLOW:
 *    1. Decode the RegistrationRequested(player, nickname) event
 *    2. Read on-chain: PlayerRegistry.isNicknameAvailable(nickname)
 *    3. Validate: nickname must be available
 *    4. EVM Write: PlayerRegistry.registerPlayer(player, nickname)
 *       - This emits PlayerRegistered event
 *       - Frontend listens for this event
 *
 *  CONFIG:
 *    - chainId, rpcUrl, playerRegistryAddress, gasLimit
 *
 * ================================================================
 */

import {
  EVMClient,
  handler,
  getNetwork,
  hexToBase64,
  bytesToHex,
  type Runtime,
  type EVMLog,
} from "@chainlink/cre-sdk"
import {
  encodeFunctionData,
  decodeFunctionResult,
  decodeEventLog,
  parseAbi,
  toHex,
} from "viem"

const PLAYER_REGISTRY_ABI = parseAbi([
  "function isNicknameAvailable(string nickname) view returns (bool)",
  "function registerPlayer(address playerAddress, string nickname)",
  "event RegistrationRequested(address indexed player, string nickname)",
  "event PlayerRegistered(address indexed player, string nickname, uint256 timestamp)",
])

interface Config {
  chainId: number
  rpcUrl: string
  playerRegistryAddress: string
  gasLimit: number
}

const onRegistrationRequested = (runtime: Runtime<Config>, log: EVMLog): Record<string, never> => {
  const config = runtime.config

  runtime.log("=== PlayerRegistrationWorkflow Started ===")
  runtime.log(`Chain ID: ${config.chainId}`)
  runtime.log(`PlayerRegistry: ${config.playerRegistryAddress}`)

  try {
    const network = getNetwork({
      chainFamily: "evm",
      chainId: config.chainId,
    })
    if (!network) throw new Error(`Network not found: ${config.chainId}`)

    const evmClient = new EVMClient(network.chainSelector.selector)

    // Decode the trigger event
    const topics = log.topics.map((t: any) => bytesToHex(t)) as [`0x${string}`, ...`0x${string}`[]]
    const data = bytesToHex(log.data)

    runtime.log("Decoding RegistrationRequested event...")
    const decoded = decodeEventLog({
      abi: PLAYER_REGISTRY_ABI,
      data,
      topics,
    })

    if (decoded.eventName !== "RegistrationRequested") {
      throw new Error(`Unexpected event: ${decoded.eventName}`)
    }

    const { player, nickname } = decoded.args as { player: string; nickname: string }
    runtime.log(`Player: ${player}`)
    runtime.log(`Nickname: ${nickname}`)

    // Step 1: Validate nickname availability
    runtime.log("Validating nickname availability...")
    const isAvailableCalldata = encodeFunctionData({
      abi: PLAYER_REGISTRY_ABI,
      functionName: "isNicknameAvailable",
      args: [nickname],
    })

    const isAvailableRaw = evmClient
      .readContract(
        runtime,
        config.playerRegistryAddress,
        isAvailableCalldata
      )
      .result()

    const isAvailable = decodeFunctionResult({
      abi: PLAYER_REGISTRY_ABI,
      functionName: "isNicknameAvailable",
      data: isAvailableRaw,
    }) as boolean

    if (!isAvailable) {
      throw new Error(`Nickname "${nickname}" is not available`)
    }

    runtime.log(`Nickname "${nickname}" is available ✓`)

    // Step 2: Register player
    runtime.log("Registering player...")
    const registerCalldata = encodeFunctionData({
      abi: PLAYER_REGISTRY_ABI,
      functionName: "registerPlayer",
      args: [player, nickname],
    })

    evmClient
      .writeContract(
        runtime,
        config.playerRegistryAddress,
        registerCalldata,
        { gasLimit: config.gasLimit }
      )
      .result()

    runtime.log(`Player registered: ${player}`)
    runtime.log("PlayerRegistered event emitted - Frontend will receive it")

    runtime.log("=== PlayerRegistrationWorkflow Completed Successfully ===")
    return {}
  } catch (error) {
    runtime.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

export const playerRegistrationHandler = handler(onRegistrationRequested)
