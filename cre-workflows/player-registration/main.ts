/**
 * ================================================================
 *  CRE Workflow: player-registration
 *  CHAINLINK SERVICE: CRE / Keystone (Decentralized Oracle Network)
 * ================================================================
 *
 *  PURPOSE:
 *    Listens for the on-chain `RegistrationRequested` event emitted by
 *    PlayerRegistry.sol when a player submits a registration request.
 *    The workflow validates the nickname and registers the player.
 *
 *  CHAINLINK CRE INTEGRATION:
 *    This workflow enables GASLESS player onboarding. The player signs
 *    a message (zero gas), which is relayed to the PlayerRegistry
 *    contract. The CRE DON validates the nickname, calls registerPlayer(),
 *    and pays the gas — the player never spends a single wei.
 *
 *    WHY DECENTRALIZED:
 *    - Registration validation runs inside the Chainlink DON, not a
 *      centralized server. No single entity controls who can register.
 *    - The DON's threshold signature ensures only validated registrations
 *      are accepted by the PlayerRegistry contract.
 *    - Combined with Chainlink Functions Paymaster for the initial
 *      relay, this creates a fully gasless onboarding experience
 *      that is indistinguishable from a traditional web app.
 *
 *  DATA FLOW:
 *    1. Player signs registration intent (nickname + wallet address)
 *    2. Chainlink Functions Paymaster relays the signed message on-chain
 *    3. PlayerRegistry emits RegistrationRequested event
 *    4. CRE DON detects the event via LogTrigger capability
 *    5. DON nodes execute this WASM workflow:
 *       a. Decode RegistrationRequested(player, nickname)
 *       b. Read isNicknameAvailable(nickname) from PlayerRegistry
 *       c. If available, call registerPlayer(player, nickname)
 *    6. PlayerRegistry emits PlayerRegistered event
 *    7. Frontend detects PlayerRegistered and updates UI
 *
 *  CHAINLINK SERVICES USED:
 *    - CRE/Keystone: WASM execution, LogTrigger, consensus
 *    - EVMClient: Reads nickname availability, writes registration
 *    - Chainlink Functions: Paymaster relay for initial gasless TX
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
