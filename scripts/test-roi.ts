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
  shiftsFromHours,
} from "../src/data/robots";
import {
  computeRobotEconomics,
  economicFit,
  estimateHoursFreed,
  sumEconomics,
} from "../lib/roi/economics";
import { evaluateCatalogForSpace } from "../lib/robots/catalog";
import { BUSINESS_PRESETS } from "../lib/ai/businessPresets";
import type { Job } from "../types/contracts";

// 1. Catalog + verified prices (2026-11-26)
assert.equal(ROBOTS_CATALOG_LIST.length, 15, "Catalog must contain exactly 15 robots");
assert.equal(ROBOTS_BY_ID.keenon_t8.purchasePriceEur, 8900);
assert.equal(ROBOTS_BY_ID.keenon_t8.rentEurMonth, 370);
assert.equal(ROBOTS_BY_ID.keenon_t8.rentSource, "quote");
assert.match(ROBOTS_BY_ID.keenon_t8.priceSource, /aparaturafiscala\.ro/);
assert.equal(ROBOTS_BY_ID.keenon_w3.purchasePriceEur, 16000);
assert.equal(ROBOTS_BY_ID.keenon_t10.purchasePriceEur, 12000);
assert.match(ROBOTS_BY_ID.keenon_w3.priceSource, /babystore\.lv.*VAT status unconfirmed/);
assert.equal(ROBOTS_BY_ID.mir250.purchasePriceEur, 44284);
for (const r of ROBOTS_CATALOG_LIST) {
  assert.equal(r.verifiedOn, "2026-11-26");
  // client price = rent, NO +15% markup
  assert.equal(r.clientRaaSEur, r.rentEurMonth, `${r.id}: client rent must have no markup`);
  if (r.id !== "keenon_t8") {
    assert.equal(r.rentSource, "estimate");
    assert.equal(r.rentEurMonth, Math.round(r.purchasePriceEur * 0.028));
  }
  if (!["keenon_t8", "keenon_w3", "keenon_t10"].includes(r.id)) {
    assert.equal(r.priceSource, "US list price converted at 1 EUR = 1.096 USD");
  }
}

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

// 4. Hours freed + rent/buy money — café, Keenon T8, 6 days/week, waiter €9.24, venue factor 1.0
{
  const near = (actual: number | null, expected: number, tol: number, msg: string) => {
    assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `${msg}: got ${actual}, want ${expected}±${tol}`);
  };
  const cafe = BUSINESS_PRESETS.find((p) => p.id === "narrow_cafe")!.demoScene;
  const t8 = ROBOTS_BY_ID.keenon_t8;
  const h = estimateHoursFreed(t8, cafe, { venueFactor: 1 });
  assert.deepEqual(h, { low: 2, expected: 3, high: 4 });
  const e = computeRobotEconomics(t8, cafe, { venueFactor: 1, daysOpenPerWeek: 6, roleHourlyEur: 9.24 });
  near(e.savings_eur_month.low, 480, 2, "savings low");
  near(e.savings_eur_month.expected, 720, 2, "savings expected");
  near(e.savings_eur_month.high, 960, 2, "savings high");
  near(e.net_rent_eur_month.low, 110, 2, "net rent low");
  near(e.net_rent_eur_month.expected, 350, 2, "net rent expected");
  near(e.net_rent_eur_month.high, 590, 2, "net rent high");
  near(e.payback_months.low, 21.9, 0.2, "payback low scenario");
  near(e.payback_months.expected, 13.8, 0.2, "payback expected");
  near(e.payback_months.high, 10.0, 0.2, "payback high scenario");
  near(e.upkeep_eur_month, 74.17, 0.01, "upkeep 10%/yr");
  assert.equal(economicFit(e), "good");

  // Venue factor: tiny café (<80 m²) → ×0.75 for tray waiters
  const small = estimateHoursFreed(t8, cafe);
  near(small.expected, 2.25, 0.001, "small café venue factor");
  // Cap at opening hours/day
  assert.equal(estimateHoursFreed(t8, cafe, { venueFactor: 1, openingHoursPerDay: 2.5 }).high, 2.5);
  // Shifts multiply only scrubbers & AMRs
  assert.deepEqual(estimateHoursFreed(t8, cafe, { venueFactor: 1, shifts: 3 }), h);
  assert.equal(estimateHoursFreed(ROBOTS_BY_ID.pudu_t300, cafe, { shifts: 2 }).expected, 10);

  // Plan totals sum rent and buy
  const two = sumEconomics([e, e]);
  near(two.netRent.expected, 2 * e.net_rent_eur_month.expected, 0.01, "plan sum");
  assert.equal(two.purchase, 17800);
}

// 5. Spatial & Economic Honesty on /jobs presets
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
  assert.equal(neoCard1.fit, "no", "Avidbots Neo 2 must be Not Suitable on 1 shift");
  assert.equal(gausCard1.fit, "no", "Gausium 75P must be Not Suitable on 1 shift");
  assert.match(neoCard1.limits, /Doesn't pay off on 1 shift/);
  assert.equal(neoCard1.payback_months, null);

  // 3 shifts → re-evaluated: hours freed ×3, fit decided by the same rule
  const mall3Shift = evaluateCatalogForSpace({
    scene: mallPreset.demoScene,
    businessType: mallPreset.label,
    hoursPerWeek: 168,
    shiftsOverride: 3,
  });
  for (const id of ["avidbots_neo_2", "gausium_scrubber_75p"] as const) {
    const one = mall1Shift.find((j) => j.robot_type === id)!.economics!;
    const three = mall3Shift.find((j) => j.robot_type === id)!;
    const e3 = three.economics!;
    assert.ok(Math.abs(e3.hours_freed_per_day.expected - 3 * one.hours_freed_per_day.expected) < 1e-9, `${id}: 3 shifts = 3× hours`);
    assert.equal(three.shifts_count, 3);
    assert.equal(three.fit, economicFit(e3) === "no" ? "no" : three.fit);
  }

  // Narrow-aisle café: Keenon T8 suitable, BellaBot Pro & Keenon T10 Not Suitable
  const cafePreset = BUSINESS_PRESETS.find((p) => p.id === "narrow_cafe")!;
  const cafeJobs = evaluateCatalogForSpace({
    scene: cafePreset.demoScene,
    businessType: cafePreset.label,
    hoursPerWeek: 56,
  });
  const t8Job = cafeJobs.find((j) => j.robot_type === "keenon_t8")!;
  assert.equal(t8Job.fit, "good");
  assert.equal(t8Job.client_raas_eur, 370);
  assert.ok(t8Job.economics);
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
  assert.notEqual(whJobs.find((j) => j.robot_type === "mir250")!.fit, "no");
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
