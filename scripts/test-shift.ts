import assert from "node:assert/strict";
import { mockJobs, mockScene } from "../mocks";
import { buildPlan } from "../lib/roi/roi";
import {
  buildJobScenario,
  buildShiftFallback,
  jobLabels,
  SHIFT_MAX_STEPS,
  SHIFT_MIN_STEPS,
  zoneForJob,
} from "../lib/ai/shiftFallback";
import { cleanShiftSteps } from "../lib/ai/shift";
import { finalizeSteps, shortLabel, shortenSay } from "../lib/ai/labels";
import { buildRobotScenario, inferRobotType } from "../lib/robots/catalog";
import { ROBOTS_CATALOG_LIST } from "../src/data/robots";
import { filterValidSteps, isScenario, type Scene } from "../types/contracts";

const plan = buildPlan(mockJobs.jobs, 9.24, 56);
const zoneIds = mockScene.zones.map((z) => z.id);

// 1. Shift fallback valid
{
  const s = buildShiftFallback(
    plan,
    mockJobs.jobs,
    mockScene,
    "Tight Café (Riga)",
  );
  assert.ok(isScenario(s));
  assert.equal(s.job_id, "shift");
  assert.ok(
    s.steps.length >= SHIFT_MIN_STEPS && s.steps.length <= SHIFT_MAX_STEPS,
    `steps ${s.steps.length}`,
  );
  assert.equal(filterValidSteps(s.steps, zoneIds).length, s.steps.length);
  assert.equal(s.steps[0].action, "say");
  assert.equal(s.steps.at(-1)?.action, "say");
}

// 2. Archetype scenarios for all 15 commercial robots use ONLY valid actions & zones
for (const robot of ROBOTS_CATALOG_LIST) {
  const fakeJob = {
    ...mockJobs.jobs[0],
    id: `job_${robot.id}`,
    title: `${robot.name} — ${robot.defaultJobTitle}`,
    robot_type: robot.id,
  };
  const sc = buildRobotScenario(inferRobotType(fakeJob), fakeJob, mockScene);
  assert.ok(isScenario(sc), `${robot.id} scenario valid`);
  assert.equal(
    filterValidSteps(sc.steps, zoneIds).length,
    sc.steps.length,
    `${robot.id} steps match scene zones`,
  );
  assert.ok(sc.steps.length >= 6, `${robot.id} has >= 6 steps`);
}

// 3. Zone heuristics & step label checks
assert.ok(zoneForJob(mockJobs.jobs[0], mockScene.zones).zone !== null);
{
  const one: Scene = {
    room: { width: 4, depth: 4 },
    zones: [{ id: "desk", label: "Desk", x: 2, z: 2, w: 1, d: 1 }],
  };
  const s = buildShiftFallback({ ...plan, job_ids: ["nope"] }, mockJobs.jobs, one, "Office");
  assert.ok(
    s.steps.length >= 3 &&
      filterValidSteps(s.steps, ["desk"]).length === s.steps.length,
  );
}
{
  const firstId = mockJobs.jobs[0].id;
  const steps = cleanShiftSteps(
    [
      { job: "intro", action: "say", text: "Hi", target: null },
      { job: firstId, action: "walk_to", target: "entrance", text: "", extra: 1 },
      { job: firstId, action: "walk_to", target: "kitchen" },
      { job: "???", action: "wave" },
      { job: "outro", action: "say", text: "Bye" },
    ],
    mockJobs.jobs,
    zoneIds,
  );
  assert.equal(steps.length, 4);
  assert.equal(steps[0].label, "Shift start");
  assert.equal(steps[3].label, "Shift end");
}

const wc = (t: string) => t.trim().split(/\s+/).length;
for (const j of mockJobs.jobs) {
  const s = buildJobScenario(j, mockScene);
  for (const st of s.steps) {
    assert.ok(st.label && wc(st.label) <= 4);
    if (st.action === "say") assert.ok(wc(st.text ?? "") <= 8);
  }
}
const twins = [
  { ...mockJobs.jobs[0], id: "a", title: "Greet visitors at the main entrance door" },
  { ...mockJobs.jobs[0], id: "b", title: "Greet visitors at the side door" },
];
const lm = jobLabels(twins);
assert.notEqual(lm.get("a"), lm.get("b"));
assert.equal(shortLabel("Explain the menu items and daily specials to every customer"), "Explain menu items daily");
assert.equal(shortenSay("Hi there."), "Hi there.");
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

console.log("test:shift OK");
