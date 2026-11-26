import assert from "node:assert/strict";
import { computeRoi, buildPlan } from "../lib/roi/roi";
import {
  RUNNING_COST_EUR_MONTH,
  ROBOT_CAPACITY_HOURS_PER_WEEK,
} from "../lib/roi/config";
import {
  LATVIA_2026_LABOR_BENCHMARKS,
  ROBOTS_BY_ID,
  ROBOTS_CATALOG_LIST,
  computeRobotRoiMetrics,
  shiftsFromHours,
} from "../src/data/robots";
import { evaluateCatalogForSpace } from "../lib/robots/catalog";
import { BUSINESS_PRESETS } from "../lib/ai/businessPresets";
import type { Job } from "../types/contracts";

// 1. Verify exact 15-robot commercial catalog
assert.equal(ROBOTS_CATALOG_LIST.length, 15, "Catalog must contain exactly 15 robots");
assert.equal(ROBOTS_BY_ID.keenon_t8.clientRaaSEur, 206);
assert.equal(ROBOTS_BY_ID.keenon_t8.baseRaaSEur, 179);
assert.equal(ROBOTS_BY_ID.keenon_t8.monthlyCommissionEur, 27);
assert.equal(ROBOTS_BY_ID.keenon_t8.saleCommissionEur, 447);
assert.equal(ROBOTS_BY_ID.gausium_scrubber_75p.clientRaaSEur, 2799);
assert.equal(ROBOTS_BY_ID.avidbots_neo_2.clientRaaSEur, 2344);
assert.equal(ROBOTS_BY_ID.mir250.purchasePriceEur, 44284);
assert.equal(ROBOTS_BY_ID.temi.clientRaaSEur, 132);

// 2. Verify Latvia 2026 employer labor benchmarks (gross + 23.59% VSAOI)
assert.equal(LATVIA_2026_LABOR_BENCHMARKS.waiter.employerMonthlyEur, 1552);
assert.equal(LATVIA_2026_LABOR_BENCHMARKS.reception.employerMonthlyEur, 1668);
assert.equal(LATVIA_2026_LABOR_BENCHMARKS.hotel_courier.employerMonthlyEur, 1668);
assert.equal(LATVIA_2026_LABOR_BENCHMARKS.cleaner.employerMonthlyEur, 1298);
assert.equal(LATVIA_2026_LABOR_BENCHMARKS.scrubber_op.employerMonthlyEur, 1483);
assert.equal(LATVIA_2026_LABOR_BENCHMARKS.warehouse.employerMonthlyEur, 1854);

// 3. Shift count auto calculation
assert.equal(shiftsFromHours(56), 1);
assert.equal(shiftsFromHours(60), 1);
assert.equal(shiftsFromHours(61), 2);
assert.equal(shiftsFromHours(119), 2);
assert.equal(shiftsFromHours(120), 3);
assert.equal(shiftsFromHours(168), 3);

// 4. Multi-shift honesty math for Avidbots Neo 2 & Gausium Scrubber 75P
{
  const neo1 = computeRobotRoiMetrics(ROBOTS_BY_ID.avidbots_neo_2, { shiftsOverride: 1 });
  assert.equal(neo1.humanMonthlyCostEur, 1483);
  assert.equal(neo1.savingsPct, -58.1);

  const gausium1 = computeRobotRoiMetrics(ROBOTS_BY_ID.gausium_scrubber_75p, { shiftsOverride: 1 });
  assert.equal(gausium1.humanMonthlyCostEur, 1483);
  assert.equal(gausium1.savingsPct, -88.7);

  const gausium3 = computeRobotRoiMetrics(ROBOTS_BY_ID.gausium_scrubber_75p, { shiftsOverride: 3 });
  assert.equal(gausium3.humanMonthlyCostEur, 4449);
  assert.equal(gausium3.monthlySavingsEur, 1650);
  assert.equal(gausium3.savingsPct, 37.1);
}

// 5. Spatial & Economic Honesty Enforcement on /jobs presets
{
  const mallPreset = BUSINESS_PRESETS.find((p) => p.id === "mall_airport")!;
  const mall1Shift = evaluateCatalogForSpace({
    scene: mallPreset.demoScene,
    businessType: mallPreset.label,
    hoursPerWeek: 56,
    shiftsOverride: 1,
  });
  assert.equal(mall1Shift.length, 15);
  const neoCard1 = mall1Shift.find((j) => j.robot_type === "avidbots_neo_2")!;
  const gausCard1 = mall1Shift.find((j) => j.robot_type === "gausium_scrubber_75p")!;
  assert.equal(neoCard1.fit, "no", "Avidbots Neo 2 must be Not Suitable on 1 shift in Latvia");
  assert.equal(gausCard1.fit, "no", "Gausium 75P must be Not Suitable on 1 shift in Latvia");
  assert.match(neoCard1.limits, /Not cost-effective on 1 shift in Latvia/);

  const mall3Shift = evaluateCatalogForSpace({
    scene: mallPreset.demoScene,
    businessType: mallPreset.label,
    hoursPerWeek: 168,
    shiftsOverride: 3,
  });
  assert.equal(mall3Shift.find((j) => j.robot_type === "avidbots_neo_2")!.fit, "good");
  assert.equal(mall3Shift.find((j) => j.robot_type === "gausium_scrubber_75p")!.fit, "good");

  // Narrow-aisle café: Keenon T8 suitable, BellaBot Pro & Keenon T10 Not Suitable
  const cafePreset = BUSINESS_PRESETS.find((p) => p.id === "narrow_cafe")!;
  const cafeJobs = evaluateCatalogForSpace({
    scene: cafePreset.demoScene,
    businessType: cafePreset.label,
    hoursPerWeek: 56,
  });
  assert.equal(cafeJobs.find((j) => j.robot_type === "keenon_t8")!.fit, "good");
  assert.equal(cafeJobs.find((j) => j.robot_type === "pudu_bellabot")!.fit, "no");
  assert.equal(cafeJobs.find((j) => j.robot_type === "keenon_t10")!.fit, "no");

  // Warehouse: MiR250 & Pudu T300 suitable
  const whPreset = BUSINESS_PRESETS.find((p) => p.id === "warehouse")!;
  const whJobs = evaluateCatalogForSpace({
    scene: whPreset.demoScene,
    businessType: whPreset.label,
    hoursPerWeek: 112,
  });
  assert.equal(whJobs.find((j) => j.robot_type === "pudu_t300")!.fit, "good");
  assert.equal(whJobs.find((j) => j.robot_type === "mir250")!.fit, "good");
  assert.match(whJobs.find((j) => j.robot_type === "mir250")!.limits, /1,450 mm.*850 mm.*20 mm/);
}

// 6. Task-level computeRoi & buildPlan unit checks
{
  const r = computeRoi({ frequency_per_day: 20, minutes_each: 3, fit: "good", hourlyCost: 12 });
  assert.equal(r.hours_per_week, 6);
  assert.ok(r.savings_eur_month > 0);
  assert.equal(r.payback_months, null);
}
{
  const r = computeRoi({ frequency_per_day: 50, minutes_each: 10, fit: "no", hourlyCost: 20 });
  assert.equal(r.savings_eur_month, 0);
}
const job = (id: string, fit: Job["fit"], hours: number, gross: number): Job => ({
  id, title: id, fit, score: 50, why: "", limits: "", hours_per_week: hours, savings_eur_month: gross, payback_months: null,
});
{
  const p = buildPlan([job("a", "good", 8, 500), job("b", "good", 7.5, 400)], 9.24);
  assert.deepEqual(p.job_ids.sort(), ["a", "b"]);
  assert.equal(p.gross_savings_eur_month, 900);
  assert.equal(p.running_cost_eur_month, RUNNING_COST_EUR_MONTH);
  assert.equal(p.net_savings_eur_month, 900 - RUNNING_COST_EUR_MONTH);
  assert.ok(p.hours_per_week <= ROBOT_CAPACITY_HOURS_PER_WEEK);
}

console.log("roi tests passed");
