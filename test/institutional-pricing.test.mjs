import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCENARIO,
  buildProposalText,
  calculateInstitutionalPricing,
  normalizeScenario,
} from "../js/institutional-pricing.js";

test("institutional pricing preserves the requested net margin", () => {
  const result = calculateInstitutionalPricing({
    ...DEFAULT_SCENARIO,
    utilizationMode: "manual",
    expectedAdherencePct: 12,
    students: 1000,
    schools: 2,
    commercialDiscountPct: 0,
    minimumMonthlyFee: 0,
  });

  assert.equal(result.activeStudents, 120);
  assert.equal(result.monthlySessions, 144);
  assert.ok(Math.abs(result.effectiveMarginPct - 25) <= 0.01);
  assert.equal(result.marginStatus, "on-target");
  assert.equal(result.contractTotal, result.annualRecurring + DEFAULT_SCENARIO.implementationFee);
});

test("Brazilian basic education benchmark estimates monthly use from observed annual access", () => {
  const result = calculateInstitutionalPricing({
    ...DEFAULT_SCENARIO,
    students: 450,
  });

  assert.equal(result.evidence.annualBasePct, 3.15);
  assert.equal(result.evidence.monthlyRatePct, 0.79);
  assert.equal(result.activeStudents, 4);
  assert.match(result.evidence.sourceLabel, /Brasil/);
});

test("higher education benchmark uses observed counseling center utilization", () => {
  const result = calculateInstitutionalPricing({
    ...DEFAULT_SCENARIO,
    students: 450,
    educationSegment: "higher-education",
  });

  assert.equal(result.evidence.annualBasePct, 10.2);
  assert.equal(result.evidence.monthlyRatePct, 2.55);
  assert.equal(result.activeStudents, 12);
});

test("operational variables adjust evidence-based use and respect capacity", () => {
  const result = calculateInstitutionalPricing({
    ...DEFAULT_SCENARIO,
    students: 1000,
    averageActiveMonths: 4,
    maturityFactor: 1.2,
    engagementFactor: 1.2,
    accessFactor: 1.2,
    capacityMonthlyUsers: 15,
  });

  assert.equal(result.evidence.monthlyRatePct, 1.81);
  assert.equal(result.evidence.uncappedActiveStudents, 19);
  assert.equal(result.activeStudents, 15);
  assert.equal(result.evidence.capacityApplied, true);
});

test("commercial discounts expose margin erosion", () => {
  const result = calculateInstitutionalPricing({
    ...DEFAULT_SCENARIO,
    utilizationMode: "manual",
    expectedAdherencePct: 12,
    commercialDiscountPct: 10,
  });

  assert.equal(result.marginStatus, "below-target");
  assert.ok(result.effectiveMarginPct < DEFAULT_SCENARIO.targetProfitMarginPct);
  assert.ok(result.netProfit > 0);
});

test("minimum monthly fee becomes the commercial floor", () => {
  const result = calculateInstitutionalPricing({
    ...DEFAULT_SCENARIO,
    utilizationMode: "manual",
    expectedAdherencePct: 12,
    students: 10,
    minimumMonthlyFee: 20000,
  });

  assert.equal(result.monthlyRevenue, 20000);
  assert.equal(result.minimumApplied, true);
});

test("invalid percentage composition is rejected", () => {
  assert.throws(
    () => calculateInstitutionalPricing({ taxPct: 50, contingencyPct: 20, targetProfitMarginPct: 30 }),
    /inferior a 95%/
  );
});

test("normalization prevents negative operational inputs", () => {
  const normalized = normalizeScenario({ students: -5, schools: 0, professionalCostPerSession: -10 });
  assert.equal(normalized.students, 1);
  assert.equal(normalized.schools, 1);
  assert.equal(normalized.professionalCostPerSession, 0);
});

test("proposal text includes scale and contract values", () => {
  const result = calculateInstitutionalPricing({ ...DEFAULT_SCENARIO, institutionName: "Colégio Exemplo" });
  const text = buildProposalText(result, (value) => `R$ ${value.toFixed(2)}`);
  assert.match(text, /Colégio Exemplo/);
  assert.match(text, /1\.000 estudantes/);
  assert.match(text, /Valor global/);
});
