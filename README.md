# Meridian

An AI chat application that answers questions with live data from [Orthogonal](https://orthogonal.com)'s API catalog: company profiles, people and contact lookups, web and news search, and any other endpoint in the catalog the model decides it needs.

**Live demo:** _(deployed URL here)_

## Architecture

### The problem, in my own words

Build a chat assistant that doesn't just talk, but goes and gets real data. Orthogonal is the data layer: it's a pay-per-call proxy over a catalog of third-party APIs (Serper, ContactOut, Company Enrich, Tomba, and roughly 190 endpoints total at the time of writing). The assistant should decide when a question needs live data, pick the right endpoint, call it, and ground its answer in what came back.

Two properties of Orthogonal shaped everything else:

1. **It's a catalog, not a fixed API.** There is no single "company endpoint." There's a search API (`/v1/search`) that finds endpoints semantically, a details API (`/v1/details`) that returns an endpoint's parameter schema, and a run API (`/v1/run`) that executes any of them. The catalog contents can change without notice.
2. **Every `run` call costs real money.** Prices range from $0.002 (a Serper search) to $0.55 (a ContactOut person enrichment). An LLM that calls tools in a loop can burn through credit fast if nothing stops it.

Assumptions I made:

- Users are anonymous. There's no login. In production you'd gate this behind auth, since every message spends the operator's Orthogonal credit (see Limitations).
- One shared Orthogonal key, held server-side. Users never see or supply keys.
- Conversation history is worth persisting, but the app should still function without a database (it degrades to ephemeral chats).
- The response shapes documented at docs.orthogonal.com are not fully accurate. I verified everything against the live API before writing types; where they disagreed (the `/v1/details` response shape, the price field type), the live API won.

### Functional requirements

- A user can send a message and watch the assistant's answer stream in token by token.
- The assistant calls Orthogonal endpoints when a question needs live data, and can chain calls (e.g. web-search for a domain, then enrich it).
- The assistant can discover and execute catalog endpoints that have no purpose-built tool, via search → details → run.
- Every tool call is visible in the UI: which endpoint ran, with what input, what it returned, and what it cost in cents.
- Conversations persist across page reloads. Users can revisit, resume, and delete them.
- Failures (rate limits, insufficient credits, upstream 5xx, timeouts) surface as readable messages, and the model gets a chance to recover before the user sees an error.

### Non-functional requirements

- **Cost safety.** A single chat turn cannot spend more than a configured cap (default 50¢), no matter what the model decides to do. Identical paid calls within a 10-minute window are served from cache instead of re-charged.
- **Latency.** First token should stream within a few seconds. Catalog metadata lookups (search, details) are cached in memory so repeat questions skip the round trips.
- **Resilience.** Orthogonal errors are classified and normalized; a tool failure never kills the stream. Persistence failures never block a response.
- **Portability.** The LLM provider is a config value (`LLM_PROVIDER=orthogonal|anthropic|openai`), not an import. The default needs no additional key: inference runs through Orthogonal's own catalog.
- **Type safety end to end.** TypeScript strict mode; the Orthogonal client types were validated against live responses, not the docs.

### System diagram

```
                                   ┌──────────────────────────────────────────┐
                                   │                Browser                   │
                                   │                                          │
                                   │  Next.js React UI (useChat)              │
                                   │  · streaming messages                    │
                                   │  · tool trace log w/ cost badges         │
                                   │  · conversation sidebar                  │
                                   └───────┬───────────────────▲──────────────┘
                                           │ POST /api/chat    │ SSE stream
                                           │ (UIMessages)      │ (tokens + tool events)
┌──────────────────────────────────────────▼───────────────────┴──────────────┐
│                        Next.js server (Vercel)                              │
│                                                                             │
│  /api/chat ──► agent loop (AI SDK streamText, max 8 steps)                  │
│                   │                                                         │
│                   │ tool calls                    ┌──────────────────────┐  │
│                   ▼                               │  LLM provider        │  │
│  ┌─────────────────────────────────┐  prompts +   │  default: GLM-5.2    │  │
│  │ Tool layer                      │  tool defs   │  via Orthogonal /run │  │
│  │                                 │◄────────────►│  (or Anthropic/      │  │
│  │                                 │              │  OpenAI via env)     │  │
│  │                                 │              └──────────────────────┘  │
│  │ curated:                        │                                        │
│  │  · enrich_company               │              ┌──────────────────────┐  │
│  │  · find_contact_by_linkedin    ─┼──────────────►  SpendTracker        │  │
│  │  · enrich_person                │  budget gate │  (per-turn ¢ cap)    │  │
│  │  · web_search / news_search     │              └──────────────────────┘  │
│  │ dynamic:                        │                                        │
│  │  · discover_apis (free)         │                                        │
│  │  · get_api_details (free)       │                                        │
│  │  · run_api (paid)               │                                        │
│  └───────────────┬─────────────────┘                                        │
│                  ▼                                                          │
│  ┌─────────────────────────────────┐         ┌──────────────────────────┐   │
│  │ Orthogonal client               │         │ TTL cache (in-memory)    │   │
│  │ · typed search/details/run      │◄───────►│ · details: 1h            │   │
│  │ · error normalization           │         │ · search: 5m             │   │
│  │ · timeout + retryability flags  │         │ · run dedupe: 10m        │   │
│  └───────────────┬─────────────────┘         └──────────────────────────┘   │
│                  │                                                          │
│  /api/conversations[,/:id] ──► conversation store (Drizzle)                 │
│                  │                       │                                  │
└──────────────────┼───────────────────────┼──────────────────────────────────┘
                   │ HTTPS Bearer          │ SQL
                   ▼                       ▼
      ┌────────────────────────┐   ┌──────────────────┐
      │ Orthogonal API         │   │ Postgres (Neon)  │
      │ /v1/search             │   │ · conversations  │
      │ /v1/details            │   │ · messages       │
      │ /v1/list-endpoints     │   │   (parts JSONB)  │
      │ /v1/run ── $ per call ─┼─► └──────────────────┘
      └───────┬────────────────┘
              ▼
      ~190 third-party endpoints
      (Serper, ContactOut, Company
       Enrich, Tomba, Olostep, …)
```

### API specification

The app exposes four endpoints. Everything else is internal.

`POST /api/chat`

Runs one assistant turn. Body:

```json
{
  "id": "conversation-nanoid",
  "messages": [ /* AI SDK UIMessage[], the full visible history */ ]
}
```

Returns an SSE stream of UI message chunks: text deltas, tool-call inputs as they're generated, tool outputs as they resolve, and a finish event carrying `{ costCents, charges[] }` metadata for the turn. Errors before streaming starts return `400` (malformed body) or `500` with `{ error }`.

`GET /api/conversations`

```json
{ "conversations": [{ "id", "title", "updatedAt" }], "persistent": true }
```

`persistent: false` means no database is configured; the client shows an "ephemeral mode" notice.

`GET /api/conversations/:id`

```json
{ "id": "…", "messages": [ /* UIMessage[] with costCents metadata */ ] }
```

`DELETE /api/conversations/:id`

```json
{ "ok": true }
```

### Core entities and data model

Two tables.

```
conversations                      messages
┌────────────────────┐            ┌─────────────────────────────┐
│ id          text PK│◄───────────│ conversation_id  text FK    │
│ title       text   │  1 : many  │ id               text PK    │
│ created_at  tstz   │            │ role             text       │
│ updated_at  tstz   │            │ parts            jsonb      │
└────────────────────┘            │ cost_cents       int        │
                                  │ created_at       tstz       │
                                  └─────────────────────────────┘
                                  index (conversation_id, created_at)
```

The interesting decision is `parts jsonb`. A message is not just text: it's an ordered sequence of text chunks and tool invocations (input, output, state, cost). I store the AI SDK's `UIMessage.parts` array verbatim. Replaying a conversation renders identical to the live stream, including the tool trace, with zero reassembly logic. The alternative (normalized `tool_calls` tables joined back into messages) buys queryability I don't need yet and costs a reconstruction layer that has to track the AI SDK's part format anyway. `cost_cents` is denormalized onto the message row because "what did this turn cost" is the one aggregation I actually want.

### Database choice

Postgres, via Drizzle ORM, hosted on Neon.

- Chat history is relational in the small (conversations → messages) with one awkward, schema-fluid bit (message parts). Postgres handles both: real foreign keys with cascade delete, plus JSONB for the parts.
- Serverless-friendly: Neon speaks the plain Postgres protocol over a connection pooler, which works from Vercel functions without a driver rewrite.
- Drizzle because the schema is two tables and I wanted migrations plus types without an ORM runtime footprint.

The app also runs with no database at all. Every store function no-ops when `DATABASE_URL` is unset, and the UI tells the user history won't survive a refresh. That's deliberate: reviewers can `npm run dev` with two env vars and get the full chat experience.

### Additional infrastructure

- **In-memory TTL cache** (bounded, LRU-ish) in front of Orthogonal. Three jobs: catalog search results (5 min), endpoint schemas (1 h, they're effectively static), and paid `run` de-duplication (10 min). The last one is a cost control, not a performance optimization: an agent that retries or a user who re-asks doesn't get double-charged. On serverless this cache is per-instance, which weakens but doesn't break it; see Limitations.
- **Per-turn spend tracker.** A `SpendTracker` instance is created per request and closed over by every tool. Paid calls check the remaining budget before executing; when it's exhausted the tool returns a structured "budget exceeded" result that instructs the model to stop calling paid tools and answer with what it has.
- Things I considered and left out: a queue (no long-running jobs exist; a chat turn is one request), Redis (the cache abstraction is an interface, so swapping the Map for Redis is a small change when multi-instance dedupe starts to matter), and rate limiting middleware (needed before real launch, see Limitations).

## Design decisions

**Hybrid toolset: curated tools plus dynamic discovery.** This is the biggest one. I gave the model five curated tools mapped to specific catalog endpoints I tested by hand (company enrichment, two contact lookups, web search, news search), and three meta-tools that expose Orthogonal's own primitives (`discover_apis`, `get_api_details`, `run_api`). Curated-only would be reliable but caps the app at whatever I picked; the brief explicitly says "and any other available APIs". Discovery-only would be maximally general but slow (every question starts with catalog search) and fragile (the model composes calls to endpoints nobody tested). The hybrid gets predictable behavior on the common cases and a documented escape hatch for the long tail. The system prompt tells the model to prefer curated tools and to always fetch an endpoint's schema before running it dynamically.

**Verify the API before typing it.** I wrote a smoke script (`scripts/smoke.ts`) and a probe script (`scripts/probe.ts`) and ran them against the live API before writing the tool layer. This caught real divergences from the docs: `/v1/details` returns `pathParams`/`queryParams`/`bodyParams` rather than the documented flat `parameters` array, prices come back as numbers not strings, and `/v1/balance` 404s despite being documented. The curated tools' estimated prices in the code are the live values from those probes.

**Tool errors are data, not exceptions.** Tools never throw. Every failure returns `{ ok: false, error: "..." }` with a normalized code and a retryability hint. A thrown error inside a tool would abort the whole stream and the user would get a broken turn; a structured error gives the model one more step to try an alternative endpoint or explain the failure. The error taxonomy (AUTH, RATE_LIMITED, INSUFFICIENT_CREDITS, UPSTREAM, TIMEOUT, BUDGET_EXCEEDED, …) is shared between the client and the tools.

**One key end to end: the LLM itself runs through Orthogonal.** While probing the catalog I noticed it contains OpenAI-compatible chat-completion endpoints (Baseten, Z.ai, Perplexity). I verified that Baseten's `/v1/chat/completions` via `/v1/run` supports the `tools` array and that `zai-org/GLM-5.2` emits well-formed `tool_calls`, at roughly 0.1¢ per call. So the default deployment needs exactly one secret: the Orthogonal key pays for both the reasoning and the data. Implementation: the AI SDK's OpenAI provider with a custom `fetch` that rewraps each request into the `/v1/run` envelope and unwraps the response, composed with `simulateStreamingMiddleware` because `/v1/run` returns a single JSON body. The tradeoff is real: no true token-by-token streaming on this provider; text arrives per agent step. Direct Anthropic or OpenAI keys restore token streaming with one env change, and I kept those paths tested and first-class. I chose the single-key default anyway because it demonstrates the deepest possible use of the platform being evaluated, and it removes a signup barrier for anyone running the repo.

**Vercel AI SDK over a hand-rolled agent loop.** I considered writing the tool-calling loop directly against the Anthropic API. The AI SDK won on three counts: the multi-step loop with `stopWhen` is exactly the agent shape I needed, the UIMessage stream protocol carries tool inputs/outputs to the client incrementally (which is what makes the live tool trace possible without inventing a wire format), and provider abstraction came free, which the "provider-agnostic" requirement made non-optional. The cost is a framework dependency whose part-type unions occasionally fight you in TypeScript.

**Budget enforcement lives server-side, per turn.** The cap is not in the prompt (models don't reliably obey numeric constraints) and not in the client (trivially bypassed). It's a counter in the request handler that every paid tool consults. Prompt guidance exists too, but as an optimization (the model economizes voluntarily), not as the safety mechanism.

**Costs are a first-class UI element.** Each tool call renders as a trace row with a cent badge; each assistant message shows its total turn cost. Partly honesty (this app spends real money and users should see it), partly because it made my own debugging faster: you can watch the model choose a 55¢ enrichment when a 3¢ lookup would do, and then go fix the prompt.

## Tradeoffs

- **No auth, by choice.** The brief says "assume real customers" and a real deployment would need user accounts and per-user budgets. I spent that time on cost controls and error handling instead, because those are the parts specific to this problem; auth is commodity work (NextAuth or Clerk drop in) that would have displaced the interesting engineering.
- **In-memory cache instead of Redis.** Correct behavior on a single warm instance, weaker guarantees across cold starts and concurrent instances. The `CacheStore` interface exists so the swap is contained. For a take-home deployment on one Vercel region, the Map wins on simplicity per unit of benefit.
- **Last-2-messages persistence per turn.** The chat route persists the user message and assistant response after each turn rather than diffing the full history. Simple and correct for the append-only flow the UI generates; it would miss edits or regenerations of older messages if those features were added.
- **Trimmed tool outputs.** Upstream responses get truncated at 12 kB before reaching the model. Saves tokens and keeps latency down, at the cost of occasionally cutting off a long result. The full response is still visible in the UI trace (up to its own display cap).
- **No streaming of intermediate model "thinking".** Reasoning parts are dropped in the UI. Cleaner for end users, less transparency for the curious.
- **Simulated streaming on the default provider.** Orthogonal's `/v1/run` cannot stream, so with `LLM_PROVIDER=orthogonal` each agent step's text arrives as a block rather than token by token. Tool trace events still appear live between steps, which preserves most of the perceived responsiveness. Direct Anthropic/OpenAI keys restore true streaming.
- **Two tables, no users table.** The data model matches what the app does today rather than speculating about multi-tenancy. Adding `user_id` to conversations is a one-line migration when auth arrives.

## Limitations

If this deployed to production today, these are the things I'd worry about, in order:

1. **Anyone can spend my Orthogonal credit.** No auth plus a shared server-side key means the per-turn cap is the only thing between a scripted abuser and my balance. Fix: auth, per-user budgets, and a global daily cap enforced in the database rather than in process memory.
2. **No rate limiting.** A loop hitting `/api/chat` burns LLM tokens and Orthogonal credit in parallel. Needs IP-based limits at the edge before anything else.
3. **Cache and budget state are per-instance.** Two concurrent serverless instances each allow a full budget and neither sees the other's dedupe cache. Low blast radius at take-home traffic, real money at scale. Redis (or Postgres advisory state) fixes both.
4. **Dynamic `run_api` trusts catalog metadata.** The model composes parameters from `/v1/details` schemas. A catalog endpoint with a wrong or malicious schema description could induce bad calls. Payloads only ever go to Orthogonal's own host, which bounds the damage, but input validation is only as good as the catalog's metadata.
5. **No observability.** Errors go to `console.error`. Production needs structured logs, cost dashboards per conversation/day, and alerts on spend velocity and error rates.
6. **Conversations are unbounded.** History is capped at 40 messages per request, but there's no summarization, so long conversations lose early context silently.

## Future improvements

With another week:

- **Auth and per-user budgets** (Clerk plus a `users` table and a daily spend ledger). This unblocks actually letting strangers use it, which is the biggest current gap.
- **Redis for cache and budget state**, making cost controls correct under concurrency instead of correct per instance.
- **Rate limiting** at the middleware layer.
- **Evals for tool selection.** A small fixture set of questions with expected tool choices, run against prompt changes. Tool-selection quality is the product; right now regressions are caught by vibes.

With another month:

- **A curated-tool registry instead of hardcoded tools.** The five curated tools are code today. A registry (endpoint slug, path, schema, price, prompt description) stored in Postgres would let new catalog endpoints get promoted from "discovered dynamically" to "curated" without a deploy, closing the loop between the two halves of the hybrid design.
- **Result citations.** Tool outputs carry request IDs; threading them into the answer text as citation markers would make the grounding verifiable instead of asserted.
- **Cost-aware planning.** Give the model the turn budget and endpoint prices up front and let it plan the cheapest path to an answer, rather than discovering budget exhaustion mid-turn.
- **Conversation summarization** so old context compresses instead of falling off the end.

## Running it

```bash
git clone <repo>
cd <repo>
npm install
cp .env.example .env.local   # fill in ORTHOGONAL_API_KEY and one LLM key
npm run dev
```

Minimum viable env: `ORTHOGONAL_API_KEY`. That single key covers both the LLM (GLM-5.2 through Orthogonal's Baseten endpoint) and the data tools. Optionally set `LLM_PROVIDER=anthropic` or `openai` with the matching key for true token streaming. Without `DATABASE_URL` the app runs in ephemeral mode; with it, run `npx drizzle-kit push` once to create the two tables.

`npx tsx scripts/smoke.ts` sanity-checks your Orthogonal key against the live catalog without spending anything.
