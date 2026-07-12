/**
 * Live smoke test against the real Orthogonal API.
 * Run: npx tsx scripts/smoke.ts
 *
 * Requires ORTHOGONAL_API_KEY in the environment (.env.local is auto-loaded).
 * Only `search`, `list-endpoints`, and `details` are exercised by
 * default — `run` costs money, so it is gated behind SMOKE_RUN=1.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { OrthogonalClient } from "@/lib/orthogonal/client";

function show(label: string, v: unknown) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(v, null, 2).slice(0, 2500));
}

async function main() {
  const client = new OrthogonalClient();

  const search = await client.search("find company information by domain", 5);
  show("search: company info", {
    count: search.count,
    apisCount: search.apisCount,
    results: search.results?.map((a) => ({
      name: a.name,
      slug: a.slug,
      endpoints: a.endpoints?.map((e) => ({
        path: e.path,
        method: e.method,
        price: e.price,
        score: e.score,
        description: e.description,
      })),
    })),
  });

  const contacts = await client.search("find people contact email at a company", 5);
  show("search: contacts", {
    results: contacts.results?.map((a) => ({ name: a.name, slug: a.slug, eps: a.endpoints?.map((e) => e.path) })),
  });

  const web = await client.search("web search the internet for recent news", 5);
  show("search: web", {
    results: web.results?.map((a) => ({ name: a.name, slug: a.slug, eps: a.endpoints?.map((e) => e.path) })),
  });

  // Inspect details for the top result of the company search, if any.
  const top = search.results?.[0];
  const topEp = top?.endpoints?.[0];
  if (top && topEp) {
    show(`details: ${top.slug} ${topEp.path}`, await client.details(top.slug, topEp.path));
  }

  const list = await client.listEndpoints(10, 0);
  show("list-endpoints (first 10 apis)", {
    count: list.count,
    totalEndpoints: list.totalEndpoints,
    apis: list.apis?.map((a) => a.slug),
  });

  if (process.env.SMOKE_RUN === "1" && top && topEp) {
    console.log("\n(SMOKE_RUN=1) executing a real paid run call...");
    show("run", await client.run({ api: top.slug, path: topEp.path, body: {} }));
  }
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
