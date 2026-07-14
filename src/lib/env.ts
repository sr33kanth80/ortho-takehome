/**
 * Centralised, validated environment access.
 *
 * We deliberately avoid throwing at module-load time for optional values so the
 * app can boot in a degraded-but-useful mode (e.g. no DATABASE_URL -> ephemeral
 * conversations). Required values are validated lazily where they are consumed.
 */

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

function int(name: string, fallback: number): number {
  const v = optional(name);
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export type LlmProvider = "orthogonal" | "anthropic" | "openai";

/**
 * Read lazily (getters) rather than snapshotting process.env at import time:
 * import hoisting means this module can be evaluated before dotenv/config in
 * scripts, and lazy reads also play nicer with test overrides.
 */
export const env = {
  orthogonal: {
    get apiKey() {
      return optional("ORTHOGONAL_API_KEY");
    },
    get baseUrl() {
      return optional("ORTHOGONAL_BASE_URL") ?? "https://api.orthogonal.com";
    },
  },
  llm: {
    get provider() {
      return (optional("LLM_PROVIDER") ?? "orthogonal") as LlmProvider;
    },
    get model() {
      return optional("LLM_MODEL");
    },
    get anthropicApiKey() {
      return optional("ANTHROPIC_API_KEY");
    },
    get openaiApiKey() {
      return optional("OPENAI_API_KEY");
    },
  },
  // "Talk to Meridian" voice mode. Two providers:
  //  - "orthogonal" (default): fully single-key — speech-to-text and
  //    text-to-speech run through Orthogonal's catalog (ElevenLabs), chained
  //    around the existing text agent. Push-to-talk.
  //  - "xai": realtime Grok Voice over WebRTC (needs XAI_API_KEY).
  voice: {
    get provider() {
      return (optional("VOICE_PROVIDER") ?? "orthogonal") as "orthogonal" | "xai";
    },
    /** ElevenLabs voice id used for TTS in the orthogonal provider. */
    get elevenVoiceId() {
      return optional("VOICE_ELEVEN_VOICE_ID") ?? "21m00Tcm4TlvDq8ikWAM"; // "Rachel"
    },
    // xAI Grok Voice (only used when VOICE_PROVIDER=xai).
    get apiKey() {
      return optional("XAI_API_KEY");
    },
    get model() {
      return optional("XAI_VOICE_MODEL") ?? "grok-voice-latest";
    },
    get voice() {
      return optional("XAI_VOICE") ?? "eve";
    },
    /** Hard per-voice-session caps (safety: voice bills per turn + per tool call). */
    get maxSessionSeconds() {
      return int("VOICE_MAX_SESSION_SECONDS", 300);
    },
    get maxSpendCents() {
      return int("VOICE_MAX_SPEND_CENTS", 50);
    },
  },
  get databaseUrl() {
    return optional("DATABASE_URL");
  },
  guards: {
    get maxSpendCentsPerTurn() {
      return int("MAX_SPEND_CENTS_PER_TURN", 50);
    },
    get maxAgentSteps() {
      return int("MAX_AGENT_STEPS", 8);
    },
  },
} as const;

/** Throw a clear error if a required key is missing at the point of use. */
export function requireOrthogonalKey(): string {
  if (!env.orthogonal.apiKey) {
    throw new Error(
      "ORTHOGONAL_API_KEY is not set. Add it to .env.local (see .env.example).",
    );
  }
  return env.orthogonal.apiKey;
}

export const hasDatabase = () => Boolean(env.databaseUrl);

/**
 * Voice mode availability. The default "orthogonal" provider only needs the
 * Orthogonal key (already required by the app), so voice works out of the box;
 * the "xai" provider needs XAI_API_KEY.
 */
export const hasVoice = () =>
  env.voice.provider === "xai" ? Boolean(env.voice.apiKey) : Boolean(env.orthogonal.apiKey);
