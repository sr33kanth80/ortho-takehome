export type Recipe = {
  slug: string;
  title: string;
  category: string;
  description: string;
  useCaseDescription: string;
  tools: string[];
  input: string;
  output: string;
  method: string[];
  safeguard: string;
  prompt: string;
};

export const RECIPES: Recipe[] = [
  {
    slug: "company-field-notes",
    title: "Company Field Notes",
    category: "Company intelligence",
    description: "Turn a domain into a concise brief with company facts, funding signals, and current news.",
    useCaseDescription:
      "Turn a domain into a decision-ready profile with business context, size signals, funding data, and recent developments.",
    tools: ["web", "company", "news"],
    input: "A company name or domain, plus any decision you are trying to make.",
    output: "A concise company brief with sourced facts, recent signals, open questions, and a visible lookup trace.",
    method: [
      "Confirm the company and resolve an ambiguous domain.",
      "Gather the cheapest useful company and web signals first.",
      "Add recent news, then separate confirmed facts from gaps.",
    ],
    safeguard: "Meridian prefers lower-cost web lookups before deeper enrichment when the company is unclear.",
    prompt:
      "I want to make the Company Field Notes recipe. Ask me for a company domain, then use the cheapest useful live lookups to produce a concise brief covering what it does, size, funding signals, recent news, and notable gaps. Prefer web search before enrichment when the domain is unclear.",
  },
  {
    slug: "competitive-table",
    title: "The Competitive Table",
    category: "Competitive landscape",
    description: "Map a company against its closest alternatives and explain the differences clearly.",
    useCaseDescription:
      "Identify the closest alternatives to a company and compare positioning, customer focus, scale signals, and current momentum.",
    tools: ["web", "company", "news"],
    input: "A company or domain and, optionally, the market or buyer you care about.",
    output: "A compact competitor map comparing positioning, likely customer, scale signals, and recent moves.",
    method: [
      "Define the company and the comparison boundary.",
      "Identify credible direct alternatives using current web evidence.",
      "Compare the same signals across every company and flag assumptions.",
    ],
    safeguard: "Meridian labels inferred competitors and does not present a search result as a verified market fact.",
    prompt:
      "I want to make The Competitive Table recipe. Ask me for a company or domain, then use live web and company data to identify its closest competitors. Return a compact comparison of positioning, likely customer, scale signals, and recent moves. Flag assumptions and gaps clearly.",
  },
  {
    slug: "warm-introduction",
    title: "A Warm Introduction",
    category: "Contact discovery",
    description: "Start with a LinkedIn profile and find the most direct available path to reach the person.",
    useCaseDescription:
      "Start with a LinkedIn profile, find an appropriate contact route, and add enough company context to make outreach relevant.",
    tools: ["web", "contact", "company"],
    input: "A LinkedIn profile URL and the reason you want to reach the person.",
    output: "The best available contact path with role, company, and outreach context attached.",
    method: [
      "Confirm the person and current role from the supplied profile.",
      "Use the least expensive useful contact lookup.",
      "Add only the company context needed to make outreach relevant.",
    ],
    safeguard: "Expensive person enrichment is not run unless you explicitly approve it.",
    prompt:
      "I want to make the A Warm Introduction recipe. Ask me for a LinkedIn profile URL first. Then use the least expensive useful live lookup to find available contact details and summarize the person's current role and company context. Do not use expensive person enrichment unless I explicitly approve it.",
  },
  {
    slug: "morning-pour",
    title: "The Morning Pour",
    category: "Current-events briefing",
    description: "Get a fresh, practical news brief for a company, market, or theme without the noise.",
    useCaseDescription:
      "Distill recent coverage about a company, market, or theme into the developments that matter and the questions still open.",
    tools: ["news", "web"],
    input: "A company, market, or topic and the time window you want covered.",
    output: "A current briefing that explains the important developments, why they matter, and what remains unresolved.",
    method: [
      "Set the topic and time window before searching.",
      "Collect current coverage from live news and web sources.",
      "Remove duplicates and organize developments by significance.",
    ],
    safeguard: "Every time-sensitive claim stays tied to a current source and publication date.",
    prompt:
      "I want to make The Morning Pour recipe. Ask me for a company, market, or topic and a time window. Then use live news search to create a crisp briefing with the most important developments, why they matter, and any unresolved questions.",
  },
  {
    slug: "open-pantry",
    title: "The Open Pantry",
    category: "API capability discovery",
    description: "Find the right Orthogonal API for an unusual job and inspect it before running it.",
    useCaseDescription:
      "Search Orthogonal's catalog for an unfamiliar task, inspect the best endpoint schemas and prices, and recommend what to run.",
    tools: ["catalog", "schema"],
    input: "The outcome you need, the data you already have, and any cost or coverage constraints.",
    output: "A vetted API recommendation with schema, price, expected inputs, and execution tradeoffs.",
    method: [
      "Translate the task into capabilities the catalog can search.",
      "Inspect the most promising endpoint schemas and prices.",
      "Recommend the best fit before executing anything paid.",
    ],
    safeguard: "No paid dynamic catalog API runs until you confirm the recommendation.",
    prompt:
      "I want to make The Open Pantry recipe. Ask what I am trying to accomplish, then search Orthogonal's catalog for appropriate APIs. Inspect the most promising endpoint schemas and prices before recommending the best option. Do not execute a paid dynamic API until I confirm.",
  },
  {
    slug: "signal-check",
    title: "The Signal Check",
    category: "Claim verification",
    description: "Verify a detail that would be costly to get wrong and show exactly what was checked.",
    useCaseDescription:
      "Check an important detail against a live source, show the evidence used, and separate confirmed facts from remaining uncertainty.",
    tools: ["catalog", "web", "verify"],
    input: "The exact claim or detail you need checked and why the answer matters.",
    output: "A grounded verification note with evidence, confidence, and remaining uncertainty.",
    method: [
      "Restate the claim precisely enough to test.",
      "Choose the cheapest live source capable of validating it.",
      "Report the evidence and clearly separate certainty from inference.",
    ],
    safeguard: "Specialized paid verification tools are inspected and priced before Meridian asks to run them.",
    prompt:
      "I want to make The Signal Check recipe. Ask me for the claim or detail I need verified. Choose the cheapest live source that can validate it, explain the evidence plainly, and tell me what remains uncertain. If a specialized catalog API would help, inspect its schema and price before asking for confirmation to run it.",
  },
];
