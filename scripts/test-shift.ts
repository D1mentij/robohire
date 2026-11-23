import assert from "node:assert/strict";
import { mockJobs, mockScene } from "../mocks";
import { buildPlan } from "../lib/roi/roi";
import { buildJobScenario, buildShiftFallback, jobLabels, SHIFT_MAX_STEPS, SHIFT_MIN_STEPS, zoneForJob } from "../lib/ai/shiftFallback";
import { cleanShiftSteps } from "../lib/ai/shift";
import { finalizeSteps, shortLabel, shortenSay } from "../lib/ai/labels";
import { filterValidSteps, isScenario, type Scene } from "../types/contracts";

const plan = buildPlan(mockJobs.jobs, 8.5, 60);
const zoneIds = mockScene.zones.map((z) => z.id);

// fallback: valid, job_id "shift", 10–20 steps, intro first, outro last, every plan job present in order
{
  const s = buildShiftFallback(plan, mockJobs.jobs, mockScene, "Small café (Riga)");
  assert.ok(isScenario(s));
  assert.equal(s.job_id, "shift");
  assert.ok(s.steps.length >= 10 && s.steps.length <= SHIFT_MAX_STEPS, `steps ${s.steps.length}`);
  assert.equal(filterValidSteps(s.steps, zoneIds).length, s.steps.length);
  assert.equal(s.steps[0].action, "say");
  assert.match(s.steps[0].text ?? "", /Starting my shift at Small café/);
  assert.equal(s.steps.at(-1)?.action, "say");
  const lm = jobLabels(plan.job_ids.map((id) => mockJobs.jobs.find((j) => j.id === id)!));
  const titles = plan.job_ids.map((id) => lm.get(id)!);
  const order = titles.map((t) => s.steps.findIndex((st) => st.label === t));
  assert.ok(order.every((i) => i > 0), "every plan job has steps");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "plan order kept");
}
// zone heuristics on the café scene
assert.equal(zoneForJob(mockJobs.jobs.find((j) => j.id === "greeter")!, mockScene.zones).zone?.id, "entrance");
assert.equal(zoneForJob(mockJobs.jobs.find((j) => j.id === "menu_presenter")!, mockScene.zones).zone?.id, "menu_board");
assert.equal(zoneForJob(mockJobs.jobs.find((j) => j.id === "table_guide")!, mockScene.zones).zone?.id, "tables");

// many jobs: still capped at 20
{
  const many = Array.from({ length: 8 }, (_, i) => ({ ...mockJobs.jobs[0], id: `j${i}`, title: `Job ${i}` }));
  const s = buildShiftFallback({ ...plan, job_ids: many.map((j) => j.id) }, many, mockScene, null);
  assert.ok(s.steps.length <= SHIFT_MAX_STEPS && s.steps.length >= SHIFT_MIN_STEPS);
}
// unknown plan ids / one-zone scene → still a valid scenario
{
  const one: Scene = { room: { width: 4, depth: 4 }, zones: [{ id: "desk", label: "Desk", x: 2, z: 2, w: 1, d: 1 }] };
  const s = buildShiftFallback({ ...plan, job_ids: ["nope"] }, mockJobs.jobs, one, "Office");
  assert.ok(s.steps.length >= 3 && filterValidSteps(s.steps, ["desk"]).length === s.steps.length);
}
// cleanShiftSteps: job tag → label, unknown zone dropped, nulls dropped, extra fields stripped
{
  const steps = cleanShiftSteps(
    [
      { job: "intro", action: "say", text: "Hi", target: null },
      { job: "greeter", action: "walk_to", target: "entrance", text: "", extra: 1 },
      { job: "greeter", action: "walk_to", target: "kitchen" },
      { job: "???", action: "wave" },
      { job: "outro", action: "say", text: "Bye" },
    ],
    mockJobs.jobs,
    zoneIds,
  );
  assert.deepEqual(steps, [
    { action: "say", label: "Shift start", text: "Hi" },
    { action: "walk_to", label: "Greet guests", target: "entrance" },
    { action: "wave", label: "Greet guests" },
    { action: "say", label: "Shift end", text: "Bye" },
  ]);
}
// ---- labels: short, identical within a task, contiguous groups in execution order, say ≤ 8 words
const wc = (t: string) => t.trim().split(/\s+/).length;
function checkLabels(steps: { action: string; label?: string; text?: string }[], what: string) {
  const seen: string[] = [];
  for (const st of steps) {
    assert.ok(st.label && wc(st.label) <= 4, `${what}: label "${st.label}"`);
    if (seen.at(-1) !== st.label) {
      assert.ok(!seen.includes(st.label!), `${what}: label "${st.label}" is split into two groups`);
      seen.push(st.label!);
    }
    if (st.action === "say") assert.ok(wc(st.text ?? "") <= 8, `${what}: say "${st.text}"`);
  }
  return seen;
}
{
  const groups = checkLabels(buildShiftFallback(plan, mockJobs.jobs, mockScene, "Small café").steps, "shift fallback");
  assert.deepEqual([groups[0], groups.at(-1)], ["Shift start", "Shift end"]);
  assert.ok(groups.length >= 3);
  for (const j of mockJobs.jobs) {
    const g = checkLabels(buildJobScenario(j, mockScene).steps, `job ${j.id}`);
    assert.equal(g.length, 1);
  }
  // two jobs of the same kind get different labels; long titles are shortened
  const twins = [
    { ...mockJobs.jobs[0], id: "a", title: "Greet visitors at the main entrance door" },
    { ...mockJobs.jobs[0], id: "b", title: "Greet visitors at the side door" },
  ];
  const lm = jobLabels(twins);
  assert.notEqual(lm.get("a"), lm.get("b"));
  const g2 = checkLabels(buildShiftFallback({ ...plan, job_ids: ["a", "b"] }, twins, mockScene, null).steps, "twins");
  assert.ok(g2.length >= 4);
  assert.equal(shortLabel("Explain the menu items and daily specials to every customer"), "Explain menu items daily");
  assert.ok(wc(shortLabel("a very long task title that goes on and on")) <= 4);
  assert.equal(shortenSay("Welcome to our lovely café, please take a seat anywhere you like today"), "Welcome to our lovely café, please take.");
  assert.equal(shortenSay("Hi there."), "Hi there.");
  assert.ok(wc(shortenSay("one two three four five six seven eight nine ten")) <= 8);
  // finalizeSteps fills missing labels (from the previous step, else fallback) and shortens long ones
  const fin = finalizeSteps(
    [
      { action: "walk_to", target: "entrance" },
      { action: "say", text: "This sentence is definitely much longer than eight words in total.", label: "A way too long label for a checklist" },
      { action: "wave" },
    ],
    "Greet guests",
  );
  assert.equal(fin[0].label, "Greet guests");
  assert.ok(wc(fin[1].label!) <= 4 && wc(fin[1].text!) <= 8);
  assert.equal(fin[2].label, fin[1].label);
  // AI steps with unknown job tags / no tags still end up fully labelled
  const ai = cleanShiftSteps(
    [
      { job: "intro", action: "say", text: "Starting my shift today with a long cheerful introduction sentence." },
      { job: "greeter", action: "walk_to", target: "entrance" },
      { job: "nope", action: "wave" },
      { action: "wait", seconds: 1 },
    ],
    mockJobs.jobs,
    mockScene.zones.map((z) => z.id),
  );
  checkLabels(ai, "AI shift");
}
console.log("test:shift OK");
