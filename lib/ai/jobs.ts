import {
  isJobsResult,
  isRobotPlan,
  type JobsResult,
  type RobotPlan,
  type Scene,
} from "@/types/contracts";
import { buildPlan } from "@/lib/roi/roi";
import { evaluateCatalogForSpace } from "@/lib/robots/catalog";
import { buildK1Job } from "@/lib/roi/k1";
import { daysOpenFromHours, operatingHoursPerDay } from "@/lib/roi/economics";
import { findPreset } from "./businessPresets";
import type { Rating, Task } from "./types";
import { completeRatings } from "./ratings";

export type JobsInput = {
  tasks: Task[];
  scene: Scene;
  businessType: string;
  hoursPerWeek: number;
  hourlyCost: number;
  baselineHourlyCost?: number;
  shiftsOverride?: 1 | 2 | 3 | null;
  ratings?: Rating[];
};

export type JobsOutcome =
  | {
      ok: true;
      jobs: JobsResult;
      plan: RobotPlan;
      heuristicRatings: number;
    }
  | { ok: false; error: string };

/**
 * Evaluates all 15 real commercial robots against the analyzed space, Latvia 2026
 * full employer labor costs (gross + 23.59% VSAOI), multi-shift schedule, and
 * +15% RoboHire RaaS brokerage margin.
 */
export function buildJobs(input: JobsInput): JobsOutcome {
  const { heuristicCount } = completeRatings(input.tasks, input.ratings);
  const preset = findPreset(input.businessType);
  const baselineHourly =
    input.baselineHourlyCost ?? preset?.defaultHourlyCost ?? null;

  const jobs = evaluateCatalogForSpace({
    scene: input.scene,
    businessType: input.businessType,
    hoursPerWeek: input.hoursPerWeek,
    hourlyCost: input.hourlyCost,
    shiftsOverride: input.shiftsOverride ?? null,
    baselineHourlyCost: baselineHourly,
  });

  // Booster K1 EDU is the PRIMARY robot: always first (FINAL_SPEC decision 1).
  const hpw = input.hoursPerWeek > 0 ? input.hoursPerWeek : 60;
  const k1 = buildK1Job(input.scene, {
    daysOpenPerWeek: daysOpenFromHours(hpw),
    openingHoursPerDay: operatingHoursPerDay(hpw, 1),
  });
  const result: JobsResult = { business_type: input.businessType, jobs: [k1, ...jobs] };
  if (!isJobsResult(result)) {
    return { ok: false, error: "Result failed JobsResult validation" };
  }
  const plan = buildPlan(result.jobs, input.hourlyCost, input.hoursPerWeek);
  if (!isRobotPlan(plan)) {
    return { ok: false, error: "Plan failed RobotPlan validation" };
  }
  return { ok: true, jobs: result, plan, heuristicRatings: heuristicCount };
}
