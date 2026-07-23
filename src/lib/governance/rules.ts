import type { RunArgs } from "@/lib/orthogonal/client";
import type { DetailsEndpoint } from "@/lib/orthogonal/types";

export const MAX_DYNAMIC_INPUT_BYTES = 64_000;
const SECRET_KEY = /(authorization|password|passwd|secret|token|api[_-]?key|cookie)/i;

export function normalizeApi(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeMethod(value: string | undefined) {
  return (value || "GET").trim().toUpperCase();
}

export function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth limited]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeForAudit(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 200)
        .map(([key, item]) => [key, SECRET_KEY.test(key) ? "[redacted]" : sanitizeForAudit(item, depth + 1)]),
    );
  }
  if (typeof value === "string") return value.slice(0, 4_000);
  return value;
}

export function validateEndpointParameters(endpoint: DetailsEndpoint, args: RunArgs): string | null {
  const bytes = Buffer.byteLength(JSON.stringify({ body: args.body, query: args.query }), "utf8");
  if (bytes > MAX_DYNAMIC_INPUT_BYTES) return `Dynamic API input exceeds the ${MAX_DYNAMIC_INPUT_BYTES / 1_000} KB limit.`;
  const method = normalizeMethod(endpoint.method);
  if (method === "GET" && args.body && Object.keys(args.body).length) return "GET endpoints must use query parameters, not a request body.";
  const query = args.query ?? {};
  const body = args.body ?? {};
  for (const param of endpoint.queryParams ?? []) {
    if (param.required && (query[param.name] === undefined || query[param.name] === null || query[param.name] === "")) return `Missing required query parameter: ${param.name}`;
  }
  for (const param of endpoint.bodyParams ?? []) {
    if (param.required && (body[param.name] === undefined || body[param.name] === null || body[param.name] === "")) return `Missing required body parameter: ${param.name}`;
  }
  return null;
}

export interface BudgetState {
  estimatedCostCents: number;
  turnRemainingCents?: number;
  maxCostPerCallCents: number;
  dailyUsedCents: number;
  dailyUserLimitCents: number;
  monthlyUsedCents: number;
  monthlyCompanyLimitCents: number;
}

export function budgetBlockReason(state: BudgetState): string | null {
  if (state.turnRemainingCents !== undefined && state.estimatedCostCents > state.turnRemainingCents) return `This endpoint costs ${state.estimatedCostCents}¢, above the remaining ${state.turnRemainingCents}¢ turn budget.`;
  if (state.estimatedCostCents > state.maxCostPerCallCents) return `This endpoint costs ${state.estimatedCostCents}¢, above the company per-call limit of ${state.maxCostPerCallCents}¢.`;
  if (state.dailyUsedCents + state.estimatedCostCents > state.dailyUserLimitCents) return `This call would exceed the employee daily limit of ${state.dailyUserLimitCents}¢.`;
  if (state.monthlyUsedCents + state.estimatedCostCents > state.monthlyCompanyLimitCents) return `This call would exceed the company monthly limit of ${state.monthlyCompanyLimitCents}¢.`;
  return null;
}
