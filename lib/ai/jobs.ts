import { isJobsResult, isRobotPlan, type JobsResult, type RobotPlan, type Scene } from "@/types/contracts";
import { buildJob, buildPlan } from "@/lib/roi/roi";
import type { Rating, Task } from "./types";
import { completeRatings } from "./ratings";

export type JobsInput = { tasks: Task[]; scene: Scene; businessType: string; hoursPerWeek: number; hourlyCost: number; ratings?: Rating[] };
export type JobsOutcome = { ok: true; jobs: JobsResult; plan: RobotPlan; heuristicRatings: number } | { ok: false; error: string };

/** Jobs + ROI + shift plan, all in code (no AI call). Ratings come from the analysis call; gaps use heuristics. */
export function buildJobs(input: JobsInput): JobsOutcome {
  const { ratings, heuristicCount } = completeRatings(input.tasks, input.ratings);
  const jobs = input.tasks
    .map((t) => buildJob({ ...ratings.get(t.id)!, title: t.title }, t, input.hourlyCost, input.hoursPerWeek))
    .sort((a, b) => b.score - a.score);
  const result: JobsResult = { business_type: input.businessType, jobs };
  if (!isJobsResult(result)) return { ok: false, error: "Result failed JobsResult validation" };
  const plan = buildPlan(result.jobs, input.hourlyCost, input.hoursPerWeek);
  if (!isRobotPlan(plan)) return { ok: false, error: "Plan failed RobotPlan validation" };
  return { ok: true, jobs: result, plan, heuristicRatings: heuristicCount };
}
