/** Probe the catalog LLM endpoints: schema, price, and a minimal live call. */
import { config } from "dotenv";
config({ path: ".env.local" });

import { OrthogonalClient } from "@/lib/orthogonal/client";

async function main() {
  const client = new OrthogonalClient();

  for (const [api, path] of [
    ["baseten", "/v1/chat/completions"],
    ["baseten", "/v1/models"],
    ["zai", "/api/paas/v4/chat/completions"],
    ["perplexity", "/chat/completions"],
  ] as const) {
    try {
      const d = await client.details(api, path);
      const ep = d.endpoint;
      console.log(`\n=== ${api} ${path} ===`);
      console.log(
        JSON.stringify(
          {
            method: ep.method,
            price: ep.price,
            dynamic: ep.hasDynamicPricing,
            bodyParams: ep.bodyParams?.map((p) => `${p.name}${p.required ? "*" : ""}:${p.type}`),
            desc: ep.description?.slice(0, 140),
          },
          null,
          2,
        ),
      );
    } catch (e) {
      console.log(`\n=== ${api} ${path} === FAILED: ${(e as Error).message}`);
    }
  }

  // Cheapest possible live sanity call: list models (likely free/cheap).
  try {
    const models = await client.run<{ data?: Array<{ id: string }> }>({
      api: "baseten",
      path: "/v1/models",
    });
    console.log("\n=== baseten models (live) ===");
    console.log("priceCents:", models.priceCents);
    console.log(models.data?.data?.map((m) => m.id).join("\n"));
  } catch (e) {
    console.log("models call failed:", (e as Error).message);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
