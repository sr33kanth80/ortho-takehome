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
