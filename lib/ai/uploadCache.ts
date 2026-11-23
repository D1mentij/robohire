import type { JobsResult, RobotPlan } from "@/types/contracts";
import type { StoredAnalysis } from "./types";

/** Client-side result cache for /upload. localStorage "robohire:cache:<hash>", max 5 entries, LRU. */
const PREFIX = "robohire:cache:";
const MAX_ENTRIES = 5;

export type CacheEntry = { t: number; analysis: StoredAnalysis; jobs: JobsResult; plan: RobotPlan };

export async function hashInputs(frames: string[], businessType: string, hoursPerWeek: number, hourlyCost: number): Promise<string | null> {
  try {
    const data = new TextEncoder().encode(JSON.stringify([frames, businessType.trim().toLowerCase(), hoursPerWeek, hourlyCost]));
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null; // insecure context etc. → just no cache
  }
}

function keys(): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) out.push(k);
  }
  return out;
}

function read(key: string): CacheEntry | null {
  try {
    const e = JSON.parse(localStorage.getItem(key) ?? "null") as CacheEntry | null;
    return e && typeof e.t === "number" && e.analysis && e.jobs && e.plan ? e : null;
  } catch {
    return null;
  }
}

export function getCached(hash: string): CacheEntry | null {
  try {
    const e = read(PREFIX + hash);
    if (e) localStorage.setItem(PREFIX + hash, JSON.stringify({ ...e, t: Date.now() })); // LRU touch
    return e;
  } catch {
    return null;
  }
}

export function putCached(hash: string, entry: Omit<CacheEntry, "t">): void {
  try {
    localStorage.setItem(PREFIX + hash, JSON.stringify({ ...entry, t: Date.now() }));
    const all = keys().map((k) => ({ k, t: read(k)?.t ?? 0 })).sort((a, b) => a.t - b.t);
    for (const { k } of all.slice(0, Math.max(0, all.length - MAX_ENTRIES))) localStorage.removeItem(k);
  } catch {
    /* quota / disabled storage: caching is best-effort */
  }
}
