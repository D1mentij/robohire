# RoboHire

RoboHire turns a short video of a business space into a list of "robot jobs".
AI finds the repetitive tasks, we match them against what the Booster K1 humanoid can really do, and rank them with savings and payback.
Click "Hire" and the K1 performs the job in a 3D replica of your space.

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

| Variable | Meaning |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini API key (server-side only, never sent to the browser) |
| `GEMINI_MODEL` | Optional model override; default is `gemini-3.8-flash` |

No key? Use **Try demo** on `/upload` (or the landing page): the app runs on mock data from `mocks/`.
Other scripts: `npm run lint`, `npm run build`, `npm run test:roi`, `npm run check:mocks`.

## Architecture

- **Upload** (`/upload`): 8 frames are extracted from the video in the browser (max 60 s) and kept in `sessionStorage`.
- **Analyze** (`/api/analyze`): Gemini estimates a floor plan (`Scene`) and repetitive tasks; the code validates, clamps zones into the room and removes overlaps.
- **Jobs + ROI** (`/api/jobs`, `lib/roi`): Gemini rates each task against the K1 capability profile (`lib/ai/k1-profile.json`) as fit/score/why/limits; hours, savings and payback are computed in code only.
- **Scenario** (`/api/scenario`): Gemini writes a short demo script (walk_to, turn_to, wave, point_to, say, wait) for the chosen job; invalid steps are filtered by code.
- **3D robot** (`/robot`): react-three-fiber renders the room and a K1 stand-in model that executes the scenario.

Data contracts live in `types/contracts.ts`. A demo mode (`lib/ai/demo.ts`) keeps the app working if the AI fails.

## Team split

- **Person 1 (Claude Code, "brain")**: `app/upload`, `app/api`, `lib/ai`, `lib/roi`.
- **Person 2 (Antigravity, "body")**: `app/jobs`, `app/robot`, `components/three`, `lib/executor`.
- Shared: `types/contracts.ts`, `mocks/`, `AGENTS.md`, `package.json`.

## AI usage disclosure

**Written with AI coding assistants** (details per step in `PROGRESS.md`):
- **Claude Code (Claude Sonnet 5.5)**: project skeleton, shared contracts and mocks, upload screen and frame extraction, `/api/analyze`, `/api/jobs`, `/api/scenario`, the Gemini provider wrapper, prompts, post-processing and validation, the K1 capability profile, ROI code and tests, demo mode, this README.
- **Antigravity (Gemini)**: the `/jobs` page, the `/robot` page, `components/three/*`, `lib/executor/*` (3D room, K1 stand-in, walking/gesture/speech executor). The `RobotExpressive.glb` model is the standard three.js example asset used as a K1 stand-in.

**Used at runtime** (Google Gemini via `@google/genai`, server-side): analysing video frames into a floor plan and tasks, rating each task's fit for the K1 (fit/score/why/limits only), and writing the demo scenario (steps and robot speech). AI output is validated by code before use. Gemini never produces money or hours figures.

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
