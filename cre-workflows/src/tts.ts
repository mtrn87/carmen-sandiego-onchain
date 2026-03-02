// ============================================================
//  ElevenLabs TTS Integration for Carmen Sandiego On-Chain
//
//  CHAINLINK CRE INTEGRATION:
//  Text-to-speech narration for mission briefings, clues, capture
//  messages, and failure messages. Converts AI-generated text into
//  dramatic audio narration using ElevenLabs' voice synthesis API.
//
//  STATUS: Prepared for CRE v2 async support. CRE v1 WASM handlers
//  are synchronous, so these functions are ready but gated behind
//  the async barrier — same pattern as the OpenAI integration.
//  When CRE v2 ships async handler support, a one-line uncomment
//  in each workflow enables full TTS narration.
//
//  Audio is returned as base64-encoded data URIs (no IPFS needed).
//  The frontend ClueModal already supports audio playback (PR #92).
// ============================================================

export type TTSVoiceId = string

export type TTSConfig = {
  apiKey: string
  voiceId: TTSVoiceId
  modelId?: string
  stability?: number
  similarityBoost?: number
  style?: number
}

// Pre-selected voices for different narration contexts
export const VOICE_PRESETS = {
  // Narrator — deep, dramatic, noir-style briefing voice
  briefing: "pNInz6obpgDQGcFmaJgB", // "Adam" — deep, authoritative
  // Informant — quick, hushed, intelligence-style clue delivery
  clue: "EXAVITQu4vr4xnSDxMaL", // "Bella" — warm, slightly urgent
  // Carmen — confident, teasing, playful capture/failure messages
  carmen: "21m00Tcm4TlvDq8ikWAM", // "Rachel" — smooth, expressive
} as const

/**
 * Generate speech audio from text using ElevenLabs API.
 *
 * Returns a base64 data URI string (audio/mpeg) that can be
 * directly used as an audio src in the frontend.
 *
 * @param text - The text to convert to speech
 * @param config - ElevenLabs API configuration
 * @returns base64 data URI string (audio/mpeg)
 *
 * NOTE: This function is async and requires CRE v2 async handler support.
 * In CRE v1, call sites should use the synchronous fallback (no audio).
 */
export async function generateSpeech(
  text: string,
  config: TTSConfig
): Promise<string> {
  const {
    apiKey,
    voiceId,
    modelId = "eleven_monolingual_v1",
    stability = 0.5,
    similarityBoost = 0.75,
    style = 0.0,
  } = config

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
        style,
        use_speaker_boost: true,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`)
  }

  const audioBuffer = await response.arrayBuffer()
  const base64Audio = arrayBufferToBase64(audioBuffer)

  return `data:audio/mpeg;base64,${base64Audio}`
}

/**
 * Generate narrated briefing audio.
 *
 * Uses the "briefing" voice preset — deep, authoritative, noir-style.
 */
export async function generateBriefingAudio(
  briefingText: string,
  apiKey: string
): Promise<string> {
  return generateSpeech(briefingText, {
    apiKey,
    voiceId: VOICE_PRESETS.briefing,
    stability: 0.6,
    similarityBoost: 0.8,
    style: 0.1,
  })
}

/**
 * Generate narrated clue audio.
 *
 * Uses the "clue" voice preset — hushed, urgent, intelligence-style.
 */
export async function generateClueAudio(
  clueText: string,
  apiKey: string
): Promise<string> {
  return generateSpeech(clueText, {
    apiKey,
    voiceId: VOICE_PRESETS.clue,
    stability: 0.4,
    similarityBoost: 0.7,
    style: 0.2,
  })
}

/**
 * Generate narrated capture/failure audio.
 *
 * Uses the "carmen" voice preset — Carmen's confident, teasing voice.
 */
export async function generateCarmenAudio(
  messageText: string,
  apiKey: string
): Promise<string> {
  return generateSpeech(messageText, {
    apiKey,
    voiceId: VOICE_PRESETS.carmen,
    stability: 0.35,
    similarityBoost: 0.85,
    style: 0.4,
  })
}

/**
 * Convert ArrayBuffer to base64 string.
 * Works in both Node.js and WASM environments.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
