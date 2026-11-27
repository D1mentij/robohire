# RoboHire

RoboHire turns a short video of a business space into a list of "robot jobs".
AI finds the repetitive tasks, we match them against what the Booster K1 humanoid can really do, and rank them with savings and payback.
Click "Hire" and the K1 performs the job in a 3D replica of your space.

## Run locally (MacBook, no cloud needed)

The AI runs on your own machine through [Ollama](https://ollama.com): free, no rate limits, works offline. Gemini is an optional alternative.

```bash
brew install ollama                    # or download the app from https://ollama.com/download
ollama serve                           # skip if the Ollama menu-bar app is already running
ollama pull qwen3-vl:4b-instruct       # default model, 3.3 GB download, ~5 GB RAM
# optional, better zone names but ~60% slower (6.2 GB):  ollama pull qwen3-vl:8b-instruct

npm install
cp .env.example .env.local             # the defaults already point to Ollama
npm run dev                            # http://localhost:3000
```

**Why 4B is the default:** measured on a MacBook Air M5 (16 GB) with 3 real room videos (café, hotel lobby, car showroom), 4 frames at 512 px:
`qwen3-vl:4b-instruct` was valid in 26 of 27 runs (the one failure was an Ollama stall, now retried faster), 4–6 zones, ~15–25 s warm and ~30–45 s for the very first (cold) call;
`qwen3-vl:8b-instruct` was valid 12/12 but ~22–30 s warm and 56–62 s cold, for slightly nicer labels. 6 frames @ 640 px was slower and found no more zones.
The server loads the model at start-up (`instrumentation.ts`) and keeps it in RAM (`OLLAMA_KEEP_ALIVE`, default 30m), so the first Analyze on stage is warm.
With Ollama the model only describes the **space** (typed zones: entrance, counter, seating, display, waiting, shelves, desk, corridor); the tasks and K1 ratings
are then generated in code from zone types and the opening hours (`lib/ai/zoneTasks.ts`), so a small model cannot break them. Gemini keeps the full one-call prompt.

If the default model is not pulled but the other one is, the app uses it automatically.
If Ollama is not running, `/upload` shows "Start Ollama..." and offers **Continue with demo**.
The first AI call after starting Ollama is slower (the model loads into memory).

| Variable | Meaning |
| --- | --- |
| `AI_PROVIDER` | `ollama` (default) or `gemini` |
| `OLLAMA_URL` | default `http://localhost:11434` |
| `OLLAMA_MODEL` / `OLLAMA_FALLBACK_MODEL` | default `qwen3-vl:4b-instruct` / `qwen3-vl:8b-instruct` |
| `OLLAMA_MAX_FRAMES` | video frames sent to the model, default 4 (more = slower) |
| `OLLAMA_KEEP_ALIVE` / `OLLAMA_NUM_CTX` | how long the model stays in RAM (default `30m`) / context size (default 8192) |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` | only with `AI_PROVIDER=gemini` (key stays server-side) |

No AI at all? Use **Try demo** (mock café) or **Try real example: ...** (a saved real analysis, see below) on `/upload` or the landing page.

**Showcase (a real example with no AI call):** `lib/ai/showcase/real-room-test.json` ships with the repo (analysis of a real café video). To add your own: run a real analysis, open `http://localhost:3000/upload?dev=1`, click *Save as showcase (dev)*,
and put the downloaded `.json` into `lib/ai/showcase/`. It then appears as "Try real example: <name>" next to *Try demo*.

Scripts: `npm run doctor` (is this laptop ready? green/red checklist with fix commands), `npm run demo:check` (doctor → e2e → one real local analyze → READY / NOT READY), `npm run lint`, `npm run build`, `npm test` (roi, shift, k1export, ai, mocks), `npm run e2e` (Playwright on its own port :3100, demo mode, no AI),
`npx tsx scripts/bench-ai.ts <video|frames-folder> [businessType] [runs]` (latency + validation of the real AI path; env `BENCH_FRAMES`, `BENCH_SIZE`). `npm run e2e:prod` is optional (tests a deployed site).

## Backup laptop setup

Goal: a second laptop that can run the demo on stage if the main one fails. About 10 minutes plus downloads.

**macOS**
1. Install Homebrew (https://brew.sh), then: `brew install node git ollama ffmpeg` (ffmpeg only for the benchmark script).
2. `git clone <repo-url> robohire && cd robohire`
3. `npm install`
4. `open -a Ollama` (or `ollama serve` in another terminal), then `ollama pull qwen3-vl:4b-instruct`
5. `npx playwright install chromium`
6. `npm run doctor` — fix every red line using the command it prints (it creates `.env.local` from `.env.example` if missing).
7. `npm run demo:check` — must end with **READY**. (Copy any room video into `test-videos/` first to include the real AI test; videos are never committed.)
8. `npm run dev`, open http://localhost:3000/upload and press **Try demo** once. Keep Ollama running.

**Windows** (PowerShell)
1. `winget install OpenJS.NodeJS.LTS Git.Git Ollama.Ollama Gyan.FFmpeg` (then reopen PowerShell).
2. `git clone <repo-url> robohire; cd robohire`
3. `npm install`
4. Start **Ollama** from the Start menu (or `ollama serve`), then `ollama pull qwen3-vl:4b-instruct`
5. `npx playwright install chromium`
6. `npm run doctor` (it runs `copy .env.example .env.local` for you if the file is missing; red lines show the fix command).
7. `npm run demo:check` — must end with **READY**.
8. `npm run dev`, open http://localhost:3000/upload and press **Try demo** once.

No GPU? It still works (slower); if the real AI is too slow or Ollama fails, **Try demo** and **Try real example** need no AI at all.

## Sync check

`npm run sync:check` makes the laptops compare themselves through the repo: it fetches (and fast-forwards if you are behind with a clean tree), runs `npm install` when `node_modules` is missing or older than `package-lock.json`, then writes `sync/<hostname>.json` (short hostname, OS, Node, git commit/ahead/behind/dirty, Ollama version and installed models, the *names* of the keys set in `.env.local` — never values — the `AI_PROVIDER`, the `demo:check` verdict and a timestamp), commits **only that file** (`sync: <hostname> status`) and pushes it. It then compares all `sync/*.json` files and prints a table plus plain-English problems ("win is on an older commit → they must git pull", "qwen3-vl:4b-instruct missing on win", "AI_PROVIDER differs", "report older than 24 h", "demo:check NOT READY: …") and ends with `ALL MACHINES IN SYNC & READY` or `NOT IN SYNC: <n> issues`. Use `npm run sync:check -- --skip-demo` to skip the 2–3 minute `demo:check`. Run it on every laptop before demo prep and at the start of each day.

## Architecture

- **Upload** (`/upload`): 4 frames (512 px) are extracted from the video in the browser (max 60 s) and kept in `sessionStorage`.
- **Analyze** (`/api/analyze`): ONE AI call returns the floor plan (`Scene`), the repetitive tasks and a K1 fit rating per task. Code validates, clamps zones into the room, removes overlaps and fills any missing rating with a keyword heuristic (`lib/ai/ratings.ts`).
- **Jobs + ROI** (`/api/jobs`, `lib/roi`): no AI. Ratings become jobs; hours, savings, payback and the one-robot shift plan are computed in code only.
- **Scenario** (`/api/scenario`): per-job scripts are built in code from templates (instant); `?ai=1` asks the model instead.
- **Shift** (`/api/shift`): on "Hire this K1" the AI writes one continuous script for the whole plan; any error or timeout falls back to a code-built script.
- **3D robot** (`/robot`): react-three-fiber renders the room and a K1 stand-in model that executes the scenario.

AI calls per full run (upload → hired shift): 3 → 2 (analyze + job rating merged; per-job scenarios by code; only the shift script uses the AI).
Data contracts live in `types/contracts.ts`. A demo mode (`lib/ai/demo.ts`) keeps the app working if the AI fails.

## Team split

- **Person 1 (Claude Code, "brain")**: `app/upload`, `app/api`, `lib/ai`, `lib/roi`.
- **Person 2 (Antigravity, "body")**: `app/jobs`, `app/robot`, `components/three`, `lib/executor`.
- Shared: `types/contracts.ts`, `mocks/`, `AGENTS.md`, `package.json`.

## AI usage disclosure

Full disclosure (all tools, what the team did, pre-existing vs hackathon work): [docs/AI_DISCLOSURE.md](docs/AI_DISCLOSURE.md).

**Written with AI coding assistants** (details per step in `PROGRESS.md`; agreed spec in `FINAL_SPEC.md`):
- **Claude Code (Claude Sonnet 5.5 / Opus 5.5)**: project skeleton, shared contracts and mocks, upload screen and frame extraction, `/api/analyze`, `/api/jobs`, `/api/scenario`, `/api/shift`, AI provider wrappers, prompts, validation, the honest economics (`lib/roi/economics.ts`: hours freed per day, rent vs buy), the robot price/wage reference data (`src/data/robots.ts`), Booster K1 economics (`lib/roi/k1.ts`, `src/data/k1.ts`), the `/report` page, the real-K1 Python export (`lib/k1export`), tests, demo mode, this README.
- **Antigravity (Gemini)**: the `/jobs` page, the `/robot` page, the landing page, `components/three/*`, `lib/executor/*` (3D room, robot models, walking/gesture executor, checklist). The `RobotExpressive.glb` model is the standard three.js example asset used as a K1 stand-in.
- Price and wage figures were researched with AI help and then checked by hand on 26.11.2026 (sources listed on `/report`). They are reference data, not quotes.

**Used at runtime** (server-side only): a local Ollama vision model, default `qwen3-vl:4b-instruct` (fallback `qwen3-vl:8b-instruct`), or optionally Google Gemini via `@google/genai`. The AI turns video frames into a floor plan, tasks and each task's fit (fit/score/why/limits), and can write the shift demo script. Code validates all AI output before using it. **The AI never produces money or hours figures**: those come only from the formulas below. The robot never speaks aloud; the simulation shows a checklist and captions.

**K1 facts** come from the official [Booster K1 page](https://www.booster.tech/booster-k1/), the [K1 product manual](https://docs.booster.tech/docs/product-manual/k1/getting-started/overview/) and the generationrobots listing; values without a source are labelled as assumptions in `src/data/k1.ts` (for example the 55 cm minimum aisle, because Booster publishes no K1 width).

### Economics (`lib/roi/economics.ts`, `lib/roi/k1.ts`)

`savings/month = hours freed per day × role €/h × days open per week × 4.33`
- **Rent:** net = savings − distributor rent (no RoboHire markup). No payback, because you can stop renting.
- **Buy:** upkeep = 10% of price per year; net = savings − upkeep; payback = price ÷ net; 3-year ROI = (net × 36 − price) ÷ price.
- Every figure is computed as low / expected / high. Cards and the pitch show the **likely range = expected → best case**; the conservative (low) case stays visible next to it.
- Demo venues (small, one 80-min charge, reception €9.93/h): **Booster K1 frees 1.1–1.3 h/day, €290–340/mo, payback 27–33 months at €7,500 ex VAT (€9,000 incl.), fit "Partial"** (conservative case 0.75 h/day, payback 57 months). Keenon T8 frees 2.3–3 h/day (conservative 1.5).
- Price range of the 15-robot benchmark: Temi €4.1k → Gausium Scrubber 75P €87.4k (`src/data/robots.ts`).

| Value | Setting | Label |
| --- | --- | --- |
| Hours freed per day | tray robot 2/3/4, greeter 1/1.5/2, courier 1.5/2.5/4, AMR 3/5/7 per shift; cleaners from floor area | assumption |
| Booster K1 | greeter 1/1.5/2 h/day, capped by one 80-min battery unless swapped; buy only, €7,500 ex VAT (€9,000 incl. VAT) | price verified, hours assumption |
| Waiter cost | €9.24/h (CSB Q2 2026 €1,256 gross + 23.59% VSAOI) | verified |
| Other role costs | €7.72–€11.04/h | estimate |
| Keenon T8 | €8,900 buy / €370 per month rent | distributor quote |
| Keenon W3 / T10 | €16,000 / €12,000 | Riga retail |
| Other robots | US list price converted; rent = 2.8% of price per month | estimate |
| Upkeep when buying | 10% of price per year | assumption |
| Days open | 6 per week (7 if ≥ 84 h/week) | assumption |
| Partner view commissions | 15% of rent, 7% of sale | assumption (referral fee paid by distributor) |
