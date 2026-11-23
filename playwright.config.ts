import { defineConfig, devices } from "@playwright/test";

/**
 * npm run e2e      → starts `next dev` on :3200 with Ollama pointed at a closed port (demo mode: no AI at all, the app
 *                     falls back to code) and tests it.
 * npm run e2e:prod  → optional: tests a deployed app (E2E_BASE_URL=https://robohire-six.vercel.app), no local server.
 */
const prodUrl = process.env.E2E_BASE_URL;
const PORT = 3200;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: process.env.E2E_REAL ? [] : /real-upload/, // needs real Ollama + a test video: run with npm run e2e:real
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
    launchOptions: { args: ["--mute-audio", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: prodUrl
    ? undefined
    : {
        command: `npx next dev -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 120_000,
        // closed port → "Start Ollama" error instantly → built-in code fallbacks (demo mode). Existing env vars win over .env.local.
        // E2E_REAL=1 (npm run e2e:real) keeps the real local Ollama for the upload test
        env: process.env.E2E_REAL ? { AI_PROVIDER: "ollama", GEMINI_API_KEY: "" } : { AI_PROVIDER: "ollama", OLLAMA_URL: "http://127.0.0.1:9", GEMINI_API_KEY: "" },
      },
});
