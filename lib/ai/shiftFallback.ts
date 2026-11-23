import { finalizeSteps, shortLabel, shortenSay } from "./labels";
import { filterValidSteps, type Job, type RobotPlan, type Scenario, type ScenarioStep, type Scene, type Zone } from "@/types/contracts";

/**
 * Whole-shift scenario WITHOUT AI: intro + mock-style steps per plan job + closing.
 * Pure (no storage, no fetch) → usable on the server and in the browser.
 */
export const SHIFT_JOB_ID = "shift";
export const SHIFT_MIN_STEPS = 6;
export const SHIFT_MAX_STEPS = 20;
export const SHIFT_START_LABEL = "Shift start";
export const SHIFT_END_LABEL = "Shift end";

/** Plan jobs in plan order; ids missing from `jobs` are skipped. */
export function planJobs(plan: RobotPlan, jobs: Job[]): Job[] {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  return plan.job_ids.map((id) => byId.get(id)).filter((j): j is Job => j !== undefined);
}

const KIND_WORDS: { kind: Kind; job: RegExp; zone: RegExp }[] = [
  { kind: "greet", job: /greet|welcom|host|door|entr|reception/i, zone: /entr|door|recept|lobby|front/i },
  { kind: "menu", job: /menu|offer|special|promot|product|explain|recommend/i, zone: /menu|board|display|screen|shelf|shelv/i },
  { kind: "guide", job: /table|seat|guide|wayfind|direct|escort/i, zone: /table|seat|dining|lounge/i },
  { kind: "queue", job: /queue|wait|line|order|counter|checkout|pay/i, zone: /wait|queue|counter|checkout|till|desk/i },
];
type Kind = "greet" | "menu" | "guide" | "queue" | "generic";

const KIND_LABEL: Record<Kind, string | null> = { greet: "Greet guests", menu: "Present menu", guide: "Guide to tables", queue: "Queue info", generic: null };

/** Short checklist label of a job (≤ 4 words). */
export function jobLabel(job: Job): string {
  const kind = KIND_WORDS.find((k) => k.job.test(`${job.id} ${job.title}`))?.kind ?? "generic";
  return KIND_LABEL[kind] ?? shortLabel(job.title, "Task");
}

/** One UNIQUE label per job, in plan order (two jobs of the same kind must not merge into one checklist group). */
export function jobLabels(jobs: Job[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const j of jobs) {
    let l = jobLabel(j);
    if (taken.has(l)) l = shortLabel(j.title, l);
    for (let i = 2; taken.has(l); i++) l = `${shortLabel(j.title, "Task").split(" ").slice(0, 3).join(" ")} ${i}`;
    taken.add(l);
    out.set(j.id, l);
  }
  return out;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/** Best zone for a job: shared words with id/title, then kind keywords, then the first zone not used yet. */
export function zoneForJob(job: Job, zones: Zone[], used: Set<string> = new Set()): { zone: Zone | null; kind: Kind } {
  const text = `${job.id} ${job.title}`;
  const kind = KIND_WORDS.find((k) => k.job.test(text))?.kind ?? "generic";
  if (zones.length === 0) return { zone: null, kind };
  const jw = new Set(words(text.replace(/_/g, " ")));
  const byWords = zones.find((z) => words(`${z.id.replace(/_/g, " ")} ${z.label}`).some((w) => jw.has(w)));
  if (byWords) return { zone: byWords, kind };
  const kw = KIND_WORDS.find((k) => k.kind === kind);
  const byKind = kw ? zones.find((z) => kw.zone.test(`${z.id} ${z.label}`)) : undefined;
  if (byKind) return { zone: byKind, kind };
  return { zone: zones.find((z) => !used.has(z.id)) ?? zones[0], kind };
}

function jobSteps(job: Job, zone: Zone, other: Zone | null, kind: Kind, budget: number, label: string): ScenarioStep[] {
  const where = zone.label.toLowerCase();
  const lines: Record<Kind, [string, string]> = {
    greet: [`Welcome! I'm your robot host today.`, `Ask me if you need help.`],
    menu: [`This is our ${where}.`, `Ask me about today's offers.`],
    guide: [`Free seats are this way, follow me.`, `Enjoy your stay!`],
    queue: [`Please queue here, we'll be right with you.`, `Thanks for your patience!`],
    generic: [`Now handling: ${label}.`, `I'll keep an eye on this area.`],
  };
  const [l1, l2] = lines[kind];
  const s: ScenarioStep[] = [
    { action: "walk_to", target: zone.id, label },
    kind === "greet" ? { action: "wave", label } : { action: "point_to", target: zone.id, label },
    { action: "say", text: shortenSay(l1), label },
  ];
  if (other && other.id !== zone.id) s.push({ action: "point_to", target: other.id, label });
  s.push({ action: "say", text: shortenSay(l2), label });
  return s.slice(0, Math.max(3, budget));
}

/** Concatenation of per-job mock-style steps, 10–20 steps for a normal plan, only existing zones. */
export function buildShiftFallback(plan: RobotPlan, jobs: Job[], scene: Scene, businessType: string | null): Scenario {
  const zones = scene.zones;
  const zoneIds = zones.map((z) => z.id);
  const pj = planJobs(plan, jobs);
  const biz = businessType?.trim() || "this business";
  const steps: ScenarioStep[] = [{ action: "say", text: shortenSay(`Starting my shift at ${biz}.`), label: SHIFT_START_LABEL }];
  const labels = jobLabels(pj);
  const used = new Set<string>();
  const budget = pj.length > 0 ? Math.floor((SHIFT_MAX_STEPS - 3) / pj.length) : 0;
  for (const job of pj) {
    const { zone, kind } = zoneForJob(job, zones, used);
    if (!zone) continue;
    used.add(zone.id);
    const other = zones.find((z) => z.id !== zone.id && !used.has(z.id)) ?? zones.find((z) => z.id !== zone.id) ?? null;
    steps.push(...jobSteps(job, zone, other, kind, budget, labels.get(job.id) ?? jobLabel(job)));
  }
  if (pj.length === 0 && zones[0]) {
    steps.push({ action: "walk_to", target: zones[0].id, label: SHIFT_START_LABEL }, { action: "wave", label: SHIFT_START_LABEL });
  }
  steps.push(
    { action: "wait", seconds: 1, label: SHIFT_END_LABEL },
    { action: "say", text: `That's my routine. See you tomorrow!`, label: SHIFT_END_LABEL },
  );
  return { job_id: SHIFT_JOB_ID, steps: finalizeSteps(filterValidSteps(steps, zoneIds).slice(0, SHIFT_MAX_STEPS), SHIFT_START_LABEL) };
}

/** Single-job scenario from the same templates as the shift fallback (no AI). Used by /api/scenario by default. */
export function buildJobScenario(job: Job, scene: Scene): Scenario {
  const zones = scene.zones;
  const { zone, kind } = zoneForJob(job, zones);
  const other = zone ? (zones.find((z) => z.id !== zone.id) ?? null) : null;
  const label = jobLabel(job);
  const raw: ScenarioStep[] = zone ? jobSteps(job, zone, other, kind, 5, label) : [{ action: "wave", label }];
  return { job_id: job.id, steps: finalizeSteps(filterValidSteps(raw, zones.map((z) => z.id)), label) };
}
