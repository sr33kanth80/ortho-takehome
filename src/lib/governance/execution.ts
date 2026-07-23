import "server-only";

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { getOrthogonalClient, type RunArgs } from "@/lib/orthogonal/client";
import { OrthogonalError } from "@/lib/orthogonal/errors";
import type { DetailsEndpoint, SearchResponse } from "@/lib/orthogonal/types";
import { usdToCents } from "@/lib/tools/spend";
import { budgetBlockReason, normalizeApi, normalizeMethod, sanitizeForAudit, validateEndpointParameters } from "./rules";

const MAX_CAPTURE_CHARS = 8_000;

export interface ExecutionActor {
  userId: string;
  companyId: string;
  conversationId?: string;
}

export interface GovernanceResult {
  ok: boolean;
  executionId?: string;
  costCents?: number;
  data?: unknown;
  error?: string;
  code?: string;
}

interface PolicyDecision {
  allowed: boolean;
  reason: string;
}

function capture(value: unknown): unknown {
  const safe = sanitizeForAudit(value);
  const encoded = JSON.stringify(safe);
  if (encoded.length <= MAX_CAPTURE_CHARS) return safe;
  return { truncated: true, preview: encoded.slice(0, MAX_CAPTURE_CHARS) };
}

function dayStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function policyDecision(companyId: string, api: string, path: string, method: string): Promise<PolicyDecision> {
  const db = getDb();
  if (!db) return { allowed: false, reason: "Company governance is unavailable because the database is not configured." };
  const [settings] = await db.select().from(schema.companyDynamicSettings).where(eq(schema.companyDynamicSettings.companyId, companyId)).limit(1);
  if (!settings) return { allowed: false, reason: "Company dynamic execution settings are missing." };
  const [policy] = await db
    .select()
    .from(schema.dynamicApiPolicies)
    .where(and(
      eq(schema.dynamicApiPolicies.companyId, companyId),
      eq(schema.dynamicApiPolicies.api, normalizeApi(api)),
      eq(schema.dynamicApiPolicies.path, path),
      eq(schema.dynamicApiPolicies.method, normalizeMethod(method)),
    ))
    .limit(1);
  const effect = policy?.effect ?? settings.defaultPolicy;
  return effect === "allow"
    ? { allowed: true, reason: policy ? "Explicit company allow policy." : "Company default allows catalog endpoints." }
    : { allowed: false, reason: policy ? "Explicitly blocked by company policy." : "Endpoint is not on the company allowlist." };
}

export async function filterDiscoveryForCompany(actor: ExecutionActor, response: SearchResponse): Promise<SearchResponse> {
  const db = getDb();
  if (!db) return { ...response, results: [], count: 0, apisCount: 0 };
  const [[membership], [settings], policies] = await Promise.all([
    db
    .select({ enabled: schema.companyMemberships.dynamicExecutionEnabled })
    .from(schema.companyMemberships)
    .where(and(eq(schema.companyMemberships.userId, actor.userId), eq(schema.companyMemberships.companyId, actor.companyId)))
    .limit(1),
    db.select().from(schema.companyDynamicSettings).where(eq(schema.companyDynamicSettings.companyId, actor.companyId)).limit(1),
    db.select().from(schema.dynamicApiPolicies).where(eq(schema.dynamicApiPolicies.companyId, actor.companyId)),
  ]);
  if (!membership?.enabled || !settings) return { ...response, results: [], count: 0, apisCount: 0 };
  const policyMap = new Map(policies.map((policy) => [`${policy.api}\u0000${policy.path}\u0000${policy.method}`, policy.effect]));

  const filtered = [];
  for (const api of response.results ?? []) {
    const endpoints = [];
    for (const endpoint of api.endpoints ?? []) {
      const method = normalizeMethod(endpoint.method);
      const effect = policyMap.get(`${normalizeApi(api.slug)}\u0000${endpoint.path}\u0000${method}`) ?? settings.defaultPolicy;
      if (effect === "allow") endpoints.push(endpoint);
    }
    if (endpoints.length) filtered.push({ ...api, endpoints });
  }
  return { ...response, results: filtered, count: filtered.length, apisCount: filtered.length };
}

export async function authorizeDetails(actor: ExecutionActor, api: string, endpoint: DetailsEndpoint): Promise<PolicyDecision> {
  return policyDecision(actor.companyId, api, endpoint.path, normalizeMethod(endpoint.method));
}

async function recordBlocked(actor: ExecutionActor, toolCallId: string, args: RunArgs, method: string, reason: string, estimatedCostCents = 0) {
  const db = getDb();
  if (!db) return undefined;
  const id = nanoid(20);
  const [inserted] = await db.insert(schema.dynamicExecutions).values({
    id,
    companyId: actor.companyId,
    userId: actor.userId,
    conversationId: actor.conversationId,
    toolCallId,
    api: normalizeApi(args.api),
    path: args.path,
    method,
    status: "blocked",
    policyDecision: reason,
    estimatedCostCents,
    requestPreview: capture({ query: args.query, body: args.body }),
    errorCode: "POLICY_BLOCKED",
    errorMessage: reason,
    completedAt: new Date(),
  }).onConflictDoNothing().returning({ id: schema.dynamicExecutions.id });
  if (inserted) return inserted.id;
  const [existing] = await db.select({ id: schema.dynamicExecutions.id }).from(schema.dynamicExecutions).where(and(
    eq(schema.dynamicExecutions.companyId, actor.companyId), eq(schema.dynamicExecutions.toolCallId, toolCallId),
  )).limit(1);
  return existing?.id;
}

export async function executeGovernedDynamicApi(actor: ExecutionActor, toolCallId: string, args: RunArgs, turnRemainingCents?: number): Promise<GovernanceResult> {
  const db = getDb();
  if (!db) return { ok: false, code: "GOVERNANCE_UNAVAILABLE", error: "Company governance is unavailable." };

  let details;
  try {
    // Bypass the long-lived schema cache at the billing boundary so stale
    // catalog pricing can never authorize a call under an outdated estimate.
    details = await getOrthogonalClient().details(args.api, args.path, true);
  } catch (error) {
    const message = error instanceof OrthogonalError ? error.userMessage : (error as Error).message;
    return { ok: false, code: "DETAILS_FAILED", error: message };
  }
  const endpoint = details.endpoint;
  const method = normalizeMethod(endpoint.method);
  const estimatedCostCents = usdToCents(endpoint.price);
  const validationError = validateEndpointParameters(endpoint, args);
  if (validationError) {
    const executionId = await recordBlocked(actor, toolCallId, args, method, validationError, estimatedCostCents);
    return { ok: false, executionId, code: "INVALID_PARAMETERS", error: validationError };
  }
  if (endpoint.hasDynamicPricing || estimatedCostCents === undefined) {
    const reason = "Company governance blocks endpoints without a fixed catalog price.";
    const executionId = await recordBlocked(actor, toolCallId, args, method, reason);
    return { ok: false, executionId, code: "UNKNOWN_PRICE", error: reason };
  }
  if (turnRemainingCents !== undefined && estimatedCostCents > turnRemainingCents) {
    const reason = budgetBlockReason({ estimatedCostCents, turnRemainingCents, maxCostPerCallCents: Number.MAX_SAFE_INTEGER, dailyUsedCents: 0, dailyUserLimitCents: Number.MAX_SAFE_INTEGER, monthlyUsedCents: 0, monthlyCompanyLimitCents: Number.MAX_SAFE_INTEGER })!;
    const executionId = await recordBlocked(actor, toolCallId, args, method, reason, estimatedCostCents);
    return { ok: false, executionId, code: "TURN_BUDGET_BLOCKED", error: reason };
  }
  const policy = await policyDecision(actor.companyId, args.api, args.path, method);
  if (!policy.allowed) {
    const executionId = await recordBlocked(actor, toolCallId, args, method, policy.reason, estimatedCostCents);
    return { ok: false, executionId, code: "POLICY_BLOCKED", error: policy.reason };
  }

  const executionId = nanoid(20);
  const reservation = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT company_id FROM company_dynamic_settings WHERE company_id = ${actor.companyId} FOR UPDATE`);
    const [settings] = await tx.select().from(schema.companyDynamicSettings).where(eq(schema.companyDynamicSettings.companyId, actor.companyId)).limit(1);
    if (!settings) return { ok: false as const, reason: "Company dynamic execution settings are missing." };
    const [currentPolicy] = await tx.select({ effect: schema.dynamicApiPolicies.effect }).from(schema.dynamicApiPolicies).where(and(
      eq(schema.dynamicApiPolicies.companyId, actor.companyId),
      eq(schema.dynamicApiPolicies.api, normalizeApi(args.api)),
      eq(schema.dynamicApiPolicies.path, args.path),
      eq(schema.dynamicApiPolicies.method, method),
    )).limit(1);
    if ((currentPolicy?.effect ?? settings.defaultPolicy) !== "allow") {
      return { ok: false as const, reason: currentPolicy ? "Explicitly blocked by company policy." : "Endpoint is not on the company allowlist." };
    }
    await tx.execute(sql`SELECT id FROM company_memberships WHERE company_id = ${actor.companyId} AND user_id = ${actor.userId} FOR UPDATE`);
    const [membership] = await tx
      .select({ enabled: schema.companyMemberships.dynamicExecutionEnabled })
      .from(schema.companyMemberships)
      .where(and(eq(schema.companyMemberships.companyId, actor.companyId), eq(schema.companyMemberships.userId, actor.userId)))
      .limit(1);
    if (!membership?.enabled) return { ok: false as const, reason: "Dynamic API execution is disabled for this employee." };

    const spendExpression = sql<number>`coalesce(sum(case when ${schema.dynamicExecutions.status} = 'pending' then ${schema.dynamicExecutions.estimatedCostCents} else coalesce(${schema.dynamicExecutions.actualCostCents}, 0) end), 0)`;
    const [daily] = await tx.select({ cents: spendExpression }).from(schema.dynamicExecutions).where(and(
      eq(schema.dynamicExecutions.companyId, actor.companyId),
      eq(schema.dynamicExecutions.userId, actor.userId),
      gte(schema.dynamicExecutions.createdAt, dayStartUtc()),
      inArray(schema.dynamicExecutions.status, ["pending", "succeeded", "indeterminate"]),
    ));
    const [monthly] = await tx.select({ cents: spendExpression }).from(schema.dynamicExecutions).where(and(
      eq(schema.dynamicExecutions.companyId, actor.companyId),
      gte(schema.dynamicExecutions.createdAt, monthStartUtc()),
      inArray(schema.dynamicExecutions.status, ["pending", "succeeded", "indeterminate"]),
    ));
    const dailyCents = Number(daily?.cents ?? 0);
    const monthlyCents = Number(monthly?.cents ?? 0);
    const budgetReason = budgetBlockReason({
      estimatedCostCents,
      maxCostPerCallCents: settings.maxCostPerCallCents,
      dailyUsedCents: dailyCents,
      dailyUserLimitCents: settings.dailyUserLimitCents,
      monthlyUsedCents: monthlyCents,
      monthlyCompanyLimitCents: settings.monthlyCompanyLimitCents,
    });
    if (budgetReason) return { ok: false as const, reason: budgetReason };

    await tx.insert(schema.dynamicExecutions).values({
      id: executionId,
      companyId: actor.companyId,
      userId: actor.userId,
      conversationId: actor.conversationId,
      toolCallId,
      api: normalizeApi(args.api),
      path: args.path,
      method,
      status: "pending",
      policyDecision: policy.reason,
      estimatedCostCents,
      requestPreview: capture({ query: args.query, body: args.body }),
    });
    return { ok: true as const };
  }).catch((error: unknown) => {
    if (String((error as { code?: string }).code) === "23505") return { ok: false as const, reason: "This tool call was already submitted and will not be charged twice." };
    throw error;
  });

  if (!reservation.ok) {
    if (reservation.reason.includes("already submitted")) {
      const existing = await recentExecutionForToolCall(actor.companyId, toolCallId);
      return { ok: false, executionId: existing?.id, code: "DUPLICATE_EXECUTION", error: reservation.reason };
    }
    const blockedId = await recordBlocked(actor, `${toolCallId}-blocked`, args, method, reservation.reason, estimatedCostCents);
    return { ok: false, executionId: blockedId, code: "BUDGET_BLOCKED", error: reservation.reason };
  }

  const startedAt = Date.now();
  try {
    // Durable tool-call idempotency above is the source of truth. A process
    // cache would obscure whether this specific execution incurred a charge.
    const response = await getOrthogonalClient().run(args, { dedupe: false });
    const actualCostCents = response.priceCents ?? estimatedCostCents;
    await db.update(schema.dynamicExecutions).set({
      status: "succeeded",
      actualCostCents,
      responsePreview: capture(response.data),
      upstreamRequestId: response.requestId,
      durationMs: Date.now() - startedAt,
      completedAt: new Date(),
    }).where(eq(schema.dynamicExecutions.id, executionId));
    return { ok: true, executionId, costCents: actualCostCents, data: response.data };
  } catch (error) {
    const orthogonal = error instanceof OrthogonalError ? error : undefined;
    const indeterminate = orthogonal?.code === "TIMEOUT" || orthogonal?.code === "NETWORK";
    const message = orthogonal?.userMessage ?? (error as Error).message;
    await db.update(schema.dynamicExecutions).set({
      status: indeterminate ? "indeterminate" : "failed",
      errorCode: orthogonal?.code ?? "UNEXPECTED",
      errorMessage: message.slice(0, 2_000),
      upstreamRequestId: orthogonal?.requestId,
      durationMs: Date.now() - startedAt,
      completedAt: new Date(),
    }).where(eq(schema.dynamicExecutions.id, executionId));
    return { ok: false, executionId, code: orthogonal?.code ?? "UNEXPECTED", error: indeterminate ? `${message} The charge outcome is unknown; do not retry automatically.` : message };
  }
}

export async function recentExecutionForToolCall(companyId: string, toolCallId: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db.select().from(schema.dynamicExecutions).where(and(eq(schema.dynamicExecutions.companyId, companyId), eq(schema.dynamicExecutions.toolCallId, toolCallId))).orderBy(desc(schema.dynamicExecutions.createdAt)).limit(1);
  return row ?? null;
}
