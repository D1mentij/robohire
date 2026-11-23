import type { Task, Rating } from "./types";

/**
 * K1 fit ratings. The AI rates tasks in the same call as the analysis; this module validates them and
 * fills every gap with a keyword heuristic, so a small local model that skips or garbles ratings never breaks the run.
 */
const SCORE = { good: 80, partial: 45, no: 10 } as const;
const PHYSICAL = /clean|wip|wash|mop|sweep|vacuum|carry|deliver|serv(e|ing)\b|restock|stock|cook|prepar|pour|load|lift|pack|dish|trash|garbage|laundry|fold|tidy|organi[sz]|refill|bring|collect|bus(ing)?\b|repair|fix|plug|charg/i;
const TALKING = /greet|welcom|guid|direct|wayfind|explain|present|announc|inform|answer|queue|waiting|promot|recommend|menu|offer|tell|talk|reception|check.?in|show|remind|notif/i;

const LIMITS = {
  good: "Cannot hand over or touch anything: it can only walk, gesture and talk.",
  partial: "Only the talking, guiding and gesturing part; no carrying or manipulation (no hands).",
  no: "K1 has no hands and cannot carry, wipe, clean or manipulate objects.",
} as const;

const WHY = {
  good: "Mostly talking, greeting or guiding, which K1 can do by speech, head turns and arm gestures.",
  partial: "K1 can do the talking and guiding part but not the physical part.",
  no: "Mainly physical work that needs hands or carrying.",
} as const;

/** Rating with a fixed fit (used for rule-based task templates). */
export const makeRating = (id: string, fit: Rating["fit"], why?: string): Rating => ({ id, fit, score: SCORE[fit], why: why ?? WHY[fit], limits: LIMITS[fit] });

export function heuristicRating(task: Pick<Task, "id" | "title" | "description">): Rating {
  const text = `${task.title} ${task.description}`;
  const talk = TALKING.test(text);
  const phys = PHYSICAL.test(text);
  const fit = talk && !phys ? "good" : talk && phys ? "partial" : "no";
  const why =
    fit === "good" ? "Mostly talking, greeting or guiding, which K1 can do by speech, head turns and arm gestures."
    : fit === "partial" ? "K1 can do the talking and guiding part but not the physical part."
    : "Mainly physical work that needs hands or carrying.";
  return { id: task.id, fit, score: SCORE[fit], why, limits: LIMITS[fit] };
}

const isFit = (v: unknown): v is Rating["fit"] => v === "good" || v === "partial" || v === "no";

/**
 * Lenient parse: keeps well-formed ratings for known task ids (score/limits optional), ignores the rest.
 * `idMap` maps the id the model wrote to the final task id (ids get slugged/deduped in cleanup).
 */
export function parseRatings(raw: unknown, taskIds: Set<string>, idMap: Map<string, string> = new Map()): Rating[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, Rating>();
  for (const r of raw) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || !isFit(o.fit)) continue;
    const id = idMap.get(o.id) ?? o.id;
    if (!taskIds.has(id) || out.has(id)) continue;
    const score = Number(o.score);
    out.set(id, {
      id,
      fit: o.fit,
      score: Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : SCORE[o.fit],
      why: typeof o.why === "string" && o.why.trim() ? o.why.trim() : heuristicRating({ id, title: "", description: "" }).why,
      limits: typeof o.limits === "string" && o.limits.trim() ? o.limits.trim() : LIMITS[o.fit],
    });
  }
  return [...out.values()];
}

/** One rating per task: the given ones first, heuristic for every task without one. */
export function completeRatings(tasks: Task[], given: Rating[] | undefined): { ratings: Map<string, Rating>; heuristicCount: number } {
  const ratings = new Map<string, Rating>();
  for (const r of given ?? []) if (tasks.some((t) => t.id === r.id)) ratings.set(r.id, r);
  let heuristicCount = 0;
  for (const t of tasks) {
    if (!ratings.has(t.id)) {
      ratings.set(t.id, heuristicRating(t));
      heuristicCount++;
    }
  }
  return { ratings, heuristicCount };
}
