import { createTools } from "@/lib/tools";
import type { SpendTracker } from "@/lib/tools/spend";
import type { ExecutionActor } from "@/lib/governance/execution";

/**
 * Voice tool bridge.
 *
 * Grok Voice takes an array of `function` tool definitions in its session
 * config. We expose Meridian's existing capabilities as those functions, and
 * route every invocation back through the SAME `createTools()` + `SpendTracker`
 * used by the text chat — so voice answers with identical live Orthogonal data,
 * under the identical per-call budget guard, at the identical cost.
 *
 * The definitions below mirror the tools' input schemas (see lib/tools/index.ts).
 * Descriptions are trimmed for a spoken context; execution is not duplicated.
 */

export interface VoiceFunctionDef {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const TBS = { type: "string", enum: ["qdr:h", "qdr:d", "qdr:w", "qdr:m", "qdr:y"] };

export const VOICE_TOOL_DEFS: VoiceFunctionDef[] = [
  {
    type: "function",
    name: "enrich_company",
    description:
      "Full company profile from a website domain (industry, size, revenue, location, funding). ~1¢. Use first for company questions.",
    parameters: {
      type: "object",
      properties: { domain: { type: "string", description: "Bare domain, e.g. stripe.com" } },
      required: ["domain"],
    },
  },
  {
    type: "function",
    name: "find_contact_by_linkedin",
    description: "Contact details (email, phone) for a person from their LinkedIn profile URL. ~3¢.",
    parameters: {
      type: "object",
      properties: {
        profile: { type: "string", description: "Full LinkedIn profile URL" },
        include_phone: { type: "boolean" },
      },
      required: ["profile"],
    },
  },
  {
    type: "function",
    name: "enrich_person",
    description:
      "Enrich a person from partial info into a full profile with contacts. EXPENSIVE (~55¢) — last resort only.",
    parameters: {
      type: "object",
      properties: {
        full_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        linkedin_url: { type: "string" },
        company_domain: { type: "string" },
        job_title: { type: "string" },
        location: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "web_search",
    description: "Google web search for facts, research, or finding a domain / LinkedIn URL. Very cheap (~0.2¢).",
    parameters: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query" },
        num: { type: "integer", minimum: 1, maximum: 20 },
        tbs: { ...TBS, description: "Time filter: past hour/day/week/month/year" },
      },
      required: ["q"],
    },
  },
  {
    type: "function",
    name: "news_search",
    description: "Google News search for current events and press coverage. Very cheap (~0.2¢).",
    parameters: {
      type: "object",
      properties: {
        q: { type: "string", description: "News search query" },
        num: { type: "integer", minimum: 1, maximum: 20 },
        tbs: { ...TBS, description: "Time filter" },
      },
      required: ["q"],
    },
  },
  {
    type: "function",
    name: "discover_apis",
    description: "FREE. Semantic search over Orthogonal's ~190-endpoint catalog when no other tool fits.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Capability you need" },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["prompt"],
    },
  },
  {
    type: "function",
    name: "get_api_details",
    description: "FREE. Parameter schema + price for a catalog endpoint. Always call before run_api.",
    parameters: {
      type: "object",
      properties: {
        api: { type: "string", description: "API slug from discover_apis" },
        path: { type: "string", description: "Endpoint path" },
      },
      required: ["api", "path"],
    },
  },
  {
    type: "function",
    name: "run_api",
    description: "PAID. Execute a catalog endpoint discovered via discover_apis. Call get_api_details first.",
    parameters: {
      type: "object",
      properties: {
        api: { type: "string" },
        path: { type: "string" },
        query: { type: "object", additionalProperties: true },
        body: { type: "object", additionalProperties: true },
        estimated_price_usd: { type: "number" },
      },
      required: ["api", "path"],
    },
  },
];

const VOICE_TOOL_NAMES = new Set(VOICE_TOOL_DEFS.map((d) => d.name));

export interface VoiceToolResult {
  ok: boolean;
  /** String payload handed back to the voice model. */
  output: string;
  costCents: number;
  totalCents: number;
  remainingCents: number;
}

/**
 * Execute one voice tool call through the real tool layer. `spend` is the
 * session-scoped SpendTracker, so the per-session budget accumulates across
 * every call in the conversation (voice sessions are long-lived, unlike a
 * single text turn).
 */
export async function executeVoiceTool(
  name: string,
  args: Record<string, unknown>,
  spend: SpendTracker,
  actor: ExecutionActor,
  toolCallId: string,
): Promise<VoiceToolResult> {
  const base = (data: Partial<VoiceToolResult>): VoiceToolResult => ({
    ok: false,
    output: "",
    costCents: 0,
    totalCents: spend.totalCents,
    remainingCents: spend.remainingCents,
    ...data,
  });

  if (!VOICE_TOOL_NAMES.has(name)) {
    return base({ ok: false, output: `Unknown tool: ${name}` });
  }

  const tools = createTools(spend, actor) as unknown as Record<
    string,
    { execute: (a: unknown, o: unknown) => Promise<{ ok: boolean; data?: string; error?: string; costCents?: number }> }
  >;
  try {
    const res = await tools[name].execute(args, {
      toolCallId,
      messages: [],
    });
    return base({
      ok: res.ok,
      output: res.ok ? res.data ?? "" : res.error ?? "Tool failed",
      costCents: res.costCents ?? 0,
      totalCents: spend.totalCents,
      remainingCents: spend.remainingCents,
    });
  } catch (e) {
    return base({ ok: false, output: `Tool error: ${(e as Error).message}` });
  }
}
