import assert from "node:assert/strict";
import test from "node:test";
import { budgetBlockReason, sanitizeForAudit, validateEndpointParameters } from "./rules";

test("audit capture redacts nested credentials without erasing ordinary company data", () => {
  assert.deepEqual(sanitizeForAudit({ company: "Acme", nested: { apiKey: "secret", count: 2 } }), {
    company: "Acme", nested: { apiKey: "[redacted]", count: 2 },
  });
});

test("GET endpoints reject request bodies", () => {
  assert.match(validateEndpointParameters({ path: "/lookup", method: "GET" }, { api: "x", path: "/lookup", body: { q: "x" } }) ?? "", /query parameters/);
});

test("required catalog parameters are enforced", () => {
  assert.equal(validateEndpointParameters({ path: "/lookup", method: "POST", bodyParams: [{ name: "email", required: true }] }, { api: "x", path: "/lookup", body: {} }), "Missing required body parameter: email");
});

test("valid parameters pass", () => {
  assert.equal(validateEndpointParameters({ path: "/lookup", method: "POST", bodyParams: [{ name: "email", required: true }] }, { api: "x", path: "/lookup", body: { email: "a@example.com" } }), null);
});

const budget = { estimatedCostCents: 5, turnRemainingCents: 50, maxCostPerCallCents: 25, dailyUsedCents: 20, dailyUserLimitCents: 100, monthlyUsedCents: 200, monthlyCompanyLimitCents: 1_000 };

test("budget accepts a call inside every perimeter", () => assert.equal(budgetBlockReason(budget), null));
test("budget enforces the per-call limit", () => assert.match(budgetBlockReason({ ...budget, estimatedCostCents: 26 }) ?? "", /per-call/));
test("budget counts existing daily reservations", () => assert.match(budgetBlockReason({ ...budget, dailyUsedCents: 98 }) ?? "", /daily/));
test("budget counts existing monthly reservations", () => assert.match(budgetBlockReason({ ...budget, monthlyUsedCents: 999 }) ?? "", /monthly/));
