import { NextResponse } from "next/server";
import { rateJobs, type JobsInput } from "@/lib/ai/jobs";
import { isScene, type JobsResult, type RobotPlan } from "@/types/contracts";

export const maxDuration = 60;

type Resp = { ok: true; jobs: JobsResult; plan: RobotPlan } | { ok: false; error: string };
const fail = (error: string, status: number) => NextResponse.json<Resp>({ ok: false, error }, { status });

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
    if (typeof b !== "object" || b === null) throw new Error();
  } catch {
    return fail("Invalid JSON body.", 400);
  }
  if (typeof b.businessType !== "string" || !b.businessType.trim() || b.businessType.length > 100)
    return fail("businessType is required.", 400);
  if (!isScene(b.scene)) return fail("Invalid scene.", 400);
  if (!num(b.hoursPerWeek) || b.hoursPerWeek <= 0 || b.hoursPerWeek > 168) return fail("Invalid hoursPerWeek.", 400);
  if (!num(b.hourlyCost) || b.hourlyCost <= 0 || b.hourlyCost > 1000) return fail("Invalid hourlyCost.", 400);
  if (!Array.isArray(b.tasks) || b.tasks.length < 1 || b.tasks.length > 20) return fail("Send 1–20 tasks.", 400);
  const zoneIds = new Set(b.scene.zones.map((z) => z.id));
  const ids = new Set<string>();
  const tasks: JobsInput["tasks"] = [];
  for (const t of b.tasks as Record<string, unknown>[]) {
    if (
      typeof t !== "object" || t === null ||
      typeof t.id !== "string" || typeof t.title !== "string" || typeof t.description !== "string" ||
      typeof t.zone_id !== "string" || !zoneIds.has(t.zone_id) ||
      !num(t.frequency_per_day) || t.frequency_per_day < 0 || t.frequency_per_day > 1000 ||
      !num(t.minutes_each) || t.minutes_each < 0 || t.minutes_each > 600 || ids.has(t.id)
    )
      return fail("Invalid task list.", 400);
    ids.add(t.id);
    tasks.push({ id: t.id, title: t.title, zone_id: t.zone_id, description: t.description, frequency_per_day: t.frequency_per_day, minutes_each: t.minutes_each });
  }
  const out = await rateJobs({ tasks, scene: b.scene, businessType: b.businessType.trim(), hoursPerWeek: b.hoursPerWeek, hourlyCost: b.hourlyCost });
  if (!out.ok) return fail(out.error, out.error.includes("GEMINI_API_KEY") ? 503 : 502);
  return NextResponse.json<Resp>(out);
}
