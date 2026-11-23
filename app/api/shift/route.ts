import { NextResponse } from "next/server";
import { generateShift } from "@/lib/ai/shift";
import { isJob, isRobotPlan, isScene } from "@/types/contracts";

export const maxDuration = 60;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * POST { plan: RobotPlan, jobs: Job[], scene: Scene, businessType? } → { scenario, source: "ai" | "fallback", warning? }
 * scenario.job_id = "shift"; steps carry an optional `label` (job title / "Shift start" / "Shift end").
 * AI failure is not an error: the built-in code routine is returned with source "fallback".
 */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
    if (typeof b !== "object" || b === null) throw new Error();
  } catch {
    return fail("Invalid JSON body.", 400);
  }
  if (!isRobotPlan(b.plan)) return fail("Invalid plan.", 400);
  if (!Array.isArray(b.jobs) || !b.jobs.every(isJob)) return fail("Invalid jobs.", 400);
  if (!isScene(b.scene) || b.scene.zones.length === 0) return fail("Invalid scene.", 400);
  const plan = b.plan;
  if (!plan.job_ids.some((id) => (b.jobs as { id: string }[]).some((j) => j.id === id))) {
    return fail("Plan has no jobs from the jobs list.", 400);
  }
  const businessType = typeof b.businessType === "string" ? b.businessType.slice(0, 100) : null;

  const out = await generateShift(plan, b.jobs, b.scene, businessType);
  if (out.warning) console.warn(`[shift] ${out.warning}`);
  return NextResponse.json(out);
}
