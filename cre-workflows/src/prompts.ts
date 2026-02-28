// ============================================================
//  Prompt Templates for AI-powered clue generation
//
//  CHAINLINK CRE INTEGRATION:
//  These prompts are used by CRE workflows running inside the
//  Chainlink DON (Decentralized Oracle Network) to generate
//  dynamic, contextual game content via OpenAI GPT-4o-mini.
//
//  The prompts are designed for the noir detective aesthetic of
//  "Carmen Sandiego On-Chain" — blending real-world cultural
//  details with blockchain/Web3 terminology for an immersive
//  mystery experience.
//
//  STATUS: Prepared for CRE v2 async support. Currently, CRE WASM
//  handlers are synchronous, so these prompts serve as templates
//  for the async AI functions already coded in each workflow.
//  When CRE v2 ships async handler support, a one-line uncomment
//  enables full AI generation.
//
//  Supports: OpenAI (primary) + any OpenAI-compatible API
// ============================================================

export type CityInfo = {
  name: string
  emoji: string
  chain: string
}

export type CityClue = {
  landmark: string
  culture: string
}

export type Scenario = {
  id: string
  title: string
  briefing: string
  cities: Record<string, CityInfo>
  cityClues: Record<string, CityClue>
  clues: {
    true: { type: number; text: string }[]
    false: { type: number; text: string }[]
  }
  captureMessage: string
  failureMessage: string
}

/**
 * Builds a prompt for generating a mission briefing.
 * The LLM should return a dramatic, noir-style briefing text.
 *
 * Used by: generate-briefing/main.ts (CRE LogTrigger: MissionStarted)
 */
export function buildBriefingPrompt(scenario: Scenario): string {
  const cityNames = Object.values(scenario.cities).map(c => c.name).join(", ")
  const chainNames = Object.values(scenario.cities).map(c => `${c.name} (${c.chain})`).join(", ")

  return `You are the Chief of ACME Detective Agency in "Carmen Sandiego On-Chain" — a blockchain mystery game where each city exists on a different blockchain network. Your detectives track Carmen across real chains: ${chainNames}.

Write a dramatic, classified mission briefing for your detective. The scenario is:

Title: "${scenario.title}"
Context: ${scenario.briefing}
Possible locations: ${cityNames}

Rules:
- Write in 2nd person ("You must track...", "Your mission...")
- Include Web3 terminology naturally (NFTs, chains, wallets, bridges, oracles, hashes)
- Mention the stolen item, its value, and the method of theft
- Reference Chainlink VRF as the source of randomness ("the oracle's dice have been cast")
- Keep it under 150 words
- End with an urgent call to action that creates time pressure
- Do NOT reveal Carmen's actual location
- Tone: Cold War intelligence dossier meets cyberpunk noir
- Open with "CLASSIFIED" or "TOP SECRET" header for dramatic effect`
}

/**
 * Builds a prompt for generating a clue (true or false).
 * True clues subtly hint at the correct city with cultural and chain details.
 * False clues mislead toward a wrong city with a mocking undertone.
 *
 * Used by: mission-start/main.ts (CRE LogTrigger: InvestigationSubmitted)
 */
export function buildCluePrompt(
  scenario: Scenario,
  carmenCityId: string,
  investigatedCityId: string,
  isTrue: boolean,
  clueNumber: number
): string {
  const carmenCity = scenario.cities[carmenCityId]
  const investigatedCity = scenario.cities[investigatedCityId]
  const carmenCityClue = scenario.cityClues[carmenCityId]
  const investigatedCityClue = scenario.cityClues[investigatedCityId]

  if (isTrue) {
    return `You are generating a TRUE clue for "Carmen Sandiego On-Chain," a blockchain mystery game where each city is a real blockchain network.

Scenario: "${scenario.title}"
Carmen is ACTUALLY in: ${carmenCity.name} (blockchain: ${carmenCity.chain})
Local landmarks/culture: ${carmenCityClue.landmark}, ${carmenCityClue.culture}
The player investigated: ${investigatedCity.name} (blockchain: ${investigatedCity.chain})
Clue number: ${clueNumber + 1}

Write a clue that subtly hints Carmen is in ${carmenCity.name}. Include:
- A vivid reference to a local landmark, food, or cultural element of ${carmenCity.name}
- A blockchain/Web3 detail specific to ${carmenCity.chain} (transaction patterns, gas fees, L2 characteristics)
- Make it feel like field intelligence gathered by an informant — not a direct answer
- Blend the physical world detail with the on-chain evidence seamlessly
- Keep it under 80 words
- Do NOT explicitly name the city — use cultural and chain-specific hints only
- Tone: noir detective intelligence briefing`
  }

  return `You are generating a FALSE (misleading) clue for "Carmen Sandiego On-Chain," a blockchain mystery game where each city is a real blockchain network.

Scenario: "${scenario.title}"
Carmen is NOT in: ${investigatedCity.name} (blockchain: ${investigatedCity.chain}) — the player is searching the wrong place
Landmarks to use as bait: ${investigatedCityClue.landmark}, ${investigatedCityClue.culture}
Clue number: ${clueNumber + 1}

Write a misleading clue that suggests Carmen MIGHT be in ${investigatedCity.name}, but include subtle hints that it is a dead end. Include:
- A reference to ${investigatedCity.name} landmarks or culture that seems promising
- A blockchain detail from ${investigatedCity.chain} that appears suspicious but leads nowhere
- End with a slightly mocking, sardonic tone ("The trail goes cold, detective..." or "You're chasing ghosts in the mempool...")
- Keep it under 80 words
- Tone: noir with dark humor — Carmen is toying with the detective`
}

/**
 * Builds a prompt for generating a capture success message.
 *
 * Used by: generate-finale/main.ts (CRE LogTrigger: CarmenCaptured)
 */
export function buildCapturePrompt(scenario: Scenario, carmenCityId: string): string {
  const city = scenario.cities[carmenCityId]
  const cityClue = scenario.cityClues[carmenCityId]

  return `You are narrating the dramatic capture of Carmen Sandiego in "Carmen Sandiego On-Chain," a blockchain mystery game powered by Chainlink's Decentralized Oracle Network.

Scenario: "${scenario.title}"
Carmen was captured in: ${city.name} (blockchain: ${city.chain}) near ${cityClue.landmark}
The stolen item was recovered and the evidence is permanently recorded on-chain.

Write a dramatic capture message that:
- Describes where and how Carmen was cornered (at ${cityClue.landmark} or nearby)
- Mentions the stolen item being recovered and secured on-chain
- Includes a witty Carmen Sandiego quote as she is caught — she respects the detective but promises to return
- References the blockchain evidence being immutable ("the chain remembers everything")
- Mention the Chainlink DON verified the capture ("the oracle network confirmed your evidence")
- Keep it under 100 words
- Tone: triumphant but respectful of Carmen as a worthy adversary
- End with a hint that Carmen will escape again — setting up the next mission`
}

/**
 * Builds a prompt for generating a mission failure message.
 *
 * Used by: mission-start/main.ts (when mission expires)
 */
export function buildFailurePrompt(scenario: Scenario): string {
  return `You are narrating Carmen Sandiego's escape in "Carmen Sandiego On-Chain," a blockchain mystery game powered by Chainlink's Decentralized Oracle Network.

Scenario: "${scenario.title}"
The detective investigated the wrong city and Carmen escaped before the blocks ran out.

Write a dramatic failure message that:
- Describes how Carmen vanished while the detective chased the wrong lead
- Mentions what happened to the stolen item (bridged to an unknown chain, laundered through a mixer, burned and re-minted)
- Includes a taunting Carmen quote that is clever but not cruel
- Reference the blockchain: "the blocks kept ticking" or "the mempool swallowed her trail"
- Keep it under 80 words
- Tone: dramatic loss, but motivating the detective to try again
- End with a line that makes the player want to start a new mission immediately`
}
