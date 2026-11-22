import { NextResponse } from "next/server";
import { generateScenario } from "@/lib/ai/scenario";
import { isJob, isScene } from "@/types/contracts";

export const maxDuration = 60;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
    if (typeof b !== "object" || b === null) throw new Error();
  } catch {
    return fail("Invalid JSON body.", 400);
  }
  if (!isJob(b.job)) return fail("Invalid job.", 400);
  if (!isScene(b.scene) || b.scene.zones.length === 0) return fail("Invalid scene.", 400);
  const businessType = typeof b.businessType === "string" ? b.businessType.slice(0, 100) : null;

  const out = await generateScenario(b.job, b.scene, businessType);
  if (!out.ok) return fail(out.error, out.error.includes("GEMINI_API_KEY") ? 503 : 502);
  return NextResponse.json({ scenario: out.scenario });
}
