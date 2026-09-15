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

test("450 eligible students automatically estimate 54 monthly users", () => {
  const result = calculateInstitutionalPricing({
    ...DEFAULT_SCENARIO,
    students: 450,
    expectedAdherencePct: 12,
  });

  assert.equal(result.activeStudents, 54);
});

test("commercial discounts expose margin erosion", () => {
  const result = calculateInstitutionalPricing({
    ...DEFAULT_SCENARIO,
    commercialDiscountPct: 10,
  });

  assert.equal(result.marginStatus, "below-target");
  assert.ok(result.effectiveMarginPct < DEFAULT_SCENARIO.targetProfitMarginPct);
  assert.ok(result.netProfit > 0);
});

test("minimum monthly fee becomes the commercial floor", () => {
  const result = calculateInstitutionalPricing({
    ...DEFAULT_SCENARIO,
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
