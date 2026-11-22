import assert from "node:assert/strict";
import { computeRoi } from "../lib/roi/roi";
import { ROBOT_PRICE_EUR } from "../lib/roi/config";

// good: 20x/day * 3 min = 1 h/day -> 6 h/week; 6*0.8*4.33*12 = 249.4 - 60 = 189.4 -> 189
{
  const r = computeRoi({ frequency_per_day: 20, minutes_each: 3, fit: "good", hourlyCost: 12 });
  assert.equal(r.hours_per_week, 6);
  assert.equal(r.savings_eur_month, 189);
  assert.equal(r.payback_months, Math.round(ROBOT_PRICE_EUR / 189));
}
// partial: 6*0.4*4.33*12 = 124.7 - 60 = 64.7 -> 65
{
  const r = computeRoi({ frequency_per_day: 20, minutes_each: 3, fit: "partial", hourlyCost: 12 });
  assert.equal(r.savings_eur_month, 65);
  assert.equal(r.payback_months, Math.round(ROBOT_PRICE_EUR / 65));
}
// "no" -> zero savings, no payback
{
  const r = computeRoi({ frequency_per_day: 50, minutes_each: 10, fit: "no", hourlyCost: 20 });
  assert.equal(r.savings_eur_month, 0);
  assert.equal(r.payback_months, null);
  assert.ok(r.hours_per_week > 0);
}
// tiny task: savings below running cost -> clamped to 0, payback null
{
  const r = computeRoi({ frequency_per_day: 1, minutes_each: 5, fit: "good", hourlyCost: 12 });
  assert.equal(r.savings_eur_month, 0);
  assert.equal(r.payback_months, null);
}
// zero frequency
assert.equal(computeRoi({ frequency_per_day: 0, minutes_each: 5, fit: "good", hourlyCost: 12 }).savings_eur_month, 0);
console.log("roi tests passed");
