import type { Fit, Job, RobotPlan } from "@/types/contracts";
import { ROBOTS_BY_ID, shiftsFromHours } from "@/src/data/robots";
import { sumEconomics } from "./economics";
import {
  COVERAGE,
  DAYS_OPEN_PER_WEEK,
  MIN_JOB_GROSS_EUR_MONTH,
  ROBOT_ACTIVE_HOURS_PER_DAY,
  ROBOT_CAPACITY_HOURS_PER_WEEK,
  ROBOT_PRICE_EUR,
  RUNNING_COST_EUR_MONTH,
  WEEKS_PER_MONTH,
} from "./config";

export interface RoiInput {
  frequency_per_day: number;
  minutes_each: number;
  fit: Fit;
  hourlyCost: number;
  /** Business opening hours per week; caps a task's hours. Omitted = no cap. */
  hoursPerWeek?: number;
}

export interface RoiOutput {
  hours_per_week: number;
  savings_eur_month: number;
  payback_months: null;
}

/** Pure money/hours math for task-based hours & gross labor value. */
export function computeRoi({
  frequency_per_day,
  minutes_each,
  fit,
  hourlyCost,
  hoursPerWeek,
}: RoiInput): RoiOutput {
  const raw = ((frequency_per_day * minutes_each) / 60) * DAYS_OPEN_PER_WEEK;
  const hours =
    hoursPerWeek && hoursPerWeek > 0 ? Math.min(raw, hoursPerWeek) : raw;
  const gross =
    fit === "no" ? 0 : hours * COVERAGE[fit] * WEEKS_PER_MONTH * hourlyCost;
  return {
    hours_per_week: Math.round(hours * 10) / 10,
    savings_eur_month: Math.max(0, Math.round(gross)),
    payback_months: null,
  };
}

export type JobAi = Pick<
  Job,
  "id" | "title" | "fit" | "score" | "why" | "limits" | "robot_type"
>;

export function buildJob(
  ai: JobAi,
  task: { frequency_per_day: number; minutes_each: number },
  hourlyCost: number,
  hoursPerWeek?: number,
): Job {
  return {
    ...ai,
    ...computeRoi({ ...task, fit: ai.fit, hourlyCost, hoursPerWeek }),
  };
}

/**
 * Builds a recommended commercial deployment summary (`RobotPlan`):
 * - When `jobs` contains commercial RaaS catalog entries (with `client_raas_eur` / `human_monthly_cost_eur`),
 *   recommends the #1 highest-scoring Suitable/Partial robot; totals come from sumEconomics (rent vs buy).
 * - When `jobs` contains task-level entries (e.g. unit tests or raw task lists), bundles suitable tasks up to capacity.
 */
export function buildPlan(
  jobs: Job[],
  hourlyCost: number,
  hoursPerWeek?: number,
): RobotPlan {
  const commercialJobs = jobs.filter(
    (j) =>
      j.robot_type !== undefined &&
      j.client_raas_eur !== undefined &&
      j.human_monthly_cost_eur !== undefined,
  );

  if (commercialJobs.length > 0) {
    const viable = [...commercialJobs]
      .filter((j) => j.fit !== "no" && j.savings_eur_month > 0)
      .sort((a, b) => b.score - a.score || b.savings_eur_month - a.savings_eur_month);

    const top = viable[0];
    const shifts =
      top?.shifts_count ?? shiftsFromHours(hoursPerWeek ?? 60);
    const cap = hoursPerWeek && hoursPerWeek > 0 ? hoursPerWeek : shifts * 56;

    if (!top) {
      return {
        job_ids: [],
        hours_per_week: 0,
        capacity_hours_per_week: cap,
        gross_savings_eur_month: 0,
        running_cost_eur_month: 0,
        net_savings_eur_month: 0,
        robot_price_eur: ROBOT_PRICE_EUR,
        payback_months: null,
        assumptions: [
          "Savings = hours freed per day × Latvia 2026 role cost (gross wage + 23.59% employer VSAOI) × days open × 4.33",
          "Rent = distributor rent with no RoboHire markup; Buy = price + 10%/yr upkeep",
          `Evaluated at ${shifts} shift${shifts > 1 ? "s" : ""} (${cap} operating hrs/week); no robot pays off at these settings`,
        ],
      };
    }

    const spec = top.robot_type ? ROBOTS_BY_ID[top.robot_type] : undefined;
    const chosen = [top];
    const econs = chosen
      .map((j) => j.economics)
      .filter((e): e is NonNullable<Job["economics"]> => e !== undefined);
    const price = top.purchase_price_eur ?? spec?.purchasePriceEur ?? ROBOT_PRICE_EUR;
    const rent = top.client_raas_eur ?? spec?.rentEurMonth ?? RUNNING_COST_EUR_MONTH;
    const t = econs.length ? sumEconomics(econs) : null;
    const savings = t ? t.savings.expected : top.savings_eur_month;
    const net = t ? t.netRent.expected : savings - rent;
    const payback = t ? t.payback.expected : null;
    const r = (n: number) => Math.round(n);
    const months = (n: number | null) => (n === null ? "never" : `${n.toFixed(1)} mo`);

    return {
      job_ids: chosen.map((j) => j.id),
      hours_per_week: top.hours_per_week,
      capacity_hours_per_week: cap,
      gross_savings_eur_month: r(savings),
      running_cost_eur_month: r(t ? t.rent : rent),
      net_savings_eur_month: r(net),
      robot_price_eur: t ? t.purchase : price,
      payback_months: payback === null ? null : Math.round(payback * 10) / 10,
      assumptions: t
        ? [
            `Top match: ${spec?.name ?? top.title} — frees ${t.savings.low > 0 ? `€${r(t.savings.low)}–€${r(t.savings.high)}` : "€0"}/mo of staff time (expected €${r(t.savings.expected)}/mo)`,
            `RENT: €${r(t.rent)}/mo → net €${r(t.netRent.low)} / €${r(t.netRent.expected)} / €${r(t.netRent.high)} per month (low / expected / high)`,
            `BUY: €${t.purchase.toLocaleString("en-US")} ex VAT + €${r(t.upkeep)}/mo upkeep (10%/yr) → payback ${months(t.payback.high)} – ${months(t.payback.low)}`,
            `Savings = hours freed per day × Latvia 2026 role cost (incl. 23.59% VSAOI) × days open × 4.33 (${shifts} shift${shifts > 1 ? "s" : ""})`,
            "Prices verified 26.11.2026 — reference data, not a quote",
          ]
        : [
            `Top match: ${spec?.name ?? top.title} — rent €${rent}/mo or €${price.toLocaleString("en-US")} purchase`,
            "Prices verified 26.11.2026 — reference data, not a quote",
          ],
    };
  }

  // Task-bundle fallback for plain task lists & unit tests
  const capacity =
    hoursPerWeek && hoursPerWeek > 0
      ? Math.min(ROBOT_CAPACITY_HOURS_PER_WEEK, hoursPerWeek)
      : ROBOT_CAPACITY_HOURS_PER_WEEK;
  const robotHours = (j: Job) => j.hours_per_week * COVERAGE[j.fit];
  const candidates = jobs
    .filter(
      (j) =>
        j.fit !== "no" &&
        j.savings_eur_month >= MIN_JOB_GROSS_EUR_MONTH &&
        robotHours(j) > 0,
    )
    .sort(
      (a, b) =>
        b.savings_eur_month / robotHours(b) -
        a.savings_eur_month / robotHours(a),
    );
  const picked: Job[] = [];
  let hours = 0;
  for (const j of candidates) {
    if (hours + robotHours(j) <= capacity + 1e-9) {
      picked.push(j);
      hours += robotHours(j);
    }
  }
  const gross = picked.reduce((n, j) => n + j.savings_eur_month, 0);
  const running = picked.length ? RUNNING_COST_EUR_MONTH : 0;
  const net = gross - running;
  return {
    job_ids: picked.map((j) => j.id),
    hours_per_week: Math.round(hours * 10) / 10,
    capacity_hours_per_week: capacity,
    gross_savings_eur_month: gross,
    running_cost_eur_month: running,
    net_savings_eur_month: net,
    robot_price_eur: ROBOT_PRICE_EUR,
    payback_months: net > 0 ? Math.round(ROBOT_PRICE_EUR / net) : null,
    assumptions: [
      `Entry commercial robot price €${ROBOT_PRICE_EUR} (Keenon T8 benchmark)`,
      `Coverage: good fit ${Math.round(COVERAGE.good * 100)}%, partial ${Math.round(COVERAGE.partial * 100)}% of task hours`,
      `Robot active ${ROBOT_ACTIVE_HOURS_PER_DAY} h/day × ${DAYS_OPEN_PER_WEEK} days = ${ROBOT_CAPACITY_HOURS_PER_WEEK} h/week${capacity < ROBOT_CAPACITY_HOURS_PER_WEEK ? `, capped at ${capacity} h/week opening hours` : ""}`,
      `Staff employer cost €${hourlyCost}/h (incl. 23.59% Latvia VSAOI); monthly RaaS €${RUNNING_COST_EUR_MONTH}/month`,
      `${WEEKS_PER_MONTH} weeks/month; tasks under €${MIN_JOB_GROSS_EUR_MONTH}/month gross are skipped`,
    ],
  };
}
