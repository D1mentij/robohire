import {
  filterValidSteps,
  isJobsResult,
  isScenario,
  isScene,
  ALLOWED_ACTIONS,
} from "../types/contracts";
import { mockJobs, mockScenario, mockScene } from "../mocks";

const errors: string[] = [];
const check = (ok: boolean, msg: string) => {
  if (!ok) errors.push(msg);
};

check(isScene(mockScene), "scene.json fails isScene");
check(isJobsResult(mockJobs), "jobs.json fails isJobsResult");
check(isScenario(mockScenario), "scenario.json fails isScenario");

// scene geometry: inside room, no overlaps
const { room, zones } = mockScene;
for (const z of zones) {
  check(
    z.x - z.w / 2 >= 0 &&
      z.x + z.w / 2 <= room.width &&
      z.z - z.d / 2 >= 0 &&
      z.z + z.d / 2 <= room.depth,
    `zone ${z.id} is outside the room`,
  );
}
for (let i = 0; i < zones.length; i++) {
  for (let j = i + 1; j < zones.length; j++) {
    const a = zones[i];
    const b = zones[j];
    const overlap =
      Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
      Math.abs(a.z - b.z) < (a.d + b.d) / 2;
    check(!overlap, `zones ${a.id} and ${b.id} overlap`);
  }
}
check(new Set(zones.map((z) => z.id)).size === zones.length, "duplicate zone ids");

// jobs
check(mockJobs.jobs.length === 4, "expected 4 jobs");
check(
  mockJobs.jobs.every((j) => (j.fit === "no") === (j.payback_months === null)),
  'payback_months must be null exactly when fit is "no"',
);

// scenario: nothing dropped, uses all actions, 6-10 steps, job exists
const ids = zones.map((z) => z.id);
const kept = filterValidSteps(mockScenario.steps, ids);
check(kept.length === mockScenario.steps.length, "scenario has invalid steps");
check(
  mockScenario.steps.length >= 6 && mockScenario.steps.length <= 10,
  "scenario must have 6-10 steps",
);
const used = new Set(mockScenario.steps.map((s) => s.action));
for (const a of ALLOWED_ACTIONS) check(used.has(a), `scenario does not use ${a}`);
check(
  mockJobs.jobs.some((j) => j.id === mockScenario.job_id),
  "scenario job_id not in jobs.json",
);

// filterValidSteps negative tests
const bad: unknown[] = [
  { action: "fly" },
  { action: "walk_to" },
  { action: "walk_to", target: "nowhere" },
  { action: "say" },
  { action: "wait" },
  null,
  { action: "wave" },
];
const filtered = filterValidSteps(bad, ids);
check(
  filtered.length === 1 && filtered[0].action === "wave",
  "filterValidSteps negative test failed",
);

if (errors.length) {
  console.error("check:mocks FAILED\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("check:mocks OK");
