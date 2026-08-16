import assert from "node:assert/strict";
import test from "node:test";
import { businessProfileInput, calculateOverallScore, leadReviewInput, leadSourcingInput, missionInput, normalizeDomain } from "./validation";

test("normalizeDomain turns URLs and hosts into stable dedupe keys", () => {
  assert.equal(normalizeDomain("https://www.Example.com/about"), "example.com");
  assert.equal(normalizeDomain(" example.com "), "example.com");
  assert.equal(normalizeDomain(null), null);
});
test("overall prospect score uses a stable fit-first weighting", () => {
  assert.equal(calculateOverallScore(90, 70), 83);
  assert.equal(calculateOverallScore(120, -20), 71);
});

test("business brief trims and deduplicates customer criteria", () => {
  const parsed = businessProfileInput.parse({
    businessName: "  Northstar  ",
    website: "northstar.example",
    offer: "Thermal simulation services",
    valueProposition: "Fewer physical prototype cycles",
    targetIndustries: ["Battery", "Battery", " Energy storage "],
    targetLocations: [],
    companySizes: [],
    buyerRoles: ["VP Engineering"],
    buyingSignals: [],
    exclusions: [],
    exampleCustomers: [],
    notes: null,
  });
  assert.equal(parsed.businessName, "Northstar");
  assert.deepEqual(parsed.targetIndustries, ["Battery", "Energy storage"]);
});

test("mission limits reject unbounded research jobs", () => {
  const result = missionInput.safeParse({ name: "Everything", brief: "Find every company", targetCount: 101, maxSpendCents: 300 });
  assert.equal(result.success, false);
});

test("chat lead sourcing requires a complete thesis and bounded mission", () => {
  const result = leadSourcingInput.safeParse({
    profile: {
      businessName: "Northstar",
      website: null,
      offer: "Battery thermal simulation",
      valueProposition: "Reduce prototype cycles",
      targetIndustries: ["Battery manufacturing"],
      targetLocations: ["Midwest United States"],
      companySizes: [],
      buyerRoles: ["VP Engineering"],
      buyingSignals: ["Engineering hiring"],
      exclusions: [],
      exampleCustomers: [],
      notes: null,
    },
    mission: { name: "Midwest battery manufacturers", brief: "Find expanding manufacturers", targetCount: 25, maxSpendCents: 300 },
  });
  assert.equal(result.success, true);
  assert.equal(leadSourcingInput.safeParse({ profile: result.success ? result.data.profile : {}, mission: { name: "Too broad", brief: "Find all", targetCount: 101, maxSpendCents: 300 } }).success, false);
});

test("chat lead review keeps rejection feedback bounded", () => {
  assert.equal(leadReviewInput.safeParse({ accountId: "account-1", status: "approved" }).success, true);
  assert.equal(leadReviewInput.safeParse({ accountId: "account-1", status: "rejected", reason: "x".repeat(1_001) }).success, false);
});
