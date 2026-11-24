// Single source of truth for data shared between "brain" (AI) and "body" (3D).
// No external libs. Change only if both people agree (log it in PROGRESS.md).

/**
 * Zone on the floor. Meters; floor = XZ plane; origin (0,0) at a room corner.
 * x,z = zone CENTER; w along X, d along Z.
 */
export interface Zone {
  id: string;
  label: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Scene {
  room: { width: number; depth: number };
  zones: Zone[];
}

export type Fit = "good" | "partial" | "no";

export const ROBOT_TYPES = [
  "k1",
  "vacuum",
  "window_cleaner",
  "tray_delivery",
  "uvc_disinfection",
  "shelf_scanner",
  "air_purifier",
  "security_rover",
] as const;

export type RobotType = (typeof ROBOT_TYPES)[number];

export interface Job {
  id: string;
  title: string;
  fit: Fit;
  score: number; // 0-100
  why: string;
  limits: string;
  hours_per_week: number;
  savings_eur_month: number;
  payback_months: number | null;
  /** Optional robot platform identifier; omitted defaults to primary "k1" (Booster K1). */
  robot_type?: RobotType;
}

export interface JobsResult {
  business_type: string;
  jobs: Job[];
}

/** One K1 robot doing several jobs per shift. Payback only makes sense for the whole plan. */
export interface RobotPlan {
  job_ids: string[];
  hours_per_week: number; // robot-hours used
  capacity_hours_per_week: number;
  gross_savings_eur_month: number;
  running_cost_eur_month: number;
  net_savings_eur_month: number;
  robot_price_eur: number;
  payback_months: number | null;
  assumptions: string[];
}

export const ALLOWED_ACTIONS = [
  "walk_to",
  "turn_to",
  "wave",
  "point_to",
  "say",
  "wait",
] as const;

export type Action = (typeof ALLOWED_ACTIONS)[number];

export interface ScenarioStep {
  action: Action;
  target?: string; // zone id
  text?: string;
  seconds?: number;
  /** Optional, display only: which job / phase this step belongs to (e.g. in a whole-shift scenario). */
  label?: string;
}

export interface Scenario {
  job_id: string;
  steps: ScenarioStep[];
}

// ---------- helpers ----------

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const isAction = (v: unknown): v is Action =>
  isStr(v) && (ALLOWED_ACTIONS as readonly string[]).includes(v);

export const isRobotType = (v: unknown): v is RobotType =>
  isStr(v) && (ROBOT_TYPES as readonly string[]).includes(v);

// ---------- type guards ----------

export function isZone(v: unknown): v is Zone {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.label) &&
    isNum(v.x) &&
    isNum(v.z) &&
    isNum(v.w) &&
    isNum(v.d)
  );
}

export function isScene(v: unknown): v is Scene {
  if (!isObj(v) || !isObj(v.room) || !Array.isArray(v.zones)) return false;
  return isNum(v.room.width) && isNum(v.room.depth) && v.zones.every(isZone);
}

export function isJob(v: unknown): v is Job {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.title) &&
    (v.fit === "good" || v.fit === "partial" || v.fit === "no") &&
    isNum(v.score) &&
    v.score >= 0 &&
    v.score <= 100 &&
    isStr(v.why) &&
    isStr(v.limits) &&
    isNum(v.hours_per_week) &&
    isNum(v.savings_eur_month) &&
    (v.payback_months === null || isNum(v.payback_months)) &&
    (v.robot_type === undefined || isRobotType(v.robot_type))
  );
}

export function isJobsResult(v: unknown): v is JobsResult {
  return (
    isObj(v) &&
    isStr(v.business_type) &&
    Array.isArray(v.jobs) &&
    v.jobs.every(isJob)
  );
}

export function isRobotPlan(v: unknown): v is RobotPlan {
  return (
    isObj(v) &&
    Array.isArray(v.job_ids) &&
    v.job_ids.every(isStr) &&
    isNum(v.hours_per_week) &&
    isNum(v.capacity_hours_per_week) &&
    isNum(v.gross_savings_eur_month) &&
    isNum(v.running_cost_eur_month) &&
    isNum(v.net_savings_eur_month) &&
    isNum(v.robot_price_eur) &&
    (v.payback_months === null || isNum(v.payback_months)) &&
    Array.isArray(v.assumptions) &&
    v.assumptions.every(isStr)
  );
}

function isScenarioStepShape(v: unknown): v is ScenarioStep {
  if (!isObj(v) || !isAction(v.action)) return false;
  if (v.target !== undefined && !isStr(v.target)) return false;
  if (v.text !== undefined && !isStr(v.text)) return false;
  if (v.seconds !== undefined && !(isNum(v.seconds) && v.seconds >= 0))
    return false;
  if (v.label !== undefined && !isStr(v.label)) return false;
  return true;
}

export function isScenario(v: unknown): v is Scenario {
  return (
    isObj(v) &&
    isStr(v.job_id) &&
    Array.isArray(v.steps) &&
    v.steps.every(isScenarioStepShape)
  );
}

// ---------- step validation ----------

/**
 * Drops steps with unknown actions, missing required fields, or targets that
 * are not existing zone ids.
 * Required: walk_to/turn_to/point_to -> target; say -> text; wait -> seconds.
 * wave -> nothing (target optional, but if given must be a valid zone).
 */
export function filterValidSteps(
  steps: unknown[],
  zoneIds: string[],
): ScenarioStep[] {
  const ids = new Set(zoneIds);
  const out: ScenarioStep[] = [];
  for (const raw of steps) {
    if (!isScenarioStepShape(raw)) continue;
    const s = raw;
    if (s.target !== undefined && !ids.has(s.target)) continue;
    switch (s.action) {
      case "walk_to":
      case "turn_to":
      case "point_to":
        if (s.target === undefined) continue;
        break;
      case "say":
        if (s.text === undefined || s.text.trim() === "") continue;
        break;
      case "wait":
        if (s.seconds === undefined) continue;
        break;
      case "wave":
        break;
    }
    out.push(s);
  }
  return out;
}
