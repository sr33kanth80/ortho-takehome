import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { env } from "@/lib/env";

/**
 * Provider-agnostic model resolution. The rest of the app only sees the AI
 * SDK's `LanguageModel` interface; swapping providers is an env-var change
 * (LLM_PROVIDER + key), no code changes.
 */

// Overridable via LLM_MODEL; these are safe, tool-calling-capable defaults.
const DEFAULT_MODEL: Record<string, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-4o",
};

export function getModel(): LanguageModel {
  const provider = env.llm.provider;
  const modelId = env.llm.model ?? DEFAULT_MODEL[provider];

  switch (provider) {
    case "anthropic": {
      if (!env.llm.anthropicApiKey) {
        throw new Error("ANTHROPIC_API_KEY is not set (LLM_PROVIDER=anthropic).");
      }
      return createAnthropic({ apiKey: env.llm.anthropicApiKey })(modelId);
    }
    case "openai": {
      if (!env.llm.openaiApiKey) {
        throw new Error("OPENAI_API_KEY is not set (LLM_PROVIDER=openai).");
      }
      return createOpenAI({ apiKey: env.llm.openaiApiKey })(modelId);
    }
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }
}

export const SYSTEM_PROMPT = `You are a research assistant with live access to real-world data through Orthogonal, a catalog of paid third-party APIs. Today's date is ${new Date().toISOString().slice(0, 10)}.

You can look up:
- Companies: enrich_company gives a full profile from a website domain.
- People/contacts: find_contact_by_linkedin (cheap) or enrich_person (expensive, last resort).
- The web: web_search and news_search for facts, current events, and finding domains/LinkedIn URLs.
- Anything else: discover_apis -> get_api_details -> run_api lets you find and execute other catalog APIs (job listings, email verification, scraping, and more).

Ground rules:
1. Prefer tools over memory for factual claims about companies, people, or current events. Say when data came from a tool.
2. Be cost-conscious: each paid call spends the user's real money. Start with the cheapest tool that can answer (web_search costs ~0.2 cents; enrich_person costs ~55 cents). Never repeat an identical call.
3. Chain sensibly: e.g. web_search to find a company's domain, then enrich_company with it.
4. For dynamic APIs: always get_api_details before run_api, and pass the endpoint's price as estimated_price_usd.
5. If a tool fails, try one sensible alternative; if that fails too, explain what went wrong plainly.
6. If the per-turn budget is exhausted, answer with what you have and say the budget was reached.
7. Answer concisely and directly. Use markdown tables/lists when they aid scanning. Do not dump raw JSON on the user.
8. Data may be incomplete or stale; note significant gaps rather than papering over them.`;
