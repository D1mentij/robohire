import { isJobsResult, type JobsResult, type Scene } from "@/types/contracts";
import { buildJob } from "@/lib/roi/roi";
import type { Task } from "./types";
import { buildJobsPrompt, JOBS_SCHEMA } from "./prompts";
import { MissingKeyError, provider } from "./provider";
import { k1Profile } from "./k1Profile";

export type JobsInput = { tasks: Task[]; scene: Scene; businessType: string; hoursPerWeek: number; hourlyCost: number };
export type JobsOutcome = { ok: true; result: JobsResult } | { ok: false; error: string };

type Rating = { id: string; fit: "good" | "partial" | "no"; score: number; why: string; limits: string };

function parseRatings(raw: unknown, tasks: Task[]): Map<string, Rating> {
  const list = (raw as { ratings?: unknown } | null)?.ratings;
  if (!Array.isArray(list)) throw new Error("AI returned no ratings array");
  const byId = new Map<string, Rating>();
  for (const r of list) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || !tasks.some((t) => t.id === o.id)) continue;
    if (o.fit !== "good" && o.fit !== "partial" && o.fit !== "no") continue;
    if (typeof o.why !== "string" || typeof o.limits !== "string" || !Number.isFinite(Number(o.score))) continue;
    byId.set(o.id, {
      id: o.id,
      fit: o.fit,
      score: Math.min(100, Math.max(0, Math.round(Number(o.score)))),
      why: o.why.trim(),
      limits: o.limits.trim(),
    });
  }
  const missing = tasks.filter((t) => !byId.has(t.id));
  if (missing.length) throw new Error(`AI rated ${byId.size}/${tasks.length} tasks`);
  return byId;
}

export async function rateJobs(input: JobsInput): Promise<JobsOutcome> {
  const tasks = input.tasks.map((t) => ({ id: t.id, title: t.title, zone_id: t.zone_id, description: t.description }));
  const prompt = buildJobsPrompt(
    input.businessType,
    tasks,
    input.scene.zones.map((z) => ({ id: z.id, label: z.label })),
    { specs: k1Profile.specs, can: k1Profile.can, cannot: k1Profile.cannot },
  );
  let lastError = "Unknown error";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await provider.generateJson(prompt, [], JOBS_SCHEMA);
      const ratings = parseRatings(raw, input.tasks);
      const jobs = input.tasks
        .map((t) => buildJob({ ...ratings.get(t.id)!, title: t.title }, t, input.hourlyCost))
        .sort((a, b) => b.score - a.score);
      const result: JobsResult = { business_type: input.businessType, jobs };
      if (!isJobsResult(result)) throw new Error("Result failed JobsResult validation");
      return { ok: true, result };
    } catch (e) {
      if (e instanceof MissingKeyError) return { ok: false, error: e.message };
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`[jobs] attempt ${attempt + 1} failed:`, lastError.slice(0, 300));
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return { ok: false, error: `AI job rating failed twice: ${lastError.slice(0, 200)}` };
}

