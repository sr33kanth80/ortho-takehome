import assert from "node:assert/strict";
import test from "node:test";
import { businessProfileInput, calculateOverallScore, intakeInput, missionInput, normalizeDomain } from "./validation";

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

test("unified intake keeps the conversation bounded", () => {
  assert.equal(intakeInput.safeParse({ messages: [{ role: "user", text: "Find battery manufacturers" }] }).success, true);
  assert.equal(intakeInput.safeParse({ messages: [] }).success, false);
  assert.equal(intakeInput.safeParse({ messages: Array.from({ length: 13 }, () => ({ role: "user", text: "next" })) }).success, false);
});
