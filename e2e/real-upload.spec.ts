import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "./fixtures";

/**
 * npm run e2e:real — the REAL path in the browser: video upload → frame extraction → /api/analyze with local Ollama → /jobs → hire.
 * Needs Ollama + the model, ffmpeg and a video in test-videos/ (gitignored). Chromium has no H.264, so the video is converted to webm first.
 */
const dir = path.join(process.cwd(), "test-videos");
const video = existsSync(dir) ? readdirSync(dir).find((f) => /\.(mp4|mov|webm)$/i.test(f)) : undefined;

test("real video → analyze (local AI) → jobs → hire → robot plays", async ({ page }) => {
  test.skip(!video, "no test-videos/*.mp4");
  test.setTimeout(420_000);
  const tmp = mkdtempSync(path.join(os.tmpdir(), "e2e-real-"));
  const webm = path.join(tmp, "room.webm");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(dir, video!), "-t", "20", "-vf", "scale=640:-2", "-an", webm]);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/upload");
  await page.locator('input[type="file"]').setInputFiles(webm);
  // Auto-detect chip: the model guesses the business family; defaults for hours/cost stay editable
  await page.getByRole("button", { name: "Auto-detect from video" }).first().click();
  await page.locator('input[type="number"]').first().fill("60");
  await page.getByRole("button", { name: "Extract frames" }).click();
    const analyze = page.getByRole("button", { name: /^Analyze$/ });
  await expect(analyze).toBeEnabled({ timeout: 60_000 });
  const t0 = Date.now();
  await analyze.click();
  await expect(page.getByRole("button", { name: /Analyzing/ })).toHaveCount(0, { timeout: 240_000 });
  console.log(`analyze took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await expect(page.getByText(/Analysis failed|AI analysis failed|Start Ollama/i)).toHaveCount(0);
  const errors2: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors2.push(m.text()));

  // "Detected: …" + dropdown to correct it before /jobs
  const detected = page.getByTestId("detected-family-label");
  await expect(detected).toBeVisible({ timeout: 30_000 });
  console.log(`detected: ${await detected.textContent()} (video ${video})`);
  await expect(page.getByRole("link", { name: /See robot jobs/ })).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("family-select").selectOption("gym");
  await expect(detected).toHaveText(/Gym/);
  await expect(page.getByRole("link", { name: /See robot jobs/ })).toBeVisible({ timeout: 60_000 });

  await page.goto("/jobs");
  await expect(page.locator('[data-testid^="job-card-"]').first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("hire-plan-btn").click();
  await expect(page).toHaveURL(/\/robot/, { timeout: 90_000 });
  await page.getByRole("button", { name: /Start/ }).first().click();
  await expect(page.getByTestId("job-completed-card")).toBeVisible({ timeout: 180_000 });
  const jobTitles = (await page.locator('[data-testid^="job-card-"]').allInnerTexts()).join("\n");
  expect(jobTitles).toMatch(/gym|member|class|studio/i); // corrected family reached /jobs
  expect(errors, errors.join(" | ")).toEqual([]);
  expect(errors2, errors2.join(" | ")).toEqual([]);
});
