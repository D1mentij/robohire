import type { Scenario, Scene, Zone } from "@/types/contracts";
import { inferZoneType, zoneTypeOfId, type ZoneType } from "@/lib/ai/zoneTypes";
import { K1_SPEC } from "@/src/data/k1";
import { planK1Commands } from "./plan";

/*
 * "Safety & navigation check" for the K1 route (PCH1: the route, aisle widths and crowded zones are checked in the
 * 3D twin before the real K1 walks it). Pure + unit-tested. Everything is computed from the scene the app already
 * has (zone boxes estimated from the video) and the same route the .py export uses (planK1Commands).
 * It is a planning check, NOT a measured map: the UI always says "measure on site".
 */

/** Zones where people gather → the K1 should walk slowly / pause there. */
const CROWDED_TYPES: ZoneType[] = ["entrance", "counter", "waiting"];
/** Level changes / doors the K1 route must avoid or check (Booster docs do not state stair climbing). */
const LEVEL_RE = /stair|steps?\b|escalator|elevator|lift\b|ramp|threshold|kerb|curb|podium|stage/i;
const DOOR_RE = /door|entrance|entry|gate/i;

export type CheckStatus = "ok" | "warn" | "fail";

export interface Passage {
  between: string; // "Counter ↔ Tables (to Menu board)"
  widthCm: number;
  onRoute: boolean;
}

export interface SafetyCheck {
  minAisleCm: number;
  aisle: { status: CheckStatus; narrowest: Passage | null; passages: Passage[] };
  routeCrossings: string[]; // labels of zones the straight walking line passes through
  levelChanges: { zone: string; note: string }[];
  crowded: { id: string; label: string }[];
  walkMeters: number;
}

const zoneType = (z: Zone): ZoneType => {
  const byId = zoneTypeOfId(z.id);
  return byId !== "other" ? byId : inferZoneType(z.label);
};

export const isCrowdedZone = (z: Zone): boolean => CROWDED_TYPES.includes(zoneType(z));

const box = (z: Zone) => ({ x0: z.x - z.w / 2, x1: z.x + z.w / 2, z0: z.z - z.d / 2, z1: z.z + z.d / 2 });

/** Distance along a ray from p (direction d) to box z, or Infinity if missed. Slab method. */
function rayToBox(p: { x: number; z: number }, d: { x: number; z: number }, z: Zone): number {
  const B = box(z);
  let t0 = 0;
  let t1 = Infinity;
  for (const [o, dir, lo, hi] of [
    [p.x, d.x, B.x0, B.x1],
    [p.z, d.z, B.z0, B.z1],
  ] as const) {
    if (Math.abs(dir) < 1e-12) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    const a = (lo - o) / dir;
    const b = (hi - o) / dir;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 <= t1 ? t0 : Infinity;
}

/** Distance along a ray from p to the room wall. */
function rayToWall(p: { x: number; z: number }, d: { x: number; z: number }, room: Scene["room"]): number {
  const tx = d.x > 1e-12 ? (room.width - p.x) / d.x : d.x < -1e-12 ? -p.x / d.x : Infinity;
  const tz = d.z > 1e-12 ? (room.depth - p.z) / d.z : d.z < -1e-12 ? -p.z / d.z : Infinity;
  return Math.max(0, Math.min(tx, tz));
}

const inside = (p: { x: number; z: number }, z: Zone) => {
  const B = box(z);
  return p.x >= B.x0 && p.x <= B.x1 && p.z >= B.z0 && p.z <= B.z1;
};

/** Does the segment p→q pass through box z (shrunk by 5 cm)? Liang–Barsky clip. */
function segmentHitsBox(p: { x: number; z: number }, q: { x: number; z: number }, z: Zone): boolean {
  const B = box(z);
  const s = 0.05;
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const clip = (den: number, num: number) => {
    if (Math.abs(den) < 1e-12) return num >= 0;
    const t = num / den;
    if (den < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, p.x - (B.x0 + s)) && clip(dx, B.x1 - s - p.x) && clip(-dz, p.z - (B.z0 + s)) && clip(dz, B.z1 - s - p.z) && t0 < t1
  );
}

export function checkK1Route(scenario: Scenario, scene: Scene, minAisleCm: number = K1_SPEC.minAisleCm): SafetyCheck {
  const plan = planK1Commands(scenario, scene);
  const routeIds = new Set<string>(scenario.steps.filter((s) => s.action === "walk_to" && s.target).map((s) => s.target!));
  if (plan.start.zone) routeIds.add(plan.start.zone);
  const byLabel = new Map(scene.zones.map((z) => [z.label, z]));

  // 1) walking segments from the same plan the .py export uses; 2) free width across the walking line
  //    (rays left + right to the nearest zone box or wall, sampled every 25 cm; zone boxes = furniture areas)
  const pose = { x: plan.start.x, z: plan.start.z, h: plan.start.headingDeg };
  const crossings = new Set<string>();
  const passages: Passage[] = [];
  let walkMeters = 0;
  for (const c of plan.commands) {
    if (c.kind === "turn") pose.h += c.deg;
    if (c.kind !== "walk") continue;
    const rad = (pose.h * Math.PI) / 180;
    const dir = { x: Math.cos(rad), z: -Math.sin(rad) };
    const next = { x: pose.x + dir.x * c.meters, z: pose.z + dir.z * c.meters };
    for (const z of scene.zones) {
      if (z.id === plan.start.zone || byLabel.get(c.toward) === z || zoneType(z) === "corridor") continue;
      if (segmentHitsBox(pose, next, z)) crossings.add(z.label);
    }
    let seg: Passage | null = null;
    for (let t = 0.1; t <= c.meters - 0.1 + 1e-9; t += 0.25) {
      const q = { x: pose.x + dir.x * t, z: pose.z + dir.z * t };
      const obstacles = scene.zones.filter((z) => !inside(q, z) && zoneType(z) !== "corridor"); // corridors are walkways
      const side = (d: { x: number; z: number }) => {
        let best = rayToWall(q, d, scene.room);
        let what = "wall";
        for (const z of obstacles) {
          const r = rayToBox(q, d, z);
          if (r < best) {
            best = r;
            what = z.label;
          }
        }
        return { best, what };
      };
      const L = side({ x: -dir.z, z: dir.x });
      const R = side({ x: dir.z, z: -dir.x });
      const widthCm = Math.round((L.best + R.best) * 100);
      if (!seg || widthCm < seg.widthCm) seg = { between: `${L.what} ↔ ${R.what} (to ${c.toward})`, widthCm, onRoute: true };
    }
    if (seg) passages.push(seg);
    walkMeters += c.meters;
    pose.x = next.x;
    pose.z = next.z;
  }
  const narrowest = passages.reduce<Passage | null>((m, p) => (!m || p.widthCm < m.widthCm ? p : m), null);
  const status: CheckStatus = !narrowest ? "warn" : narrowest.widthCm < minAisleCm ? "fail" : "ok";

  // 3) level changes / doors
  const levelChanges: { zone: string; note: string }[] = [];
  for (const z of scene.zones) {
    if (LEVEL_RE.test(z.label)) {
      levelChanges.push({ zone: z.label, note: "Steps / lift / ramp: keep the K1 route step-free on one floor (Booster docs do not state stair climbing)." });
    } else if (DOOR_RE.test(z.label) && routeIds.has(z.id)) {
      levelChanges.push({ zone: z.label, note: "Door: check the threshold height on site before the K1 walks through." });
    }
  }

  return {
    minAisleCm,
    aisle: { status, narrowest, passages },
    routeCrossings: [...crossings],
    levelChanges,
    crowded: scene.zones.filter(isCrowdedZone).map((z) => ({ id: z.id, label: z.label })),
    walkMeters: Math.round(walkMeters * 10) / 10,
  };
}
