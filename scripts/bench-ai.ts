/**
 * Measures the REAL AI path: latency per call and whether the output passes our validation.
 *   npx tsx scripts/bench-ai.ts <video.mp4 | folder-with-jpgs> [businessType] [runs]
 * Needs ffmpeg for videos. Provider/model come from the usual env (AI_PROVIDER, OLLAMA_MODEL, ... in .env.local).
 * Prints a table; exit code 1 if any run failed validation.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildJobs } from "../lib/ai/jobs";
import { analyze } from "../lib/ai/analyze";
import { generateShift } from "../lib/ai/shift";
import { providerName, warmUpOllama } from "../lib/ai/provider";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local */
  }
}

function frames(input: string): string[] {
  let dir = input;
  if (!statSync(input).isDirectory()) {
    dir = mkdtempSync(path.join(os.tmpdir(), "bench-frames-"));
    // 8 evenly spaced frames, max 768 px wide (same as the browser extraction)
    const n = Number(process.env.BENCH_FRAMES) || 8; // frames extracted from the video (the model then gets at most OLLAMA_MAX_FRAMES)
    const size = Number(process.env.BENCH_SIZE) || 768; // longest side in px
    const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", input]).toString().trim()) || 20;
    execFileSync("ffmpeg", ["-v", "error", "-i", input, "-vf", `fps=${n}/${dur},scale='if(gt(iw,ih),${size},-2)':'if(gt(iw,ih),-2,${size})'`, "-frames:v", String(n), "-q:v", "4", path.join(dir, "f%02d.jpg")]);
    if (process.env.BENCH_KEEP_FRAMES) console.log("frames in", dir);
  }
  const files = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort();
  if (!files.length) throw new Error("no jpg frames found");
  return files.map((f) => `data:image/jpeg;base64,${readFileSync(path.join(dir, f)).toString("base64")}`);
}

async function main() {
  loadEnvLocal();
  const [input, businessType = "Small café", runsArg] = process.argv.slice(2);
  if (!input) {
    console.error("usage: npx tsx scripts/bench-ai.ts <video | frames-folder> [businessType] [runs]");
    process.exit(2);
  }
  const runs = Math.max(1, Number(runsArg) || 2);
  const fr = frames(input);
  console.log(`provider=${providerName()} model=${process.env.OLLAMA_MODEL ?? "(default)"} frames=${fr.length} (${Math.round(fr.join("").length / 1024)} KB)\n`);
  let failed = 0;
  if (process.env.BENCH_WARMUP) console.log("warm-up:", JSON.stringify(await warmUpOllama()));
  const maxSec = Number(process.env.BENCH_MAX_SECONDS) || 0;
  console.log("run | analyze(+ratings) | valid | zones | tasks | AI ratings | shift(AI) | shift source");
  for (let i = 1; i <= runs; i++) {
    const t0 = Date.now();
    const a = await analyze({ businessType, hoursPerWeek: 60, hourlyCost: 8.5, frames: fr });
    const tA = ((Date.now() - t0) / 1000).toFixed(1);
    if (maxSec && Number(tA) > maxSec) { failed++; console.log(`${i} | ${tA}s | TOO SLOW (limit ${maxSec}s)`); continue; }
    if (!a.ok) {
      failed++;
      console.log(`${i} | ${tA}s | FAIL: ${a.error}`);
      continue;
    }
    const { scene, tasks, ratings = [] } = a.result;
    const jobs = buildJobs({ tasks, scene, businessType, hoursPerWeek: 60, hourlyCost: 8.5, ratings });
    const t1 = Date.now();
    const shift = jobs.ok && !process.env.BENCH_SKIP_SHIFT ? await generateShift(jobs.plan, jobs.jobs.jobs, scene, businessType) : null;
    const tS = ((Date.now() - t1) / 1000).toFixed(1);
    if (!jobs.ok) failed++;
    console.log(`${i} | ${tA}s | ${jobs.ok ? "ok" : "FAIL"} | ${scene.zones.length} | ${tasks.length} | ${ratings.length}/${tasks.length} | ${tS}s | ${shift?.source ?? "-"} (${shift?.scenario.steps.length ?? 0} steps) | family=${a.result.family}`);
    if (process.env.BENCH_SAVE && i === runs) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(process.env.BENCH_SAVE, JSON.stringify({ name: process.env.BENCH_NAME ?? "Real room test", analysis: { ...a.result, businessType, hoursPerWeek: 60, hourlyCost: 8.5 }, jobs: jobs.ok ? jobs.jobs : null, plan: jobs.ok ? jobs.plan : null }, null, 2));
    }
    if (i === runs) console.log("\nfamily:", a.result.family, a.result.familyDetected ? "(auto-detected)" : "", "\nzones:", scene.zones.map((z) => `${z.label} ${z.w}x${z.d}`).join(", "), "\ntasks:", tasks.map((t) => t.title).join(" | "));
  }
  process.exit(failed ? 1 : 0);
}
main();
