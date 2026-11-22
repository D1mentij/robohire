import type { Fit, Job } from "@/types/contracts";
import {
  COVERAGE,
  DAYS_OPEN_PER_WEEK,
  ROBOT_PRICE_EUR,
  RUNNING_COST_EUR_MONTH,
  WEEKS_PER_MONTH,
} from "./config";

export interface RoiInput {
  frequency_per_day: number;
  minutes_each: number;
  fit: Fit;
  hourlyCost: number;
}

export interface RoiOutput {
  hours_per_week: number;
  savings_eur_month: number;
  payback_months: number | null;
}

/** Pure money/hours math. The AI never produces these numbers. */
export function computeRoi({ frequency_per_day, minutes_each, fit, hourlyCost }: RoiInput): RoiOutput {
  const hours = ((frequency_per_day * minutes_each) / 60) * DAYS_OPEN_PER_WEEK;
  const raw = fit === "no" ? 0 : hours * COVERAGE[fit] * WEEKS_PER_MONTH * hourlyCost - RUNNING_COST_EUR_MONTH;
  const savings = Math.max(0, Math.round(raw));
  return {
    hours_per_week: Math.round(hours * 10) / 10,
    savings_eur_month: savings,
    payback_months: savings > 0 ? Math.round(ROBOT_PRICE_EUR / savings) : null,
  };
}

export type JobAi = Pick<Job, "id" | "title" | "fit" | "score" | "why" | "limits">;

export function buildJob(ai: JobAi, task: { frequency_per_day: number; minutes_each: number }, hourlyCost: number): Job {
  return { ...ai, ...computeRoi({ ...task, fit: ai.fit, hourlyCost }) };
}
