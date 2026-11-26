import { isScene, type Scene } from "@/types/contracts";
import type { AnalysisResult, Rating, Task } from "./types";
import { ZONE_TYPES, inferZoneType, zoneTypeOfId, type ZoneType } from "./zoneTypes";
import { heuristicRating, makeRating } from "./ratings";
import { fixLayout, relabelZones, switchFamilyLabels } from "./layout";
import { isAutoDetect } from "./businessPresets";
import { FAMILIES, parseFamily, zonesHintFor } from "./families";
import {
  detectBusiness,
  genericBasics,
  inferFromHints,
  templatesFor,
  type BusinessKind,
  type Template,
} from "./businessTemplates";

/**
 * Local (Ollama qwen3-vl:8b-instruct) analysis split: Vision AI maps spatial zones,
 * clearances, corridors, elevators/doors, and visible staff activities; tasks and
 * initial ratings are generated deterministically from the mapped zones.
 */
export const ZONES_SCHEMA = {
  type: "object",
  properties: {
    room: {
      type: "object",
      properties: { width: { type: "number" }, depth: { type: "number" } },
      required: ["width", "depth"],
    },
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
    business_guess: { type: "string", enum: FAMILIES },
  },
  required: ["room", "zones", "activities"],
};

export function buildZonesPrompt(businessType: string): string {
  const auto = isAutoDetect(businessType);
  const hint = zonesHintFor(businessType);
  const intro = auto
    ? "Infer the commercial/industrial venue type automatically from what is visible in these frames. Describe only what is VISIBLE."
    : `These frames show a "${businessType}". Describe only what is VISIBLE.`;
  const zoneHintLine = hint
    ? `\n- Expected zones for this industry (ONLY include ones actually visible): ${hint}.`
    : "";
  return `${intro} Return JSON:
{"room":{"width":m,"depth":m},"zones":[{"label","type","x","z","w","d"}],"activities":["..."]}
- Top-down floor plan in METERS, origin = room corner, X = width, Z = depth. x,z = zone CENTER; w along X, d along Z.
- Estimate realistic room dimensions and aisle/corridor clearances (e.g. tight 55 cm café table gaps vs >=1.45 m warehouse corridors, elevators/doors, flat vs raised thresholds, hard floor vs carpet).
- 4 to 7 non-overlapping zones inside the room. type is one of: ${ZONE_TYPES.join(", ")}
  (entrance = door/receiving bay, counter = service pass/reception/checkout, seating = tables/lounge, display = promo screen/menu/product display,
  waiting = pickup/staging/waiting area, shelves = pallet racks/aisles/storage, desk = host/packing/QA desk, corridor = main aisle/elevator bank/AMR lane).${zoneHintLine}
- activities: 2 to 4 short phrases of visible work or spatial traits (e.g. "waiters carry trays through narrow aisles", "wide tile concourse for scrubbing", "pallet racks along wide warehouse corridor", "elevator bank in hotel lobby").
- No robot, charging or docking zones.${auto ? `\n- business_guess: the venue type you see, exactly one of: ${FAMILIES.join(", ")}.` : ""}`;
}

const MIN_ZONE_SIDE = 1;

export function parseZonesAnswer(raw: unknown): {
  scene: Scene;
  activities: string[];
  businessGuess: string | null;
} {
  if (typeof raw !== "object" || raw === null)
    throw new Error("AI returned non-object JSON");
  const o = raw as Record<string, unknown>;
  const zonesRaw = Array.isArray(o.zones) ? o.zones : [];
  const zones = zonesRaw
    .filter((z): z is Record<string, unknown> => typeof z === "object" && z !== null)
    .map((z) => {
      const label =
        typeof z.label === "string" && z.label.trim() ? z.label.trim() : "Area";
      const type = (ZONE_TYPES as readonly string[]).includes(String(z.type))
        ? (z.type as ZoneType)
        : inferZoneType(label);
      return {
        id: type,
        label,
        x: Number(z.x),
        z: Number(z.z),
        w: Number(z.w),
        d: Number(z.d),
      };
    })
    .filter(
      (z) =>
        [z.x, z.z, z.w, z.d].every(Number.isFinite) && z.w > 0 && z.d > 0,
    )
    .map((z) => ({
      ...z,
      w: Math.max(z.w, MIN_ZONE_SIDE),
      d: Math.max(z.d, MIN_ZONE_SIDE),
    }));
  if (!zones.length) throw new Error("AI returned no zones");
  const scene = { room: o.room, zones };
  if (!isScene(scene)) throw new Error("AI zones failed validation");
  const activities = (Array.isArray(o.activities) ? o.activities : [])
    .filter((a): a is string => typeof a === "string" && a.trim().length > 2)
    .map((a) => a.trim());
  return {
    scene,
    activities,
    businessGuess:
      typeof o.business_guess === "string" ? o.business_guess : null,
  };
}

export { ZONE_TYPES, inferZoneType, zoneTypeOfId, type ZoneType };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
const MAX_TASKS = 7;
const MAX_NO = 2;

export function tasksFromZones(
  scene: Scene,
  activities: string[],
  hoursPerWeek: number,
  businessType = "",
  kindOverride?: BusinessKind,
): { tasks: Task[]; ratings: Rating[] } {
  const kind =
    kindOverride ??
    detectBusiness(businessType, [
      ...activities,
      ...scene.zones.map((z) => z.label),
    ]);
  const scale = Math.min(2.5, Math.max(0.3, hoursPerWeek / 60));
  const zones = scene.zones.map((z) => ({ z, type: zoneTypeOfId(z.id) }));
  if (!zones.length) return { tasks: [], ratings: [] };
  const entries: { task: Task; rating: Rating }[] = [];
  const used = new Set<string>();
  const fill = (text: string, label: string) => text.replaceAll("{zone}", label);
  const add = (zoneId: string, t: Template) => {
    if (used.has(t.key)) return;
    used.add(t.key);
    const zone = scene.zones.find((z) => z.id === zoneId)!;
    const label = zone.label.trim().slice(0, 30);
    const title = fill(t.title, label);
    const id = slug(`${zoneId}_${t.key}`).slice(0, 48);
    const task: Task = {
      id,
      title,
      zone_id: zoneId,
      description: fill(t.desc, label.toLowerCase()),
      frequency_per_day: Math.max(1, Math.round(t.perDay * scale)),
      minutes_each: Math.max(1, Math.round(t.minutes)),
    };
    entries.push({ task, rating: makeRating(id, t.fit, t.why) });
  };
  for (const { z, type } of zones) {
    for (const t of templatesFor(kind, type)) add(z.id, t);
  }

  const home =
    zones.find((x) => x.type === "counter") ??
    zones.find((x) => x.type === "seating") ??
    zones[0];
  for (const a of activities.slice(0, 2)) {
    if (entries.length >= 5) break;
    if (/robot|charg|dock/i.test(a)) continue;
    const title = a[0].toUpperCase() + a.slice(1);
    if (used.has(`act:${title}`)) continue;
    used.add(`act:${title}`);
    const task: Task = {
      id: slug(`${home.z.id}_${title}`).slice(0, 48),
      title,
      zone_id: home.z.id,
      description: `Observed in space: ${a}.`,
      frequency_per_day: Math.max(1, Math.round(15 * scale)),
      minutes_each: 3,
    };
    entries.push({ task, rating: heuristicRating(task) });
  }

  const goodCount = () => entries.filter((e) => e.rating.fit !== "no").length;
  const first = zones[0].z.id;
  for (const t of genericBasics()) if (goodCount() < 2) add(first, t);

  const suitable = entries
    .filter((e) => e.rating.fit !== "no")
    .slice(0, MAX_TASKS - 2);
  const no = entries
    .filter((e) => e.rating.fit === "no")
    .slice(0, Math.min(MAX_NO, MAX_TASKS - suitable.length));
  const picked = [...suitable, ...no].slice(0, MAX_TASKS);
  for (const e of entries) {
    if (picked.length < 4 && !picked.includes(e)) picked.push(e);
  }
  return {
    tasks: picked.map((e) => e.task),
    ratings: picked.map((e) => e.rating),
  };
}

export function validateZonesAnalysis(
  raw: unknown,
  hoursPerWeek: number,
  cleanScene: (s: Scene) => Scene | null,
  businessType = "",
): AnalysisResult {
  const { scene: rawScene, activities, businessGuess } = parseZonesAnswer(raw);
  const cleaned = cleanScene(rawScene);
  if (!cleaned) throw new Error("No usable zones after cleanup");
  const hints = [...activities, ...rawScene.zones.map((z) => z.label)];
  const auto = isAutoDetect(businessType);
  const kind: BusinessKind = auto
    ? (parseFamily(businessGuess) ?? inferFromHints(hints))
    : detectBusiness(businessType, hints);
  const scene = fixLayout(relabelZones(cleaned, kind), kind);
  const { tasks, ratings } = tasksFromZones(
    scene,
    activities,
    hoursPerWeek,
    businessType,
    kind,
  );
  if (!tasks.length) throw new Error("No tasks could be derived");
  return { scene, tasks, ratings, family: kind, familyDetected: auto };
}

export function rebuildForFamily(
  a: AnalysisResult,
  to: BusinessKind,
  hoursPerWeek: number,
): AnalysisResult {
  const from = (a.family as BusinessKind | undefined) ?? "generic";
  const scene = switchFamilyLabels(a.scene, from, to);
  const { tasks, ratings } = tasksFromZones(scene, [], hoursPerWeek, "", to);
  return { ...a, scene, tasks, ratings, family: to };
}
