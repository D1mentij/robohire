#!/usr/bin/env node
/** npm run demo:check — doctor → e2e (demo mode) → one real local analyze with timing. One verdict. */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { runDoctor } from "./doctor.mjs";

const root = process.cwd();
const steps = [];
const run = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit", cwd: root, shell: process.platform === "win32" }).status === 0;

// 1 doctor (port 3000 does not matter for the checks below, which use other ports/no server)
steps.push(["doctor", await runDoctor()]);
// 2 e2e in demo mode
console.log("\n— e2e (demo mode) —");
steps.push(["e2e (demo mode)", run("npx", ["playwright", "test"])]);
// 3 real analyze on a frame set
console.log("\n— one real local analyze —");
let input = null;
const tv = path.join(root, "test-videos");
if (existsSync(tv)) {
  const f = readdirSync(tv).find((x) => /\.(mp4|mov|webm|m4v)$/i.test(x));
  if (f) input = path.join(tv, f);
}
let warning = "";
if (!input) {
  // test videos are gitignored (never committed), so a fresh backup laptop has none: not a failure, but say so
  warning = "real analyze SKIPPED: no test-videos/*.mp4 on this laptop (copy one in to test the real AI path)";
  console.log(warning);
} else {
  const env = { ...process.env, BENCH_FRAMES: "4", BENCH_SIZE: "512", BENCH_SKIP_SHIFT: "1", BENCH_WARMUP: "1", BENCH_MAX_SECONDS: "60" };
  const ok = spawnSync("npx", ["tsx", "scripts/bench-ai.ts", input, "Small café", "1"], { stdio: "inherit", cwd: root, env, shell: process.platform === "win32" }).status === 0;
  steps.push(["real analyze (valid, < 60 s after warm-up)", ok]);
}
console.log("\nSummary");
for (const [n, ok] of steps) console.log(`  ${ok ? "✔" : "✘"} ${n}`);
const ready = steps.every(([, ok]) => ok);
if (warning) console.log(`  ! ${warning}`);
console.log(ready ? "\nREADY ✔" : "\nNOT READY ✘");
process.exit(ready ? 0 : 1);
