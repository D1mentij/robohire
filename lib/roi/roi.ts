import type { Fit, Job, RobotPlan } from "@/types/contracts";
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

/** Pure money/hours math. The AI never produces these numbers. */
export function computeRoi({ frequency_per_day, minutes_each, fit, hourlyCost, hoursPerWeek }: RoiInput): RoiOutput {
  const raw = ((frequency_per_day * minutes_each) / 60) * DAYS_OPEN_PER_WEEK;
  const hours = hoursPerWeek && hoursPerWeek > 0 ? Math.min(raw, hoursPerWeek) : raw;
  // GROSS: running cost is charged once per plan (buildPlan), never per job.
  const gross = fit === "no" ? 0 : hours * COVERAGE[fit] * WEEKS_PER_MONTH * hourlyCost;
  return {
    hours_per_week: Math.round(hours * 10) / 10,
    savings_eur_month: Math.max(0, Math.round(gross)),
    payback_months: null, // only meaningful for the whole plan
  };
}

export type JobAi = Pick<Job, "id" | "title" | "fit" | "score" | "why" | "limits">;

export function buildJob(
  ai: JobAi,
  task: { frequency_per_day: number; minutes_each: number },
  hourlyCost: number,
  hoursPerWeek?: number,
): Job {
  return { ...ai, ...computeRoi({ ...task, fit: ai.fit, hourlyCost, hoursPerWeek }) };
}

/**
 * One K1 robot, several jobs. Picks good/partial jobs by gross savings per robot-hour
 * (robot-hours = job hours × coverage) while they fit into the weekly capacity.
 * Running cost is subtracted once; payback = price / net.
 */
export function buildPlan(jobs: Job[], hourlyCost: number, hoursPerWeek?: number): RobotPlan {
  const capacity =
    hoursPerWeek && hoursPerWeek > 0 ? Math.min(ROBOT_CAPACITY_HOURS_PER_WEEK, hoursPerWeek) : ROBOT_CAPACITY_HOURS_PER_WEEK;
  const robotHours = (j: Job) => j.hours_per_week * COVERAGE[j.fit];
  const candidates = jobs
    .filter(
      (j) =>
        (!j.robot_type || j.robot_type === "k1") &&
        j.fit !== "no" &&
        j.savings_eur_month >= MIN_JOB_GROSS_EUR_MONTH &&
        robotHours(j) > 0,
    )
    .sort((a, b) => b.savings_eur_month / robotHours(b) - a.savings_eur_month / robotHours(a));
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
      `Robot price €${ROBOT_PRICE_EUR} (assumption — Booster publishes no price)`,
      `Coverage: good fit ${COVERAGE.good * 100}%, partial ${COVERAGE.partial * 100}% of task hours`,
      `Robot active ${ROBOT_ACTIVE_HOURS_PER_DAY} h/day × ${DAYS_OPEN_PER_WEEK} days = ${ROBOT_CAPACITY_HOURS_PER_WEEK} h/week (battery + charging)${capacity < ROBOT_CAPACITY_HOURS_PER_WEEK ? `, capped at ${capacity} h/week opening hours` : ""}`,
      `Staff cost €${hourlyCost}/h; running cost €${RUNNING_COST_EUR_MONTH}/month for the one robot`,
      `${WEEKS_PER_MONTH} weeks/month; jobs under €${MIN_JOB_GROSS_EUR_MONTH}/month gross are skipped`,
    ],
  };
}
