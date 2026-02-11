// ============================================================
//  Prompt Templates for AI-powered clue generation
//  Used by CRE workflows to generate dynamic game content
//  Supports: Gemini (primary) + OpenAI (fallback)
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
 */
export function buildBriefingPrompt(scenario: Scenario): string {
  const cityNames = Object.values(scenario.cities).map(c => c.name).join(", ")

  return `You are the Chief of ACME Detective Agency in a Carmen Sandiego game set in the Web3/blockchain world.

Write a dramatic mission briefing for your detective. The scenario is:

Title: "${scenario.title}"
Context: ${scenario.briefing}
Possible locations: ${cityNames}

Rules:
- Write in 2nd person ("You must track...")
- Include Web3 terminology (NFTs, chains, wallets, bridges)
- Mention the stolen item and its value
- Keep it under 150 words
- End with an urgent call to action
- Do NOT reveal Carmen's actual location
- Tone: noir detective meets cyberpunk`
}

/**
 * Builds a prompt for generating a clue (true or false).
 * True clues subtly hint at the correct city.
 * False clues mislead toward a wrong city.
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
    return `You are generating a TRUE clue for a Carmen Sandiego detective game.

Scenario: "${scenario.title}"
Carmen is ACTUALLY in: ${carmenCity.name} (${carmenCity.chain})
Local landmarks/culture: ${carmenCityClue.landmark}, ${carmenCityClue.culture}
The player investigated: ${investigatedCity.name}
Clue number: ${clueNumber + 1}

Write a clue that subtly hints Carmen is in ${carmenCity.name}. Include:
- A reference to a local landmark, food, or cultural element of ${carmenCity.name}
- A blockchain/Web3 detail (wallet activity, transaction, NFT metadata)
- Make it feel like detective intelligence — not a direct answer
- Keep it under 80 words
- Do NOT explicitly name the city — use cultural hints only`
  }

  return `You are generating a FALSE (misleading) clue for a Carmen Sandiego detective game.

Scenario: "${scenario.title}"
Carmen is NOT in: ${investigatedCity.name} — the player is searching the wrong place
Landmarks to use as bait: ${investigatedCityClue.landmark}, ${investigatedCityClue.culture}
Clue number: ${clueNumber + 1}

Write a misleading clue that suggests Carmen MIGHT be in ${investigatedCity.name}, but include subtle hints that it's a dead end. Include:
- A reference to ${investigatedCity.name} landmarks or culture
- A blockchain detail that seems suspicious but leads nowhere
- End with a slightly mocking tone ("You're chasing shadows, detective")
- Keep it under 80 words`
}

/**
 * Builds a prompt for generating a capture success message.
 */
export function buildCapturePrompt(scenario: Scenario, carmenCityId: string): string {
  const city = scenario.cities[carmenCityId]
  const cityClue = scenario.cityClues[carmenCityId]

  return `You are narrating the successful capture of Carmen Sandiego in a Web3 detective game.

Scenario: "${scenario.title}"
Carmen was captured in: ${city.name} near ${cityClue.landmark}
The stolen item was recovered and returned via Chainlink CCIP bridge.

Write a dramatic capture message that:
- Describes where/how Carmen was caught (at ${cityClue.landmark} or nearby)
- Mentions the stolen item being recovered
- Includes a witty Carmen Sandiego quote as she's captured
- References CCIP for the cross-chain recovery
- Keep it under 100 words
- Tone: triumphant but respectful of Carmen as a worthy adversary`
}

/**
 * Builds a prompt for generating a mission failure message.
 */
export function buildFailurePrompt(scenario: Scenario): string {
  return `You are narrating Carmen Sandiego's escape in a Web3 detective game.

Scenario: "${scenario.title}"
The detective investigated the wrong city and Carmen escaped.

Write a dramatic failure message that:
- Describes how Carmen escaped while the detective was in the wrong place
- Mentions what happened to the stolen item (sold, burned, moved to unknown chain)
- Includes a taunting Carmen quote
- Keep it under 80 words
- Tone: dramatic loss, but motivating the detective to try again`
}
