import { NextResponse } from "next/server";
import { readShowcasesFromDisk } from "@/lib/ai/showcaseDisk";

/** GET → { showcases: Showcase[] } from lib/ai/showcase/*.json (no AI). */
export async function GET() {
  return NextResponse.json({ showcases: await readShowcasesFromDisk() });
}
