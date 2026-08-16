import "server-only";

import { tool } from "ai";
import type { AuthUser } from "@/lib/auth";
import type { SpendTracker } from "@/lib/tools/spend";
import { runContactWaterfall, runProspectMission } from "./agent";
import {
  createMission,
  getBusinessProfile,
  getMission,
  getMissionAccounts,
  listMissions,
  reviewProspect,
  saveBusinessProfile,
} from "./store";
import { leadContactInput, leadMissionInput, leadReviewInput, leadSourcingInput } from "./validation";

const MAX_TOOL_DATA_CHARS = 12_000;

function data(value: unknown) {
  const serialized = JSON.stringify(value);
  return serialized.length <= MAX_TOOL_DATA_CHARS
    ? { data: serialized, truncated: false }
    : { data: serialized.slice(0, MAX_TOOL_DATA_CHARS), truncated: true };
}

function errorResult(error: unknown) {
  return {
    ok: false as const,
    error: error instanceof Error ? error.message : "Lead sourcing failed unexpectedly.",
  };
}

function leadRows(accounts: Awaited<ReturnType<typeof getMissionAccounts>>) {
  return accounts.map((account) => ({
    accountId: account.id,
    company: account.name,
    domain: account.domain,
    website: account.website,
    industry: account.industry,
    location: account.location,
    employeeCount: account.employeeCount,
    matchScore: account.overallScore,
    rationale: account.rationale,
    whyNow: account.whyNow,
    outreachAngle: account.outreachAngle,
    evidence: account.evidence,
    contacts: account.contacts.map((contact) => ({
      contactId: contact.id,
      name: contact.fullName,
      title: contact.title,
      email: contact.email,
      emailStatus: contact.emailStatus,
      phone: contact.phone,
      linkedinUrl: contact.linkedinUrl,
      confidence: contact.confidence,
      source: contact.source,
    })),
  }));
}

export function createProspectingChatTools(user: AuthUser, spend: SpendTracker) {
  return {
    get_lead_pipeline: tool({
      description:
        "FREE. Load the signed-in company's saved customer thesis and lead missions. Use when the user refers to their business, latest mission, saved pipeline, or asks to continue without supplying an ID.",
      inputSchema: leadMissionInput.partial(),
      execute: async ({ missionId }) => {
        try {
          const [profile, missions] = await Promise.all([getBusinessProfile(user), listMissions(user)]);
          const selected = missionId ? missions.find((mission) => mission.id === missionId) : missions[0];
          const accounts = selected ? await getMissionAccounts(user, selected.id) : [];
          const payload = data({
            profile,
            missions: missions.map((mission) => ({
              missionId: mission.id,
              name: mission.name,
              brief: mission.brief,
              status: mission.status,
              prospectCount: mission.prospectCount,
              targetCount: mission.targetCount,
              contactCount: mission.contactCount,
              remainingBudgetCents: mission.maxSpendCents - mission.spentCents,
              exportUrl: `/api/prospecting/missions/${mission.id}/export`,
            })),
            selectedLeads: leadRows(accounts),
          });
          return { ok: true as const, costCents: 0, ...payload };
        } catch (error) {
          return errorResult(error);
        }
      },
    }),

    source_b2b_leads: tool({
      description:
        "Create and immediately run a durable B2B lead-sourcing mission from this chat. Use when the signed-in user asks Meridian to find, source, build, or prospect a list of businesses. Ask one focused question first only if the offer, target business, or buyer role is missing. The first run is bounded to up to three evidence-backed accounts and attempts a verified contact route within the same turn budget.",
      inputSchema: leadSourcingInput,
      execute: async ({ profile, mission }) => {
        if (spend.remainingCents <= 0) {
          return { ok: false as const, error: "This chat turn has no paid-research budget remaining. Start the lead mission in a new message." };
        }
        const startingCost = spend.totalCents;
        try {
          await saveBusinessProfile(user, profile);
          const savedMission = await createMission(user, mission);
          const run = await runProspectMission(user, savedMission.id, spend);
          let accounts = await getMissionAccounts(user, savedMission.id);
          let contactNote: string | null = null;
          const strongestWithoutContact = accounts.find((account) => account.contacts.length === 0);
          if (strongestWithoutContact && spend.remainingCents > 0) {
            try {
              await runContactWaterfall(user, strongestWithoutContact.id, spend);
              accounts = await getMissionAccounts(user, savedMission.id);
            } catch (error) {
              contactNote = error instanceof Error ? error.message : "Contact research did not complete.";
            }
          }
          const costCents = spend.totalCents - startingCost;
          const payload = data({
            missionId: savedMission.id,
            missionName: savedMission.name,
            targetCount: savedMission.targetCount,
            inserted: run.inserted,
            summary: run.summary,
            leads: leadRows(accounts),
            contactNote,
            exportUrl: `/api/prospecting/missions/${savedMission.id}/export`,
          });
          return { ok: true as const, costCents, totalSpentCents: spend.totalCents, ...payload };
        } catch (error) {
          return errorResult(error);
        }
      },
    }),

    continue_lead_mission: tool({
      description:
        "Run the next bounded batch for an existing saved B2B lead mission. Use only when the user explicitly asks to continue, resume, or find more leads. Call get_lead_pipeline first if the mission ID is not already present in the conversation.",
      inputSchema: leadMissionInput,
      execute: async ({ missionId }) => {
        if (spend.remainingCents <= 0) {
          return { ok: false as const, error: "This chat turn has no paid-research budget remaining. Continue the mission in a new message." };
        }
        const startingCost = spend.totalCents;
        try {
          const run = await runProspectMission(user, missionId, spend);
          const accounts = await getMissionAccounts(user, missionId);
          const costCents = spend.totalCents - startingCost;
          const payload = data({
            missionId,
            inserted: run.inserted,
            summary: run.summary,
            leads: leadRows(accounts),
            exportUrl: `/api/prospecting/missions/${missionId}/export`,
          });
          return { ok: true as const, costCents, totalSpentCents: spend.totalCents, ...payload };
        } catch (error) {
          return errorResult(error);
        }
      },
    }),

    find_lead_contacts: tool({
      description:
        "Find verified decision-makers and available contact routes for one saved lead. Never use a company name as the account ID; call get_lead_pipeline first when the account ID is not already present in the conversation.",
      inputSchema: leadContactInput,
      execute: async ({ accountId }) => {
        if (spend.remainingCents <= 0) {
          return { ok: false as const, error: "This chat turn has no paid-research budget remaining. Research the contact in a new message." };
        }
        const startingCost = spend.totalCents;
        try {
          const result = await runContactWaterfall(user, accountId, spend);
          const costCents = spend.totalCents - startingCost;
          const payload = data({ accountId, summary: result.summary, contacts: result.contacts });
          return { ok: true as const, costCents, totalSpentCents: spend.totalCents, ...payload };
        } catch (error) {
          return errorResult(error);
        }
      },
    }),

    review_b2b_lead: tool({
      description:
        "Approve, reject, archive, or reset one saved B2B lead from the conversation. For a rejection, include the user's reason so future sourcing batches can learn from it. Call get_lead_pipeline first if the account ID is not already present in the conversation.",
      inputSchema: leadReviewInput,
      execute: async ({ accountId, status, reason }) => {
        try {
          const account = await reviewProspect(user, accountId, { status, reason });
          return { ok: true as const, costCents: 0, ...data({ accountId: account.id, company: account.name, status: account.status, rejectionReason: account.rejectionReason }) };
        } catch (error) {
          return errorResult(error);
        }
      },
    }),

    export_lead_mission: tool({
      description:
        "Prepare the authenticated CSV download link for a saved B2B lead mission. Call get_lead_pipeline first if the mission ID is not already present in the conversation.",
      inputSchema: leadMissionInput,
      execute: async ({ missionId }) => {
        try {
          const mission = await getMission(user, missionId);
          return { ok: true as const, costCents: 0, ...data({ missionId, missionName: mission.name, downloadUrl: `/api/prospecting/missions/${missionId}/export` }) };
        } catch (error) {
          return errorResult(error);
        }
      },
    }),
  };
}
