/**
 * ================================================================
 *  CRE Workflow: citynode-resolver
 *  CHAINLINK SERVICE: CRE / Keystone (Decentralized Oracle Network)
 * ================================================================
 *
 *  PURPOSE:
 *    Listens for on-chain events emitted by CityNode contracts on
 *    remote chains (Arbitrum Sepolia, Base Sepolia, XDC Apothem) and
 *    resolves them by calling the corresponding GameMaster functions
 *    on Ethereum Sepolia.
 *
 *    Events monitored:
 *    - ClueRequested      → resolveClueOnCity()
 *    - DossierRequested   → resolveDossierOnCity()
 *    - CaptureRequested   → resolveCaptureOnCity()
 *
 *  DATA FLOW:
 *    1. Player calls requestClue() on CityNode (Arbitrum/Base/XDC)
 *    2. CityNode emits ClueRequested event
 *    3. CRE DON detects the event via LogTrigger capability
 *    4. DON nodes execute this WASM workflow:
 *       a. Decode the request event (missionId, player, locationIdx)
 *       b. Read on-chain state from GameMaster (mission salt, cities)
 *       c. Generate clue data (type, strength, text)
 *       d. ECIES-encrypt the clue with the player's public key
 *       e. Call resolveClueOnCity() on GameMaster via proxy
 *    5. GameMaster.resolveClueOnCity() calls CityNode.resolveClue()
 *       on the originating chain via CCIP
 *    6. CityNode emits ClueUnlocked event → frontend picks it up
 *
 *  IMPORTANT CONSTRAINTS:
 *    - @noble/* libs MUST stay on v1.x (v2.x breaks CRE WASM compilation)
 *    - Handler must be synchronous (no async/await inside the handler)
 *    - All EVM reads use .result() which blocks synchronously in CRE
 *
 *  CONFIG:
 *    - chainSelectorName: Sepolia chain selector for GameMaster reads/writes
 *    - gameMasterAddress: GameMaster contract on Sepolia
 *    - proxyAddress: GameMasterProxy on Sepolia
 *    - gasLimit: gas limit for report delivery
 *    - cityNodeChains: JSON array of { chainSelector, cityNodeAddress }
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
} from "viem"
import { eciesEncrypt } from "./ecies"

// ============================================================
//  Config — populated from workflow.yaml target settings
// ============================================================
type Config = {
  chainSelectorName: string
  gameMasterAddress: string
  proxyAddress: string
  gasLimit: string
}

// ============================================================
//  ABI fragments
// ============================================================
const GameMasterABI = parseAbi([
  "function getMission(uint256) view returns (address,uint256,bytes32,uint8,uint8,uint8)",
  "function getMissionSalt(uint256) view returns (bytes32)",
  "function getValidCities() view returns (uint256[])",
  "function getPlayerPublicKey(address) view returns (bytes)",
  "function getMissionClues(uint256) view returns ((uint8,bytes32,string,uint256,uint8)[])",
])

const CityNodeABI = parseAbi([
  "event ClueRequested(address indexed player, uint256 indexed missionId, uint8 locationIdx, uint8 clueIdx)",
  "event DossierRequested(address indexed player, uint256 indexed missionId, bytes32 suspectId)",
  "event CaptureRequested(address indexed player, uint256 indexed missionId, uint8 locationIdx, bytes32 txHash)",
])

// GameMasterProxy action codes (matches GameMasterProxy._processReport)
const ACTION_RESOLVE_CLUE_ON_CITY = 7   // resolveClueOnCity
const ACTION_RESOLVE_DOSSIER_ON_CITY = 8 // resolveDossierOnCity
const ACTION_RESOLVE_CAPTURE_ON_CITY = 9 // resolveCaptureOnCity

// ============================================================
//  Scenario data (imported at build time)
// ============================================================
import scenariosData from "../data/scenarios.json"
const scenarios = scenariosData.scenarios

// ============================================================
//  Helpers
// ============================================================

/** Get scenario for a given missionId (deterministic rotation) */
function getScenario(missionId: number) {
  if (!scenarios.length) return null
  const idx = (missionId - 1) % scenarios.length
  return scenarios[idx]
}

/** Deterministic clue strength from salt + investigation data */
function calculateStrength(salt: string, missionId: number, isCorrectCity: boolean): number {
  const hash = keccak256(toBytes(`${salt}-${missionId}-strength`))
  const raw = parseInt(hash.slice(2, 10), 16)
  if (isCorrectCity) {
    return 40 + (raw % 56) // Range: 40–95
  }
  return 20 + (raw % 36) // Range: 20–55
}

/** Pick a clue text from scenario data */
function pickClueText(
  scenario: ReturnType<typeof getScenario>,
  salt: string,
  isCorrectCity: boolean
): string {
  if (!scenario) return isCorrectCity
    ? "Signal detected near target location. Carmen was here recently."
    : "Faint trail detected but leads nowhere. Dead end, detective."

  const pool = isCorrectCity ? scenario.clues.true : scenario.clues.false
  const hash = keccak256(toBytes(`${salt}-clue-pick`))
  const idx = parseInt(hash.slice(2, 10), 16) % pool.length
  return pool[idx].text
}

/** Build the proxy report payload for resolveClueOnCity */
function buildClueResolutionPayload(
  cityNodeAddress: string,
  player: string,
  missionId: number,
  locationIdx: number,
  clueIdx: number,
  clueType: number,
  encryptedData: string,
  strength: number,
  isDeadEnd: boolean
): string {
  // action=7 (resolveClueOnCity), then the data
  const innerData = encodeAbiParameters(
    parseAbiParameters("address,address,uint256,uint8,uint8,uint8,bytes,uint8,bool"),
    [
      cityNodeAddress as `0x${string}`,
      player as `0x${string}`,
      BigInt(missionId),
      locationIdx,
      clueIdx,
      clueType,
      encryptedData as `0x${string}`,
      strength,
      isDeadEnd,
    ]
  )
  return encodeAbiParameters(
    parseAbiParameters("uint8,bytes"),
    [ACTION_RESOLVE_CLUE_ON_CITY, innerData]
  )
}

/** Build the proxy report payload for resolveDossierOnCity */
function buildDossierResolutionPayload(
  cityNodeAddress: string,
  player: string,
  missionId: number,
  suspectId: string,
  dossierData: string
): string {
  const innerData = encodeAbiParameters(
    parseAbiParameters("address,address,uint256,bytes32,string"),
    [
      cityNodeAddress as `0x${string}`,
      player as `0x${string}`,
      BigInt(missionId),
      suspectId as `0x${string}`,
      dossierData,
    ]
  )
  return encodeAbiParameters(
    parseAbiParameters("uint8,bytes"),
    [ACTION_RESOLVE_DOSSIER_ON_CITY, innerData]
  )
}

/** Build the proxy report payload for resolveCaptureOnCity */
function buildCaptureResolutionPayload(
  cityNodeAddress: string,
  player: string,
  missionId: number,
  locationIdx: number,
  txHash: string,
  success: boolean,
  reasonCode: number
): string {
  const innerData = encodeAbiParameters(
    parseAbiParameters("address,address,uint256,uint8,bytes32,bool,uint8"),
    [
      cityNodeAddress as `0x${string}`,
      player as `0x${string}`,
      BigInt(missionId),
      locationIdx,
      txHash as `0x${string}`,
      success,
      reasonCode,
    ]
  )
  return encodeAbiParameters(
    parseAbiParameters("uint8,bytes"),
    [ACTION_RESOLVE_CAPTURE_ON_CITY, innerData]
  )
}

// ============================================================
//  Main handler — processes CityNode events
// ============================================================

const cityNodeResolver = handler<Config, EVMLog>(
  { type: "log", triggerName: "citynode-events" },
  (runtime: Runtime, config: Config, log: EVMLog) => {
    const network = getNetwork(config.chainSelectorName)
    const evm = new EVMClient(runtime, network)

    // --- Determine event type from topic0 ---
    const topic0 = log.topics[0] || ""

    // ClueRequested topic
    const clueRequestedTopic = keccak256(
      toBytes("ClueRequested(address,uint256,uint8,uint8)")
    )
    // DossierRequested topic
    const dossierRequestedTopic = keccak256(
      toBytes("DossierRequested(address,uint256,bytes32)")
    )
    // CaptureRequested topic
    const captureRequestedTopic = keccak256(
      toBytes("CaptureRequested(address,uint256,uint8,bytes32)")
    )

    // Source CityNode address from the log
    const cityNodeAddress = log.address

    if (topic0 === clueRequestedTopic) {
      // --- Handle ClueRequested ---
      const decoded = decodeEventLog({
        abi: CityNodeABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      })
      const { player, missionId, locationIdx, clueIdx } = decoded.args as {
        player: string
        missionId: bigint
        locationIdx: number
        clueIdx: number
      }
      const mid = Number(missionId)

      // Read mission data from GameMaster
      const missionCall = encodeCallMsg(
        config.gameMasterAddress as `0x${string}`,
        encodeFunctionData({ abi: GameMasterABI, functionName: "getMission", args: [missionId] }),
        LATEST_BLOCK_NUMBER
      )
      const missionResult = evm.callContract(network, missionCall).result()
      const [missionPlayer, , targetHash, status] = decodeFunctionResult({
        abi: GameMasterABI,
        functionName: "getMission",
        data: bytesToHex(missionResult),
      }) as [string, bigint, string, number, number, number]

      // Mission must be Active (status=1)
      if (status !== 1) {
        runtime.log(`Mission ${mid} is not active (status=${status}), skipping.`)
        return
      }

      // Read salt
      const saltCall = encodeCallMsg(
        config.gameMasterAddress as `0x${string}`,
        encodeFunctionData({ abi: GameMasterABI, functionName: "getMissionSalt", args: [missionId] }),
        LATEST_BLOCK_NUMBER
      )
      const saltResult = evm.callContract(network, saltCall).result()
      const salt = decodeFunctionResult({
        abi: GameMasterABI,
        functionName: "getMissionSalt",
        data: bytesToHex(saltResult),
      }) as string

      // Read valid cities to determine if this CityNode's chain is Carmen's location
      const citiesCall = encodeCallMsg(
        config.gameMasterAddress as `0x${string}`,
        encodeFunctionData({ abi: GameMasterABI, functionName: "getValidCities" }),
        LATEST_BLOCK_NUMBER
      )
      const citiesResult = evm.callContract(network, citiesCall).result()
      const validCities = decodeFunctionResult({
        abi: GameMasterABI,
        functionName: "getValidCities",
        data: bytesToHex(citiesResult),
      }) as bigint[]

      // Brute-force which city matches targetHash
      let isCorrectCity = false
      for (const cityChainId of validCities) {
        const candidateHash = keccak256(
          encodeAbiParameters(parseAbiParameters("uint256,bytes32"), [cityChainId, salt as `0x${string}`])
        )
        if (candidateHash === targetHash) {
          // Check if log originated from a CityNode on this chain
          // (In production, the log's chain metadata would identify the source chain)
          isCorrectCity = true
          break
        }
      }

      // Read player's ECIES public key
      const pubKeyCall = encodeCallMsg(
        config.gameMasterAddress as `0x${string}`,
        encodeFunctionData({
          abi: GameMasterABI,
          functionName: "getPlayerPublicKey",
          args: [player as `0x${string}`],
        }),
        LATEST_BLOCK_NUMBER
      )
      const pubKeyResult = evm.callContract(network, pubKeyCall).result()
      const playerPubKey = decodeFunctionResult({
        abi: GameMasterABI,
        functionName: "getPlayerPublicKey",
        data: bytesToHex(pubKeyResult),
      }) as string

      // Generate clue
      const scenario = getScenario(mid)
      const strength = calculateStrength(salt, mid, isCorrectCity)
      const clueText = pickClueText(scenario, salt, isCorrectCity)
      const isDeadEnd = !isCorrectCity && strength < 30
      const clueType = 0 // text

      // Encrypt clue with player's ECIES public key
      const encrypted = eciesEncrypt(playerPubKey, clueText)

      // Build report payload
      const payload = buildClueResolutionPayload(
        cityNodeAddress,
        player,
        mid,
        locationIdx,
        clueIdx,
        clueType,
        encrypted,
        strength,
        isDeadEnd
      )

      // Deliver via proxy
      runtime.report(
        hexToBase64(payload),
        config.proxyAddress,
        parseInt(config.gasLimit)
      )

      runtime.log(
        `ClueRequested resolved: mission=${mid}, player=${player.slice(0, 10)}..., ` +
        `strength=${strength}, correct=${isCorrectCity}, deadEnd=${isDeadEnd}`
      )
    } else if (topic0 === dossierRequestedTopic) {
      // --- Handle DossierRequested ---
      const decoded = decodeEventLog({
        abi: CityNodeABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      })
      const { player, missionId, suspectId } = decoded.args as {
        player: string
        missionId: bigint
        suspectId: string
      }
      const mid = Number(missionId)

      // Generate dossier data (template-based for CRE v1)
      const dossierText = `Suspect profile retrieved. Analysis indicates ${
        Math.random() > 0.5 ? "possible connection" : "no direct link"
      } to Carmen's network. Cross-reference with on-chain evidence for confirmation.`

      const payload = buildDossierResolutionPayload(
        cityNodeAddress,
        player,
        mid,
        suspectId,
        dossierText
      )

      runtime.report(
        hexToBase64(payload),
        config.proxyAddress,
        parseInt(config.gasLimit)
      )

      runtime.log(`DossierRequested resolved: mission=${mid}, suspect=${suspectId.slice(0, 10)}...`)
    } else if (topic0 === captureRequestedTopic) {
      // --- Handle CaptureRequested ---
      const decoded = decodeEventLog({
        abi: CityNodeABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      })
      const { player, missionId, locationIdx, txHash } = decoded.args as {
        player: string
        missionId: bigint
        locationIdx: number
        txHash: string
      }
      const mid = Number(missionId)

      // Read mission to check target
      const missionCall = encodeCallMsg(
        config.gameMasterAddress as `0x${string}`,
        encodeFunctionData({ abi: GameMasterABI, functionName: "getMission", args: [missionId] }),
        LATEST_BLOCK_NUMBER
      )
      const missionResult = evm.callContract(network, missionCall).result()
      const [, , targetHash] = decodeFunctionResult({
        abi: GameMasterABI,
        functionName: "getMission",
        data: bytesToHex(missionResult),
      }) as [string, bigint, string, number, number, number]

      // Read salt
      const saltCall = encodeCallMsg(
        config.gameMasterAddress as `0x${string}`,
        encodeFunctionData({ abi: GameMasterABI, functionName: "getMissionSalt", args: [missionId] }),
        LATEST_BLOCK_NUMBER
      )
      const saltResult = evm.callContract(network, saltCall).result()
      const salt = decodeFunctionResult({
        abi: GameMasterABI,
        functionName: "getMissionSalt",
        data: bytesToHex(saltResult),
      }) as string

      // Determine capture success — check if the CityNode chain matches Carmen's location
      // For simplicity, we check all valid cities
      const citiesCall = encodeCallMsg(
        config.gameMasterAddress as `0x${string}`,
        encodeFunctionData({ abi: GameMasterABI, functionName: "getValidCities" }),
        LATEST_BLOCK_NUMBER
      )
      const citiesResult = evm.callContract(network, citiesCall).result()
      const validCities = decodeFunctionResult({
        abi: GameMasterABI,
        functionName: "getValidCities",
        data: bytesToHex(citiesResult),
      }) as bigint[]

      let captureSuccess = false
      for (const cityChainId of validCities) {
        const candidateHash = keccak256(
          encodeAbiParameters(parseAbiParameters("uint256,bytes32"), [cityChainId, salt as `0x${string}`])
        )
        if (candidateHash === targetHash) {
          captureSuccess = true
          break
        }
      }

      const reasonCode = captureSuccess ? 0 : 1 // 0=SUCCESS, 1=WRONG_CITY

      const payload = buildCaptureResolutionPayload(
        cityNodeAddress,
        player,
        mid,
        locationIdx,
        txHash,
        captureSuccess,
        reasonCode
      )

      runtime.report(
        hexToBase64(payload),
        config.proxyAddress,
        parseInt(config.gasLimit)
      )

      runtime.log(
        `CaptureRequested resolved: mission=${mid}, player=${player.slice(0, 10)}..., ` +
        `success=${captureSuccess}, reason=${reasonCode}`
      )
    } else {
      runtime.log(`Unknown event topic: ${topic0}, skipping.`)
    }
  }
)

// ============================================================
//  Runner — entry point
// ============================================================
const runner = new Runner()
runner.add(cityNodeResolver)
