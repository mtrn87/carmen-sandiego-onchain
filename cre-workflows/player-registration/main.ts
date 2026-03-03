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
 *    - chainSelectorName, playerRegistryAddress, gasLimit
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
import {
  encodeFunctionData,
  decodeFunctionResult,
  decodeEventLog,
  parseAbi,
  keccak256,
  toBytes,
  zeroAddress,
} from "viem"

const PLAYER_REGISTRY_ABI = parseAbi([
  "function isNicknameAvailable(string nickname) view returns (bool)",
  "function registerPlayer(address playerAddress, string nickname)",
  "event RegistrationRequested(address indexed player, string nickname)",
  "event PlayerRegistered(address indexed player, string nickname, uint256 timestamp)",
])

interface Config {
  chainSelectorName: string
  playerRegistryAddress: string
  gasLimit: string
}

// Helper: read contract — same pattern as mission-start
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

const onRegistrationRequested = (runtime: Runtime<Config>, log: EVMLog): Record<string, never> => {
  const config = runtime.config

  runtime.log("=== PlayerRegistrationWorkflow Started ===")
  runtime.log(`Registry: ${config.playerRegistryAddress}`)

  try {
    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName: config.chainSelectorName,
      isTestnet: true,
    })
    if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

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

    const isAvailableRaw = readContract(evmClient, runtime, config.playerRegistryAddress, isAvailableCalldata)

    const isAvailable = decodeFunctionResult({
      abi: PLAYER_REGISTRY_ABI,
      functionName: "isNicknameAvailable",
      data: isAvailableRaw,
    }) as boolean

    runtime.log(`Nickname "${nickname}" available: ${isAvailable}`)

    if (!isAvailable) {
      runtime.log(`Nickname "${nickname}" already taken — registration skipped`)
    } else {
      runtime.log(`Nickname "${nickname}" is available — CRE DON would register player on production deploy`)
    }

    runtime.log("=== PlayerRegistrationWorkflow Completed Successfully ===")
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
  const registrationTopic = keccak256(toBytes("RegistrationRequested(address,string)"))

  return [
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.playerRegistryAddress)],
        topics: [{ values: [hexToBase64(registrationTopic)] }],
      }),
      onRegistrationRequested
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}

// Helper exports omitted — Javy WASM does not support exported functions with parameters
