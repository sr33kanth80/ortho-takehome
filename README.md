# Meridian

Meridian is a web-based AI research assistant that answers questions with live data through [Orthogonal](https://orthogonal.com). It combines conversational research, visible tool execution, per-call cost reporting, reusable research recipes, persistent history, and optional push-to-talk voice in one interface.

**Last updated:** July 13, 2026

The application exposes this exact file at `/readme`. The global **README** button in the top-right corner of every page opens that route, so the repository document and evaluator-facing document have one source of truth.

## TLDR;

Bera, I treated Meridian as the smallest honest version of the product we intended to build around Orthogonal: one conversational surface where a user can ask for research, the assistant can find the right live API, run it, and show the user exactly what happened and what it cost.

I implemented that through a hybrid agent. The common paths are curated for reliability: company research, contacts, web, and news. The long tail goes through Orthogonal's catalog discovery flow: search for an API, inspect its schema, choose the useful and affordable option, and run it. I kept the tool trace, spend guardrails, conversation history, recipes, voice path, and evaluator-facing README visible so the app feels like a real product rather than a chat demo.

Visually, I implemented Orthogonal's design but with a medium-y, rolex-esque design: editorial typography, parchment, forest ink, restrained emerald accents, and a sense of considered craft. The goal was to make Meridian feel calm, premium, and trustworthy while still making the live-data machinery legible underneath.

## Architecture

### The problem, in my own words

The challenge is not merely to place a chat box in front of an LLM. The assistant must recognize when a question requires current external evidence, select an appropriate data source, call it safely through Orthogonal, and explain the result without hiding cost or provenance.

Orthogonal behaves like a tool router over a changing catalog of third-party APIs. It provides primitives for semantic catalog search, endpoint inspection, and paid execution. That creates two central engineering constraints:

1. **The tool surface is dynamic.** Hardcoding a few endpoints would produce a reliable demo but would not demonstrate access to the wider Orthogonal catalog.
2. **Calls have real monetary cost.** An autonomous model can retry, chain tools, or choose an unnecessarily expensive endpoint. Cost control must be enforced in code rather than entrusted to a prompt.

The product therefore uses a hybrid agent: curated tools handle common research reliably, while catalog-discovery tools let the model reach long-tail capabilities at runtime.

### Assumptions

- Meridian uses a simple email-and-password account system. An opaque, HttpOnly session cookie identifies the account; each conversation is scoped to its owner on the server.
- A single server-side Orthogonal API key funds inference, data tools, and the default voice pipeline. The key is never sent to the browser.
- Postgres is required for the application. `DATABASE_URL` backs accounts, sessions, and durable conversation history; the app does not fall back to shared process memory.
- Recipes are transparent prompt templates and research methods, not a separate autonomous runtime. Starting a recipe hands its instructions to the same Meridian agent and cost controls used by ordinary chat.
- Live API responses are the source of truth when they differ from documentation. Probe scripts were used to validate Orthogonal response shapes and endpoint prices.
- The current scope uses self-hosted credential auth to keep account setup light while establishing an actual ownership boundary for customer data.

### Functional requirements

- The agent can chain multiple tools in one turn.
- Common company, contact, web, and news tasks use curated, validated tools.
- Unusual requests can search the Orthogonal catalog, inspect an endpoint schema, and execute the selected endpoint.
- Tool inputs, outputs, failures, and attributed costs are visible in the conversation trace.
- A persistent animated `Cooking` status remains visible for the entire agent turn, including pauses between multiple tool calls and final answer synthesis.
- Conversation history can be listed, reopened, resumed, and deleted.
- Accounts can register, sign in, and sign out. History is visible only to the account that created it.
- An in-flight conversation continues when a user switches to another conversation and returns.
- Users can speak to Meridian through a push-to-talk voice interface backed by the same research agent.
- The landing page includes categorized prompt suggestions and a horizontally scrollable Cookbook of reusable recipes.
- The Use Cases page presents every recipe and opens its full details in an accessible overlay without navigating away.
- Privacy Policy, Terms of Use, Use Cases, and README pages share the stationary application sidebar.
- A compact footer exposes Use Cases, Privacy, and Terms links on the landing page.

### Non-functional requirements

- **Cost safety:** every chat turn has a server-enforced paid-tool budget, defaulting to 50 cents. Voice has independent session duration and spend caps.
- **Transparency:** the UI shows which tools ran and the cost attributed to each assistant turn.
- **Resilience:** malformed input is rejected, upstream failures are normalized, tool errors are returned to the model as data, and persistence failures do not break a response stream.
- **Performance:** catalog searches and schemas are cached; identical successful paid calls are deduplicated for ten minutes on the current server instance.
- **Portability:** model selection is controlled by environment variables. Orthogonal, Anthropic, and OpenAI providers share the same AI SDK interface.
- **Security:** secrets stay server-side, paid calls pass through a budget gate, tool outputs are length-bounded, and Orthogonal requests have a 30-second timeout.
- **Accessibility:** interactive cards are keyboard controls; recipe dialogs support Escape, backdrop dismissal, focus containment, and focus restoration.
- **Type safety:** the application uses strict TypeScript, Zod tool schemas, typed Orthogonal responses, and AI SDK message validation.
- **Graceful degradation:** missing optional database or voice configuration does not prevent text research from working.

### System design diagram

```text
+----------------------------- BROWSER -----------------------------+
| Meridian UI: chat, history, tool trace, recipes, voice, and docs |
+-------------------------------+-----------------------------------+
                                |
              +-----------------+-----------------+
              |                 |                 |
              v                 v                 v
        POST /api/chat     History APIs       Voice APIs
              |                 |                 |
+-------------+-----------------+-----------------+-----------------+
|                         NEXT.JS SERVER                            |
|                                                                  |
|  AI SDK agent ------> Model provider ------> Orthogonal API      |
|       |                                      (AI + STT/TTS)       |
|       v                                                          |
|  Hybrid tools --> Spend gate --> Orthogonal client               |
|                                      |                            |
|                                      +--> API catalog             |
|                                      +--> TTL cache               |
|                                                                  |
|  Conversation store --------------------> Postgres or memory      |
|  /readme -------------------------------> README.md               |
+------------------------------------------------------------------+
```

### Runtime request flow

1. The browser sends the visible `UIMessage[]` history and a client-generated conversation ID to `POST /api/chat`.
2. The server validates and caps history at the latest 40 messages.
3. A new `SpendTracker` and toolset are created for the turn.
4. The AI SDK runs the selected model for at most `MAX_AGENT_STEPS` steps.
5. Curated or dynamically discovered tools call Orthogonal through the typed client.
6. Paid calls pass through the budget check. Successful identical calls may be served from the TTL cache.
7. Text and tool events stream to the browser through the AI SDK UI-message protocol.
8. Final cost metadata is attached to the assistant message.
9. The trailing user and assistant messages are saved to Postgres or the in-memory fallback. Persistence is best-effort and cannot terminate the user-facing response.

### Major components

| Component | Responsibility |
| --- | --- |
| `src/components/app.tsx` | Conversation lifecycle, persistent per-conversation chat instances, landing experience, streaming UI orchestration |
| `src/app/api/chat/route.ts` | Input validation, agent execution, streaming response metadata, persistence |
| `src/lib/llm.ts` | Provider-neutral model selection and Orthogonal-routed inference |
| `src/lib/tools/index.ts` | Curated tools, dynamic catalog tools, structured tool failures |
| `src/lib/tools/spend.ts` | Server-side per-turn and per-session spend accounting |
| `src/lib/orthogonal/client.ts` | Authenticated Orthogonal search, details, list, and run requests; cache and error normalization |
| `src/lib/db/store.ts` | Postgres-backed history with an in-memory fallback |
| `src/lib/voice/*` | Voice sessions, transient recordings, Orthogonal STT/TTS, and realtime-tool bridge |
| `src/lib/recipes.ts` | Shared recipe definitions used by the landing Cookbook and Use Cases overlays |
| `src/app/readme/page.tsx` | Reads and renders this exact `README.md` inside the application |

### API specification


#### `POST /api/chat`

Runs one assistant turn.

Request body:

```json
{
  "id": "client-generated-conversation-id",
  "messages": [
    {
      "id": "message-id",
      "role": "user",
      "parts": [{ "type": "text", "text": "Profile stripe.com" }]
    }
  ]
}
```

The server requires an authenticated session and a non-empty `messages` array, validates it with the AI SDK, and uses only the latest 40 messages. The submitted user message is saved before model execution, so it remains in the thread if a later model or provider call fails. Invalid JSON or malformed messages return `400` with `{ "error": string }`.

Success returns an AI SDK UI-message event stream containing text deltas, tool-call states, tool results, and final message metadata:

```json
{
  "costCents": 2,
  "charges": [{ "api": "company-enrich", "path": "/companies/enrich", "cents": 2 }]
}
```

#### `GET /api/conversations`

Returns the newest 50 conversation summaries.

```json
{
  "conversations": [
    { "id": "abc", "title": "Profile stripe.com", "updatedAt": "2026-07-13T12:00:00.000Z" }
  ]
}
```

Returns `401` without a signed-in account. Results are filtered by the current account.

#### `GET /api/conversations/:id`

Returns `{ "id": string, "messages": UIMessage[] }` for a conversation owned by the current account. Stored cost metadata is restored onto assistant messages.

#### `DELETE /api/conversations/:id`

Deletes a conversation owned by the current account and its messages. Returns `{ "ok": true }`. Postgres uses cascade deletion for messages.

#### `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`

Creates an account, starts an existing account session, or clears the current session. Register and login accept `{ "email": string, "password": string }`; passwords must be at least 10 characters. Sessions are random opaque tokens, stored only as SHA-256 hashes in Postgres, and delivered as `HttpOnly`, `SameSite=Lax` cookies.

#### `GET /api/voice/session`

Capability probe returning `{ "configured": boolean, "provider": "orthogonal" | "xai" }`.

#### `POST /api/voice/session`

Creates an opaque voice session with server-side history and a session-level spend tracker.

The default Orthogonal response contains:

```json
{
  "configured": true,
  "provider": "orthogonal",
  "sessionId": "opaque-id",
  "caps": { "maxSessionSeconds": 300, "maxSpendCents": 50 }
}
```

When `VOICE_PROVIDER=xai`, the response also contains an ephemeral realtime token, model, voice, instructions, and tool definitions.

#### `POST /api/voice/turn`

Accepts `multipart/form-data` with:

- `sessionId`: an active voice-session ID.
- `audio`: a browser recording.

The route temporarily hosts the clip, transcribes it through Orthogonal, runs the shared agent and tools, synthesizes the answer, and returns:

```json
{
  "transcript": "What changed at Anthropic this week?",
  "text": "...",
  "audioBase64": "...",
  "mime": "audio/mpeg",
  "tools": ["news_search"],
  "turnCents": 2,
  "totalCents": 4,
  "remainingCents": 46
}
```

#### `POST /api/voice/tool`

Executes a tool call for the optional xAI realtime client.

```json
{
  "sessionId": "opaque-id",
  "name": "web_search",
  "arguments": { "q": "Orthogonal API" }
}
```

The call uses the same validated tool layer and session `SpendTracker` as text chat.

#### `GET /api/voice/audio/:id`

Serves a short-lived, non-cacheable recording to the speech-to-text provider. The unguessable entry is stored in memory, expires after 90 seconds, and is deleted after transcription. Missing or expired IDs return `404`.

### Core entities and data model

#### Durable relational entities

```text
conversations
  id            text primary key
  user_id       text foreign key -> users.id on delete cascade
  title         text not null
  created_at    timestamptz not null
  updated_at    timestamptz not null

messages
  id               text primary key
  conversation_id  text foreign key -> conversations.id on delete cascade
  role             text: user | assistant | system
  parts            jsonb not null
  cost_cents       integer not null default 0
  created_at       timestamptz not null

index: messages(conversation_id, created_at)
relationship: users 1 -> many conversations; conversations 1 -> many messages
```

```text
users
  id            text primary key
  email         text unique not null
  password_hash text not null (bcrypt)

sessions
  id            text primary key
  user_id       text foreign key -> users.id on delete cascade
  token_hash    text unique not null
  expires_at    timestamptz not null
```

`messages.parts` stores the AI SDK `UIMessage.parts` array verbatim. A message can contain ordered text, tool inputs, tool outputs, states, and metadata. JSONB preserves replay fidelity without introducing a brittle set of normalized tool-call tables. `cost_cents` is denormalized because per-turn cost is displayed frequently.

#### Process-local entities

- **Cache entries:** `{ value, expiresAt }`, bounded to 500 entries by an LRU-like `Map` policy.
- **Voice sessions:** opaque ID, text history, creation time, and a session `SpendTracker`.
- **Transient audio:** unguessable ID, bytes, MIME type, and expiration time.
- **Recipes:** static typed definitions containing slug, title, category, description, input, output, tools, method, cost safeguard, and agent prompt.

### Database choice

The durable store is PostgreSQL through Drizzle ORM and the `postgres` driver. Neon is the intended managed deployment option, although any compatible Postgres connection string works.

Why Postgres:

- Conversation-to-message ownership is naturally relational.
- Foreign keys and cascade deletion prevent orphaned history.
- JSONB handles schema-fluid AI SDK message parts without sacrificing relational integrity around conversations.
- Postgres is operationally familiar and supported by serverless providers.
- The schema is small enough that a specialized document database would add operational surface without a material benefit.

Why Drizzle:

- The schema remains visible as TypeScript rather than hidden behind generated models.
- It provides typed queries and migrations with little runtime abstraction.
- It works cleanly with the serverless-friendly `postgres` driver.

### Additional infrastructure

#### Bounded TTL cache

The Orthogonal client uses a process-local cache with resource-specific TTLs:

| Resource | TTL | Reason |
| --- | ---: | --- |
| Catalog search | 5 minutes | Avoid repeated semantic search while allowing catalog changes |
| Endpoint details | 1 hour | Schemas and prices change infrequently |
| Endpoint list | 10 minutes | Stable catalog navigation data |
| Successful paid run | 10 minutes | Prevent duplicate charges for identical requests |

This improves latency and cost behavior on one warm instance. Redis would be the production replacement for cross-instance consistency.

#### Spend trackers

A new server-side `SpendTracker` is created per chat turn. Every paid tool checks the remaining budget before execution and records the actual or estimated charge afterward. Voice sessions have a longer-lived tracker with their own duration and spend caps.

#### Voice session and audio stores

Voice state and temporary recordings are process-local. Audio exists only long enough for the remote speech-to-text provider to fetch it. Production multi-instance voice would use shared session storage and object storage with signed, short-lived URLs.

#### Infrastructure intentionally omitted

- **Queue/background worker:** chat and voice turns are synchronous request/response workflows; no current task needs deferred processing.
- **Redis:** avoided for take-home simplicity, but the cache and session boundaries are clear replacement points.
- **Search/vector database:** the product retrieves live structured and web data; it does not maintain a private document corpus.

## Design Decisions

### Hybrid curated and dynamic tools

Five curated tools cover the most common tasks:

- `enrich_company`
- `find_contact_by_linkedin`
- `enrich_person`
- `web_search`
- `news_search`

Three meta-tools expose the wider Orthogonal catalog:

- `discover_apis`
- `get_api_details`
- `run_api`

Curated-only was rejected because it would cap the product at endpoints selected during development. Discovery-only was rejected because every common request would require extra catalog steps and would depend on untested schemas. The hybrid gives the common path tight validation while preserving generality.

### One-key default architecture

The default LLM is `zai-org/GLM-5.2`, called through Baseten's OpenAI-compatible endpoint inside Orthogonal `/v1/run`. The same `ORTHOGONAL_API_KEY` therefore pays for reasoning, research tools, speech-to-text, and text-to-speech.

Alternative providers remain first-class:

- `LLM_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`.
- `LLM_PROVIDER=openai` with `OPENAI_API_KEY`.

The provider adapter means the rest of the agent is unchanged. The single-key default demonstrates the Orthogonal platform deeply and makes evaluation setup smaller.

### Vercel AI SDK instead of a custom agent loop

The AI SDK provides multi-step tool calling, provider abstraction, validated UI messages, and a streaming protocol that carries tool state alongside text. A hand-built loop would offer more control but would require inventing and maintaining the same state machine and browser wire format.

### Server-enforced budgets

Budget instructions exist in the system prompt, but the enforcement mechanism is a server-side counter closed over by every paid tool. Client-side limits are bypassable, and prompt-only numeric limits are unreliable.

### Structured tool failures

Tools return normalized `{ ok: false, error }` results rather than throwing. A thrown tool exception can abort the entire stream. A structured failure lets the agent try one sensible alternative or explain the failure with the partial evidence already gathered.

### Visible cost and process trace

Each tool invocation is rendered as part of the assistant message, and the completed turn carries cost metadata. This is both a customer trust feature and an engineering diagnostic: expensive or redundant tool choices are visible immediately.

### Persistent chat objects per conversation

The browser keeps one AI SDK `Chat` instance per conversation in a session-scoped map. Switching conversations therefore does not abort an in-flight response. Returning to the conversation re-subscribes to the same stream.

### Recipes as shared typed data

Recipe definitions live in `src/lib/recipes.ts` and power both the landing Cookbook and Use Cases overlays. This prevents the marketing description, tool list, safeguards, and executable prompt from drifting across surfaces. A recipe is inspectable before it becomes an agent instruction.

### README as a product surface

`/readme` reads `README.md` on the server and renders it inside the same application shell. A separate CMS page was rejected because it would create two documents that could diverge. The repository file remains authoritative.

### Voice reuses the text agent

The default voice flow is browser recording -> Orthogonal speech-to-text -> existing model and tools -> Orthogonal text-to-speech. Reusing the agent preserves tool schemas, failure handling, budget enforcement, and answer behavior across text and voice.

## Tradeoffs

- **Self-hosted credential auth:** this keeps the setup simple and establishes ownership now, but delegates email verification, password recovery, MFA, SSO, and account governance to future work.
- **Process-local cache:** zero additional service is required, but deduplication and catalog caching are not coordinated across server instances.
- **Database-required history:** customers get durable, owner-scoped conversations, but a database must be provisioned before the app can be used.
- **Last-two-message persistence:** simple for the append-only interface, but it would not correctly model arbitrary edits to older messages.
- **40-message history cap:** bounds model context and cost, but long conversations lose early context without summarization.
- **12,000-character tool-result cap:** prevents oversized model inputs, but a very large upstream response may be truncated.
- **Simulated streaming on the default provider:** Orthogonal `/v1/run` returns a complete JSON response, so the default model streams at agent-step granularity. Direct Anthropic or OpenAI restores token streaming.
- **Inference cost is not in the displayed tool ledger:** visible and enforced spend covers data tools; default Orthogonal model calls are a separate unreported cost.
- **Static recipes:** transparent, version-controlled, and easy to audit, but adding a recipe currently requires a code change and deployment.
- **Push-to-talk voice:** reuses the agent and is straightforward to reason about, but has more latency and less conversational fluidity than a persistent realtime audio session.
- **Full tool outputs in message JSONB:** perfect replay fidelity, but limited queryability for analytics without extracting JSON fields.
- **Editorial desktop-first shell:** the stationary 260px sidebar creates a strong application identity, but the current narrow-screen experience needs more responsive navigation work.

## Limitations

If this application were deployed to production today, the primary concerns would be:

1. **Authentication is deliberately basic.** Email/password accounts establish ownership, but there is no email verification, password reset, MFA, SSO, rate limiting, or per-user quota yet.
2. **There is no rate limiter.** Parallel requests can each receive a fresh per-turn budget.
3. **Spend and deduplication are instance-local.** Separate serverless instances do not share their `SpendTracker` or cache state.
4. **Inference spend is missing from the ledger.** The UI reports data-tool charges, not total Orthogonal spend including model calls.
5. **Voice storage is single-instance.** A speech provider can fail to retrieve an in-memory clip if a request is routed to another instance.
6. **The transient audio endpoint is public by possession of its ID.** IDs are unguessable and short-lived, but signed URLs and object storage would provide stronger production controls.
7. **Dynamic execution trusts catalog metadata.** `run_api` validates its outer shape, but correctness of endpoint parameter descriptions depends on Orthogonal's catalog.
8. **Observability is limited to console logs.** There are no structured traces, spend dashboards, latency histograms, or alerts.
9. **No automated agent eval suite exists.** Tool-selection regressions are currently caught through manual scenarios and smoke scripts.
10. **Long conversations are truncated rather than summarized.** The latest 40 messages are retained for an agent request.
11. **The default Orthogonal model does not truly token-stream.** Tool events remain incremental, but text arrives one agent step at a time.
12. **Accessibility is improved but not formally audited.** Recipe overlays include keyboard behavior, but the complete application has not undergone WCAG testing with multiple screen readers.
13. **Legal copy is appropriate product scaffolding, not jurisdiction-specific legal advice.** Privacy and Terms should be reviewed before a real commercial launch.
14. **No CI workflow is included.** Verification currently runs locally through lint, TypeScript, production builds, smoke scripts, and browser checks.

## Future Improvements

### If I had another week

1. **Account hardening and rate limits.** Add email verification, password reset, MFA or SSO, and per-user, per-IP, and global daily limits in shared storage.
2. **Spend ledgers.** Record inference and data charges in one ledger.
3. **Redis-backed cache and voice sessions.** Make deduplication, budgets, sessions, and temporary state correct across concurrent instances.
4. **Agent evaluation fixtures.** Add representative prompts with expected tool choices, maximum cost, and answer-grounding checks. Tool selection is the core product behavior and needs regression protection.
5. **Structured observability.** Add request IDs, tool latency, provider errors, spend velocity, and alerts.
6. **Responsive navigation and accessibility audit.** Replace the fixed desktop rail with a mobile drawer at narrow widths and test the full keyboard/screen-reader flow.
7. **CI pipeline.** Run lint, TypeScript, production build, unit tests, and a mocked tool-selection suite on every pull request.

### If I had another month

1. **Recipe registry and publishing workflow.** Store versioned recipes with authorship, permissions, usage metrics, and a promotion path from community recipe to trusted recipe.
2. **Curated-tool registry.** Promote catalog endpoints into tested tools through configuration rather than code changes.
3. **Evidence citations.** Thread Orthogonal request IDs and source URLs into answer-level citation markers.
4. **Cost-aware planning.** Give the model a priced tool plan before execution and require confirmation above configurable thresholds.
5. **Conversation summarization.** Compress earlier context instead of silently dropping it after 40 messages.
6. **Durable realtime voice.** Move audio to signed object storage, sessions to Redis, and complete the realtime WebRTC interface.
7. **Administrative controls.** Add usage dashboards, recipe management, endpoint allowlists, account suspension, and spend alerts.
8. **Data retention controls.** Add export, deletion, configurable retention periods, and audit logging.

## Changelog and Timeline

### July 12, 2026: Foundation

- **00:27: Initial scaffold (`702661c`).** Created the Next.js application baseline.
- **01:33: Core agent (`2d8da8b`).** Added the typed Orthogonal client, hybrid toolset, multi-step agent, streamed chat UI, conversation persistence, cost tracking, and error normalization.
- **01:40: Engineering narrative (`80028c2`).** Added the initial architecture, system diagram, design decisions, tradeoffs, and limitations.
- **01:53: Product design (`82bfdf6`).** Introduced Meridian's parchment-and-forest editorial visual system.
- **02:30: Single-key architecture (`df39bd1`).** Routed the default LLM through Orthogonal's Baseten endpoint so one Orthogonal key can power reasoning and data tools.

### July 13, 2026: Product completion pass

- Added email-and-password accounts with opaque HttpOnly sessions, owner-scoped conversations, and immediate persistence of submitted chat messages.
- Kept independent chat streams alive while navigating between conversations.
- Added push-to-talk voice with Orthogonal speech-to-text and text-to-speech, shared tools, and session spend limits.
- Added categorized, horizontally scrollable prompt suggestions.
- Added the Meridian Cookbook with six reusable research recipes.
- Added a shared typed recipe registry so landing cards and Use Cases details cannot drift.
- Added recipe detail overlays with keyboard dismissal, focus containment, focus restoration, inputs, outputs, method, tools, and cost safeguards.
- Added Privacy Policy, Terms of Use, and Use Cases routes with the stationary sidebar.
- Added compact landing-page footer navigation and the informational-page horizon footer.
- Added the global README button and `/readme` route that renders this repository file directly.
- Replaced the system design block with a compact ASCII diagram that renders consistently in the repository and the in-app README.
- Replaced the first-step-only thinking dots with a persistent accessible `Cooking` animation for the full multi-step agent run.
- Replaced the default favicon with Meridian's compass mark through the App Router icon metadata.
- Updated lint, strict TypeScript, production build, and browser-interaction verification after the completion pass.

## Running the Application

### Prerequisites

- Node.js compatible with Next.js 16
- An Orthogonal account and API key
- Optional Postgres database for durable history

### Setup

```bash
git clone <repository-url>
cd ortho-takehome
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

The minimum configuration is:

```env
ORTHOGONAL_API_KEY=orth_live_xxxxxxxxxxxxxxxxxxxx
```

That key powers the default LLM path, data tools, and default voice provider. Meridian also requires a Postgres database for accounts and saved history.

For durable Postgres history:

```env
DATABASE_URL=postgres://user:pass@host:5432/ortho
```

Then create the schema:

```bash
npx drizzle-kit push
```

For true token streaming through a direct provider:

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
```

or:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=...
```

For deployed push-to-talk voice, set the public application origin so the speech-to-text provider can retrieve the temporary recording:

```env
VOICE_PUBLIC_BASE_URL=https://your-public-origin.example
```

### Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `ORTHOGONAL_API_KEY` | Yes | N/A | Orthogonal inference, data tools, and default voice |
| `ORTHOGONAL_BASE_URL` | No | `https://api.orthogonal.com` | Orthogonal host override |
| `LLM_PROVIDER` | No | `orthogonal` | `orthogonal`, `anthropic`, or `openai` |
| `LLM_MODEL` | No | Provider default | Model override |
| `ANTHROPIC_API_KEY` | Conditional | N/A | Required for direct Anthropic mode |
| `OPENAI_API_KEY` | Conditional | N/A | Required for direct OpenAI mode |
| `DATABASE_URL` | Yes | N/A | Accounts, sessions, and durable Postgres history |
| `MAX_SPEND_CENTS_PER_TURN` | No | `50` | Paid data-tool budget per chat turn |
| `MAX_AGENT_STEPS` | No | `8` | Maximum model/tool steps per turn |
| `VOICE_PROVIDER` | No | `orthogonal` | `orthogonal` or experimental `xai` |
| `VOICE_PUBLIC_BASE_URL` | Deployment-dependent | Request origin | Public origin used to serve transient recordings |
| `VOICE_ELEVEN_VOICE_ID` | No | Rachel voice ID | Orthogonal TTS voice |
| `VOICE_MAX_SESSION_SECONDS` | No | `300` | Voice session duration cap |
| `VOICE_MAX_SPEND_CENTS` | No | `50` | Voice session spend cap |
| `XAI_API_KEY` | Conditional | N/A | Required for xAI realtime mode |
| `XAI_VOICE_MODEL` | No | `grok-voice-latest` | xAI realtime model |
| `XAI_VOICE` | No | `eve` | xAI voice selection |

## Verification

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Orthogonal catalog smoke check:

```bash
npx tsx scripts/smoke.ts
```

Additional probe scripts in `scripts/` document live endpoint and model compatibility checks used during implementation.
