import { defineConfig, devices } from "@playwright/test";

/**
 * npm run e2e      → starts `next dev` on :3200 with GEMINI_API_KEY="" (demo mode, no AI calls) and tests it.
 * npm run e2e:prod → tests the deployed app (E2E_BASE_URL=https://robohire-six.vercel.app), no local server.
 */
const prodUrl = process.env.E2E_BASE_URL;
const PORT = 3200;

export default defineConfig({
  testDir: "./e2e",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: prodUrl ?? `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
    trace: "retain-on-failure",
    // headless Chromium: software WebGL for the 3D canvas
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: prodUrl
    ? undefined
    : {
        command: `npx next dev -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 120_000,
        // empty key → server AI routes fail fast → the app's built-in fallbacks are used (demo mode)
        env: { GEMINI_API_KEY: "" },
      },
});
