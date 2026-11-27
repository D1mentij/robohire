/**
 * Booster K1 economics + K1 job (FINAL_SPEC.md decision 4). Pure.
 * Same formulas as lib/roi/economics.ts, but: greeter archetype, battery cap,
 * NO rent offer (rent_available: false, net rent = 0, never "pays" via rent).
 */
import type { EconRange, Fit, Job, JobEconomics, Scene } from "@/types/contracts";
import { LATVIA_2026_LABOR_BENCHMARKS } from "@/src/data/robots";
import { K1_JOB_ID, K1_SPEC } from "@/src/data/k1";
import {
  DEFAULT_DAYS_OPEN_PER_WEEK,
  HOURS_FREED_ASSUMPTIONS,
  UPKEEP_RATE_PER_YEAR,
  venueSizeFactor,
  WEEKS_PER_MONTH,
  type HoursFreedOptions,
} from "./economics";

/** JobEconomics with rent_available pinned to false (no rent offer). */
export type K1Economics = JobEconomics & { rent_available: false };

export interface K1Options extends HoursFreedOptions {
  daysOpenPerWeek?: number;
  roleHourlyEur?: number;
  /** Spare batteries swapped during the day → no 80-min cap. ASSUMPTION default: false. */
  batterySwaps?: boolean;
}

const map = (r: EconRange, f: (v: number) => number): EconRange => ({
  low: f(r.low),
  expected: f(r.expected),
  high: f(r.high),
});

/** Greeter 1 / 1.5 / 2 h/day × venue size, capped by one 80-min battery unless swaps. */
export function k1HoursFreed(scene: Scene, opts: K1Options = {}): EconRange {
  const f = venueSizeFactor(scene, opts);
  let r = map(HOURS_FREED_ASSUMPTIONS.greeter, (v) => v * f);
  if (!opts.batterySwaps) r = map(r, (v) => Math.min(v, K1_SPEC.batteryMinutes / 60));
  const cap = opts.openingHoursPerDay;
  return cap && cap > 0 ? map(r, (v) => Math.min(v, cap)) : r;
}

export function computeK1Economics(scene: Scene, opts: K1Options = {}): K1Economics {
  const days = opts.daysOpenPerWeek ?? DEFAULT_DAYS_OPEN_PER_WEEK;
  const daysPerMonth = days * WEEKS_PER_MONTH;
  const hourly = opts.roleHourlyEur ?? LATVIA_2026_LABOR_BENCHMARKS[K1_SPEC.role].hourlyEmployerEur;
  const hours = k1HoursFreed(scene, opts);
  const savings = map(hours, (h) => h * hourly * daysPerMonth);
  const price = K1_SPEC.purchasePriceEur;
  const upkeep = (price * UPKEEP_RATE_PER_YEAR) / 12;
  const netBuy = map(savings, (s) => s - upkeep);
  const pb = (n: number) => (n > 0 ? price / n : null);
  return {
    hours_freed_per_day: hours,
    days_per_month: daysPerMonth,
    role_hourly_eur: hourly,
    savings_eur_month: savings,
    rent_available: false,
    rent_eur_month: 0,
    rent_source: "estimate",
    net_rent_eur_month: { low: 0, expected: 0, high: 0 },
    purchase_price_eur: price,
    price_source: K1_SPEC.priceSource,
    verified_on: K1_SPEC.verifiedOn,
    upkeep_eur_month: upkeep,
    net_buy_eur_month: netBuy,
    payback_months: { low: pb(netBuy.low), expected: pb(netBuy.expected), high: pb(netBuy.high) },
    roi_3y: map(netBuy, (n) => (n * 36 - price) / price),
  };
}

/** Buy-only fit: good ≤ 24 mo, partial ≤ 36 mo, else no. */
export function k1Fit(e: JobEconomics): Fit {
  const pb = e.payback_months.expected;
  if (pb === null || pb > 36) return "no";
  return pb > 24 ? "partial" : "good";
}

/** The K1 job card data (always present, first in the list — FINAL_SPEC decision 1). */
export function buildK1Job(scene: Scene, opts: K1Options = {}): Job & { robot_id: string; economics: K1Economics } {
  const e = computeK1Economics(scene, opts);
  const days = opts.daysOpenPerWeek ?? DEFAULT_DAYS_OPEN_PER_WEEK;
  const pb = e.payback_months.expected;
  const fit = k1Fit(e);
  const h = (n: number) => (Math.round(n * 10) / 10).toString();
  const eur = (n: number) => `€${Math.round(n).toLocaleString("en-US")}`;
  const battery = opts.batterySwaps ? "" : " (capped by one 80-min battery; spare batteries raise this)";
  return {
    id: K1_JOB_ID,
    title: `${K1_SPEC.name} — ${K1_SPEC.jobTitle}`,
    fit,
    score: fit === "good" ? 90 : fit === "partial" ? 75 : 40,
    why: `Frees ${h(e.hours_freed_per_day.low)}–${h(e.hours_freed_per_day.high)} h/day of reception time${battery}: greets at the entrance, guides visitors to zones, points at information. Worth ${eur(e.savings_eur_month.expected)}/mo of staff time.`,
    limits: `${K1_SPEC.limits} No rent offer — buy only (${eur(K1_SPEC.purchasePriceInclVatEur)} incl. VAT).`,
    hours_per_week: Math.round(e.hours_freed_per_day.expected * days * 10) / 10,
    savings_eur_month: Math.round(e.savings_eur_month.expected),
    payback_months: pb === null ? null : Math.round(pb * 10) / 10,
    robot_id: K1_SPEC.id,
    robot_name: K1_SPEC.name,
    category: K1_SPEC.category,
    role: K1_SPEC.role,
    purchase_price_eur: K1_SPEC.purchasePriceEur,
    human_monthly_cost_eur: Math.round(e.savings_eur_month.expected),
    economics: e,
  };
}
