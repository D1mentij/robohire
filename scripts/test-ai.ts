import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mockJobs, mockScene } from "../mocks";
import { demoTasks, demoMeta } from "../lib/ai/demoData";
import { cleanScene, validateAnalysis } from "../lib/ai/analyze";
import { buildJobs } from "../lib/ai/jobs";
import { completeRatings, heuristicRating, parseRatings } from "../lib/ai/ratings";
import { buildPlan } from "../lib/roi/roi";
import {
  OllamaUnavailableError,
  parseModelJson,
  provider,
  providerName,
  isUnavailableMessage,
} from "../lib/ai/provider";
import { parseShowcase } from "../lib/ai/showcase";
import { readShowcasesFromDisk } from "../lib/ai/showcaseDisk";
import { ANALYSIS_SCHEMA, buildAnalysisPrompt } from "../lib/ai/prompts";
import { detectBusiness, inferFromHints } from "../lib/ai/businessTemplates";
import { BUSINESS_PRESETS, AUTO_DETECT_ID, findPreset } from "../lib/ai/businessPresets";
import { BUSINESS_DEFAULTS } from "../lib/roi/businessDefaults";
import { FAMILY_OPTIONS, FAMILIES, parseFamily } from "../lib/ai/families";
import { buildDemoData } from "../lib/ai/demo";
import { fixLayout, hasOverlap } from "../lib/ai/layout";
import {
  rebuildForFamily,
  tasksFromZones,
  validateZonesAnalysis,
  buildZonesPrompt,
} from "../lib/ai/zoneTasks";
import { isJobsResult, isRobotPlan, type Scene } from "../types/contracts";

// 1. JSON parsing of model output
assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
assert.deepEqual(parseModelJson('Sure! {"a":{"b":2}} done'), { a: { b: 2 } });
assert.throws(() => parseModelJson("nope"));

// 2. Fleet heuristic ratings
assert.equal(
  heuristicRating({ id: "a", title: "Greet guests at the entrance", description: "Welcome visitors" }).fit,
  "good",
);
assert.equal(
  heuristicRating({ id: "b", title: "Pull espresso shots", description: "Manual barista work" }).fit,
  "no",
);

// 3. Ratings parse + completion
{
  const ids = new Set(["greeter", "barista"]);
  const parsed = parseRatings(
    [
      { id: "Greeter", fit: "good", why: "screen", limits: "" },
      { id: "barista", fit: "maybe", why: "x" },
    ],
    ids,
    new Map([["Greeter", "greeter"]]),
  );
  assert.equal(parsed.length, 1);
  const tasks = [
    { ...demoTasks[0], id: "greeter" },
    { ...demoTasks[4], id: "barista" },
  ];
  const c = completeRatings(tasks, parsed);
  assert.equal(c.heuristicCount, 1);
}

// 4. /api/jobs builds 15-robot commercial catalog evaluation
{
  const out = buildJobs({
    tasks: demoTasks,
    scene: mockScene,
    businessType: "Tight Café / Bistro (Narrow Aisles ~55 cm)",
    hoursPerWeek: 56,
    hourlyCost: 9.24,
  });
  assert.ok(out.ok && isJobsResult(out.jobs) && isRobotPlan(out.plan));
  assert.equal(out.jobs.jobs.length, 15, "buildJobs returns all 15 commercial robots");
}

// 5. Prompts check spatial cues without legacy Booster K1 mentions
{
  const full = buildAnalysisPrompt("Warehouse / Distribution Center", false);
  const compact = buildAnalysisPrompt("Tight Café / Bistro (Narrow Aisles ~55 cm)", true);
  assert.ok(!/Booster K1/i.test(full) && !/Booster K1/i.test(compact));
  assert.match(full, /MiR250|Keenon T8/);
  assert.ok(ANALYSIS_SCHEMA.required.includes("ratings"));
}

// 6. Business detection incl. warehouse & factory
assert.equal(detectBusiness("Warehouse / Distribution Center"), "warehouse");
assert.equal(detectBusiness("3PL Logistics Noliktava"), "warehouse");
assert.equal(detectBusiness("Factory / Manufacturing Floor"), "factory");
assert.equal(detectBusiness("Tight Café / Bistro (Narrow Aisles ~55 cm)"), "cafe");
assert.equal(detectBusiness("Shopping Mall / Airport (Large 24/7)"), "mall");
assert.equal(inferFromHints(["pallet racks and loading dock"]), "warehouse");

// 7. Presets & Latvia 2026 VSAOI captions
{
  assert.equal(BUSINESS_PRESETS.length, 9);
  for (const p of BUSINESS_PRESETS) {
    const d = BUSINESS_DEFAULTS[p.id];
    assert.ok(d, `${p.id} defaults exist`);
    assert.equal(p.defaultHoursPerWeek, d.hoursPerWeek);
    assert.equal(p.defaultHourlyCost, d.hourlyCost);
    assert.match(p.costHelper, /Latvia 2026.*23\.59% VSAOI/);
    assert.equal(hasOverlap(p.demoScene.zones), false, `${p.id} demoScene overlap`);
    assert.ok(FAMILIES.includes(p.family));

    const demo = buildDemoData({
      businessType: p.label,
      hoursPerWeek: p.defaultHoursPerWeek,
      hourlyCost: p.defaultHourlyCost,
    });
    assert.equal(demo.jobs.jobs.length, 15);
    assert.ok(isJobsResult(demo.jobs) && isRobotPlan(demo.plan));
  }
  assert.equal(findPreset("warehouse")?.family, "warehouse");
  assert.equal(findPreset("narrow_cafe")?.defaultHourlyCost, 9.24);
}

// 8. Auto-detect & family rebuild
{
  assert.equal(parseFamily("warehouse"), "warehouse");
  assert.equal(parseFamily("factory"), "factory");
  const raw = {
    room: { width: 16, depth: 11 },
    zones: [
      { label: "Inbound dock", type: "entrance", x: 2, z: 5, w: 2, d: 3 },
      { label: "Pallet racks", type: "shelves", x: 7, z: 2, w: 4, d: 2 },
      { label: "AMR lane", type: "corridor", x: 8, z: 6, w: 4, d: 2 },
      { label: "Packing desk", type: "desk", x: 13, z: 8, w: 3, d: 2 },
    ],
    activities: ["workers move pallets"],
    business_guess: "warehouse",
  };
  const a = validateZonesAnalysis(raw, 112, cleanScene, AUTO_DETECT_ID);
  assert.equal(a.family, "warehouse");
  assert.equal(a.familyDetected, true);
  const fixed = rebuildForFamily(a, "hotel", 168);
  assert.equal(fixed.family, "hotel");
  assert.match(buildZonesPrompt(AUTO_DETECT_ID), /business_guess/);

  const poor: Scene = {
    room: { width: 8, depth: 6 },
    zones: [{ id: "other", label: "Hall", x: 4, z: 3, w: 3, d: 3 }],
  };
  for (const { family } of FAMILY_OPTIONS) {
    const lay = fixLayout(poor, family);
    const full = tasksFromZones(lay, [], 60, "", family);
    assert.ok(full.tasks.length >= 4, `${family} tasks`);
  }
}

// 9. Ollama provider test (qwen3-vl:8b-instruct primary, 4b fallback)
type Seen = { chat?: Record<string, unknown> };
function fakeOllama(
  models: string[],
  reply: unknown,
  seen: Seen,
): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.url === "/api/tags")
          return void res.end(
            JSON.stringify({ models: models.map((name) => ({ name })) }),
          );
        if (req.url === "/api/chat") {
          seen.chat = JSON.parse(body);
          return void res.end(
            JSON.stringify({
              message: {
                role: "assistant",
                content:
                  typeof reply === "string" ? reply : JSON.stringify(reply),
              },
            }),
          );
        }
        res.statusCode = 404;
        res.end("{}");
      });
    });
    srv.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${(srv.address() as { port: number }).port}`,
        close: () => srv.close(),
      }),
    );
  });
}

async function main() {
  delete process.env.AI_PROVIDER;
  assert.equal(providerName(), "ollama");
  {
    const seen: Seen = {};
    const srv = await fakeOllama(
      ["qwen3-vl:8b-instruct"],
      '```json\n{"ok":true}\n```',
      seen,
    );
    process.env.OLLAMA_URL = srv.url;
    delete process.env.OLLAMA_MODEL;
    const frames = Array.from(
      { length: 8 },
      (_, i) => `data:image/jpeg;base64,FRAME${i}`,
    );
    const out = await provider.generateJson(
      "hello",
      frames,
      { type: "object" },
      { timeoutMs: 5000 },
    );
    assert.deepEqual(out, { ok: true });
    assert.equal((seen.chat as { model: string }).model, "qwen3-vl:8b-instruct");
    srv.close();
  }
  {
    const seen: Seen = {};
    const srv = await fakeOllama(["qwen3-vl:4b-instruct"], { ok: 1 }, seen);
    process.env.OLLAMA_URL = srv.url;
    await provider.generateJson("x", [], undefined, { timeoutMs: 5000 });
    assert.equal((seen.chat as { model: string }).model, "qwen3-vl:4b-instruct");
    srv.close();
  }
  {
    const srv = await fakeOllama(["llama3:8b"], {}, {});
    process.env.OLLAMA_URL = srv.url;
    await assert.rejects(
      provider.generateJson("x", [], undefined, { timeoutMs: 5000 }),
      (e: Error) =>
        e instanceof OllamaUnavailableError &&
        /ollama pull qwen3-vl:8b-instruct/.test(e.message),
    );
    srv.close();
  }
  {
    process.env.OLLAMA_URL = "http://127.0.0.1:9";
    await assert.rejects(
      provider.generateJson("x", [], undefined, { timeoutMs: 5000 }),
      (e: Error) =>
        e instanceof OllamaUnavailableError &&
        /Start Ollama/.test(e.message) &&
        isUnavailableMessage(e.message),
    );
  }

  // 10. Showcase disk loader
  {
    const plan = buildPlan(mockJobs.jobs, demoMeta.hourlyCost, demoMeta.hoursPerWeek);
    const good = {
      name: "Test café",
      analysis: { scene: mockScene, tasks: demoTasks, ...demoMeta },
      jobs: mockJobs,
      plan,
    };
    assert.equal(parseShowcase(good)?.name, "Test café");
    const dir = await mkdtemp(path.join(os.tmpdir(), "showcase-"));
    await writeFile(path.join(dir, "a.json"), JSON.stringify(good));
    const list = await readShowcasesFromDisk(dir);
    assert.deepEqual(
      list.map((s) => s.name),
      ["Test café"],
    );
    const repoShowcases = await readShowcasesFromDisk();
    assert.ok(repoShowcases.length >= 2, "Built-in showcases pass validation");
  }

  // validateAnalysis check
  {
    const raw = {
      scene: mockScene,
      tasks: [
        {
          id: "Greet Guests",
          title: "Greet guests",
          zone_id: "entrance",
          description: "d",
          frequency_per_day: 40,
          minutes_each: 1,
        },
      ],
      ratings: [{ id: "Greet Guests", fit: "good", score: 90, why: "w", limits: "l" }],
    };
    const a = validateAnalysis(raw);
    assert.equal(a.tasks[0].id, "greet_guests");
  }

  console.log("test:ai OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
