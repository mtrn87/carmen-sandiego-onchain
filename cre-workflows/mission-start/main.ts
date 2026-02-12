/**
 * ================================================================
 *  CRE Workflow: mission-start
 * ================================================================
 *
 *  PURPOSE:
 *    Listens for the on-chain `InvestigationSubmitted` event emitted by
 *    GameMaster.sol whenever a player investigates a city. The workflow
 *    then determines whether the player picked the correct city (where
 *    Carmen is hiding), selects a "true" or "false" clue, encrypts it
 *    with the player's ECIES public key, and delivers the encrypted
 *    clue back on-chain through the GameMasterProxy.
 *
 *    If the player guessed correctly AND has collected at least 3 clues,
 *    the workflow also triggers a capture resolution — ending the
 *    mission and minting a trophy NFT for the player.
 *
 *  HOW CRE WORKS (Chainlink Compute Runtime Environment):
 *    - CRE compiles TypeScript to WASM and runs it off-chain in a
 *      Chainlink DON (Decentralized Oracle Network).
 *    - Workflows are triggered by on-chain events (LogTrigger) or
 *      cron schedules (CronCapability).
 *    - The handler function receives (runtime, eventLog) and must
 *      be SYNCHRONOUS — async/await is not supported in CRE WASM.
 *    - To read on-chain data, use EVMClient.callContract() (EVM Read).
 *    - To write on-chain data, use runtime.report() → evmClient.writeReport().
 *    - The report goes through the DON consensus → signed by multiple nodes
 *      → delivered to the receiver contract (GameMasterProxy).
 *
 *  FLOW:
 *    1. Decode the InvestigationSubmitted(missionId, player, chainId) event
 *    2. Read on-chain: getMissionSalt, getValidCities, getMission, getPlayerPublicKey
 *    3. Brute-force the targetHash to find Carmen's actual city
 *       (targetHash = keccak256(cityChainId, salt) — only 3 cities to try)
 *    4. Compare player's investigated city with Carmen's city → true/false
 *    5. Select a clue from the scenario data (rotate through clues by index)
 *    6. ECIES-encrypt the clue with the player's registered public key
 *    7. Send an EVM Write report: ACTION_RECEIVE_CLUE → proxy → GameMaster.receiveClue()
 *    8. If correct city + 3+ clues → also send ACTION_RESOLVE_CAPTURE
 *
 *  CONFIG (from workflow.yaml staging/production targets):
 *    - chainSelectorName: "ethereum-testnet-sepolia"
 *    - gameMasterAddress: the deployed GameMaster contract
 *    - proxyAddress: the deployed GameMasterProxy (receives CRE reports)
 *    - gasLimit: gas limit for the on-chain write transaction
 *
 *  DEPENDENCIES:
 *    - @chainlink/cre-sdk: CRE runtime, EVM client, encoding utilities
 *    - viem: ABI encoding/decoding, keccak256, event parsing
 *    - ./ecies.ts: ECIES encryption (secp256k1 + AES-256-GCM)
 *    - ../data/scenarios.json: game scenario data with true/false clues
 *
 *  IMPORTANT CONSTRAINTS:
 *    - @noble/* libs MUST stay on v1.x (v2.x breaks CRE WASM compilation)
 *    - Handler must be synchronous (no async/await inside the handler)
 *    - All EVM reads use .result() which blocks synchronously in CRE
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
import { eciesEncrypt } from "./ecies"

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
//  ABI fragments — only the functions/events this workflow uses
//  Parsed once at module level for efficiency
// ============================================================
const GameMasterABI = parseAbi([
  // View functions for reading on-chain game state
  "function getMission(uint256) view returns (address,uint256,bytes32,uint8,uint8,uint8)",
  "function getMissionSalt(uint256) view returns (bytes32)",
  "function getValidCities() view returns (uint256[])",
  "function getMissionClues(uint256) view returns ((uint8,bytes32,string,uint256)[])",
  "function getPlayerPublicKey(address) view returns (bytes)",
  // The event we listen for — emitted when a player investigates a city
  "event InvestigationSubmitted(uint256 indexed missionId, address indexed player, uint256 chainId)",
])

// ============================================================
//  Scenarios — pre-written game content with true/false clues
//  Each scenario has clue pools; the workflow cycles through them
// ============================================================
import scenariosData from "../data/scenarios.json"

type ScenarioClue = { type: number; text: string }
type Scenario = {
  id: string
  clues: { true: ScenarioClue[]; false: ScenarioClue[] }
}

/**
 * Select a scenario based on missionId (cycles through available scenarios).
 * Mission #1 → scenario[0], Mission #2 → scenario[1], etc.
 */
function getScenario(missionId: bigint): Scenario {
  const scenarios = scenariosData.scenarios
  if (!scenarios || scenarios.length === 0) {
    throw new Error("No scenarios configured in scenarios.json")
  }
  const index = Number(missionId - BigInt(1)) % scenarios.length
  return scenarios[index] as Scenario
}

// Action codes — must match the constants in GameMasterProxy.sol
// These tell the proxy which GameMaster function to forward the report to
const ACTION_RECEIVE_CLUE = 1      // → GameMaster.receiveClue()
const ACTION_RESOLVE_CAPTURE = 2   // → GameMaster.resolveCapture()

// ============================================================
//  Handler: onInvestigationSubmitted
//  Called by CRE when an InvestigationSubmitted event is detected
// ============================================================
const onInvestigationSubmitted = (runtime: Runtime<Config>, log: EVMLog): Record<string, never> => {
  const config = runtime.config

  // Resolve the chain network from CRE's chain selector registry
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  // EVMClient provides callContract (read) and writeReport (write) capabilities
  const evmClient = new EVMClient(network.chainSelector.selector)

  // ── Step 1: Decode the InvestigationSubmitted event from the raw log ──
  // CRE provides raw log bytes; we use viem's decodeEventLog to parse them
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

  // ── Step 2: EVM Read — getMissionSalt ──
  // The salt is a secret random value (from VRF) stored on-chain.
  // Only the CRE workflow can read it (via getMissionSalt which is access-controlled).
  // targetHash = keccak256(carmenCityChainId, salt)
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
    .result() // .result() blocks synchronously in CRE — this is the CRE pattern for reads

  const salt = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getMissionSalt",
    data: bytesToHex(saltResult.data),
  })
  runtime.log(`Salt: ${salt}`)

  // Guard: if salt is zero, VRF callback hasn't arrived yet — skip this event.
  // The player's investigation was submitted before VRF set the target.
  // CRE will process subsequent investigations once VRF fulfills.
  if (salt === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    runtime.log("WARN: Salt is zero — VRF not yet fulfilled. Skipping investigation.")
    return {}
  }

  // ── Step 3: EVM Read — getValidCities ──
  // Returns the array of valid city chain IDs [421614, 84532, 51]
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

  // ── Step 4a: EVM Read — getMission → targetHash + cluesReceived ──
  // We need targetHash to find Carmen's city, and cluesReceived to know
  // which clue index to select from the scenario pool
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

  // getMission returns: (player, startBlock, targetHash, cluesReceived, investigationsCount, status)
  const [, , targetHash, cluesReceived, ,] = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getMission",
    data: bytesToHex(missionResultData.data),
  }) as [string, bigint, string, number, number, number]
  runtime.log(`TargetHash: ${targetHash}, cluesReceived: ${cluesReceived}`)

  // ── Step 4b: EVM Read — getPlayerPublicKey ──
  // The player registered their ECIES public key when they first registered.
  // We need it to encrypt the clue so only the player can decrypt it.
  const pubKeyCallData = encodeFunctionData({
    abi: GameMasterABI,
    functionName: "getPlayerPublicKey",
    args: [player],
  })
  const pubKeyResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.gameMasterAddress as `0x${string}`,
        data: pubKeyCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()

  const playerPubKeyHex = decodeFunctionResult({
    abi: GameMasterABI,
    functionName: "getPlayerPublicKey",
    data: bytesToHex(pubKeyResult.data),
  }) as `0x${string}`
  runtime.log(`Player public key: ${playerPubKeyHex.slice(0, 20)}...`)

  // ── Step 5: Brute-force — find Carmen's actual city ──
  // The commit-reveal pattern stores targetHash = keccak256(cityChainId, salt).
  // Since there are only 3 possible cities, we try each one until we find
  // the matching hash. This is the "reveal" step that only CRE can do
  // (because only CRE can read the salt via getMissionSalt).
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
    runtime.log(`ERROR: Could not determine Carmen's location.`)
    runtime.log(`  targetHash=${targetHash}, salt=${salt}, cities=[${cities.join(",")}]`)
    return {}
  }
  runtime.log(`Carmen is in city: ${carmenCity}`)

  // ── Step 6: Decide — true clue (correct city) or false clue (wrong city) ──
  const isCorrectCity = investigatedChainId === carmenCity
  runtime.log(`Player investigated ${investigatedChainId}, correct=${isCorrectCity}`)

  // Select a clue from the scenario's pre-written pool.
  // True clues hint at the correct city; false clues are misleading.
  // We cycle through the pool using cluesReceived as index.
  const scenario = getScenario(missionId)
  const cluePool = isCorrectCity ? scenario.clues.true : scenario.clues.false
  const clueIndex = Number(cluesReceived) % cluePool.length
  const selectedClue = cluePool[clueIndex]
  const clueText = selectedClue.text
  const clueType = selectedClue.type

  // ── Step 7: Encrypt the clue with ECIES ──
  // contentHash is keccak256 of the plaintext — stored on-chain for verification.
  // The actual clue text is encrypted so only the player can read it.
  const contentHash = keccak256(toBytes(clueText))

  // Convert hex public key to bytes for the ECIES encrypt function
  const pubKeyClean = playerPubKeyHex.startsWith("0x") ? playerPubKeyHex.slice(2) : playerPubKeyHex
  if (pubKeyClean.length !== 130 || !/^[0-9a-fA-F]+$/.test(pubKeyClean)) {
    runtime.log(`ERROR: Invalid public key format (length=${pubKeyClean.length})`)
    return {}
  }
  const pubKeyBytes = new Uint8Array(pubKeyClean.length / 2)
  for (let i = 0; i < pubKeyBytes.length; i++) {
    pubKeyBytes[i] = parseInt(pubKeyClean.slice(i * 2, i * 2 + 2), 16)
  }
  const encryptedClue = eciesEncrypt(pubKeyBytes, clueText)
  runtime.log(`Clue encrypted (${encryptedClue.length} hex chars)`)

  // ── Step 8: EVM Write — deliver the clue via GameMasterProxy ──
  // The report format is: ABI-encode(actionCode, actionData)
  // ACTION_RECEIVE_CLUE = 1 tells the proxy to call GameMaster.receiveClue()
  // The actionData contains: (missionId, clueType, contentHash, encryptedClueHex)
  const clueData = encodeAbiParameters(
    parseAbiParameters("uint256, uint8, bytes32, string"),
    [missionId, clueType, contentHash as `0x${string}`, encryptedClue]
  )
  const clueReport = encodeAbiParameters(
    parseAbiParameters("uint8, bytes"),
    [ACTION_RECEIVE_CLUE, clueData as `0x${string}`]
  )

  // runtime.report() creates a signed report through the DON consensus mechanism.
  // Multiple CRE nodes sign the report, ensuring the data is trustworthy.
  // The report is then delivered to the proxy contract via writeReport().
  runtime.log("Sending clue report to proxy...")
  const clueReportResponse = runtime
    .report({
      encodedPayload: hexToBase64(clueReport),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result()

  // writeReport sends the DON-signed report to the proxy contract on-chain.
  // The proxy verifies the DON signatures, then forwards to GameMaster.
  evmClient
    .writeReport(runtime, {
      receiver: config.proxyAddress,
      report: clueReportResponse,
      gasConfig: { gasLimit: config.gasLimit },
    })
    .result()

  runtime.log("Clue delivered successfully!")

  // ── Step 9: Check capture conditions ──
  // If the player investigated the correct city AND has now accumulated
  // 3+ clues (including the one just sent), trigger capture resolution.
  // This ends the mission and mints a MissionNFT trophy for the player.
  const totalClues = cluesReceived + 1 // including the one we just sent
  runtime.log(`Clue count: ${cluesReceived} on-chain + 1 new = ${totalClues} total (need 3 for capture)`)

  if (isCorrectCity && totalClues >= 3) {
    runtime.log(`CAPTURE! Player found Carmen in city ${carmenCity} with ${totalClues} clues.`)

    // ACTION_RESOLVE_CAPTURE = 2 tells the proxy to call GameMaster.resolveCapture()
    // It needs the missionId, the correct city, and the salt as proof
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
//  Workflow initialization — sets up the event trigger
// ============================================================

/**
 * initWorkflow is called once when the CRE workflow starts.
 * It configures the LogTrigger to listen for InvestigationSubmitted events
 * from the GameMaster contract address.
 *
 * CRE pattern:
 *   1. Create an EVMClient for the target chain
 *   2. Compute the event topic hash (keccak256 of the event signature)
 *   3. Set up a logTrigger that watches for that topic from the contract
 *   4. Return an array of handler(trigger, handlerFn) pairs
 *
 * The Runner will keep the workflow alive, invoking the handler each time
 * the trigger detects a matching event.
 */
const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)

  // The event topic is the keccak256 hash of the event signature.
  // CRE's logTrigger watches for this topic in new blocks.
  const eventHash = keccak256(toBytes("InvestigationSubmitted(uint256,address,uint256)"))

  return [
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.gameMasterAddress)],  // Only from GameMaster
        topics: [{ values: [hexToBase64(eventHash)] }],      // Only InvestigationSubmitted
      }),
      onInvestigationSubmitted
    ),
  ]
}

/**
 * Entry point — CRE calls main() when the workflow is deployed.
 * Runner.newRunner<Config>() reads configuration from workflow.yaml
 * and starts the event loop.
 */
export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
