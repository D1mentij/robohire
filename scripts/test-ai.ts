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
import { detectBusiness, inferFromHints } from "../lib/ai/businessTemplates";
import { BUSINESS_PRESETS, AUTO_DETECT_ID, findPreset } from "../lib/ai/businessPresets";
import { BUSINESS_DEFAULTS, costCaption } from "../lib/roi/businessDefaults";
import { FAMILY_OPTIONS, FAMILIES, parseFamily, zonesHintFor } from "../lib/ai/families";
import { buildDemoData } from "../lib/ai/demo";
import { fixLayout, gridLayout, hasOverlap, isBareLabel, isCollinear, relabelZones } from "../lib/ai/layout";
import { parseZonesAnswer, rebuildForFamily, tasksFromZones, validateZonesAnalysis, buildZonesPrompt, ZONES_SCHEMA } from "../lib/ai/zoneTasks";
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
    [["Small café", "Coffee shop", "kafejnīca", "кафе"], "cafe"],
    [["Restaurant", "Bistro", "restorāns", "ресторан"], "restaurant"],
    [["Cocktail bar", "Bar / Lounge", "Pub"], "bar"],
    [["Supermarket", "Grocery store", "супермаркет"], "supermarket"],
    [["Shopping mall", "Mall atrium", "tirdzniecības centrs"], "mall"],
    [["Dental clinic", "Clinic", "klīnika", "клиника"], "clinic"],
    [["Gym", "Fitness club", "фитнес"], "gym"],
    [["Museum", "Art gallery", "музей"], "museum"],
    [["Airport", "Train terminal", "вокзал"], "terminal"],
    [["Conference venue", "Expo hall"], "event"],
    [["Retail shop", "Clothing store", "veikals", "магазин"], "retail"],
    [["Office reception", "Coworking", "birojs", "офис"], "office"],
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
// ---- detection synonyms + inference from what the model saw
{
  for (const n of ["Autodealer", "auto dealer", "Car dealer", "car salon", "Auto salon", "Showroom", "dīleris", "autosalons", "автодилер", "автосалон", "дилер", "Mazda dealership"]) assert.equal(detectBusiness(n), "showroom", n);
  assert.equal(detectBusiness("hair salon"), "generic"); // "salon" alone is not a car salon
  assert.equal(detectBusiness("Kaut kas", ["parked cars on display", "customer talks to salesperson"]), "showroom");
  assert.equal(detectBusiness("", ["barista makes coffee"]), "cafe");
  assert.equal(detectBusiness("???", ["guest at reception", "luggage cart"]), "hotel");
  assert.equal(detectBusiness("???", ["people walking"]), "generic");
  assert.equal(inferFromHints(["Reader browsing books"]), "library");
}

// ---- human labels, uniqueness, bare detection
{
  assert.equal(isBareLabel("Seating area", "seating"), true);
  assert.equal(isBareLabel("Main seating zone with tables and bench", "seating"), true);
  assert.equal(isBareLabel("elevator corridor", "corridor"), false);
  assert.equal(isBareLabel("Wooden service counter", "counter"), false);
  assert.equal(isBareLabel("entrance", "entrance"), true);
  const z = (id: string, label: string, x: number) => ({ id, label, x, z: 3, w: 2, d: 2 });
  const rl = relabelZones({ room: { width: 14, depth: 9 }, zones: [z("display", "display", 2), z("display_2", "Display area", 5), z("seating", "sofa", 8), z("counter", "Reception counter", 11)] }, "showroom");
  assert.deepEqual(rl.zones.map((q) => q.label), ["Car display", "Car display 2", "Customer lounge", "Reception counter"]);
  assert.equal(new Set(relabelZones({ room: { width: 8, depth: 6 }, zones: [z("other", "x", 2), z("other_2", "y", 5)] }, "cafe").zones.map((q) => q.label)).size, 2);
}

// ---- rounding: whole numbers shown to users, min 1
{
  const sc: Scene = { room: { width: 12, depth: 9 }, zones: [{ id: "entrance", label: "Entrance", x: 2, z: 2, w: 2, d: 2 }, { id: "display", label: "Car display", x: 6, z: 5, w: 3, d: 2 }] };
  for (const hrs of [7, 33, 60, 111]) {
    const { tasks } = tasksFromZones(sc, ["customers browse"], hrs, "Car dealer");
    for (const t of tasks) {
      assert.ok(Number.isInteger(t.frequency_per_day) && t.frequency_per_day >= 1, `${t.title} freq ${t.frequency_per_day}`);
      assert.ok(Number.isInteger(t.minutes_each) && t.minutes_each >= 1, `${t.title} min ${t.minutes_each}`);
    }
  }
  const g = validateAnalysis({ scene: mockScene, tasks: [{ id: "a", title: "Greet", zone_id: mockScene.zones[0].id, description: "d", frequency_per_day: 12.6, minutes_each: 0.4 }] });
  assert.deepEqual([g.tasks[0].frequency_per_day, g.tasks[0].minutes_each], [13, 1]);
}

// ---- layout sanity
{
  // tiny room, one zone, no entrance → bigger room, entrance added, ≥ 4 zones, no overlap
  const tiny = fixLayout({ room: { width: 4, depth: 4 }, zones: [{ id: "display", label: "Car display", x: 2, z: 2, w: 2, d: 2 }] }, "showroom");
  assert.ok(tiny.room.width >= 12 && tiny.room.depth >= 9);
  assert.ok(tiny.zones.length >= 4);
  assert.ok(tiny.zones.some((q) => q.id.startsWith("entrance")));
  assert.equal(hasOverlap(tiny.zones), false);
  assert.equal(new Set(tiny.zones.map((q) => q.label)).size, tiny.zones.length);
  for (const q of tiny.zones) {
    assert.ok(q.x - q.w / 2 >= -0.01 && q.x + q.w / 2 <= tiny.room.width + 0.01 && q.z - q.d / 2 >= -0.01 && q.z + q.d / 2 <= tiny.room.depth + 0.01, `${q.id} inside room`);
  }
  // collinear zones are spread
  const line = [0, 1, 2, 3].map((i) => ({ id: ["entrance", "counter", "seating", "display"][i], label: "x", x: 2 + i * 2.5, z: 4, w: 2, d: 1.5 }));
  assert.equal(isCollinear(line), true);
  const spreadOut = fixLayout({ room: { width: 12, depth: 9 }, zones: line }, "cafe");
  assert.equal(isCollinear(spreadOut.zones), false);
  assert.equal(hasOverlap(spreadOut.zones), false);
  // a healthy layout is left untouched; room minimums per business
  const ok: Scene = { room: { width: 12, depth: 9 }, zones: [{ id: "entrance", label: "Entrance", x: 2, z: 7.5, w: 2, d: 1.5 }, { id: "display", label: "Car display", x: 4, z: 2, w: 4, d: 2 }, { id: "seating", label: "Customer lounge", x: 10, z: 2, w: 3, d: 2 }, { id: "counter", label: "Sales desk", x: 9, z: 6.5, w: 3, d: 2 }] };
  assert.deepEqual(fixLayout(ok, "showroom").zones.map((q) => [q.x, q.z]), ok.zones.map((q) => [q.x, q.z]));
  assert.ok(fixLayout({ room: { width: 5, depth: 4 }, zones: ok.zones.map((q) => ({ ...q, x: q.x / 3, w: q.w / 3, z: q.z / 3, d: q.d / 3 })) }, "cafe").room.width >= 8);
  assert.equal(gridLayout({ width: 10, depth: 8 }, line).length, 4);
  // end to end: a weak model answer for a car dealer gives car-showroom labels and tasks
  const weak = { room: { width: 5, depth: 4 }, zones: [{ label: "area", type: "display", x: 2, z: 2, w: 1, d: 1 }, { label: "sofa area", type: "seating", x: 3, z: 2, w: 1, d: 1 }], activities: ["customer looks at a car"] };
  const r = validateZonesAnalysis(weak, 60, cleanScene, "Autodealer");
  assert.ok(r.scene.zones.length >= 4 && r.scene.room.width >= 12);
  assert.ok(r.scene.zones.some((q) => q.label === "Car display"));
  assert.ok(r.tasks.some((t) => /test-drive|offers/i.test(t.title)));
  assert.ok(!r.tasks.some((t) => /menu|barista|wipe tables/i.test(t.title)));
}
// ---- multi-industry presets, auto-detect, and industry-tailored demo fallback
{
  assert.equal(BUSINESS_PRESETS.length, 16);
  assert.equal(detectBusiness(AUTO_DETECT_ID), "generic");
  assert.equal(detectBusiness("Auto-detect from video"), "generic");
  assert.equal(detectBusiness("Auto-detect from video", ["guest at reception", "luggage cart"]), "hotel");
  assert.equal(detectBusiness("Electronics / Showroom"), "retail");
  assert.equal(detectBusiness("Gym / Fitness Club"), "gym");
  assert.equal(detectBusiness("Conference / Expo Venue"), "event");
  assert.equal(detectBusiness("Museum / Gallery"), "museum");
  assert.equal(detectBusiness("Airport / Train Terminal"), "terminal");
  assert.match(buildZonesPrompt(AUTO_DETECT_ID), /Infer the business\/space type/i);
  assert.match(buildZonesPrompt("Retail Clothing / Concept Store"), /fitting rooms/i);
  assert.match(buildAnalysisPrompt("Hotel Lobby / Reception", false), /reception desk/i);
  for (const preset of BUSINESS_PRESETS) {
    assert.equal(hasOverlap(preset.demoScene.zones), false, `${preset.id} demoScene overlap`);
    const d = buildDemoData({ businessType: preset.label, hoursPerWeek: preset.defaultHoursPerWeek, hourlyCost: preset.defaultHourlyCost });
    assert.equal(d.jobs.business_type, preset.label);
    assert.ok(d.jobs.jobs.length >= 4 && isJobsResult(d.jobs) && isRobotPlan(d.plan), `${preset.id} demo jobs/plan`);
  }
  const gymDemo = buildDemoData({ businessType: "Gym / Fitness Club", hoursPerWeek: 98, hourlyCost: 9 });
  assert.ok(gymDemo.jobs.jobs.some((j) => /member|class schedule|studio|check-in/i.test(j.title)));
  assert.ok(!gymDemo.jobs.jobs.some((j) => /coffee|barista|menu/i.test(j.title)));
  const customDemo = buildDemoData({ businessType: "Artisanal Bookstore", hoursPerWeek: 45, hourlyCost: 10 });
  assert.equal(customDemo.jobs.business_type, "Artisanal Bookstore");
  assert.ok(customDemo.jobs.jobs.length >= 4 && customDemo.analysis.hourlyCost === 10 && customDemo.analysis.hoursPerWeek === 45);
  const autoDemo = buildDemoData({ businessType: AUTO_DETECT_ID, hoursPerWeek: 60, hourlyCost: 8.5 });
  assert.match(autoDemo.jobs.business_type, /Auto-detected/i);
  assert.ok(autoDemo.jobs.jobs.length >= 4);
}
// ---- selector presets: family, one defaults table (all assumptions), caption
{
  assert.equal(BUSINESS_PRESETS.length, 16);
  assert.equal(BUSINESS_PRESETS.filter((p) => p.quickPick).length, 6);
  for (const p of BUSINESS_PRESETS) {
    const d = BUSINESS_DEFAULTS[p.id];
    assert.ok(d && d.assumption === true && d.basis, `${p.id} defaults`);
    assert.equal(p.defaultHoursPerWeek, d.hoursPerWeek);
    assert.equal(p.defaultHourlyCost, d.hourlyCost);
    assert.ok(d.hoursPerWeek >= 1 && d.hoursPerWeek <= 168 && d.hourlyCost > 0);
    assert.equal(p.costHelper, costCaption(p.label, d.hourlyCost));
    assert.match(p.costHelper, /Typical estimate for .+ in Latvia ≈ €\d+\.\d\/h incl\. employer tax \(assumption\)/);
    assert.equal(detectBusiness(p.label), p.family, `${p.label} → ${detectBusiness(p.label)}`);
    assert.ok(FAMILIES.includes(p.family));
  }
  assert.equal(findPreset("Hotel lobby / Reception")?.family, "hotel");
  assert.equal(findPreset("Hotel lobby / Reception")?.defaultHourlyCost, 9.5);
  assert.equal(BUSINESS_DEFAULTS.cafe.hourlyCost, 8.5);
  for (const k of Object.values(BUSINESS_DEFAULTS)) assert.equal(k.assumption, true);
}

// ---- Auto-detect: business_guess → family; hints in prompts for Ollama (zones prompt) and Gemini (full prompt)
{
  assert.equal(parseFamily("hotel"), "hotel");
  assert.equal(parseFamily("Hotel lobby / Reception"), "hotel");
  assert.equal(parseFamily("car dealership"), "showroom");
  assert.equal(parseFamily("generic"), null);
  assert.equal(parseFamily("???"), null);
  assert.equal(parseFamily(42), null);
  const raw = (guess?: string) => ({
    room: { width: 10, depth: 8 },
    zones: [
      { label: "Reception desk", type: "counter", x: 5, z: 2, w: 3, d: 1.5 },
      { label: "Lobby lounge", type: "seating", x: 3, z: 6, w: 3, d: 2 },
      { label: "Main door", type: "entrance", x: 1, z: 4, w: 1.5, d: 2 },
      { label: "Elevators", type: "corridor", x: 9, z: 4, w: 1.5, d: 3 },
    ],
    activities: ["people walk"],
    ...(guess ? { business_guess: guess } : {}),
  });
  const a = validateZonesAnalysis(raw("hotel"), 60, cleanScene, "auto-detect");
  assert.equal(a.family, "hotel");
  assert.equal(a.familyDetected, true);
  assert.ok(a.tasks.some((t) => /luggage|elevators|reception|check-in/i.test(t.title)));
  assert.equal(validateZonesAnalysis(raw("showroom"), 60, cleanScene, "Auto-detect from video").family, "showroom");
  // junk guess → inferred from what was seen; no hints → generic; owner's own type is never "detected"
  assert.equal(validateZonesAnalysis(raw("banana"), 60, cleanScene, "auto-detect").family, "hotel"); // "Reception desk"/"Elevators" labels
  const own = validateZonesAnalysis(raw("showroom"), 60, cleanScene, "Gym / Fitness club");
  assert.equal(own.family, "gym");
  assert.equal(own.familyDetected, false);
  // prompts: hint for a family, business_guess only for auto
  assert.match(buildZonesPrompt("Hotel lobby / Reception"), /Expected zones for this industry[^\n]*elevator corridor/);
  assert.match(buildZonesPrompt("viesnīca"), /Expected zones for this industry/); // custom text goes through keyword detection
  assert.doesNotMatch(buildZonesPrompt("Hotel lobby / Reception"), /business_guess/);
  assert.match(buildZonesPrompt("auto-detect"), /business_guess: .*hotel.*showroom/);
  assert.doesNotMatch(buildZonesPrompt("auto-detect"), /Expected zones for this industry/);
  assert.match(buildAnalysisPrompt("Gym / Fitness club"), /Typical spatial zones for this industry include/);
  assert.match(buildAnalysisPrompt("auto-detect"), /business_guess/);
  assert.ok((ZONES_SCHEMA.properties.business_guess as { enum: string[] }).enum.includes("showroom"));
  assert.equal(zonesHintFor("???"), null);
  // correcting the detected family rebuilds labels + tasks for the new family
  const fixed = rebuildForFamily(a, "gym", 60);
  assert.equal(fixed.family, "gym");
  assert.ok(fixed.tasks.every((t) => !/luggage/i.test(t.title)) && fixed.tasks.some((t) => /gym|member|class|studio/i.test(t.title)));
  assert.ok(fixed.scene.zones.some((z) => /Check-in desk|Club entrance/.test(z.label)));
}

// ---- every family yields ≥ 2 K1-doable tasks, even from a poor floor plan, and the demo uses the selected family
{
  const poor: Scene = { room: { width: 8, depth: 6 }, zones: [{ id: "other", label: "Hall", x: 4, z: 3, w: 3, d: 3 }] };
  for (const { family } of FAMILY_OPTIONS) {
    const t = tasksFromZones(poor, [], 60, "", family);
    assert.ok(t.ratings.filter((r) => r.fit !== "no").length >= 2, `${family}: ${t.tasks.map((x) => x.title).join(" | ")}`);
    const lay = fixLayout(poor, family);
    const full = tasksFromZones(lay, [], 60, "", family);
    assert.ok(full.tasks.length >= 4 && full.ratings.filter((r) => r.fit !== "no").length >= 2, `${family} on fixed layout`);
  }
  for (const p of BUSINESS_PRESETS) {
    const d = buildDemoData({ businessType: p.label });
    assert.equal(d.analysis.family, p.family);
    assert.equal(d.analysis.businessType, p.label);
    assert.ok(d.jobs.jobs.filter((j) => j.fit !== "no").length >= 2, `${p.label} demo jobs`);
    assert.equal(d.analysis.hoursPerWeek, p.defaultHoursPerWeek);
  }
  const names = (t: string) => buildDemoData({ businessType: t }).jobs.jobs.map((j) => j.title).join(" | ");
  assert.doesNotMatch(names("Gym / Fitness club"), /menu|barista|wipe tables/i);
  assert.match(names("Hotel lobby / Reception"), /luggage|elevator|reception/i);
  assert.doesNotMatch(names("Clothing / Concept store"), /menu|luggage/i);
  assert.notEqual(names("Gym / Fitness club"), names("Café / Coffee shop"));
  assert.equal(buildDemoData({ businessType: "viesnīca", hoursPerWeek: 50, hourlyCost: 9 }).analysis.family, "hotel"); // custom text → keyword detection
  assert.equal(buildDemoData({ businessType: "auto-detect" }).analysis.family, "generic");
}
console.log("test:ai OK");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
