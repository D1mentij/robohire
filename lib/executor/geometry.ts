import type { Scene, Zone } from "@/types/contracts";
import type { Vec2XZ, WalkTargetInfo } from "./types";

/** Robot walking speed in meters per second (~0.5 m/s per spec) */
export const ROBOT_WALK_SPEED = 0.5;

/** Robot smooth rotation speed in radians per second */
export const ROBOT_TURN_SPEED = 3.5;

/** Safety margin (meters) outside a zone's bounding box where the robot stops */
export const ZONE_STOP_MARGIN = 0.45;

export type ZoneFurnitureKind =
  | "entrance"
  | "counter"
  | "tables"
  | "menu"
  | "waiting"
  | "shelves"
  | "unknown";

/**
 * Maps zone id + label keywords to a low-poly furniture archetype.
 */
export function classifyZoneFurniture(zone: Zone): ZoneFurnitureKind {
  const text = `${zone.id} ${zone.label}`.toLowerCase();

  if (/\b(entrance|door|exit|entry|foyer)\b/.test(text)) {
    return "entrance";
  }
  if (/\b(menu|board|screen|display|sign|promo|poster|kiosk)\b/.test(text)) {
    return "menu";
  }
  if (
    /\b(counter|desk|reception|checkout|bar|cashier|workstation|register)\b/.test(
      text,
    )
  ) {
    return "counter";
  }
  if (/\b(waiting|sofa|bench|couch|bed|rest|armchair)\b/.test(text)) {
    return "waiting";
  }
  if (
    /\b(shelf|shelves|aisle|rack|book|storage|cabinet|wardrobe|closet)\b/.test(
      text,
    )
  ) {
    return "shelves";
  }
  if (/\b(table|tables|seating|lounge|dining|chair|chairs)\b/.test(text)) {
    return "tables";
  }
  return "unknown";
}

/** Check if a point (x, z) lies inside a zone box (expanded by optional margin) */
export function isPointInsideZone(
  point: Vec2XZ,
  zone: Zone,
  margin = 0,
): boolean {
  const hw = zone.w / 2 + margin;
  const hd = zone.d / 2 + margin;
  return (
    point.x >= zone.x - hw &&
    point.x <= zone.x + hw &&
    point.z >= zone.z - hd &&
    point.z <= zone.z + hd
  );
}

/**
 * Liang-Barsky segment vs axis-aligned bounding box intersection test in XZ.
 */
export function segmentIntersectsZone(
  a: Vec2XZ,
  b: Vec2XZ,
  zone: Zone,
  margin = 0.18,
): boolean {
  const minX = zone.x - (zone.w / 2 + margin);
  const maxX = zone.x + (zone.w / 2 + margin);
  const minZ = zone.z - (zone.d / 2 + margin);
  const maxZ = zone.z + (zone.d / 2 + margin);

  const dx = b.x - a.x;
  const dz = b.z - a.z;

  let t0 = 0;
  let t1 = 1;

  const checks: [number, number][] = [
    [-dx, a.x - minX],
    [dx, maxX - a.x],
    [-dz, a.z - minZ],
    [dz, maxZ - a.z],
  ];

  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-8) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }

  return t0 <= t1 && t1 > 0.02 && t0 < 0.98;
}

/**
 * Computes a clean starting floor position in the room corridor that is outside
 * all zones.
 */
export function getDefaultStartPosition(scene: Scene): Vec2XZ {
  const preferred: Vec2XZ = { x: 4.2, z: 2.9 };
  const isClear = (pt: Vec2XZ) =>
    pt.x >= 0.4 &&
    pt.x <= scene.room.width - 0.4 &&
    pt.z >= 0.4 &&
    pt.z <= scene.room.depth - 0.4 &&
    scene.zones.every((z) => !isPointInsideZone(pt, z, 0.25));

  if (isClear(preferred)) {
    return preferred;
  }

  // Fallback search across the floor grid if custom scene has a zone at (4.2, 2.9)
  for (let z = 1.0; z <= scene.room.depth - 1.0; z += 0.5) {
    for (let x = 1.0; x <= scene.room.width - 1.0; x += 0.5) {
      const candidate = { x, z };
      if (isClear(candidate)) return candidate;
    }
  }

  return { x: scene.room.width / 2, z: scene.room.depth / 2 };
}

/**
 * Calculates the stop point outside the target zone's bounding box along the
 * approach ray from `from` to the zone's center (zone.x, zone.z).
 * If the straight segment crosses another zone's furniture, adds one
 * intermediate waypoint around it so the robot never walks through furniture.
 */
export function calculateZoneStopPoint(
  from: Vec2XZ,
  zone: Zone,
  room: Scene["room"],
  allZones: Zone[] = [],
  margin = ZONE_STOP_MARGIN,
): WalkTargetInfo {
  const hw = zone.w / 2;
  const hd = zone.d / 2;
  const ehw = hw + margin;
  const ehd = hd + margin;

  const dx = zone.x - from.x;
  const dz = zone.z - from.z;

  let stopPoint: Vec2XZ;
  if (Math.abs(dx) < 1e-5 && Math.abs(dz) < 1e-5) {
    const fallbackZ =
      zone.z + ehd <= room.depth - 0.35 ? zone.z + ehd : zone.z - ehd;
    stopPoint = { x: zone.x, z: fallbackZ };
  } else {
    const sx =
      Math.abs(dx) > 1e-5 ? ehw / Math.abs(dx) : Number.POSITIVE_INFINITY;
    const sz =
      Math.abs(dz) > 1e-5 ? ehd / Math.abs(dz) : Number.POSITIVE_INFINITY;
    const sEdge = Math.min(sx, sz);

    let stopX = zone.x - sEdge * dx;
    let stopZ = zone.z - sEdge * dz;

    const wallMargin = 0.35;
    stopX = Math.max(wallMargin, Math.min(room.width - wallMargin, stopX));
    stopZ = Math.max(wallMargin, Math.min(room.depth - wallMargin, stopZ));

    stopPoint = { x: stopX, z: stopZ };
  }

  const lookAtAngle = Math.atan2(zone.x - stopPoint.x, zone.z - stopPoint.z);

  // Check if direct path from `from` to `stopPoint` crosses any other zone's furniture
  const obstacleZones = allZones.filter(
    (other) =>
      other.id !== zone.id &&
      classifyZoneFurniture(other) !== "unknown" &&
      !isPointInsideZone(from, other, 0.05) &&
      !isPointInsideZone(stopPoint, other, 0.05),
  );

  const blockingZones = obstacleZones.filter((obs) =>
    segmentIntersectsZone(from, stopPoint, obs, 0.16),
  );

  if (blockingZones.length === 0) {
    return {
      zone,
      stopPoint,
      waypoints: [stopPoint],
      lookAtAngle,
    };
  }

  // Generate candidate intermediate waypoints around the primary blocking zone
  const primaryObs = blockingZones[0];
  const pad = 0.42;
  const ox0 = primaryObs.x - (primaryObs.w / 2 + pad);
  const ox1 = primaryObs.x + (primaryObs.w / 2 + pad);
  const oz0 = primaryObs.z - (primaryObs.d / 2 + pad);
  const oz1 = primaryObs.z + (primaryObs.d / 2 + pad);

  const rawCandidates: Vec2XZ[] = [
    { x: ox0, z: oz0 },
    { x: ox1, z: oz0 },
    { x: ox0, z: oz1 },
    { x: ox1, z: oz1 },
    { x: from.x, z: stopPoint.z },
    { x: stopPoint.x, z: from.z },
    { x: ox0, z: primaryObs.z },
    { x: ox1, z: primaryObs.z },
    { x: primaryObs.x, z: oz0 },
    { x: primaryObs.x, z: oz1 },
  ];

  const wallMin = 0.38;
  const clampToRoom = (pt: Vec2XZ): Vec2XZ => ({
    x: Math.max(wallMin, Math.min(room.width - wallMin, pt.x)),
    z: Math.max(wallMin, Math.min(room.depth - wallMin, pt.z)),
  });

  let bestWaypoint: Vec2XZ | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const raw of rawCandidates) {
    const wp = clampToRoom(raw);
    if (obstacleZones.some((obs) => isPointInsideZone(wp, obs, 0.12))) {
      continue;
    }
    if (isPointInsideZone(wp, zone, 0.12)) {
      continue;
    }

    const hits = obstacleZones.reduce(
      (count, obs) =>
        count +
        (segmentIntersectsZone(from, wp, obs, 0.12) ? 1 : 0) +
        (segmentIntersectsZone(wp, stopPoint, obs, 0.12) ? 1 : 0),
      0,
    );

    const dist =
      Math.hypot(wp.x - from.x, wp.z - from.z) +
      Math.hypot(stopPoint.x - wp.x, stopPoint.z - wp.z);

    const score = hits * 100 + dist;
    if (score < bestScore) {
      bestScore = score;
      bestWaypoint = wp;
    }
  }

  const waypoints = bestWaypoint ? [bestWaypoint, stopPoint] : [stopPoint];

  return {
    zone,
    stopPoint,
    waypoints,
    lookAtAngle,
  };
}

/** Shortest signed angle delta in [-PI, PI] from `fromRad` to `toRad` */
export function shortestAngleDelta(fromRad: number, toRad: number): number {
  let diff = (toRad - fromRad) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/** Step `currentRad` toward `targetRad` by at most `maxStepRad` */
export function stepAngleTowards(
  currentRad: number,
  targetRad: number,
  maxStepRad: number,
): { angle: number; reached: boolean } {
  const delta = shortestAngleDelta(currentRad, targetRad);
  if (Math.abs(delta) <= Math.max(maxStepRad, 0.02)) {
    return { angle: targetRad, reached: true };
  }
  return {
    angle: currentRad + Math.sign(delta) * maxStepRad,
    reached: false,
  };
}
