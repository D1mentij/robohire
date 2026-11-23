import type { Job, RobotPlan, Scenario, Scene } from "@/types/contracts";
import { isScenario } from "@/types/contracts";

/**
 * Client-side cache for /api/scenario. Key = SHA-256 of {job.id, scene}; localStorage
 * "robohire:scenariocache:<hash>", max 20 entries (LRU). Same job + same space → no new AI call.
 */
const PREFIX = "robohire:scenariocache:";
const MAX_ENTRIES = 20;

async function hash(keyData: unknown): Promise<string | null> {
  try {
    const data = new TextEncoder().encode(JSON.stringify(keyData));
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

function load(key: string): { t: number; scenario: Scenario } | null {
  try {
    const e = JSON.parse(localStorage.getItem(key) ?? "null") as { t: number; scenario: unknown } | null;
    return e && typeof e.t === "number" && isScenario(e.scenario) ? { t: e.t, scenario: e.scenario } : null;
  } catch {
    return null;
  }
}

function save(key: string, scenario: Scenario): void {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), scenario }));
    const all: { k: string; t: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) all.push({ k, t: load(k)?.t ?? 0 });
    }
    all.sort((a, b) => a.t - b.t);
    for (const { k } of all.slice(0, Math.max(0, all.length - MAX_ENTRIES))) localStorage.removeItem(k);
  } catch {
    /* best-effort */
  }
}

/**
 * Returns the cached scenario for (job, scene) or POSTs /api/scenario and caches the result.
 * Throws on network/HTTP errors (caller decides on a fallback). Client-side only.
 */
export async function getOrCreateScenario(
  job: Job,
  scene: Scene,
  opts: { businessType?: string | null; timeoutMs?: number; force?: boolean } = {},
): Promise<{ scenario: Scenario; cached: boolean }> {
  const h = await hash({ id: job.id, scene });
  const key = h ? PREFIX + h : null;
  if (key && !opts.force) {
    const hit = load(key);
    if (hit) {
      save(key, hit.scenario); // LRU touch
      return { scenario: hit.scenario, cached: true };
    }
  }
  const res = await fetch("/api/scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job, scene, businessType: opts.businessType ?? null }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
  });
  const json = (await res.json().catch(() => null)) as { scenario?: unknown; error?: string } | null;
  if (!res.ok || !json || !isScenario(json.scenario)) throw new Error(json?.error ?? `Server error (${res.status})`);
  if (key) save(key, json.scenario);
  return { scenario: json.scenario, cached: false };
}

/**
 * Whole-plan scenario ("shift", POST /api/shift). Key = SHA-256 of {plan.job_ids, scene} (same LRU store).
 * Only AI results are cached; the server's built-in fallback (source "fallback") is returned but not cached,
 * so the next click can still get an AI script. Throws on network/HTTP errors. Client-side only.
 */
export async function getOrCreateShift(
  plan: RobotPlan,
  jobs: Job[],
  scene: Scene,
  opts: { businessType?: string | null; timeoutMs?: number; force?: boolean } = {},
): Promise<{ scenario: Scenario; cached: boolean; source: "ai" | "fallback" | "cache" }> {
  const h = await hash({ shift: plan.job_ids, scene });
  const key = h ? PREFIX + "shift:" + h : null;
  if (key && !opts.force) {
    const hit = load(key);
    if (hit) {
      save(key, hit.scenario);
      return { scenario: hit.scenario, cached: true, source: "cache" };
    }
  }
  const res = await fetch("/api/shift", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, jobs, scene, businessType: opts.businessType ?? null }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });
  const json = (await res.json().catch(() => null)) as { scenario?: unknown; source?: string; error?: string } | null;
  if (!res.ok || !json || !isScenario(json.scenario)) throw new Error(json?.error ?? `Server error (${res.status})`);
  const source = json.source === "fallback" ? "fallback" : "ai";
  if (key && source === "ai") save(key, json.scenario);
  return { scenario: json.scenario, cached: false, source };
}
