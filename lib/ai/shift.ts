import { filterValidSteps, type Job, type RobotPlan, type Scenario, type ScenarioStep, type Scene } from "@/types/contracts";
import { finalizeSteps } from "./labels";
import { buildShiftPrompt, SHIFT_SCHEMA } from "./prompts";
import { ProviderUnavailableError, provider, shiftBudgetMs } from "./provider";
import {
  buildShiftFallback,
  jobLabels,
  planJobs,
  SHIFT_END_LABEL,
  SHIFT_JOB_ID,
  SHIFT_MAX_STEPS,
  SHIFT_MIN_STEPS,
  SHIFT_START_LABEL,
  zoneForJob,
} from "./shiftFallback";

export type ShiftOutcome = { scenario: Scenario; source: "ai" | "fallback"; warning?: string };


/** AI "job" tag → display label. Unknown tags keep the previous step's label. */
function toLabel(tag: unknown, titles: Map<string, string>, prev: string): string {
  if (typeof tag !== "string") return prev;
  if (tag === "intro") return SHIFT_START_LABEL;
  if (tag === "outro") return SHIFT_END_LABEL;
  return titles.get(tag) ?? prev;
}

/** Cleans raw AI steps: drop nulls/empties, map job tag → label, keep contract fields only, filterValidSteps. */
export function cleanShiftSteps(rawSteps: unknown[], jobs: Job[], zoneIds: string[]): ScenarioStep[] {
  const titles = jobLabels(jobs); // short, unique checklist labels per plan job
  let prev = SHIFT_START_LABEL;
  const shaped = rawSteps
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s) => {
      const label = toLabel(s.job, titles, prev);
      prev = label;
      const out: Record<string, unknown> = { action: s.action, label };
      for (const k of ["target", "text", "seconds"] as const) if (s[k] !== null && s[k] !== "" && s[k] !== undefined) out[k] = s[k];
      return out;
    });
  return finalizeSteps(filterValidSteps(shaped, zoneIds).slice(0, SHIFT_MAX_STEPS), SHIFT_START_LABEL);
}

/** One continuous whole-plan demo. Never fails: AI (≤ 2 attempts, 25 s total) → code fallback. */
export async function generateShift(plan: RobotPlan, jobs: Job[], scene: Scene, businessType: string | null): Promise<ShiftOutcome> {
  const pj = planJobs(plan, jobs);
  const zoneIds = scene.zones.map((z) => z.id);
  const fallback = (warning: string): ShiftOutcome => ({
    scenario: buildShiftFallback(plan, jobs, scene, businessType),
    source: "fallback",
    warning,
  });
  if (pj.length === 0) return fallback("Plan has no known jobs");

  const used = new Set<string>();
  const prompt = buildShiftPrompt(
    pj.map((j) => {
      const { zone } = zoneForJob(j, scene.zones, used);
      if (zone) used.add(zone.id);
      return { id: j.id, title: j.title, why: j.why, limits: j.limits, suggested_zone: zone?.id ?? null };
    }),
    businessType,
    scene.zones.map((z) => ({ id: z.id, label: z.label })),
  );

  const started = Date.now();
  let lastError = "Unknown error";
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = shiftBudgetMs() - (Date.now() - started);
    if (left < 3000) break;
    try {
      const raw = await provider.generateJson(prompt, [], SHIFT_SCHEMA, { timeoutMs: left });
      const rawSteps = (raw as { steps?: unknown } | null)?.steps;
      if (!Array.isArray(rawSteps)) throw new Error("AI returned no steps array");
      const steps = cleanShiftSteps(rawSteps, pj, zoneIds);
      if (steps.length < SHIFT_MIN_STEPS) throw new Error(`Only ${steps.length} valid steps`);
      return { scenario: { job_id: SHIFT_JOB_ID, steps }, source: "ai" };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (e instanceof ProviderUnavailableError) break;
      console.error(`[shift] attempt ${attempt + 1} failed:`, lastError.slice(0, 300));
    }
  }
  return fallback(`AI shift failed, using built-in routine: ${lastError.slice(0, 160)}`);
}
