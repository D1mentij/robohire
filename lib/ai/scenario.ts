import { filterValidSteps, type Job, type Scenario, type Scene } from "@/types/contracts";
import { buildScenarioPrompt, SCENARIO_SCHEMA } from "./prompts";
import { MissingKeyError, provider } from "./provider";

export type ScenarioOutcome = { ok: true; scenario: Scenario } | { ok: false; error: string };

const MIN_STEPS = 4;
const MAX_STEPS = 14;
const CALL_TIMEOUT_MS = 18_000;

export async function generateScenario(job: Job, scene: Scene, businessType: string | null): Promise<ScenarioOutcome> {
  const zoneIds = scene.zones.map((z) => z.id);
  const prompt = buildScenarioPrompt(
    { id: job.id, title: job.title, why: job.why, limits: job.limits },
    businessType,
    scene.zones.map((z) => ({ id: z.id, label: z.label })),
  );
  const started = Date.now();
  let lastError = "Unknown error";
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = 18_000 - (Date.now() - started);
    if (left < 3000) break; // keep the total under ~18 s
    try {
      const raw = await provider.generateJson(prompt, [], SCENARIO_SCHEMA, { timeoutMs: Math.min(CALL_TIMEOUT_MS, left) });
      const rawSteps = (raw as { steps?: unknown } | null)?.steps;
      if (!Array.isArray(rawSteps)) throw new Error("AI returned no steps array");
      // drop null fields the model may emit, then keep only valid steps
      const cleaned = rawSteps
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== null && v !== "")));
      const steps = filterValidSteps(cleaned, zoneIds).slice(0, MAX_STEPS);
      if (steps.length < MIN_STEPS) throw new Error(`Only ${steps.length} valid steps`);
      return { ok: true, scenario: { job_id: job.id, steps } };
    } catch (e) {
      if (e instanceof MissingKeyError) return { ok: false, error: e.message };
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`[scenario] attempt ${attempt + 1} failed:`, lastError.slice(0, 300));
    }
  }
  return { ok: false, error: `Scenario generation failed: ${lastError.slice(0, 200)}` };
}
