/**
 * Honest robot economics: "hours freed per day", not "robot replaces a shift".
 *
 * ONE place for the money math used by /jobs, the plan and /report.
 * All functions are pure. Every value comes as { low, expected, high }, where
 * "low" is the pessimistic scenario (fewest hours freed) and "high" the
 * optimistic one — so payback.low is the LONGEST payback.
 */
import type {
  EconRange,
  Fit,
  JobEconomics,
  Scene,
} from "@/types/contracts";
import {
  LATVIA_2026_LABOR_BENCHMARKS,
  type CommercialRobotSpec,
} from "@/src/data/robots";

export type HoursArchetype =
  | "tray_waiter"
  | "greeter"
  | "cabinet_courier"
  | "compact_cleaner"
  | "large_scrubber"
  | "warehouse_amr";

/**
 * Which hours-freed model each catalog robot uses.
 * ASSUMPTION: grouping by how the robot actually takes work off staff.
 */
export const ROBOT_HOURS_ARCHETYPE: Record<CommercialRobotSpec["id"], HoursArchetype> = {
  keenon_t8: "tray_waiter",
  bear_servi: "tray_waiter",
  pudu_bellabot: "tray_waiter",
  keenon_t10: "tray_waiter",
  temi: "greeter",
  pudu_kettybot_pro: "greeter",
  pudu_flashbot: "cabinet_courier",
  keenon_w3: "cabinet_courier",
  lionsbot_r3_vac: "compact_cleaner",
  pudu_cc1: "compact_cleaner",
  pudu_cc1_pro: "large_scrubber",
  avidbots_neo_2: "large_scrubber",
  gausium_scrubber_75p: "large_scrubber",
  pudu_t300: "warehouse_amr",
  mir250: "warehouse_amr",
};

/**
 * ASSUMPTIONS — staff hours a robot frees per day (per shift for AMRs/scrubbers).
 * Fixed-range archetypes give explicit low/expected/high; area-based cleaners
 * derive hours from floor area and an effective cleaning rate.
 */
export const HOURS_FREED_ASSUMPTIONS = {
  /** Runs plates/drinks between pass and tables; staff still serve & clear. */
  tray_waiter: { low: 2, expected: 3, high: 4 },
  /** Greets, guides, shows promos; a human still handles real questions. */
  greeter: { low: 1, expected: 1.5, high: 2 },
  /** Room/office deliveries a porter or receptionist would walk. */
  cabinet_courier: { low: 1.5, expected: 2.5, high: 4 },
  /** Per shift: tugging/transport runs replaced by the AMR. */
  warehouse_amr: { low: 3, expected: 5, high: 7 },
  /** area_m2 / 250 m²/h × 0.8 effective coverage, clamp 0.5–4 h/day. */
  compact_cleaner: { m2PerHour: 250, efficiency: 0.8, min: 0.5, max: 4 },
  /** area_m2 / 1000 m²/h × 0.8 effective coverage, clamp 1–8 h per shift. */
  large_scrubber: { m2PerHour: 1000, efficiency: 0.8, min: 1, max: 8 },
  /** Range used where no explicit low/high exists. */
  rangeLowFactor: 0.67,
  rangeHighFactor: 1.33,
  /** Venue size factor (tray waiters & greeters only). */
  smallVenue: { maxTables: 10, maxAreaM2: 80, factor: 0.75 },
  largeVenue: { minTables: 30, minAreaM2: 300, factor: 1.25 },
  /** Waiters only: pass/kitchen → seating walk longer than this adds hours. */
  longWalk: { minMeters: 15, extraHours: 0.5 },
} as const;

/** Buy: yearly upkeep (service, parts, batteries) as a share of price. ASSUMPTION. */
export const UPKEEP_RATE_PER_YEAR = 0.1;
/** Average weeks per month. */
export const WEEKS_PER_MONTH = 4.33;
/** Default days open per week when the venue doesn't say. ASSUMPTION. */
export const DEFAULT_DAYS_OPEN_PER_WEEK = 6;

export interface HoursFreedOptions {
  /** 1/2/3 shifts — multiplies ONLY scrubbers and AMRs. */
  shifts?: 1 | 2 | 3;
  /** Opening hours per day; caps the result. */
  openingHoursPerDay?: number;
  /** Override the venue factor (tests / manual input). */
  venueFactor?: number;
  /** Explicit number of seating zones/tables (else counted from the scene). */
  tables?: number;
  /** Explicit floor area m² (else scene width × depth). */
  areaM2?: number;
}

const SEAT_RE = /table|seat|dining|booth|lounge|bistro/i;
const PASS_RE = /kitchen|counter|pass|bar/i;

export function sceneAreaM2(scene: Scene): number {
  return Math.max(1, scene.room.width * scene.room.depth);
}

/** Small venue ×0.75, large ×1.25, else ×1.0 (area wins when both apply → large first). */
export function venueSizeFactor(scene: Scene, opts: HoursFreedOptions = {}): number {
  if (opts.venueFactor !== undefined) return opts.venueFactor;
  const a = HOURS_FREED_ASSUMPTIONS;
  const area = opts.areaM2 ?? sceneAreaM2(scene);
  const tables =
    opts.tables ?? scene.zones.filter((z) => SEAT_RE.test(`${z.id} ${z.label}`)).length;
  if (tables > a.largeVenue.minTables || area > a.largeVenue.minAreaM2) return a.largeVenue.factor;
  if (tables < a.smallVenue.maxTables || area < a.smallVenue.maxAreaM2) return a.smallVenue.factor;
  return 1;
}

/** Average distance (m) from the kitchen/counter zone to seating zones; 0 if unknown. */
export function passToSeatingMeters(scene: Scene): number {
  const pass = scene.zones.find((z) => PASS_RE.test(`${z.id} ${z.label}`));
  const seats = scene.zones.filter(
    (z) => z !== pass && SEAT_RE.test(`${z.id} ${z.label}`),
  );
  if (!pass || seats.length === 0) return 0;
  const d = seats.map((s) => Math.hypot(s.x - pass.x, s.z - pass.z));
  return d.reduce((n, v) => n + v, 0) / d.length;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mapRange = (r: EconRange, f: (v: number) => number): EconRange => ({
  low: f(r.low),
  expected: f(r.expected),
  high: f(r.high),
});

/** Staff hours per day this robot realistically frees. Pure. */
export function estimateHoursFreed(
  robot: Pick<CommercialRobotSpec, "id">,
  scene: Scene,
  opts: HoursFreedOptions = {},
): EconRange {
  const a = HOURS_FREED_ASSUMPTIONS;
  const kind = ROBOT_HOURS_ARCHETYPE[robot.id];
  const shifts = opts.shifts ?? 1;
  const area = opts.areaM2 ?? sceneAreaM2(scene);
  let r: EconRange;

  switch (kind) {
    case "tray_waiter":
    case "greeter": {
      const f = venueSizeFactor(scene, opts);
      r = mapRange(a[kind], (v) => v * f);
      if (kind === "tray_waiter" && passToSeatingMeters(scene) > a.longWalk.minMeters) {
        r = mapRange(r, (v) => v + a.longWalk.extraHours);
      }
      break;
    }
    case "cabinet_courier":
      r = { ...a.cabinet_courier };
      break;
    case "warehouse_amr":
      r = mapRange(a.warehouse_amr, (v) => v * shifts);
      break;
    case "compact_cleaner":
    case "large_scrubber": {
      const c = a[kind];
      const exp = clamp((area / c.m2PerHour) * c.efficiency, c.min, c.max);
      r = { low: exp * a.rangeLowFactor, expected: exp, high: exp * a.rangeHighFactor };
      if (kind === "large_scrubber") r = mapRange(r, (v) => v * shifts);
      break;
    }
  }

  const cap = opts.openingHoursPerDay;
  return cap && cap > 0 ? mapRange(r, (v) => Math.min(v, cap)) : r;
}

export interface EconomicsOptions extends HoursFreedOptions {
  daysOpenPerWeek?: number;
  /** €/h employer cost for the replaced role (default: Latvia 2026 benchmark). */
  roleHourlyEur?: number;
}

/** All client-facing money for one robot. Rent uses rentEurMonth with NO markup. */
export function computeRobotEconomics(
  robot: CommercialRobotSpec,
  scene: Scene,
  opts: EconomicsOptions = {},
): JobEconomics {
  const days = opts.daysOpenPerWeek ?? DEFAULT_DAYS_OPEN_PER_WEEK;
  const daysPerMonth = days * WEEKS_PER_MONTH;
  const hourly = opts.roleHourlyEur ?? LATVIA_2026_LABOR_BENCHMARKS[robot.role].hourlyEmployerEur;
  const hours = estimateHoursFreed(robot, scene, opts);
  const savings = mapRange(hours, (h) => h * hourly * daysPerMonth);
  const rent = robot.rentEurMonth;
  const price = robot.purchasePriceEur;
  const upkeep = (price * UPKEEP_RATE_PER_YEAR) / 12;
  const netRent = mapRange(savings, (s) => s - rent);
  const netBuy = mapRange(savings, (s) => s - upkeep);
  const pb = (n: number) => (n > 0 ? price / n : null);

  return {
    hours_freed_per_day: hours,
    days_per_month: daysPerMonth,
    role_hourly_eur: hourly,
    savings_eur_month: savings,
    rent_eur_month: rent,
    rent_source: robot.rentSource,
    net_rent_eur_month: netRent,
    purchase_price_eur: price,
    price_source: robot.priceSource,
    verified_on: robot.verifiedOn,
    upkeep_eur_month: upkeep,
    net_buy_eur_month: netBuy,
    payback_months: { low: pb(netBuy.low), expected: pb(netBuy.expected), high: pb(netBuy.high) },
    roi_3y: mapRange(netBuy, (n) => (n * 36 - price) / price),
  };
}

/**
 * Economic fit: "no" if renting loses money AND buying doesn't pay back in 3 years;
 * "partial" if buy payback is 24–36 months; else "good".
 */
export function economicFit(e: JobEconomics): Fit {
  const pb = e.payback_months.expected;
  if (e.net_rent_eur_month.expected <= 0 && (pb === null || pb > 36)) return "no";
  if (pb !== null && pb >= 24 && pb <= 36) return "partial";
  return "good";
}

const FIT_RANK: Record<Fit, number> = { no: 0, partial: 1, good: 2 };
/** Combine spatial and economic fit: the worse one wins. */
export function combineFit(spatial: Fit, economic: Fit): Fit {
  return FIT_RANK[spatial] <= FIT_RANK[economic] ? spatial : economic;
}

/** Days open per week inferred from weekly hours. ASSUMPTION: ≥84 h/week → 7 days. */
export function daysOpenFromHours(hoursPerWeek: number): number {
  return hoursPerWeek >= 84 ? 7 : DEFAULT_DAYS_OPEN_PER_WEEK;
}

/**
 * Hours/day the robot can work: opening hours, but at least shifts × 8 h when
 * the user picked more shifts (24 h max).
 */
export function operatingHoursPerDay(hoursPerWeek: number, shifts: 1 | 2 | 3): number {
  const open = hoursPerWeek / daysOpenFromHours(hoursPerWeek);
  return Math.min(24, Math.max(open, shifts > 1 ? shifts * 8 : 0));
}

export interface PlanEconomics {
  savings: EconRange;
  rent: number;
  netRent: EconRange;
  purchase: number;
  upkeep: number;
  netBuy: EconRange;
  payback: { low: number | null; expected: number | null; high: number | null };
}

/** Plan totals for several chosen robots — rent and buy side by side. */
export function sumEconomics(list: JobEconomics[]): PlanEconomics {
  const add = (pick: (e: JobEconomics) => EconRange): EconRange =>
    list.reduce(
      (acc, e) => {
        const r = pick(e);
        return { low: acc.low + r.low, expected: acc.expected + r.expected, high: acc.high + r.high };
      },
      { low: 0, expected: 0, high: 0 },
    );
  const purchase = list.reduce((n, e) => n + e.purchase_price_eur, 0);
  const netBuy = add((e) => e.net_buy_eur_month);
  const pb = (n: number) => (n > 0 && purchase > 0 ? purchase / n : null);
  return {
    savings: add((e) => e.savings_eur_month),
    rent: list.reduce((n, e) => n + e.rent_eur_month, 0),
    netRent: add((e) => e.net_rent_eur_month),
    purchase,
    upkeep: list.reduce((n, e) => n + e.upkeep_eur_month, 0),
    netBuy,
    payback: { low: pb(netBuy.low), expected: pb(netBuy.expected), high: pb(netBuy.high) },
  };
}

/** Plain-English formulas for the "How we calculate" box. */
export const HOW_WE_CALCULATE: readonly string[] = [
  "Hours freed per day: realistic staff time the robot takes over (e.g. a tray robot ≈ 3 h/day, adjusted for venue size and walking distance; cleaners from floor area). Shown as low / expected / high.",
  "Monthly savings = hours freed per day × staff hourly cost (Latvia 2026 benchmark incl. 23.59% employer tax) × days open per week × 4.33.",
  "Rent: net per month = savings − distributor rent. No payback — you can stop renting.",
  "Buy: upkeep = 10% of price per year. Net per month = savings − upkeep. Payback = price ÷ net per month. 3-year ROI = (net × 36 − price) ÷ price.",
  "Booster K1 EDU: greeter & guide, 1 / 1.5 / 2 h/day (adjusted for venue size), capped by one 80-min battery unless batteries are swapped. Buy only (from €9,000 incl. VAT = €7,500 ex VAT; no rent offer). No hands: it cannot carry, clean or take payments.",
  "Fit: Not Suitable if the space doesn't fit, or if renting loses money and buying doesn't pay back within 36 months; Partial if buy payback is 24–36 months.",
];
