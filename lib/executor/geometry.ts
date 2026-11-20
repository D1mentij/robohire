import type { Scene, Zone } from "@/types/contracts";
import type { Vec2XZ, WalkTargetInfo } from "./types";

/** Robot walking speed in meters per second (~0.5 m/s per spec) */
export const ROBOT_WALK_SPEED = 0.5;

/** Robot smooth rotation speed in radians per second */
export const ROBOT_TURN_SPEED = 3.5;

/** Safety margin (meters) outside a zone's bounding box where the robot stops */
export const ZONE_STOP_MARGIN = 0.45;

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
 * Guarantees the robot stops at the EDGE of the target zone (w/2 + margin, d/2 + margin)
 * while directly facing the zone center, and never walks inside the zone box.
 */
export function calculateZoneStopPoint(
  from: Vec2XZ,
  zone: Zone,
  room: Scene["room"],
  margin = ZONE_STOP_MARGIN,
): WalkTargetInfo {
  const hw = zone.w / 2;
  const hd = zone.d / 2;
  const ehw = hw + margin;
  const ehd = hd + margin;

  const dx = zone.x - from.x;
  const dz = zone.z - from.z;

  if (Math.abs(dx) < 1e-5 && Math.abs(dz) < 1e-5) {
    const fallbackZ =
      zone.z + ehd <= room.depth - 0.35 ? zone.z + ehd : zone.z - ehd;
    const stopPoint = { x: zone.x, z: fallbackZ };
    const lookAtAngle = Math.atan2(zone.x - stopPoint.x, zone.z - stopPoint.z);
    return { zone, stopPoint, lookAtAngle };
  }

  // Ray from zone center C = (zone.x, zone.z) back toward `from`:
  // P(s) = C - s * (dx, dz).
  // It exits the expanded box [zone.x ± ehw, zone.z ± ehd] at s = min(sx, sz).
  const sx = Math.abs(dx) > 1e-5 ? ehw / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const sz = Math.abs(dz) > 1e-5 ? ehd / Math.abs(dz) : Number.POSITIVE_INFINITY;
  const sEdge = Math.min(sx, sz);

  let stopX = zone.x - sEdge * dx;
  let stopZ = zone.z - sEdge * dz;

  // Keep inside room walls while preserving zone clearance
  const wallMargin = 0.35;
  stopX = Math.max(wallMargin, Math.min(room.width - wallMargin, stopX));
  stopZ = Math.max(wallMargin, Math.min(room.depth - wallMargin, stopZ));

  const stopPoint: Vec2XZ = { x: stopX, z: stopZ };
  const lookAtAngle = Math.atan2(zone.x - stopPoint.x, zone.z - stopPoint.z);

  return { zone, stopPoint, lookAtAngle };
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
