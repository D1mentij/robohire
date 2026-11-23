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
import { buildJobScenario } from "../lib/ai/shiftFallback";
import { buildPlan } from "../lib/roi/roi";
import { OllamaUnavailableError, parseModelJson, provider, providerName, isUnavailableMessage } from "../lib/ai/provider";
import { parseShowcase } from "../lib/ai/showcase";
import { readShowcasesFromDisk } from "../lib/ai/showcaseDisk";
import { ANALYSIS_SCHEMA, buildAnalysisPrompt } from "../lib/ai/prompts";
import { detectBusiness } from "../lib/ai/businessTemplates";
import { parseZonesAnswer, tasksFromZones, validateZonesAnalysis } from "../lib/ai/zoneTasks";
import { filterValidSteps, isJobsResult, isRobotPlan, type Scene } from "../types/contracts";

const zoneIds = mockScene.zones.map((z) => z.id);

// ---- JSON parsing of model output
assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
assert.deepEqual(parseModelJson('Sure! {"a":{"b":2}} done'), { a: { b: 2 } });
assert.throws(() => parseModelJson("nope"));

// ---- heuristic ratings: talking → good, physical → no, mixed → partial
assert.equal(heuristicRating({ id: "a", title: "Greet guests at the entrance", description: "Welcome visitors" }).fit, "good");
assert.equal(heuristicRating({ id: "b", title: "Wipe tables", description: "Clean tables after guests leave" }).fit, "no");
assert.equal(heuristicRating({ id: "c", title: "Guide guests and carry menus", description: "" }).fit, "partial");
{
  const h = demoTasks.map((t) => heuristicRating(t));
  assert.ok(h.some((r) => r.fit !== "no"), "demo tasks: at least one task fits K1 by heuristic");
}

// ---- lenient ratings parse + completion
{
  const ids = new Set(["greeter", "dish"]);
  const parsed = parseRatings(
    [
      { id: "Greeter", fit: "good", why: "talks", limits: "" }, // id mapped, score/limits defaulted
      { id: "dish", fit: "maybe", why: "x" }, // invalid fit → dropped
      { id: "ghost", fit: "no", why: "x" }, // unknown id → dropped
      "junk",
    ],
    ids,
    new Map([["Greeter", "greeter"]]),
  );
  assert.equal(parsed.length, 1);
  assert.deepEqual([parsed[0].id, parsed[0].fit, parsed[0].score], ["greeter", "good", 80]);
  assert.ok(parsed[0].limits.length > 0);
  const tasks = [{ ...demoTasks[0], id: "greeter" }, { ...demoTasks[1], id: "dish", title: "Wash dishes", description: "" }];
  const c = completeRatings(tasks, parsed);
  assert.equal(c.heuristicCount, 1);
  assert.equal(c.ratings.get("dish")?.fit, "no");
}

// ---- validateAnalysis keeps AI ratings (mapped to slugged task ids) and survives missing ratings
{
  const raw = {
    scene: mockScene,
    tasks: [
      { id: "Greet Guests", title: "Greet guests", zone_id: "entrance", description: "d", frequency_per_day: 40, minutes_each: 1 },
      { id: "wipe", title: "Wipe tables", zone_id: "tables", description: "d", frequency_per_day: 10, minutes_each: 5 },
    ],
    ratings: [{ id: "Greet Guests", fit: "good", score: 90, why: "w", limits: "l" }],
  };
  const a = validateAnalysis(raw);
  assert.equal(a.tasks[0].id, "greet_guests");
  assert.deepEqual(a.ratings?.map((r) => [r.id, r.fit, r.score]), [["greet_guests", "good", 90]]);
  assert.equal(validateAnalysis({ ...raw, ratings: undefined }).ratings?.length, 0);
}

// ---- /api/jobs logic: ROI + plan in code, with and without AI ratings
{
  const tasks = demoTasks;
  const none = buildJobs({ tasks, scene: mockScene, businessType: "Café", hoursPerWeek: 60, hourlyCost: 8.5 });
  assert.ok(none.ok && isJobsResult(none.jobs) && isRobotPlan(none.plan));
  assert.equal(none.ok && none.heuristicRatings, tasks.length);
  const ai = buildJobs({
    tasks, scene: mockScene, businessType: "Café", hoursPerWeek: 60, hourlyCost: 8.5,
    ratings: tasks.map((t) => ({ id: t.id, fit: "good" as const, score: 70, why: "w", limits: "l" })),
  });
  assert.ok(ai.ok && ai.heuristicRatings === 0 && ai.jobs.jobs.every((j) => j.fit === "good"));
}

// ---- per-job scenario from templates (no AI)
for (const j of mockJobs.jobs) {
  const s = buildJobScenario(j, mockScene);
  assert.equal(s.job_id, j.id);
  assert.ok(s.steps.length >= 4, `${j.id}: ${s.steps.length} steps`);
  assert.equal(filterValidSteps(s.steps, zoneIds).length, s.steps.length);
  assert.ok(s.steps.every((st) => typeof st.label === "string" && st.label.split(" ").length <= 4));
}

// ---- compact prompt is shorter and still asks for all three parts
{
  const full = buildAnalysisPrompt("Café", false);
  const compact = buildAnalysisPrompt("Café", true);
  assert.ok(compact.length < full.length * 0.7, `${compact.length} vs ${full.length}`);
  for (const p of [full, compact]) assert.ok(/"ratings"/.test(p) && /"tasks"/.test(p) && /"scene"/.test(p));
  assert.ok(ANALYSIS_SCHEMA.required.includes("ratings"));
}

// ---- Ollama provider against a fake server
type Seen = { chat?: Record<string, unknown> };
function fakeOllama(models: string[], reply: unknown, seen: Seen): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.url === "/api/tags") return void res.end(JSON.stringify({ models: models.map((name) => ({ name })) }));
        if (req.url === "/api/chat") {
          seen.chat = JSON.parse(body);
          return void res.end(JSON.stringify({ message: { role: "assistant", content: typeof reply === "string" ? reply : JSON.stringify(reply) } }));
        }
        res.statusCode = 404;
        res.end("{}");
      });
    });
    srv.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(srv.address() as { port: number }).port}`, close: () => srv.close() }));
  });
}
async function main() {
delete process.env.AI_PROVIDER;
assert.equal(providerName(), "ollama", "default provider is ollama");
{
  const seen: Seen = {};
  const srv = await fakeOllama(["qwen3-vl:4b-instruct"], "```json\n{\"ok\":true}\n```", seen);
  process.env.OLLAMA_URL = srv.url;
  delete process.env.OLLAMA_MODEL;
  const frames = Array.from({ length: 8 }, (_, i) => `data:image/jpeg;base64,FRAME${i}`);
  const out = await provider.generateJson("hello", frames, { type: "object" }, { timeoutMs: 5000 });
  assert.deepEqual(out, { ok: true });
  const chat = seen.chat as { model: string; stream: boolean; think: boolean; format: unknown; messages: { content: string; images: string[] }[] };
  assert.equal(chat.model, "qwen3-vl:4b-instruct");
  assert.equal(chat.stream, false);
  assert.equal(chat.think, false);
  assert.deepEqual(chat.format, { type: "object" });
  assert.equal(chat.messages[0].images.length, 4, "max 4 frames");
  assert.deepEqual(chat.messages[0].images, ["FRAME0", "FRAME2", "FRAME5", "FRAME7"], "evenly spread, data-URL prefix stripped");
  srv.close();
}
{
  // only the smaller model is pulled → it is used
  const seen: Seen = {};
  const srv = await fakeOllama(["qwen3-vl:8b-instruct"], { ok: 1 }, seen);
  process.env.OLLAMA_URL = srv.url;
  await provider.generateJson("x", [], undefined, { timeoutMs: 5000 });
  assert.equal((seen.chat as { model: string }).model, "qwen3-vl:8b-instruct");
  assert.equal((seen.chat as { format: unknown }).format, "json");
  srv.close();
}
{
  // nothing pulled → "ollama pull" message
  const srv = await fakeOllama(["llama3:8b"], {}, {});
  process.env.OLLAMA_URL = srv.url;
  await assert.rejects(provider.generateJson("x", [], undefined, { timeoutMs: 5000 }), (e: Error) => e instanceof OllamaUnavailableError && /ollama pull qwen3-vl:4b-instruct/.test(e.message));
  srv.close();
}
{
  // not running → "Start Ollama" + 503 classification
  process.env.OLLAMA_URL = "http://127.0.0.1:9";
  await assert.rejects(provider.generateJson("x", [], undefined, { timeoutMs: 5000 }), (e: Error) => e instanceof OllamaUnavailableError && /Start Ollama/.test(e.message) && isUnavailableMessage(e.message));
}
process.env.AI_PROVIDER = "gemini";
assert.equal(providerName(), "gemini");
delete process.env.AI_PROVIDER;

// ---- showcase
{
  const plan = buildPlan(mockJobs.jobs, demoMeta.hourlyCost, demoMeta.hoursPerWeek);
  const good = { name: "Test café", analysis: { scene: mockScene, tasks: demoTasks, ...demoMeta }, jobs: mockJobs, plan };
  assert.equal(parseShowcase(good)?.name, "Test café");
  assert.equal(parseShowcase({ ...good, name: "" }), null);
  assert.equal(parseShowcase({ ...good, plan: {} }), null);
  const dir = await mkdtemp(path.join(os.tmpdir(), "showcase-"));
  await writeFile(path.join(dir, "a.json"), JSON.stringify(good));
  await writeFile(path.join(dir, "bad.json"), "{nope");
  await writeFile(path.join(dir, "empty.json"), "{}");
  const list = await readShowcasesFromDisk(dir);
  assert.deepEqual(list.map((s) => s.name), ["Test café"]);
  assert.deepEqual(await readShowcasesFromDisk(path.join(dir, "missing")), []);
}
// ---- local zones-only flow: tasks + ratings come from code
{
  const raw = {
    room: { width: 8, depth: 6 },
    zones: [
      { label: "Front door", type: "entrance", x: 1, z: 0.8, w: 1.5, d: 1.2 },
      { label: "Coffee bar", type: "counter", x: 6, z: 1, w: 2.5, d: 1.2 },
      { label: "Tables", type: "seating", x: 4, z: 4, w: 5, d: 3 },
      { label: "Menu board", type: "bogus", x: 7, z: 3, w: 1, d: 1 }, // unknown type → inferred from label (display)
    ],
    activities: ["barista makes coffee", "robot charging dock"],
  };
  const a = validateZonesAnalysis(raw, 60, cleanScene);
  assert.ok(a.scene.zones.length >= 3);
  assert.ok(a.tasks.length >= 4 && a.tasks.length <= 7, `tasks ${a.tasks.length}`);
  const rs = a.ratings ?? [];
  assert.equal(rs.length, a.tasks.length);
  assert.ok(rs.filter((r) => r.fit !== "no").length >= 2);
  assert.ok(rs.some((r) => r.fit === "no"));
  assert.ok(a.tasks.every((t) => a.scene.zones.some((z) => z.id === t.zone_id)));
  assert.ok(!a.tasks.some((t) => /robot/i.test(t.title)));
  assert.equal(buildJobs({ tasks: a.tasks, scene: a.scene, businessType: "Café", hoursPerWeek: 60, hourlyCost: 9, ratings: rs }).ok, true);
  // hours scale frequencies
  const lo = tasksFromZones(a.scene, [], 20).tasks[0].frequency_per_day;
  const hi = tasksFromZones(a.scene, [], 100).tasks[0].frequency_per_day;
  assert.ok(hi > lo);
  // one useless zone still yields a usable task list
  const one = tasksFromZones({ room: { width: 4, depth: 4 }, zones: [{ id: "other", label: "Room", x: 2, z: 2, w: 3, d: 3 }] }, [], 60);
  assert.ok(one.tasks.length >= 1 && one.ratings.some((r) => r.fit !== "no"));
  assert.throws(() => parseZonesAnswer({ room: { width: 4, depth: 4 }, zones: [] }));
}
// ---- business-type templates: tasks fit the business, mention the real zone label
{
  const labels: Record<string, string> = { entrance: "Main door", counter: "Front counter", seating: "Lounge seats", display: "Info board", waiting: "Waiting nook", shelves: "Book racks", desk: "Help desk", corridor: "Long corridor" };
  const types = Object.keys(labels);
  const mk = (): Scene => ({
    room: { width: 20, depth: 20 },
    zones: types.map((t, i) => ({ id: t, label: labels[t], x: 2 + (i % 4) * 4.5, z: 3 + Math.floor(i / 4) * 8, w: 3, d: 3 })),
  });
  const CAFE_ONLY = /menu|barista|orders|wipe tables|free table|specials|coffee/i;
  const kinds: [string[], string, RegExp?][] = [
    [["Hotel lobby", "Boutique hotel", "viesnīca", "Viesnīca Rīgā", "отель", "Гостиница"], "hotel"],
    [["Car showroom", "Auto salons", "Mazda dealership", "автосалон", "autosalons"], "showroom"],
    [["Public library", "bibliotēka", "библиотека"], "library"],
    [["Small café", "Coffee shop", "restaurant", "kafejnīca", "кафе", "ресторан"], "cafe"],
    [["Retail shop", "Clothing store", "veikals", "магазин"], "retail"],
    [["Office reception", "Dental clinic", "birojs", "офис"], "office"],
    [["University lobby", "Riga Technical University", "universitāte", "университет"], "university"],
    [["", "Something else", "Other"], "generic"],
  ];
  for (const [names, kind] of kinds) {
    for (const n of names) assert.equal(detectBusiness(n), kind, `${n} → ${detectBusiness(n)}`);
    const { tasks, ratings } = tasksFromZones(mk(), [], 60, names[0]);
    assert.ok(tasks.length >= 4 && tasks.length <= 7, `${kind}: ${tasks.length} tasks`);
    assert.ok(ratings.filter((r) => r.fit !== "no").length >= 2, `${kind}: suitable tasks`);
    assert.ok(ratings.some((r) => r.fit === "no"), `${kind}: has a physical task K1 cannot do`);
    for (const t of tasks) {
      assert.ok(Object.values(labels).some((l) => t.title.includes(l)), `${kind}: title "${t.title}" has no zone label`);
      if (kind === "hotel" || kind === "showroom" || kind === "library") assert.ok(!CAFE_ONLY.test(t.title), `${kind}: café task "${t.title}"`);
    }
    const ids = new Set(tasks.map((t) => t.id));
    assert.equal(ids.size, tasks.length);
  }
  const titles = (b: string) => tasksFromZones(mk(), [], 60, b).tasks.map((t) => t.title).join(" | ");
  assert.match(titles("Hotel"), /luggage/i);
  assert.match(titles("Hotel"), /breakfast and amenities/i);
  assert.match(titles("Car showroom"), /test-drive/i);
  assert.match(titles("Library"), /self-service return/i);
  assert.match(titles("Library"), /Reshelve|quiet hours/i);
  // a kind with a missing zone type falls back to generic templates (no crash, still labelled)
  const only = tasksFromZones({ room: { width: 6, depth: 6 }, zones: [{ id: "other", label: "Bay", x: 3, z: 3, w: 2, d: 2 }] }, [], 60, "Library");
  assert.ok(only.tasks.length >= 1 && only.tasks.every((t) => t.title.includes("Bay") || t.zone_id));
}
console.log("test:ai OK");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
