# RoboHire

RoboHire turns a short video of a business space into a list of "robot jobs".
AI finds the repetitive tasks, we match them against what the Booster K1 humanoid can really do, and rank them with savings and payback.
Click "Hire" and the K1 performs the job in a 3D replica of your space.

## Run locally (MacBook, no cloud needed)

The AI runs on your own machine through [Ollama](https://ollama.com): free, no rate limits, works offline. Gemini is an optional alternative.

```bash
brew install ollama                    # or download the app from https://ollama.com/download
ollama serve                           # skip if the Ollama menu-bar app is already running
ollama pull qwen3-vl:8b-instruct       # default model, 6.2 GB download, needs ~8 GB free RAM
# smaller / faster fallback (3.3 GB):  ollama pull qwen3-vl:4b-instruct

npm install
cp .env.example .env.local             # the defaults already point to Ollama
npm run dev                            # http://localhost:3000
```

If the default model is not pulled but the smaller one is, the app uses the smaller one automatically.
If Ollama is not running, `/upload` shows "Start Ollama..." and offers **Continue with demo**.
The first AI call after starting Ollama is slower (the model loads into memory).

| Variable | Meaning |
| --- | --- |
| `AI_PROVIDER` | `ollama` (default) or `gemini` |
| `OLLAMA_URL` | default `http://localhost:11434` |
| `OLLAMA_MODEL` / `OLLAMA_FALLBACK_MODEL` | default `qwen3-vl:8b-instruct` / `qwen3-vl:4b-instruct` |
| `OLLAMA_MAX_FRAMES` | video frames sent to the model, default 4 (more = slower) |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` | only with `AI_PROVIDER=gemini` (key stays server-side) |

No AI at all? Use **Try demo** (mock café) or **Try real example: ...** (a saved real analysis, see below) on `/upload` or the landing page.

**Showcase (a real example with no AI call):** run a real analysis, open `http://localhost:3000/upload?dev=1`, click *Save as showcase (dev)*,
and put the downloaded `.json` into `lib/ai/showcase/`. It then appears as "Try real example: <name>" next to *Try demo*.

Scripts: `npm run lint`, `npm run build`, `npm test` (roi, shift, k1export, ai, mocks), `npm run e2e` (Playwright, demo mode, no AI),
`npx tsx scripts/bench-ai.ts <video|frames-folder>` (latency + validation of the real AI path). `npm run e2e:prod` is optional (tests a deployed site).

## Architecture

- **Upload** (`/upload`): 8 frames are extracted from the video in the browser (max 60 s) and kept in `sessionStorage`.
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

**Written with AI coding assistants** (details per step in `PROGRESS.md`):
- **Claude Code (Claude Sonnet 5.5 / Opus 5.5)**: project skeleton, shared contracts and mocks, upload screen and frame extraction, `/api/analyze`, `/api/jobs`, `/api/scenario`, the Gemini provider wrapper, prompts, post-processing and validation, the K1 capability profile, ROI code and tests, demo mode, this README.
- **Antigravity (Gemini)**: the `/jobs` page, the `/robot` page, `components/three/*`, `lib/executor/*` (3D room, K1 stand-in, walking/gesture/speech executor). The `RobotExpressive.glb` model is the standard three.js example asset used as a K1 stand-in.

**Used at runtime** (a local Ollama vision model, default `qwen3-vl:8b-instruct`, or optionally Google Gemini via `@google/genai`; server-side): analysing video frames into a floor plan, tasks and each task's fit for the K1 (fit/score/why/limits only), and writing the whole-shift demo script (steps and robot speech). AI output is validated by code before use. The AI never produces money or hours figures.

**K1 facts** come from the official [Booster K1 page](https://www.booster.tech/booster-k1/); items without a source are marked `"assumption": true` in `lib/ai/k1-profile.json`. The can/cannot lists are our interpretation.

### ROI assumptions (`lib/roi/config.ts`) — none are measured data

| Value | Setting | Label |
| --- | --- | --- |
| Days open per week | 6 | assumption |
| Coverage of a task's hours (good / partial / no) | 0.8 / 0.4 / 0 | assumption |
| Robot price | €8,000 (Booster publishes no price) | assumption |
| Running cost (maintenance + electricity) | €60 / month | assumption |
| Weeks per month | 4.33 | assumption |
| Default staff cost (Latvian hospitality, incl. employer tax) | €8.5 / h | assumption |
| Task frequency and duration | estimated by the AI from the video | AI estimate |

`hours_per_week = frequency × minutes / 60 × 6`; `savings/month = max(0, hours × coverage × 4.33 × hourly cost − 60)`; `payback = price / savings`.
