import { NextResponse } from "next/server";
import { generateScenario } from "@/lib/ai/scenario";
import { buildJobScenario } from "@/lib/ai/shiftFallback";
import {
  buildHelperRobotScenario,
  inferRobotType,
  isHelperRobot,
} from "@/lib/robots/catalog";
import { isJob, isScene } from "@/types/contracts";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * POST { job, scene, businessType? } → { scenario, source: "code" | "ai" }.
 * Default: built in CODE from templates (instant, no AI). `?ai=1` asks the AI model; on any AI failure the code
 * scenario is returned instead (source "code"), so this endpoint always answers for a valid job + scene.
 */
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

  const robotType = inferRobotType(b.job);
  if (isHelperRobot(robotType)) {
    return NextResponse.json({
      scenario: buildHelperRobotScenario(robotType, b.job, b.scene),
      source: "code",
    });
  }

  if (new URL(req.url).searchParams.get("ai") === "1") {
    const out = await generateScenario(b.job, b.scene, businessType);
    if (out.ok) return NextResponse.json({ scenario: out.scenario, source: "ai" });
    console.warn(`[scenario] AI failed, using code template: ${out.error}`);
  }
  return NextResponse.json({ scenario: buildJobScenario(b.job, b.scene), source: "code" });
}
