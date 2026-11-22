import { isScene, type Scene, type Zone } from "@/types/contracts";
import type { AnalysisResult, Task, UploadData } from "./types";
import { buildAnalysisPrompt, ANALYSIS_SCHEMA } from "./prompts";
import { MissingKeyError, provider } from "./provider";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const MIN_SIDE = 0.5;
const MIN_ROOM = 2;
const MAX_ROOM = 60;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "zone";
}

type Rect = { x0: number; x1: number; z0: number; z1: number };
const rect = (z: Zone): Rect => ({ x0: z.x - z.w / 2, x1: z.x + z.w / 2, z0: z.z - z.d / 2, z1: z.z + z.d / 2 });

function overlap(a: Rect, b: Rect) {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return ox > 0.01 && oz > 0.01 ? { ox, oz } : null;
}

function fromRect(z: Zone, r: Rect): Zone {
  return { ...z, x: r2((r.x0 + r.x1) / 2), z: r2((r.z0 + r.z1) / 2), w: r2(r.x1 - r.x0), d: r2(r.z1 - r.z0) };
}

/** Clamp zones into the room, resolve overlaps, round numbers. */
export function cleanScene(scene: Scene): Scene | null {
  const width = clamp(r1(scene.room.width), MIN_ROOM, MAX_ROOM);
  const depth = clamp(r1(scene.room.depth), MIN_ROOM, MAX_ROOM);

  // 1. unique ids, clamp into room
  const seen = new Set<string>();
  const zones: Zone[] = [];
  for (const raw of scene.zones) {
    let id = slug(raw.id);
    for (let i = 2; seen.has(id); i++) id = `${slug(raw.id)}_${i}`;
    seen.add(id);
    const w = clamp(Math.abs(raw.w), MIN_SIDE, width);
    const d = clamp(Math.abs(raw.d), MIN_SIDE, depth);
    const x = clamp(raw.x, w / 2, width - w / 2);
    const z = clamp(raw.z, d / 2, depth - d / 2);
    zones.push({ id, label: raw.label.trim() || id, x: r2(x), z: r2(z), w: r2(w), d: r2(d) });
  }

  // 2. resolve overlaps: larger zone wins; the smaller shrinks along the axis of least overlap, or is dropped
  zones.sort((a, b) => b.w * b.d - a.w * a.d);
  const kept: Zone[] = [];
  for (let zone of zones) {
    let dropped = false;
    for (const other of kept) {
      const ov = overlap(rect(zone), rect(other));
      if (!ov) continue;
      const r = rect(zone);
      const o = rect(other);
      if (ov.ox <= ov.oz) {
        // shrink along X, away from the other zone's center
        if (zone.x < other.x) r.x1 = o.x0; else r.x0 = o.x1;
      } else {
        if (zone.z < other.z) r.z1 = o.z0; else r.z0 = o.z1;
      }
      if (r.x1 - r.x0 < MIN_SIDE || r.z1 - r.z0 < MIN_SIDE) { dropped = true; break; }
      zone = fromRect(zone, r);
    }
    if (!dropped) kept.push(zone);
  }
  if (kept.length < 1) return null;
  return { room: { width, depth }, zones: kept };
}

function cleanTasks(raw: unknown, zoneIds: Set<string>, idMap: Map<string, string>): Task[] {
  if (!Array.isArray(raw)) return [];
  const out: Task[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (typeof t !== "object" || t === null) continue;
    const o = t as Record<string, unknown>;
    if (typeof o.title !== "string" || typeof o.zone_id !== "string") continue;
    const zone_id = idMap.get(o.zone_id) ?? o.zone_id;
    if (!zoneIds.has(zone_id)) continue;
    const freq = Number(o.frequency_per_day);
    const mins = Number(o.minutes_each);
    if (!(freq > 0) || !(mins > 0)) continue;
    let id = slug(typeof o.id === "string" ? o.id : o.title);
    for (let i = 2; seen.has(id); i++) id = `${slug(String(o.id ?? o.title))}_${i}`;
    seen.add(id);
    out.push({
      id,
      title: o.title.trim(),
      zone_id,
      description: typeof o.description === "string" ? o.description.trim() : "",
      frequency_per_day: r1(Math.min(freq, 1000)),
      minutes_each: r1(Math.min(mins, 240)),
    });
  }
  return out;
}

export function validateAnalysis(raw: unknown): AnalysisResult {
  if (typeof raw !== "object" || raw === null) throw new Error("AI returned non-object JSON");
  const o = raw as Record<string, unknown>;
  if (!isScene(o.scene)) throw new Error("AI scene failed validation");
  const idMap = new Map<string, string>(); // original id -> slug, for tasks that referenced the raw id
  for (const z of o.scene.zones) idMap.set(z.id, slug(z.id));
  const scene = cleanScene(o.scene);
  if (!scene) throw new Error("No usable zones after cleanup");
  const tasks = cleanTasks(o.tasks, new Set(scene.zones.map((z) => z.id)), idMap);
  if (tasks.length === 0) throw new Error("No valid tasks after cleanup");
  return { scene, tasks };
}

export type AnalyzeOutcome = { ok: true; result: AnalysisResult } | { ok: false; error: string };

export async function analyze(data: UploadData): Promise<AnalyzeOutcome> {
  const prompt = buildAnalysisPrompt(data.businessType);
  let lastError = "Unknown error";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await provider.generateJson(prompt, data.frames, ANALYSIS_SCHEMA);
      return { ok: true, result: validateAnalysis(raw) };
    } catch (e) {
      if (e instanceof MissingKeyError) return { ok: false, error: e.message };
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
      console.error(`[analyze] attempt ${attempt + 1} failed:`, lastError.slice(0, 300));
    }
  }
  return { ok: false, error: `AI analysis failed twice: ${lastError.slice(0, 200)}` };
}
