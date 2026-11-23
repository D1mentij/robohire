import { isScene, type Scene } from "@/types/contracts";
import type { AnalysisResult, Rating, Task } from "./types";
import { heuristicRating, makeRating } from "./ratings";
import { detectBusiness, genericBasics, templatesFor, type Template } from "./businessTemplates";

/**
 * Local (Ollama) analysis split: the small model only describes the SPACE (zones with a fixed type + a few visible
 * activities). Tasks and K1 ratings are then generated in code from zone types, so a weak model cannot break them.
 */
export const ZONE_TYPES = ["entrance", "counter", "seating", "display", "waiting", "shelves", "desk", "corridor", "other"] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

export const ZONES_SCHEMA = {
  type: "object",
  properties: {
    room: { type: "object", properties: { width: { type: "number" }, depth: { type: "number" } }, required: ["width", "depth"] },
    zones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          type: { type: "string", enum: [...ZONE_TYPES] },
          x: { type: "number" },
          z: { type: "number" },
          w: { type: "number" },
          d: { type: "number" },
        },
        required: ["label", "type", "x", "z", "w", "d"],
      },
    },
    activities: { type: "array", items: { type: "string" } },
  },
  required: ["room", "zones", "activities"],
};

export function buildZonesPrompt(businessType: string): string {
  return `These frames show a "${businessType}". Describe only what is VISIBLE. Return JSON:
{"room":{"width":m,"depth":m},"zones":[{"label","type","x","z","w","d"}],"activities":["..."]}
- Top-down floor plan in METERS, origin = room corner, X = width, Z = depth. x,z = zone CENTER; w along X, d along Z.
- 4 to 7 zones that do not overlap and lie inside the room. type is one of: ${ZONE_TYPES.join(", ")}
  (entrance = door/reception area, counter = service/bar/cash desk, seating = tables/chairs/sofas, display = shelves with products/menu board,
  waiting = queue/lobby area, shelves = storage/racks, desk = work/info desk, corridor = passage).
- activities: 2 to 4 short phrases of what people/staff visibly do (e.g. "barista makes coffee", "guest talks to receptionist").
- No robot, charging or docking zones.`;
}

const TYPE_RE: [ZoneType, RegExp][] = [
  ["entrance", /entr|door|lobby entrance|reception|foyer|gate/i],
  ["counter", /counter|bar\b|cash|checkout|register|kitchen|service/i],
  ["seating", /seat|table|chair|sofa|bench|lounge|booth|dining/i],
  ["display", /display|menu|board|showcase|product|exhibit|window|vitrine|vehicle|car\b/i],
  ["waiting", /wait|queue|lobby|lounge area/i],
  ["shelves", /shelf|shelves|rack|storage|stock/i],
  ["desk", /desk|office|info|workstation/i],
  ["corridor", /corridor|hall|aisle|passage|stair/i],
];
export const inferZoneType = (label: string): ZoneType => TYPE_RE.find(([, re]) => re.test(label))?.[0] ?? "other";

/** Zone ids in the local flow are the type (+ _2, _3 when repeated), so the type survives scene cleanup. */
export const zoneTypeOfId = (id: string): ZoneType => {
  const t = id.replace(/_\d+$/, "");
  return (ZONE_TYPES as readonly string[]).includes(t) ? (t as ZoneType) : inferZoneType(id);
};

/** Validates the model's zones answer; returns a raw scene (not yet cleaned) with type-based ids + the activities. */
const MIN_ZONE_SIDE = 1;

export function parseZonesAnswer(raw: unknown): { scene: Scene; activities: string[] } {
  if (typeof raw !== "object" || raw === null) throw new Error("AI returned non-object JSON");
  const o = raw as Record<string, unknown>;
  const zonesRaw = Array.isArray(o.zones) ? o.zones : [];
  const zones = zonesRaw
    .filter((z): z is Record<string, unknown> => typeof z === "object" && z !== null)
    .map((z) => {
      const label = typeof z.label === "string" && z.label.trim() ? z.label.trim() : "Area";
      const type = (ZONE_TYPES as readonly string[]).includes(String(z.type)) ? (z.type as ZoneType) : inferZoneType(label);
      return { id: type, label, x: Number(z.x), z: Number(z.z), w: Number(z.w), d: Number(z.d) };
    })
    .filter((z) => [z.x, z.z, z.w, z.d].every(Number.isFinite) && z.w > 0 && z.d > 0)
    // small models guess tiny sizes (0.5 m); a zone the K1 can stand in should be at least ~1 m
    .map((z) => ({ ...z, w: Math.max(z.w, MIN_ZONE_SIDE), d: Math.max(z.d, MIN_ZONE_SIDE) }));
  if (!zones.length) throw new Error("AI returned no zones");
  const scene = { room: o.room, zones };
  if (!isScene(scene)) throw new Error("AI zones failed validation");
  const activities = (Array.isArray(o.activities) ? o.activities : []).filter((a): a is string => typeof a === "string" && a.trim().length > 2).map((a) => a.trim());
  return { scene, activities };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const r1 = (n: number) => Math.round(n * 10) / 10;
const MAX_TASKS = 7;
const MAX_NO = 2;

/** Tasks + rule-based ratings from zone types. Always 4–7 tasks, with at least 2 K1-suitable ones. */
export function tasksFromZones(scene: Scene, activities: string[], hoursPerWeek: number, businessType = ""): { tasks: Task[]; ratings: Rating[] } {
  const kind = detectBusiness(businessType);
  const scale = Math.min(2.5, Math.max(0.3, hoursPerWeek / 60));
  const zones = scene.zones.map((z) => ({ z, type: zoneTypeOfId(z.id) }));
  if (!zones.length) return { tasks: [], ratings: [] };
  const entries: { task: Task; rating: Rating }[] = [];
  const used = new Set<string>();
  const fill = (text: string, label: string) => text.replaceAll("{zone}", label);
  const add = (zoneId: string, t: Template) => {
    if (used.has(t.key)) return; // one task per template, first matching zone wins
    used.add(t.key);
    const zone = scene.zones.find((z) => z.id === zoneId)!;
    const label = zone.label.trim().slice(0, 30);
    const title = fill(t.title, label);
    const id = slug(`${zoneId}_${t.key}`).slice(0, 48);
    const task: Task = { id, title, zone_id: zoneId, description: fill(t.desc, label.toLowerCase()), frequency_per_day: r1(t.perDay * scale), minutes_each: t.minutes };
    entries.push({ task, rating: makeRating(id, t.fit, t.why) });
  };
  for (const { z, type } of zones) for (const t of templatesFor(kind, type)) add(z.id, t);
  // visible activities become extra tasks (generic numbers, heuristic rating), at the most relevant zone
  const home = zones.find((x) => x.type === "counter") ?? zones.find((x) => x.type === "seating") ?? zones[0];
  for (const a of activities.slice(0, 2)) {
    if (entries.length >= 5) break; // templates already cover the business; raw activity phrases make poor task titles
    if (/robot|charg|dock/i.test(a)) continue;
    const title = a[0].toUpperCase() + a.slice(1);
    if (used.has(`act:${title}`)) continue;
    used.add(`act:${title}`);
    const task: Task = { id: slug(`${home.z.id}_${title}`).slice(0, 48), title, zone_id: home.z.id, description: `Seen in the video: ${a}.`, frequency_per_day: r1(15 * scale), minutes_each: 3 };
    entries.push({ task, rating: heuristicRating(task) });
  }
  // always have enough K1-suitable work: top up with entrance/zone-agnostic basics
  const goodCount = () => entries.filter((e) => e.rating.fit !== "no").length;
  const first = zones[0].z.id;
  for (const t of genericBasics()) if (goodCount() < 2) add(first, t);
  // cap: all suitable first, then at most MAX_NO unsuitable
  const suitable = entries.filter((e) => e.rating.fit !== "no").slice(0, MAX_TASKS - 2); // leave room for a physical ("no") task: the demo should show K1 limits
  const no = entries.filter((e) => e.rating.fit === "no").slice(0, Math.min(MAX_NO, MAX_TASKS - suitable.length));
  const picked = [...suitable, ...no].slice(0, MAX_TASKS);
  // keep at least 4 tasks if possible
  for (const e of entries) if (picked.length < 4 && !picked.includes(e)) picked.push(e);
  return { tasks: picked.map((e) => e.task), ratings: picked.map((e) => e.rating) };
}

export function validateZonesAnalysis(raw: unknown, hoursPerWeek: number, cleanScene: (s: Scene) => Scene | null, businessType = ""): AnalysisResult {
  const { scene: rawScene, activities } = parseZonesAnswer(raw);
  const scene = cleanScene(rawScene);
  if (!scene) throw new Error("No usable zones after cleanup");
  const { tasks, ratings } = tasksFromZones(scene, activities, hoursPerWeek, businessType);
  if (!tasks.length) throw new Error("No tasks could be derived");
  return { scene, tasks, ratings };
}
