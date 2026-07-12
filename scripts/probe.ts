/** Probe details/prices for curated-tool candidates. Run: npx tsx scripts/probe.ts */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { OrthogonalClient } from "@/lib/orthogonal/client";

const candidates: Array<[string, string]> = [
  ["company-enrich", "/companies/enrich"],
  ["contactout", "/v1/people/enrich"],
  ["contactout", "/v1/people/linkedin"],
  ["serper", "/news"],
  ["serper", "/search"],
  ["context-dev", "/web/search"],
  ["seltz", "/v1/search"],
];

async function main() {
  const client = new OrthogonalClient();
  for (const [api, path] of candidates) {
    try {
      const d = await client.details(api, path);
      const ep = d.endpoint as unknown as Record<string, unknown>;
      console.log(`\n=== ${api} ${path} ===`);
      console.log(
        JSON.stringify(
          {
            method: ep.method,
            price: ep.price,
            description: ep.description,
            queryParams: ep.queryParams,
            bodyParams: ep.bodyParams,
            pathParams: ep.pathParams,
          },
          null,
          2,
        ).slice(0, 1800),
      );
    } catch (e) {
      console.log(`\n=== ${api} ${path} === FAILED: ${(e as Error).message}`);
    }
  }
}

main();
