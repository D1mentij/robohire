import type { Scenario, Scene, Zone } from "@/types/contracts";

/**
 * Scenario + Scene → a flat list of real-robot motion commands (SDK-agnostic, pure, unit-tested).
 *
 * Frames: the scene floor is X (width) × Z (depth), meters, origin at a room corner (types/contracts.ts).
 * The robot uses a right-handed body frame with z up, x forward, y left, positive yaw = turn LEFT (CCW seen from above).
 * The scene is rendered with three.js (Y up), so scene (x, z) maps to robot-world (X = x, Y = -z) and the
 * heading of a direction (dx, dz) is atan2(-dz, dx).
 */
export const WALK_SPEED_MPS = 0.5;
export const STOP_BEFORE_EDGE_M = 0.5;
export const MIN_MOVE_M = 0.05;
export const MIN_TURN_DEG = 2;

export type K1Command =
  | { kind: "turn"; deg: number; toward: string } // relative yaw, + = left
  | { kind: "walk"; meters: number; seconds: number; toward: string }
  | { kind: "wave" }
  | { kind: "point"; toward: string }
  | { kind: "say"; text: string }
  | { kind: "wait"; seconds: number }
  | { kind: "note"; text: string }; // comment only (skipped step, already there, …)

export interface Pose {
  x: number;
  z: number;
  headingDeg: number; // robot-world yaw, 0 = facing +X
}

export interface K1Plan {
  start: Pose & { zone: string | null };
  commands: K1Command[];
  skipped: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Wrap to (-180, 180]. */
export function normDeg(d: number): number {
  let a = ((d + 180) % 360 + 360) % 360 - 180;
  if (a === -180) a = 180;
  return a;
}

export function headingTo(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return (Math.atan2(-(to.z - from.z), to.x - from.x) * 180) / Math.PI;
}

/**
 * Distance from the zone center to the zone's edge along the ray center→p
 * (axis-aligned box w × d). Returns Infinity for a degenerate direction.
 */
export function centerToEdge(zone: Zone, p: { x: number; z: number }): number {
  const dx = p.x - zone.x;
  const dz = p.z - zone.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return Infinity;
  const sx = Math.abs(dx) > 1e-9 ? zone.w / 2 / Math.abs(dx) : Infinity;
  const sz = Math.abs(dz) > 1e-9 ? zone.d / 2 / Math.abs(dz) : Infinity;
  return Math.min(sx, sz) * len;
}

export function planK1Commands(scenario: Scenario, scene: Scene): K1Plan {
  const zones = new Map(scene.zones.map((z) => [z.id, z]));
  const firstTarget = scenario.steps.find((s) => s.target && zones.has(s.target))?.target;
  const startZone = (firstTarget && zones.get(firstTarget)) || scene.zones[0] || null;
  const pose: Pose = startZone ? { x: startZone.x, z: startZone.z, headingDeg: 0 } : { x: 0, z: 0, headingDeg: 0 };
  const start = { ...pose, zone: startZone?.id ?? null };
  const out: K1Command[] = [];
  let skipped = 0;

  const face = (zone: Zone) => {
    if (Math.hypot(zone.x - pose.x, zone.z - pose.z) < 1e-6) return; // standing on its center: keep heading
    const delta = normDeg(headingTo(pose, zone) - pose.headingDeg);
    if (Math.abs(delta) >= MIN_TURN_DEG) out.push({ kind: "turn", deg: r1(delta), toward: zone.label });
    pose.headingDeg = normDeg(pose.headingDeg + delta);
  };

  for (const step of scenario.steps) {
    const zone = step.target !== undefined ? zones.get(step.target) : undefined;
    if (step.target !== undefined && !zone) {
      out.push({ kind: "note", text: `skipped ${step.action}: unknown zone "${step.target}"` });
      skipped++;
      continue;
    }
    switch (step.action) {
      case "walk_to": {
        if (!zone) break;
        const dist = Math.hypot(zone.x - pose.x, zone.z - pose.z);
        const walk = dist - centerToEdge(zone, pose) - STOP_BEFORE_EDGE_M;
        if (!Number.isFinite(walk) || walk < MIN_MOVE_M) {
          out.push({ kind: "note", text: `already at ${zone.label}` });
          break;
        }
        face(zone);
        const meters = r2(walk);
        out.push({ kind: "walk", meters, seconds: r2(meters / WALK_SPEED_MPS), toward: zone.label });
        const rad = (pose.headingDeg * Math.PI) / 180;
        pose.x += Math.cos(rad) * walk;
        pose.z -= Math.sin(rad) * walk;
        break;
      }
      case "turn_to":
        if (zone) face(zone);
        break;
      case "point_to":
        if (zone) {
          face(zone);
          out.push({ kind: "point", toward: zone.label });
        }
        break;
      case "wave":
        out.push({ kind: "wave" });
        break;
      case "say":
        if (step.text?.trim()) out.push({ kind: "say", text: step.text.trim() });
        break;
      case "wait":
        out.push({ kind: "wait", seconds: Math.max(0, Math.min(30, step.seconds ?? 1)) });
        break;
    }
  }
  return { start, commands: out, skipped };
}
