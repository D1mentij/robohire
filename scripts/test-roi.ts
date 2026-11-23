import assert from "node:assert/strict";
import { computeRoi } from "../lib/roi/roi";

import { buildPlan } from "../lib/roi/roi";
import { RUNNING_COST_EUR_MONTH, ROBOT_CAPACITY_HOURS_PER_WEEK } from "../lib/roi/config";
import type { Job } from "../types/contracts";

// per-job: GROSS savings, no running cost, payback null. 6 h/week: 6*0.8*4.33*12 = 249.4
{
  const r = computeRoi({ frequency_per_day: 20, minutes_each: 3, fit: "good", hourlyCost: 12 });
  assert.equal(r.hours_per_week, 6);
  assert.equal(r.savings_eur_month, 249);
  assert.equal(r.payback_months, null);
}
// partial: 6*0.4*4.33*12 = 124.7 -> 125
assert.equal(computeRoi({ frequency_per_day: 20, minutes_each: 3, fit: "partial", hourlyCost: 12 }).savings_eur_month, 125);
// "no" -> zero
{
  const r = computeRoi({ frequency_per_day: 50, minutes_each: 10, fit: "no", hourlyCost: 20 });
  assert.equal(r.savings_eur_month, 0);
  assert.ok(r.hours_per_week > 0);
}
assert.equal(computeRoi({ frequency_per_day: 0, minutes_each: 5, fit: "good", hourlyCost: 12 }).savings_eur_month, 0);

const job = (id: string, fit: Job["fit"], hours: number, gross: number): Job => ({
  id, title: id, fit, score: 50, why: "", limits: "", hours_per_week: hours, savings_eur_month: gross, payback_months: null,
});

// buildPlan: running cost charged once, net = sum(gross) - running
{
  const p = buildPlan([job("a", "good", 8, 236), job("b", "good", 7.5, 221)], 8.5);
  assert.deepEqual(p.job_ids.sort(), ["a", "b"]);
  assert.equal(p.gross_savings_eur_month, 457);
  assert.equal(p.running_cost_eur_month, RUNNING_COST_EUR_MONTH);
  assert.equal(p.net_savings_eur_month, 457 - RUNNING_COST_EUR_MONTH);
  assert.equal(p.payback_months, Math.round(p.robot_price_eur / p.net_savings_eur_month));
  assert.ok(p.assumptions.length >= 4);
}
// capacity limit: robot-hours = hours*coverage; 3 jobs of 30 robot-hours (good, 37.5 h) don't all fit in 36
{
  const p = buildPlan([job("x", "good", 37.5, 900), job("y", "good", 37.5, 800), job("z", "good", 37.5, 700)], 8.5);
  assert.deepEqual(p.job_ids, ["x"]);
  assert.ok(p.hours_per_week <= ROBOT_CAPACITY_HOURS_PER_WEEK);
}
// sorted by gross per robot-hour: dense job beats big job when only one fits
{
  const p = buildPlan([job("big", "good", 37.5, 900), job("dense", "good", 20, 800)], 8.5);
  assert.deepEqual(p.job_ids, ["dense"]);
}
// skips "no" and jobs under €20 gross
{
  const p = buildPlan([job("n", "no", 10, 500), job("tiny", "good", 1, 19), job("ok", "partial", 5, 80)], 8.5);
  assert.deepEqual(p.job_ids, ["ok"]);
}
// null payback when net <= 0, and for empty plan
{
  const p = buildPlan([job("w", "good", 1, 30)], 8.5);
  assert.equal(p.net_savings_eur_month, 30 - RUNNING_COST_EUR_MONTH);
  assert.equal(p.payback_months, null);
  const e = buildPlan([job("n", "no", 10, 0)], 8.5);
  assert.deepEqual(e.job_ids, []);
  assert.equal(e.running_cost_eur_month, 0);
  assert.equal(e.payback_months, null);
}
// opening hours cap task hours and plan capacity
{
  const base = computeRoi({ frequency_per_day: 20, minutes_each: 30, fit: "good", hourlyCost: 8.5 });
  const capped = computeRoi({ frequency_per_day: 20, minutes_each: 30, fit: "good", hourlyCost: 8.5, hoursPerWeek: 10 });
  assert.equal(base.hours_per_week, 60);
  assert.equal(capped.hours_per_week, 10);
  const p = buildPlan([job("a", "good", 10, 300)], 8.5, 10);
  assert.equal(p.capacity_hours_per_week, 10);
  assert.ok(p.hours_per_week <= 10);
}
console.log("roi tests passed");
