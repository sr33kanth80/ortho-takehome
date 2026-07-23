import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export const settingsInput = z.object({
  defaultPolicy: z.enum(["allow", "deny"]),
  maxCostPerCallCents: z.number().int().min(0).max(100_000),
  dailyUserLimitCents: z.number().int().min(0).max(10_000_000),
  monthlyCompanyLimitCents: z.number().int().min(0).max(100_000_000),
}).refine((value) => value.dailyUserLimitCents >= value.maxCostPerCallCents, {
  message: "Daily employee limit must be at least the per-call limit.",
}).refine((value) => value.monthlyCompanyLimitCents >= value.dailyUserLimitCents, {
  message: "Monthly company limit must be at least the daily employee limit.",
});

export const policyInput = z.object({
  api: z.string().trim().min(1).max(100).transform((value) => value.toLowerCase()),
  path: z.string().trim().min(1).max(500).refine((value) => value.startsWith("/"), "Path must start with /."),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  effect: z.enum(["allow", "deny"]),
});

export const memberInput = z.object({ dynamicExecutionEnabled: z.boolean() });

export async function requireManagerRequest(request?: Request): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new Response(JSON.stringify({ error: "Sign in required" }), { status: 401, headers: { "Content-Type": "application/json" } });
  if (user.role !== "manager") throw new Response(JSON.stringify({ error: "Manager access required" }), { status: 403, headers: { "Content-Type": "application/json" } });
  if (request && request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    if ((origin && origin !== new URL(request.url).origin) || (site && site !== "same-origin")) {
      throw new Response(JSON.stringify({ error: "Cross-origin management changes are not allowed" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }
  }
  return user;
}

export function routeError(error: unknown): Response {
  if (error instanceof Response) return error;
  console.error("[management] request failed:", error);
  return Response.json({ error: "Management request failed." }, { status: 500 });
}

export async function getManagementOverview(manager: AuthUser) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [settings] = await db.select().from(schema.companyDynamicSettings).where(eq(schema.companyDynamicSettings.companyId, manager.companyId)).limit(1);
  const policies = await db.select().from(schema.dynamicApiPolicies).where(eq(schema.dynamicApiPolicies.companyId, manager.companyId)).orderBy(schema.dynamicApiPolicies.api, schema.dynamicApiPolicies.path);
  const members = await db
    .select({
      id: schema.companyMemberships.id,
      userId: schema.companyMemberships.userId,
      email: schema.users.email,
      role: schema.companyMemberships.role,
      dynamicExecutionEnabled: schema.companyMemberships.dynamicExecutionEnabled,
      updatedAt: schema.companyMemberships.updatedAt,
    })
    .from(schema.companyMemberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMemberships.userId))
    .where(eq(schema.companyMemberships.companyId, manager.companyId))
    .orderBy(schema.users.email);
  const executions = await db
    .select({
      id: schema.dynamicExecutions.id,
      userId: schema.dynamicExecutions.userId,
      email: schema.users.email,
      conversationId: schema.dynamicExecutions.conversationId,
      api: schema.dynamicExecutions.api,
      path: schema.dynamicExecutions.path,
      method: schema.dynamicExecutions.method,
      status: schema.dynamicExecutions.status,
      estimatedCostCents: schema.dynamicExecutions.estimatedCostCents,
      actualCostCents: schema.dynamicExecutions.actualCostCents,
      durationMs: schema.dynamicExecutions.durationMs,
      createdAt: schema.dynamicExecutions.createdAt,
    })
    .from(schema.dynamicExecutions)
    .innerJoin(schema.users, eq(schema.users.id, schema.dynamicExecutions.userId))
    .where(eq(schema.dynamicExecutions.companyId, manager.companyId))
    .orderBy(desc(schema.dynamicExecutions.createdAt))
    .limit(100);
  const [metrics] = await db
    .select({
      total: sql<number>`count(*)::int`,
      succeeded: sql<number>`count(*) filter (where ${schema.dynamicExecutions.status} = 'succeeded')::int`,
      blocked: sql<number>`count(*) filter (where ${schema.dynamicExecutions.status} = 'blocked')::int`,
      spendCents: sql<number>`coalesce(sum(${schema.dynamicExecutions.actualCostCents}), 0)::int`,
    })
    .from(schema.dynamicExecutions)
    .where(and(eq(schema.dynamicExecutions.companyId, manager.companyId), gte(schema.dynamicExecutions.createdAt, monthStart)));
  const audit = await db
    .select({
      id: schema.governanceAuditEvents.id,
      action: schema.governanceAuditEvents.action,
      targetType: schema.governanceAuditEvents.targetType,
      targetId: schema.governanceAuditEvents.targetId,
      actorEmail: schema.users.email,
      createdAt: schema.governanceAuditEvents.createdAt,
    })
    .from(schema.governanceAuditEvents)
    .innerJoin(schema.users, eq(schema.users.id, schema.governanceAuditEvents.actorUserId))
    .where(eq(schema.governanceAuditEvents.companyId, manager.companyId))
    .orderBy(desc(schema.governanceAuditEvents.createdAt))
    .limit(40);

  return {
    company: { id: manager.companyId, name: manager.companyName },
    settings,
    policies,
    members,
    executions,
    metrics: metrics ?? { total: 0, succeeded: 0, blocked: 0, spendCents: 0 },
    audit,
  };
}

export type ManagementOverview = Awaited<ReturnType<typeof getManagementOverview>>;

export async function updateSettings(manager: AuthUser, input: z.infer<typeof settingsInput>) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.companyDynamicSettings).where(eq(schema.companyDynamicSettings.companyId, manager.companyId)).limit(1);
    const [after] = await tx.update(schema.companyDynamicSettings).set({ ...input, updatedBy: manager.id, updatedAt: new Date() }).where(eq(schema.companyDynamicSettings.companyId, manager.companyId)).returning();
    await tx.insert(schema.governanceAuditEvents).values({
      id: nanoid(20), companyId: manager.companyId, actorUserId: manager.id,
      action: "limits.updated", targetType: "company_settings", targetId: manager.companyId, before, after,
    });
    return after;
  });
}

export async function createPolicy(manager: AuthUser, input: z.infer<typeof policyInput>) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT company_id FROM company_dynamic_settings WHERE company_id = ${manager.companyId} FOR UPDATE`);
    const [policy] = await tx.insert(schema.dynamicApiPolicies).values({
      id: nanoid(20), companyId: manager.companyId, createdBy: manager.id, ...input,
    }).onConflictDoUpdate({
      target: [schema.dynamicApiPolicies.companyId, schema.dynamicApiPolicies.api, schema.dynamicApiPolicies.path, schema.dynamicApiPolicies.method],
      set: { effect: input.effect, createdBy: manager.id, updatedAt: new Date() },
    }).returning();
    await tx.insert(schema.governanceAuditEvents).values({
      id: nanoid(20), companyId: manager.companyId, actorUserId: manager.id,
      action: "endpoint_policy.saved", targetType: "endpoint_policy", targetId: policy.id, after: policy,
    });
    return policy;
  });
}

export async function deletePolicy(manager: AuthUser, id: string) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT company_id FROM company_dynamic_settings WHERE company_id = ${manager.companyId} FOR UPDATE`);
    const [before] = await tx.delete(schema.dynamicApiPolicies).where(and(eq(schema.dynamicApiPolicies.id, id), eq(schema.dynamicApiPolicies.companyId, manager.companyId))).returning();
    if (!before) return false;
    await tx.insert(schema.governanceAuditEvents).values({
      id: nanoid(20), companyId: manager.companyId, actorUserId: manager.id,
      action: "endpoint_policy.deleted", targetType: "endpoint_policy", targetId: id, before,
    });
    return true;
  });
}

export async function updateMember(manager: AuthUser, membershipId: string, enabled: boolean) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.companyMemberships).where(and(eq(schema.companyMemberships.id, membershipId), eq(schema.companyMemberships.companyId, manager.companyId))).limit(1);
    if (!before) return null;
    const [after] = await tx.update(schema.companyMemberships).set({ dynamicExecutionEnabled: enabled, updatedAt: new Date() }).where(eq(schema.companyMemberships.id, membershipId)).returning();
    await tx.insert(schema.governanceAuditEvents).values({
      id: nanoid(20), companyId: manager.companyId, actorUserId: manager.id,
      action: "employee_access.updated", targetType: "company_membership", targetId: membershipId,
      before: { dynamicExecutionEnabled: before.dynamicExecutionEnabled }, after: { dynamicExecutionEnabled: after.dynamicExecutionEnabled },
    });
    return after;
  });
}

export async function getExecutionDetail(manager: AuthUser, id: string) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  const [execution] = await db
    .select({
      id: schema.dynamicExecutions.id, email: schema.users.email, conversationId: schema.dynamicExecutions.conversationId,
      api: schema.dynamicExecutions.api, path: schema.dynamicExecutions.path, method: schema.dynamicExecutions.method,
      status: schema.dynamicExecutions.status, policyDecision: schema.dynamicExecutions.policyDecision,
      estimatedCostCents: schema.dynamicExecutions.estimatedCostCents, actualCostCents: schema.dynamicExecutions.actualCostCents,
      requestPreview: schema.dynamicExecutions.requestPreview, responsePreview: schema.dynamicExecutions.responsePreview,
      errorCode: schema.dynamicExecutions.errorCode, errorMessage: schema.dynamicExecutions.errorMessage,
      upstreamRequestId: schema.dynamicExecutions.upstreamRequestId, durationMs: schema.dynamicExecutions.durationMs,
      createdAt: schema.dynamicExecutions.createdAt, completedAt: schema.dynamicExecutions.completedAt,
    })
    .from(schema.dynamicExecutions)
    .innerJoin(schema.users, eq(schema.users.id, schema.dynamicExecutions.userId))
    .where(and(eq(schema.dynamicExecutions.id, id), eq(schema.dynamicExecutions.companyId, manager.companyId)))
    .limit(1);
  return execution ?? null;
}
