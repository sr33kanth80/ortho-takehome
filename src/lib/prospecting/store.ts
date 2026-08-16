import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { AuthUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { ProspectingError } from "./http";
import {
  calculateOverallScore,
  normalizeDomain,
  type BusinessProfileInput,
  type ContactResearchOutput,
  type MissionInput,
  type MissionResearchOutput,
  type MissionUpdateInput,
  type ReviewInput,
} from "./validation";

function requireDb() {
  const db = getDb();
  if (!db) throw new ProspectingError("DATABASE_URL is required for the Prospecting Desk.", 503);
  return db;
}

export async function getBusinessProfile(user: AuthUser) {
  const [profile] = await requireDb()
    .select()
    .from(schema.businessProfiles)
    .where(eq(schema.businessProfiles.companyId, user.companyId))
    .limit(1);
  return profile ?? null;
}

export async function saveBusinessProfile(user: AuthUser, input: BusinessProfileInput) {
  const [profile] = await requireDb()
    .insert(schema.businessProfiles)
    .values({ companyId: user.companyId, updatedBy: user.id, ...input })
    .onConflictDoUpdate({
      target: schema.businessProfiles.companyId,
      set: { ...input, updatedBy: user.id, updatedAt: new Date() },
    })
    .returning();
  return profile;
}

export async function listMissions(user: AuthUser) {
  return requireDb()
    .select({
      id: schema.prospectMissions.id,
      name: schema.prospectMissions.name,
      brief: schema.prospectMissions.brief,
      status: schema.prospectMissions.status,
      targetCount: schema.prospectMissions.targetCount,
      maxSpendCents: schema.prospectMissions.maxSpendCents,
      spentCents: schema.prospectMissions.spentCents,
      strategy: schema.prospectMissions.strategy,
      lastSummary: schema.prospectMissions.lastSummary,
      lastError: schema.prospectMissions.lastError,
      lastRunAt: schema.prospectMissions.lastRunAt,
      createdAt: schema.prospectMissions.createdAt,
      updatedAt: schema.prospectMissions.updatedAt,
      prospectCount: sql<number>`(select count(*)::int from ${schema.prospectAccounts} pa where pa.mission_id = ${schema.prospectMissions.id})`,
      approvedCount: sql<number>`(select count(*)::int from ${schema.prospectAccounts} pa where pa.mission_id = ${schema.prospectMissions.id} and pa.status = 'approved')`,
      contactCount: sql<number>`(select count(*)::int from ${schema.prospectContacts} pc where pc.mission_id = ${schema.prospectMissions.id})`,
    })
    .from(schema.prospectMissions)
    .where(eq(schema.prospectMissions.companyId, user.companyId))
    .orderBy(desc(schema.prospectMissions.updatedAt));
}

export async function createMission(user: AuthUser, input: MissionInput) {
  if (!await getBusinessProfile(user)) {
    throw new ProspectingError("Complete the business brief before starting a mission.", 409);
  }
  const [mission] = await requireDb().insert(schema.prospectMissions).values({
    id: nanoid(20), companyId: user.companyId, ownerUserId: user.id, ...input,
  }).returning();
  return mission;
}

export async function updateMission(user: AuthUser, id: string, input: MissionUpdateInput) {
  const [mission] = await requireDb().update(schema.prospectMissions)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(schema.prospectMissions.id, id), eq(schema.prospectMissions.companyId, user.companyId)))
    .returning();
  if (!mission) throw new ProspectingError("Mission not found.", 404);
  return mission;
}

export async function deleteMission(user: AuthUser, id: string) {
  const deleted = await requireDb().delete(schema.prospectMissions)
    .where(and(eq(schema.prospectMissions.id, id), eq(schema.prospectMissions.companyId, user.companyId)))
    .returning({ id: schema.prospectMissions.id });
  if (!deleted.length) throw new ProspectingError("Mission not found.", 404);
}

export async function getMission(user: AuthUser, id: string) {
  const [mission] = await requireDb().select().from(schema.prospectMissions)
    .where(and(eq(schema.prospectMissions.id, id), eq(schema.prospectMissions.companyId, user.companyId)))
    .limit(1);
  if (!mission) throw new ProspectingError("Mission not found.", 404);
  return mission;
}

export async function getMissionAccounts(user: AuthUser, missionId: string) {
  await getMission(user, missionId);
  const db = requireDb();
  const accounts = await db.select().from(schema.prospectAccounts)
    .where(and(eq(schema.prospectAccounts.missionId, missionId), eq(schema.prospectAccounts.companyId, user.companyId)))
    .orderBy(desc(schema.prospectAccounts.overallScore), asc(schema.prospectAccounts.name));
  if (!accounts.length) return [];
  const contacts = await db.select().from(schema.prospectContacts)
    .where(and(eq(schema.prospectContacts.companyId, user.companyId), inArray(schema.prospectContacts.accountId, accounts.map((account) => account.id))))
    .orderBy(desc(schema.prospectContacts.preferred), desc(schema.prospectContacts.confidence));
  return accounts.map((account) => ({ ...account, contacts: contacts.filter((contact) => contact.accountId === account.id) }));
}

export async function getProspectingOverview(user: AuthUser, selectedMissionId?: string) {
  const [profile, missions] = await Promise.all([getBusinessProfile(user), listMissions(user)]);
  const selectedId = selectedMissionId && missions.some((mission) => mission.id === selectedMissionId)
    ? selectedMissionId
    : missions[0]?.id;
  const accounts = selectedId ? await getMissionAccounts(user, selectedId) : [];
  const selectedMission = selectedId ? missions.find((mission) => mission.id === selectedId) ?? null : null;
  return { profile, missions, selectedMission, accounts };
}

export async function getRecentFeedback(user: AuthUser, limit = 30) {
  return requireDb().select({
    decision: schema.prospectFeedback.decision,
    reason: schema.prospectFeedback.reason,
    snapshot: schema.prospectFeedback.snapshot,
    createdAt: schema.prospectFeedback.createdAt,
  }).from(schema.prospectFeedback)
    .where(eq(schema.prospectFeedback.companyId, user.companyId))
    .orderBy(desc(schema.prospectFeedback.createdAt))
    .limit(limit);
}

export async function claimMissionRun(user: AuthUser, missionId: string) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from prospect_missions where id = ${missionId} and company_id = ${user.companyId} for update`);
    const [mission] = await tx.select().from(schema.prospectMissions)
      .where(and(eq(schema.prospectMissions.id, missionId), eq(schema.prospectMissions.companyId, user.companyId))).limit(1);
    if (!mission) throw new ProspectingError("Mission not found.", 404);
    const staleAt = Date.now() - 10 * 60 * 1000;
    if (mission.status === "running" && mission.updatedAt.getTime() > staleAt) {
      throw new ProspectingError("This mission already has a research run in progress.", 409);
    }
    if (mission.status === "running") {
      await tx.update(schema.prospectMissionRuns).set({
        status: "failed",
        errorMessage: "Run lease expired before completion; a later batch resumed the mission.",
        completedAt: new Date(),
      }).where(and(
        eq(schema.prospectMissionRuns.missionId, missionId),
        eq(schema.prospectMissionRuns.status, "running"),
      ));
    }
    const remainingBudget = mission.maxSpendCents - mission.spentCents;
    if (remainingBudget <= 0) throw new ProspectingError("This mission has reached its spend limit.", 409);
    const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(schema.prospectAccounts)
      .where(eq(schema.prospectAccounts.missionId, missionId));
    if ((count?.value ?? 0) >= mission.targetCount) throw new ProspectingError("This mission has already reached its target.", 409);
    const runId = nanoid(20);
    await tx.insert(schema.prospectMissionRuns).values({
      id: runId, companyId: user.companyId, missionId, userId: user.id, status: "running", stage: "research",
    });
    await tx.update(schema.prospectMissions).set({ status: "running", lastError: null, lastRunAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.prospectMissions.id, missionId));
    return { mission, runId, existingCount: count?.value ?? 0, remainingBudget };
  });
}

export async function completeMissionRun(
  user: AuthUser,
  missionId: string,
  runId: string,
  output: MissionResearchOutput,
  costCents: number,
  charges: Array<{ api: string; path: string; cents: number }>,
  toolTrace: Array<{ toolName: string; state: string }>,
) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const existing = await tx.select({ name: schema.prospectAccounts.name, domain: schema.prospectAccounts.domain })
      .from(schema.prospectAccounts).where(eq(schema.prospectAccounts.missionId, missionId));
    const seenNames = new Set(existing.map((account) => account.name.trim().toLowerCase()));
    const seenDomains = new Set(existing.map((account) => account.domain).filter(Boolean));
    let inserted = 0;
    for (const candidate of output.prospects) {
      const domain = normalizeDomain(candidate.domain ?? candidate.website);
      const nameKey = candidate.name.trim().toLowerCase();
      if (seenNames.has(nameKey) || (domain && seenDomains.has(domain))) continue;
      const accountId = nanoid(20);
      const overallScore = calculateOverallScore(candidate.fitScore, candidate.signalScore);
      await tx.insert(schema.prospectAccounts).values({
        id: accountId,
        companyId: user.companyId,
        missionId,
        name: candidate.name,
        domain,
        website: candidate.website,
        industry: candidate.industry,
        location: candidate.location,
        employeeCount: candidate.employeeCount,
        description: candidate.description,
        fitScore: candidate.fitScore,
        signalScore: candidate.signalScore,
        overallScore,
        rationale: candidate.rationale,
        whyNow: candidate.whyNow,
        outreachAngle: candidate.outreachAngle,
        evidence: candidate.evidence.map((item) => ({
          label: item.label,
          ...(item.url ? { url: item.url } : {}),
          ...(item.observedAt ? { observedAt: item.observedAt } : {}),
        })),
        rawData: candidate,
        contactStatus: candidate.contact ? "found" : "not_started",
      });
      if (candidate.contact) {
        await tx.insert(schema.prospectContacts).values({
          id: nanoid(20), companyId: user.companyId, missionId, accountId, preferred: true, ...candidate.contact,
        });
      }
      seenNames.add(nameKey);
      if (domain) seenDomains.add(domain);
      inserted += 1;
    }
    const [total] = await tx.select({ value: sql<number>`count(*)::int` }).from(schema.prospectAccounts)
      .where(eq(schema.prospectAccounts.missionId, missionId));
    const [mission] = await tx.select({ targetCount: schema.prospectMissions.targetCount }).from(schema.prospectMissions)
      .where(and(eq(schema.prospectMissions.id, missionId), eq(schema.prospectMissions.companyId, user.companyId))).limit(1);
    const status = (total?.value ?? 0) >= (mission?.targetCount ?? Number.MAX_SAFE_INTEGER) ? "completed" : "paused";
    await tx.update(schema.prospectMissionRuns).set({
      status: "succeeded", summary: output.summary, costCents, charges, toolTrace, completedAt: new Date(),
    }).where(and(eq(schema.prospectMissionRuns.id, runId), eq(schema.prospectMissionRuns.companyId, user.companyId)));
    await tx.update(schema.prospectMissions).set({
      status,
      strategy: output.strategy,
      lastSummary: output.summary,
      lastError: null,
      spentCents: sql`${schema.prospectMissions.spentCents} + ${costCents}`,
      updatedAt: new Date(),
    }).where(and(eq(schema.prospectMissions.id, missionId), eq(schema.prospectMissions.companyId, user.companyId)));
    return { inserted, total: total?.value ?? inserted, status };
  });
}

export async function failMissionRun(user: AuthUser, missionId: string, runId: string, errorMessage: string, costCents: number, charges: Array<{ api: string; path: string; cents: number }>) {
  const db = requireDb();
  await db.transaction(async (tx) => {
    await tx.update(schema.prospectMissionRuns).set({ status: "failed", errorMessage, costCents, charges, completedAt: new Date() })
      .where(and(eq(schema.prospectMissionRuns.id, runId), eq(schema.prospectMissionRuns.companyId, user.companyId)));
    await tx.update(schema.prospectMissions).set({ status: "failed", lastError: errorMessage, spentCents: sql`${schema.prospectMissions.spentCents} + ${costCents}`, updatedAt: new Date() })
      .where(and(eq(schema.prospectMissions.id, missionId), eq(schema.prospectMissions.companyId, user.companyId)));
  });
}

export async function reviewProspect(user: AuthUser, accountId: string, input: ReviewInput) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.prospectAccounts)
      .where(and(eq(schema.prospectAccounts.id, accountId), eq(schema.prospectAccounts.companyId, user.companyId))).limit(1);
    if (!before) throw new ProspectingError("Prospect not found.", 404);
    const [account] = await tx.update(schema.prospectAccounts).set({
      status: input.status,
      rejectionReason: input.status === "rejected" ? input.reason ?? null : null,
      reviewedBy: input.status === "approved" || input.status === "rejected" ? user.id : null,
      reviewedAt: input.status === "approved" || input.status === "rejected" ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(schema.prospectAccounts.id, accountId)).returning();
    if (input.status === "approved" || input.status === "rejected") {
      await tx.insert(schema.prospectFeedback).values({
        id: nanoid(20), companyId: user.companyId, missionId: before.missionId, accountId, userId: user.id,
        decision: input.status, reason: input.reason, snapshot: {
          name: before.name, domain: before.domain, industry: before.industry, location: before.location,
          fitScore: before.fitScore, signalScore: before.signalScore, rationale: before.rationale, whyNow: before.whyNow,
        },
      });
    }
    return account;
  });
}

export async function claimContactResearch(user: AuthUser, accountId: string) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from prospect_accounts where id = ${accountId} and company_id = ${user.companyId} for update`);
    const [account] = await tx.select().from(schema.prospectAccounts)
      .where(and(eq(schema.prospectAccounts.id, accountId), eq(schema.prospectAccounts.companyId, user.companyId))).limit(1);
    if (!account) throw new ProspectingError("Prospect not found.", 404);
    if (account.contactStatus === "searching") throw new ProspectingError("Contact research is already running for this prospect.", 409);
    const [mission] = await tx.select({
      maxSpendCents: schema.prospectMissions.maxSpendCents,
      spentCents: schema.prospectMissions.spentCents,
    }).from(schema.prospectMissions).where(eq(schema.prospectMissions.id, account.missionId)).limit(1);
    const remainingBudget = (mission?.maxSpendCents ?? 0) - (mission?.spentCents ?? 0);
    if (remainingBudget <= 0) throw new ProspectingError("This mission has reached its spend limit.", 409);
    const runId = nanoid(20);
    await tx.insert(schema.prospectMissionRuns).values({
      id: runId, companyId: user.companyId, missionId: account.missionId, userId: user.id, status: "running", stage: "contact",
    });
    await tx.update(schema.prospectAccounts).set({ contactStatus: "searching", updatedAt: new Date() }).where(eq(schema.prospectAccounts.id, accountId));
    return { account, runId, remainingBudget };
  });
}

export async function completeContactResearch(
  user: AuthUser,
  accountId: string,
  runId: string,
  output: ContactResearchOutput,
  costCents: number,
  charges: Array<{ api: string; path: string; cents: number }>,
  toolTrace: Array<{ toolName: string; state: string }>,
) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const [account] = await tx.select().from(schema.prospectAccounts)
      .where(and(eq(schema.prospectAccounts.id, accountId), eq(schema.prospectAccounts.companyId, user.companyId))).limit(1);
    if (!account) throw new ProspectingError("Prospect not found.", 404);
    await tx.update(schema.prospectContacts).set({ preferred: false, updatedAt: new Date() }).where(eq(schema.prospectContacts.accountId, accountId));
    const existing = await tx.select().from(schema.prospectContacts).where(eq(schema.prospectContacts.accountId, accountId));
    for (const [index, contact] of output.contacts.entries()) {
      const match = existing.find((saved) =>
        (contact.email && saved.email?.toLowerCase() === contact.email.toLowerCase()) ||
        (contact.linkedinUrl && saved.linkedinUrl?.toLowerCase() === contact.linkedinUrl.toLowerCase()) ||
        (saved.fullName.toLowerCase() === contact.fullName.toLowerCase() && saved.title.toLowerCase() === contact.title.toLowerCase()),
      );
      if (match) {
        await tx.update(schema.prospectContacts).set({ ...contact, preferred: index === 0, updatedAt: new Date() })
          .where(eq(schema.prospectContacts.id, match.id));
      } else {
        await tx.insert(schema.prospectContacts).values({
          id: nanoid(20), companyId: user.companyId, missionId: account.missionId, accountId,
          preferred: index === 0, ...contact,
        });
      }
    }
    await tx.update(schema.prospectAccounts).set({
      contactStatus: output.contacts.length ? "found" : "unavailable", updatedAt: new Date(),
    }).where(eq(schema.prospectAccounts.id, accountId));
    await tx.update(schema.prospectMissionRuns).set({
      status: "succeeded", summary: output.summary, costCents, charges, toolTrace, completedAt: new Date(),
    }).where(and(eq(schema.prospectMissionRuns.id, runId), eq(schema.prospectMissionRuns.companyId, user.companyId)));
    await tx.update(schema.prospectMissions).set({
      spentCents: sql`${schema.prospectMissions.spentCents} + ${costCents}`, updatedAt: new Date(),
    }).where(and(eq(schema.prospectMissions.id, account.missionId), eq(schema.prospectMissions.companyId, user.companyId)));
    return output.contacts.length;
  });
}

export async function failContactResearch(
  user: AuthUser,
  accountId: string,
  runId: string,
  errorMessage: string,
  costCents: number,
  charges: Array<{ api: string; path: string; cents: number }>,
) {
  const db = requireDb();
  await db.transaction(async (tx) => {
    const [account] = await tx.select({ missionId: schema.prospectAccounts.missionId }).from(schema.prospectAccounts)
      .where(and(eq(schema.prospectAccounts.id, accountId), eq(schema.prospectAccounts.companyId, user.companyId))).limit(1);
    await tx.update(schema.prospectAccounts).set({ contactStatus: "not_started", updatedAt: new Date() })
      .where(and(eq(schema.prospectAccounts.id, accountId), eq(schema.prospectAccounts.companyId, user.companyId)));
    await tx.update(schema.prospectMissionRuns).set({
      status: "failed", errorMessage, costCents, charges, completedAt: new Date(),
    }).where(and(eq(schema.prospectMissionRuns.id, runId), eq(schema.prospectMissionRuns.companyId, user.companyId)));
    if (account) {
      await tx.update(schema.prospectMissions).set({
        spentCents: sql`${schema.prospectMissions.spentCents} + ${costCents}`, updatedAt: new Date(),
      }).where(and(eq(schema.prospectMissions.id, account.missionId), eq(schema.prospectMissions.companyId, user.companyId)));
    }
  });
}

export async function getMissionExportRows(user: AuthUser, missionId: string) {
  return getMissionAccounts(user, missionId);
}
