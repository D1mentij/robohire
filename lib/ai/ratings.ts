import type { Task, Rating } from "./types";

/**
 * Spatial/task fit ratings across RoboHire's 15-robot commercial catalog.
 * Validates AI ratings and fills missing items with fleet capability heuristics.
 */
const SCORE = { good: 84, partial: 52, no: 14 } as const;

const MANUAL_DEXTERITY =
  /unbox|hang\s+garment|bartend|mix\s+cocktail|pull\s+espresso|hand-?detail|polish\s+car|re-?rack|dumbbell|high-?bay|reach-?truck|cnc|torque|encode.*card|verify.*passport|insurance|polish\s+glass|stack\s+lecture|dishwash/i;
const FLEET_CAPABLE =
  /greet|welcom|guid|escort|wayfind|present|promo|display|deliver|shuttle|tray|bus(ing)?|parcel|courier|elevator|scrub|vacuum|mop|sweep|pallet|amr|corridor|telepresence|check-?in/i;

const LIMITS = {
  good: "Requires clear aisle widths (55–145 cm by robot class) and thresholds ≤15–20 mm; staff load/unload trays or pallets.",
  partial:
    "Automates transport, scrubbing, or visitor greeting, while fine manual handling stays with staff.",
  no: "Requires dexterous two-handed manipulation, heavy vertical lifting, or wet manual wiping beyond wheeled mobile robots.",
} as const;

const WHY = {
  good: "Directly matches RoboHire's commercial fleet (tray runners, greeter screens, elevator couriers, scrubbers, or 250–300 kg AMRs).",
  partial:
    "Mobile robots cover the repetitive travel, screen guidance, or floor pass while staff complete manual steps.",
  no: "Requires human dexterity, vertical reach racking, or manual surface detailing.",
} as const;

export const makeRating = (
  id: string,
  fit: Rating["fit"],
  why?: string,
): Rating => ({
  id,
  fit,
  score: SCORE[fit],
  why: why ?? WHY[fit],
  limits: LIMITS[fit],
});

export function heuristicRating(
  task: Pick<Task, "id" | "title" | "description">,
): Rating {
  const text = `${task.title} ${task.description}`;
  const manualOnly = MANUAL_DEXTERITY.test(text);
  const fleet = FLEET_CAPABLE.test(text);
  const fit: Rating["fit"] = manualOnly
    ? fleet
      ? "partial"
      : "no"
    : fleet
      ? "good"
      : "no";
  return {
    id: task.id,
    fit,
    score: SCORE[fit],
    why: WHY[fit],
    limits: LIMITS[fit],
  };
}

const isFit = (v: unknown): v is Rating["fit"] =>
  v === "good" || v === "partial" || v === "no";

export function parseRatings(
  raw: unknown,
  taskIds: Set<string>,
  idMap: Map<string, string> = new Map(),
): Rating[] {
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
      score: Number.isFinite(score)
        ? Math.min(100, Math.max(0, Math.round(score)))
        : SCORE[o.fit],
      why:
        typeof o.why === "string" && o.why.trim()
          ? o.why.trim()
          : WHY[o.fit],
      limits:
        typeof o.limits === "string" && o.limits.trim()
          ? o.limits.trim()
          : LIMITS[o.fit],
    });
  }
  return [...out.values()];
}

export function completeRatings(
  tasks: Task[],
  given: Rating[] | undefined,
): { ratings: Map<string, Rating>; heuristicCount: number } {
  const ratings = new Map<string, Rating>();
  for (const r of given ?? []) {
    if (tasks.some((t) => t.id === r.id)) ratings.set(r.id, r);
  }
  let heuristicCount = 0;
  for (const t of tasks) {
    if (!ratings.has(t.id)) {
      ratings.set(t.id, heuristicRating(t));
      heuristicCount++;
    }
  }
  return { ratings, heuristicCount };
}
