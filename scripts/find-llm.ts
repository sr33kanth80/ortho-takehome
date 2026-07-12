/** Check whether the Orthogonal catalog contains LLM/chat-completion endpoints. */
import { config } from "dotenv";
config({ path: ".env.local" });

import { OrthogonalClient } from "@/lib/orthogonal/client";

async function main() {
  const client = new OrthogonalClient();
  for (const q of [
    "LLM chat completion generate text with a language model",
    "OpenAI compatible chat completions API",
    "Claude Anthropic messages API",
  ]) {
    const res = await client.search(q, 6);
    console.log(`\n=== "${q}" ===`);
    for (const a of res.results ?? []) {
      console.log(
        `- ${a.name} (${a.slug}): ${a.endpoints?.map((e) => `${e.method ?? "?"} ${e.path} [${e.description?.slice(0, 70) ?? ""}]`).join(" | ")}`,
      );
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
