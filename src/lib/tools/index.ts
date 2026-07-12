import { tool } from "ai";
import { z } from "zod";
import { getOrthogonalClient } from "@/lib/orthogonal/client";
import { OrthogonalError } from "@/lib/orthogonal/errors";
import { SpendTracker, usdToCents } from "./spend";

/**
 * Tool layer — the hybrid design.
 *
 * Curated tools (enrich_company, find_contact_*, web_search, news_search) map
 * to specific, verified, cheap catalog endpoints with tight schemas: reliable
 * and predictable for the common questions (companies, contacts, web).
 *
 * Discovery meta-tools (discover_apis, get_api_details, run_api) expose
 * Orthogonal's own catalog primitives so the assistant can reach ANY of the
 * catalog's endpoints at runtime for long-tail requests.
 *
 * Every paid call goes through `paidRun`, which enforces the per-turn budget
 * and normalises errors into model-readable results (never throws — a thrown
 * tool error would abort the whole stream; a structured error lets the model
 * recover, e.g. try a different tool or tell the user).
 */

/** Max characters of upstream JSON returned to the model per tool call. */
const MAX_RESULT_CHARS = 12_000;

export interface ToolResultMeta {
  ok: boolean;
  costCents?: number;
  totalSpentCents?: number;
  error?: string;
  truncated?: boolean;
}

function trim(data: unknown): { text: string; truncated: boolean } {
  const s = JSON.stringify(data);
  if (s.length <= MAX_RESULT_CHARS) return { text: s, truncated: false };
  return { text: s.slice(0, MAX_RESULT_CHARS), truncated: true };
}

async function paidRun(
  spend: SpendTracker,
  args: { api: string; path: string; body?: Record<string, unknown>; query?: Record<string, unknown> },
  estimatedUsd?: number | string,
): Promise<ToolResultMeta & { data?: string }> {
  const est = usdToCents(estimatedUsd);
  if (!spend.canAfford(est)) {
    return {
      ok: false,
      error:
        `Budget exceeded: this turn already spent ${spend.totalCents}¢ of its ${spend.limitCents}¢ limit. ` +
        `Do not retry paid calls; answer with what you have and tell the user the per-turn budget was reached.`,
      totalSpentCents: spend.totalCents,
    };
  }
  try {
    const res = await getOrthogonalClient().run(args);
    const cost = res.priceCents ?? est ?? 0;
    spend.record(args.api, args.path, cost);
    const { text, truncated } = trim(res.data);
    return { ok: true, costCents: cost, totalSpentCents: spend.totalCents, data: text, truncated };
  } catch (e) {
    if (e instanceof OrthogonalError) {
      return {
        ok: false,
        error: `${e.userMessage}${e.retryable ? " (retryable)" : " (do not retry this call)"}`,
        totalSpentCents: spend.totalCents,
      };
    }
    return { ok: false, error: `Unexpected error: ${(e as Error).message}`, totalSpentCents: spend.totalCents };
  }
}

/**
 * Build the toolset for one chat turn. A fresh SpendTracker must be passed per
 * request so budgets are per-turn, not per-process.
 */
export function createTools(spend: SpendTracker) {
  return {
    // ── curated: companies ──────────────────────────────────────────────
    enrich_company: tool({
      description:
        "Get a full company profile by website domain: industry, employee count, revenue, location, funding, technologies, social links. " +
        "Costs ~1¢. Use this first for any company question. Input must be a bare domain like 'stripe.com'.",
      inputSchema: z.object({
        domain: z
          .string()
          .describe("Company website domain, bare host only (e.g. 'stripe.com' — no protocol, no path)"),
      }),
      execute: async ({ domain }) =>
        paidRun(spend, { api: "company-enrich", path: "/companies/enrich", query: { domain } }, 0.0123),
    }),

    // ── curated: contacts / people ──────────────────────────────────────
    find_contact_by_linkedin: tool({
      description:
        "Get contact details (emails, phone) for a person from their LinkedIn profile URL. Costs ~3¢.",
      inputSchema: z.object({
        profile: z.string().describe("Full LinkedIn profile URL, e.g. 'https://www.linkedin.com/in/satyanadella'"),
        include_phone: z.boolean().optional().describe("Also return phone numbers"),
      }),
      execute: async ({ profile, include_phone }) =>
        paidRun(
          spend,
          {
            api: "contactout",
            path: "/v1/people/linkedin",
            query: { profile, ...(include_phone !== undefined ? { include_phone } : {}) },
          },
          0.03,
        ),
    }),

    enrich_person: tool({
      description:
        "Enrich a person from partial info (name + company, email, or phone) into a full profile with contact details. " +
        "EXPENSIVE (~55¢) — only use when find_contact_by_linkedin cannot answer and the user clearly wants this person's details.",
      inputSchema: z.object({
        full_name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        linkedin_url: z.string().optional(),
        company_domain: z.string().optional().describe("Company website domain, e.g. 'stripe.com'"),
        job_title: z.string().optional(),
        location: z.string().optional(),
      }),
      execute: async (body) =>
        paidRun(
          spend,
          {
            api: "contactout",
            path: "/v1/people/enrich",
            body: Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)),
          },
          0.55,
        ),
    }),

    // ── curated: web ─────────────────────────────────────────────────────
    web_search: tool({
      description:
        "Google web search: organic results, knowledge graph, people-also-ask. Very cheap (~0.2¢). " +
        "Use for general facts, research, or finding a company's domain / person's LinkedIn URL before enrichment.",
      inputSchema: z.object({
        q: z.string().describe("Search query"),
        num: z.number().int().min(1).max(20).optional().describe("Number of results (default 10)"),
        tbs: z
          .enum(["qdr:h", "qdr:d", "qdr:w", "qdr:m", "qdr:y"])
          .optional()
          .describe("Time filter: past hour/day/week/month/year"),
      }),
      execute: async ({ q, num, tbs }) =>
        paidRun(
          spend,
          {
            api: "serper",
            path: "/search",
            body: { q, ...(num ? { num } : {}), ...(tbs ? { tbs } : {}) },
          },
          0.002,
        ),
    }),

    news_search: tool({
      description:
        "Google News search: recent articles with titles, sources, dates, snippets. Very cheap (~0.2¢). " +
        "Use for current events, press coverage, or anything time-sensitive.",
      inputSchema: z.object({
        q: z.string().describe("News search query"),
        num: z.number().int().min(1).max(20).optional(),
        tbs: z.enum(["qdr:h", "qdr:d", "qdr:w", "qdr:m", "qdr:y"]).optional().describe("Time filter"),
      }),
      execute: async ({ q, num, tbs }) =>
        paidRun(
          spend,
          {
            api: "serper",
            path: "/news",
            body: { q, ...(num ? { num } : {}), ...(tbs ? { tbs } : {}) },
          },
          0.002,
        ),
    }),

    // ── dynamic discovery (free) ─────────────────────────────────────────
    discover_apis: tool({
      description:
        "FREE. Semantic search over Orthogonal's catalog of ~190 third-party API endpoints (data enrichment, scraping, jobs, email verification, and more). " +
        "Use when no curated tool fits the request, to find an endpoint you can then inspect with get_api_details and execute with run_api.",
      inputSchema: z.object({
        prompt: z.string().describe("Natural-language description of the capability you need"),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ prompt, limit }) => {
        try {
          const res = await getOrthogonalClient().search(prompt, limit ?? 8);
          const { text, truncated } = trim(
            res.results?.map((a) => ({
              name: a.name,
              slug: a.slug,
              endpoints: a.endpoints?.map((e) => ({
                path: e.path,
                method: e.method,
                description: e.description,
                priceUsd: e.price,
                score: e.score,
              })),
            })),
          );
          return { ok: true, costCents: 0, data: text, truncated } satisfies ToolResultMeta & { data: string };
        } catch (e) {
          const msg = e instanceof OrthogonalError ? e.userMessage : (e as Error).message;
          return { ok: false, error: msg } satisfies ToolResultMeta;
        }
      },
    }),

    get_api_details: tool({
      description:
        "FREE. Get the full parameter schema (path/query/body params, price, method) for a catalog endpoint found via discover_apis. " +
        "ALWAYS call this before run_api so you pass valid parameters.",
      inputSchema: z.object({
        api: z.string().describe("API slug from discover_apis, e.g. 'tomba'"),
        path: z.string().describe("Endpoint path, e.g. '/v1/companies/find'"),
      }),
      execute: async ({ api, path }) => {
        try {
          const res = await getOrthogonalClient().details(api, path);
          const ep = res.endpoint;
          const { text, truncated } = trim({
            api: res.api?.slug,
            path: ep?.path,
            method: ep?.method,
            priceUsd: ep?.price,
            description: ep?.description,
            pathParams: ep?.pathParams,
            queryParams: ep?.queryParams,
            bodyParams: ep?.bodyParams,
          });
          return { ok: true, costCents: 0, data: text, truncated } satisfies ToolResultMeta & { data: string };
        } catch (e) {
          const msg = e instanceof OrthogonalError ? e.userMessage : (e as Error).message;
          return { ok: false, error: msg } satisfies ToolResultMeta;
        }
      },
    }),

    run_api: tool({
      description:
        "PAID. Execute any catalog endpoint discovered via discover_apis. You MUST call get_api_details first and pass parameters exactly as its schema specifies " +
        "(GET endpoints take 'query', POST endpoints take 'body'). Respect the per-turn budget; prefer endpoints costing a few cents.",
      inputSchema: z.object({
        api: z.string().describe("API slug, e.g. 'tomba'"),
        path: z.string().describe("Endpoint path, e.g. '/v1/companies/find'"),
        query: z.record(z.string(), z.unknown()).optional().describe("Query parameters (for GET endpoints)"),
        body: z.record(z.string(), z.unknown()).optional().describe("Body parameters (for POST endpoints)"),
        estimated_price_usd: z
          .number()
          .optional()
          .describe("The endpoint's price from get_api_details, used for budget pre-checks"),
      }),
      execute: async ({ api, path, query, body, estimated_price_usd }) =>
        paidRun(spend, { api, path, query, body }, estimated_price_usd),
    }),
  };
}

export type AppTools = ReturnType<typeof createTools>;
