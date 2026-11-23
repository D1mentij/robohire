import assert from "node:assert/strict";
import { mockJobs, mockScene } from "../mocks";
import { buildPlan } from "../lib/roi/roi";
import { buildShiftFallback, SHIFT_MAX_STEPS, SHIFT_MIN_STEPS, zoneForJob } from "../lib/ai/shiftFallback";
import { cleanShiftSteps } from "../lib/ai/shift";
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
  const titles = plan.job_ids.map((id) => mockJobs.jobs.find((j) => j.id === id)!.title);
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
    { action: "walk_to", label: "Greeter at the entrance", target: "entrance" },
    { action: "wave", label: "Greeter at the entrance" },
    { action: "say", label: "Shift end", text: "Bye" },
  ]);
}
console.log("test:shift OK");
