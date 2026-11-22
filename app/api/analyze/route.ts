import { NextResponse } from "next/server";
import { analyze } from "@/lib/ai/analyze";
import type { AnalyzeResponse, UploadData } from "@/lib/ai/types";

export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;
const JPEG_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

function fail(error: string, status: number) {
  return NextResponse.json<AnalyzeResponse>({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES + 4096) return fail("Request too large (max 4 MB of frames).", 413);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body.", 400);
  }
  const b = body as Partial<UploadData> | null;
  if (!b || typeof b !== "object") return fail("Invalid body.", 400);
  if (typeof b.businessType !== "string" || !b.businessType.trim() || b.businessType.length > 100)
    return fail("businessType is required (max 100 chars).", 400);
  if (!Array.isArray(b.frames) || b.frames.length < 1 || b.frames.length > 10)
    return fail("Send 1–10 frames.", 400);
  let total = 0;
  for (const f of b.frames) {
    if (typeof f !== "string" || !JPEG_RE.test(f)) return fail("Frames must be JPEG data URLs.", 400);
    total += f.length;
  }
  if (total >= MAX_BYTES) return fail("Frames too large (max 4 MB total).", 413);

  const data: UploadData = {
    businessType: b.businessType.trim(),
    hoursPerWeek: Number(b.hoursPerWeek) || 0,
    hourlyCost: Number(b.hourlyCost) || 0,
    frames: b.frames,
  };
  const out = await analyze(data);
  if (!out.ok) {
    const status = out.error.includes("GEMINI_API_KEY") ? 503 : 502;
    return fail(out.error, status);
  }
  return NextResponse.json<AnalyzeResponse>(out);
}
