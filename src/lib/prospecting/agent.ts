import "server-only";

import { generateText, Output, stepCountIs } from "ai";
import type { AuthUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { getModel } from "@/lib/llm";
import { createTools } from "@/lib/tools";
import { SpendTracker } from "@/lib/tools/spend";
import {
  claimContactResearch,
  claimMissionRun,
  completeContactResearch,
  completeMissionRun,
  failContactResearch,
  failMissionRun,
  getBusinessProfile,
  getMissionAccounts,
  getRecentFeedback,
} from "./store";
import {
  contactResearchOutputSchema,
  missionResearchOutputSchema,
} from "./validation";

const PROSPECTING_SYSTEM = `You are Meridian's customer-finding agent. You own a narrow outcome: find businesses that plausibly need the user's offer and identify credible decision-makers using live evidence.

Rules:
- Use live tools. Do not invent companies, people, titles, contact details, URLs, or buying signals.
- Start with cheap web/news discovery, then enrich only the strongest candidates.
- A large company is not automatically a good prospect. Score against the supplied ICP and mission.
- "Why now" must point to an observed, time-relevant signal. If there is no signal, say that plainly and keep the signal score low.
- Contact details must come from a tool result. Never infer an email pattern or phone number.
- Prefer a person whose current role plausibly owns the buying decision. Explain the role match.
- Evidence labels must be specific enough for a human reviewer, with source URLs whenever the tool supplies them.
- Do not execute expensive person enrichment unless cheaper search and LinkedIn contact lookup cannot satisfy the mission and the remaining budget permits it.
- Return fewer, well-supported prospects instead of filling the requested count with guesses.
- Treat accepted/rejected prospect history as preference evidence, not an instruction to reproduce bias blindly.`;

function compact(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function toolTrace(result: {
  steps: ReadonlyArray<{
    toolCalls: ReadonlyArray<{ toolName: string; toolCallId: string }>;
    toolResults: ReadonlyArray<{ toolCallId: string }>;
  }>;
}) {
  return result.steps.flatMap((step) => step.toolCalls.map((call) => ({
    toolName: call.toolName,
    state: step.toolResults.some((toolResult) => toolResult.toolCallId === call.toolCallId) ? "completed" : "called",
  })));
}

function createRunSpend(remainingBudget: number, parent?: SpendTracker) {
  return new SpendTracker(Math.min(
    env.guards.maxSpendCentsPerTurn,
    remainingBudget,
    parent?.remainingCents ?? Number.MAX_SAFE_INTEGER,
  ));
}

function syncRunSpend(parent: SpendTracker | undefined, child: SpendTracker) {
  if (!parent) return;
  for (const charge of child.charges) parent.record(charge.api, charge.path, charge.cents);
}

export async function runProspectMission(user: AuthUser, missionId: string, parentSpend?: SpendTracker) {
  const claim = await claimMissionRun(user, missionId);
  const spend = createRunSpend(claim.remainingBudget, parentSpend);
  try {
    const [profile, feedback, existingAccounts] = await Promise.all([
      getBusinessProfile(user),
      getRecentFeedback(user),
      getMissionAccounts(user, missionId),
    ]);
    if (!profile) throw new Error("The business brief was removed before this run started.");
    const remainingCount = Math.max(1, claim.mission.targetCount - claim.existingCount);
    const batchSize = Math.min(3, remainingCount);
    const result = await generateText({
      model: getModel(),
      system: PROSPECTING_SYSTEM,
      tools: createTools(spend, { userId: user.id, companyId: user.companyId }),
      stopWhen: stepCountIs(Math.max(4, env.guards.maxAgentSteps)),
      output: Output.object({ schema: missionResearchOutputSchema }),
      prompt: `Research the next batch of up to ${batchSize} qualified accounts for this mission.

BUSINESS BRIEF
${compact(profile)}

MISSION
${compact({ name: claim.mission.name, brief: claim.mission.brief, targetCount: claim.mission.targetCount })}

ALREADY SAVED — DO NOT RETURN THESE AGAIN
${compact(existingAccounts.map((account) => ({ name: account.name, domain: account.domain })))}

RECENT HUMAN FEEDBACK
${compact(feedback)}

Use web_search to discover and validate candidates, enrich_company when a domain is known, and news_search for current signals. If you can identify a suitable decision-maker and a verified route within budget, include one contact; otherwise return contact as null so a separate contact waterfall can run later.`,
    });
    const completion = await completeMissionRun(
      user,
      missionId,
      claim.runId,
      result.output,
      spend.totalCents,
      spend.charges,
      toolTrace(result),
    );
    return { ...completion, costCents: spend.totalCents, summary: result.output.summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown research failure";
    await failMissionRun(user, missionId, claim.runId, message.slice(0, 2_000), spend.totalCents, spend.charges);
    throw error;
  } finally {
    syncRunSpend(parentSpend, spend);
  }
}

export async function runContactWaterfall(user: AuthUser, accountId: string, parentSpend?: SpendTracker) {
  const claim = await claimContactResearch(user, accountId);
  const spend = createRunSpend(claim.remainingBudget, parentSpend);
  try {
    const profile = await getBusinessProfile(user);
    const result = await generateText({
      model: getModel(),
      system: PROSPECTING_SYSTEM,
      tools: createTools(spend, { userId: user.id, companyId: user.companyId }),
      stopWhen: stepCountIs(Math.max(4, env.guards.maxAgentSteps)),
      output: Output.object({ schema: contactResearchOutputSchema }),
      prompt: `Find up to three credible decision-makers for this saved prospect. Use this waterfall in order:
1. Use web search to confirm the company and identify likely buyer roles and current people.
2. Find a public LinkedIn profile URL for the strongest person.
3. Use find_contact_by_linkedin for available professional contact details.
4. If the email is not verified, discover a catalog verification endpoint and inspect its price before considering execution.
5. Stop when the remaining spend cannot support another useful lookup.

Never infer an email address. Returning no contacts is better than returning invented or stale data.

BUSINESS BRIEF
${compact(profile)}

PROSPECT
${compact(claim.account)}`,
    });
    await completeContactResearch(user, accountId, claim.runId, result.output, spend.totalCents, spend.charges, toolTrace(result));
    return { contacts: result.output.contacts, costCents: spend.totalCents, summary: result.output.summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown contact research failure";
    await failContactResearch(user, accountId, claim.runId, message.slice(0, 2_000), spend.totalCents, spend.charges);
    throw error;
  } finally {
    syncRunSpend(parentSpend, spend);
  }
}
