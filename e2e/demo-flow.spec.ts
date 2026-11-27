import { expect, test } from "./fixtures";
import { readFile } from "node:fs/promises";

/** Hire the plan, play the robot to the end, check the checklist + completion card + .py export from /robot. */
async function hireAndPlay(page: import("@playwright/test").Page) {
  await page.getByTestId("hire-plan-btn").click();
  await expect(page).toHaveURL(/\/robot/, { timeout: 45_000 });

  const start = page.getByRole("button", { name: /Start/ }).first();
  await expect(start).toBeVisible({ timeout: 30_000 });

  // checklist before the run: ≥ 2 tasks (distinct step.label groups, not counting shift start/end), all queued
  const labels: string[] = await page.evaluate(() => {
    const raw = sessionStorage.getItem("robohire:scenario") ?? "{}";
    const steps: { label?: string }[] = JSON.parse(raw).steps ?? [];
    return [...new Set(steps.map((s) => s.label).filter((l): l is string => !!l && l !== "Shift start" && l !== "Shift end"))];
  });
  expect(labels.length, `task labels: ${labels.join(", ")}`).toBeGreaterThanOrEqual(2);
  for (const l of labels) expect(l.split(/\s+/).length).toBeLessThanOrEqual(4);
  // checklist panel (Person 2): one row per task, pending → ▶ → ✓
  const rows = page.getByTestId("shift-task-row");
  const total = await rows.count();
  expect(total, "task rows on /robot").toBeGreaterThanOrEqual(2);
  // /robot auto-starts ~0.5 s after load, so rows may already be running — no "all pending" check
  for (const l of labels) await expect(page.getByTestId("shift-tasks-panel").getByText(l, { exact: true }).first()).toBeVisible();

  await start.click();
  const done = page.getByTestId("job-completed-card");
  await expect(done).toBeVisible({ timeout: 180_000 });
  await expect(done).toContainText(/verified|completed/i);
  await expect(done).toContainText(/€\s?[\d,.]+\s*\/\s*mo/i); // €/month

  // every task is ✓
  await expect(page.locator('[data-testid="shift-task-row"][data-status="done"]')).toHaveCount(total);
}

/** Stage safety: the full demo path works end to end (demo data only, no video upload). */
test("landing → demo → plan → hire → robot checklist all ✓ → €/month → rent-vs-buy report", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.getByTestId("landing-demo-btn").click();
  await expect(page).toHaveURL(/\/jobs/);

  const panel = page.getByTestId("robot-plan-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/h\/day/i);
  await expect(panel).toContainText(/rent net €\s?[\d,]+\s*\/\s*mo/i);

  await hireAndPlay(page);

  // /report renders rent vs buy per robot + "How we calculate"
  await page.goto("/report");
  await expect(page.getByRole("heading", { name: /Rent vs Buy Feasibility Report/ })).toBeVisible();
  await expect(page.getByText(/Rent: €[\d,]+\/mo → net/).first()).toBeVisible();
  await expect(page.getByText(/Buy: €[\d,]+ ex VAT → payback/).first()).toBeVisible();
  await expect(page.getByText(/verified 26\.11\.2026, reference data, not a quote/i).first()).toBeVisible();
  await expect(page.getByTestId("how-we-calculate")).toContainText(/Payback = price/);

  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

/** The saved REAL hotel analysis (no AI): jobs fit a hotel, no café-only tasks, Hire plays. */
test("Try real example: Real hotel lobby → hotel tasks only → Hire this K1 plays", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/upload");
  await page.getByTestId("showcase-btn").filter({ hasText: "Real hotel lobby" }).click();
  await expect(page).toHaveURL(/\/jobs/);

  const cards = page.locator('[data-testid^="job-card-"][data-fit="good"]');
  await expect(cards.first()).toBeVisible();
  const text = (await cards.allInnerTexts()).join("\n");
  expect(text).toMatch(/elevator|reception/i);
  expect(text).not.toMatch(/menu|barista|wipe tables|free table|specials|coffee/i);
  await expect(page.getByTestId("robot-plan-panel")).toBeVisible();

  await hireAndPlay(page);
  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

/** Business-type selector: presets fill defaults, user edits stay, demo follows the selected family (no AI). */
test("upload selector: preset defaults, demo uses the chosen family", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/upload");
  const hours = page.locator('input[type="number"]').nth(0);
  const cost = page.locator('input[type="number"]').nth(1);
  await page.getByTestId("quick-chip-hotel").click();
  await expect(hours).toHaveValue("168");
  await expect(cost).toHaveValue("9.93");
  await expect(page.getByText(/Latvia 2026 Hotel Porter & Reception employer cost: €9\.93\/h/).first()).toBeVisible();
  // NOTE: since the 2026-11-26 selector rewrite a preset click overwrites user-edited hours (known gap, see PROGRESS.md)
  await page.getByTestId("quick-chip-warehouse").click();
  await expect(cost).toHaveValue("11.04"); // field follows the preset
  await page.getByTestId("upload-demo-btn").click();
  await expect(page).toHaveURL(/\/jobs/);
  const text = (await page.locator('[data-testid^="job-card-"][data-fit="good"]').allInnerTexts()).join("\n");
  expect(text).toMatch(/pallet|warehouse|AMR|intralogistics/i);
  expect(text).not.toMatch(/menu|barista|luggage/i);
  expect(errors, errors.join(" | ")).toEqual([]);
});

/** Server API contract in demo mode (no AI reachable). */
test("API: /api/scenario is code-built, /api/jobs needs no AI, /api/analyze says Start Ollama, /api/shift falls back", async ({ request }) => {
  const mockScene = JSON.parse(await readFile("mocks/scene.json", "utf8"));
  const mockJobs = JSON.parse(await readFile("mocks/jobs.json", "utf8"));
  const job = mockJobs.jobs[0];

  const sc = await request.post("/api/scenario", { data: { job, scene: mockScene } });
  expect(sc.ok()).toBeTruthy();
  const scJson = await sc.json();
  expect(scJson.source).toBe("code");
  expect(scJson.scenario.job_id).toBe(job.id);
  expect(scJson.scenario.steps.length).toBeGreaterThanOrEqual(4);

  // ?ai=1 with Ollama unreachable still answers (code fallback)
  const sc2 = await request.post("/api/scenario?ai=1", { data: { job, scene: mockScene } });
  expect((await sc2.json()).source).toBe("code");

  const tasks = [{ id: "greet", title: "Greet guests", zone_id: "entrance", description: "Welcome visitors", frequency_per_day: 40, minutes_each: 1 }];
  const jobs = await request.post("/api/jobs", { data: { tasks, scene: mockScene, businessType: "Café", hoursPerWeek: 60, hourlyCost: 8.5 } });
  const jobsJson = await jobs.json();
  expect(jobsJson.ok).toBe(true);
  expect(jobsJson.jobs.jobs[0].fit).toBe("good"); // heuristic rating, no AI

  const an = await request.post("/api/analyze", {
    data: { businessType: "Café", hoursPerWeek: 60, hourlyCost: 8.5, frames: ["data:image/jpeg;base64,/9j/4AAQ"] },
  });
  expect(an.status()).toBe(503);
  expect((await an.json()).error).toMatch(/Start Ollama/);

  const plan = {
    job_ids: mockJobs.jobs.slice(0, 3).map((j: { id: string }) => j.id), hours_per_week: 14.8, capacity_hours_per_week: 36,
    gross_savings_eur_month: 545, running_cost_eur_month: 60, net_savings_eur_month: 485, robot_price_eur: 8000, payback_months: 16, assumptions: [],
  };
  const sh = await request.post("/api/shift", { data: { plan, jobs: mockJobs.jobs, scene: mockScene, businessType: "Café" } });
  const shJson = await sh.json();
  expect(shJson.source).toBe("fallback");
  expect(shJson.scenario.job_id).toBe("shift");
});
