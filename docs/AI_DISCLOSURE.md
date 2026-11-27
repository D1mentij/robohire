# RoboHire — AI disclosure (RobotHack 2026, PCH1)

RoboHire was built by a team of two humans with AI tools. This page lists each tool, what it did, and what the team did itself. Step-by-step notes are in `PROGRESS.md` ("AI-generated:" lines).

## AI tools and what they did

| Tool | What it did |
| --- | --- |
| **Claude Code** (Anthropic; Claude Sonnet 5.5 / Opus 5.5) | Wrote most of the app code: upload and frame extraction, server APIs (`app/api`), AI provider wrappers and prompts (`lib/ai`), the ROI engine (`lib/roi`: hours freed, rent vs buy, payback, Booster K1 economics), reference data files (`src/data`), the owner report (`app/report`), the Booster SDK Python export and the safety & navigation check (`lib/k1export`), tests and readiness scripts (`scripts`, `e2e`), and the docs (README, this file, `docs/hacktribe.md`). From 27.11 it also took over the remaining 3D/UI tasks. |
| **Antigravity** (Google; Gemini) | 3D scene and robot visualization (`components/three`, `lib/executor`: room, zone furniture, robot models, walking/gesture executor, checklist), parts of the UI (`/jobs`, `/robot`, landing page). The `RobotExpressive.glb` model is the standard three.js example asset, used as a K1 stand-in. |
| **Claude** (chat, claude.ai) | Market research (robot prices, Latvian sellers, wages), checking numbers against sources, pitch deck edits. |
| **Ollama `qwen3-vl:4b-instruct`** (local, fallback `qwen3-vl:8b-instruct`) | Runtime vision model inside the app. It turns video frames into a floor plan (zones) and describes the space. It never produces money or hours: those come only from code (`lib/roi`). Optional cloud fallback: Google Gemini via `@google/genai`. |
| **Veo** (Google) | Generated the demo venue videos **Cafe, Hotel and Auto** (`public/_testdrive/`, not in git). **These videos are AI-generated test inputs, not footage of real businesses.** They were used to test the upload → analysis flow. |

## What the team did itself

- The idea and the use case (Booster K1 EDU as a greeter / guide, honest comparison against 15 specialised robots).
- Product decisions: what the app shows, the locked decisions in `FINAL_SPEC.md`, what is honest to claim and what is not.
- Data verification: robot prices, rent quote, wages and K1 specs were checked by hand against the sources listed on `/report` (verified 26.11.2026; reference data, not quotes).
- Design and the demo flow, testing the app on real phone videos, reviewing AI-written code.
- The pitch, the deck and the video.

## Pre-existing vs built during the hackathon (24–28.11.2026)

From `git log` (dates in Europe/Riga). The repository was created on 20.11.2026, so **part of the code existed before the hackathon**.

**Before the hackathon (20–23.11.2026, 49 commits):** the core prototype.
- 20.11: project skeleton, shared contracts and mocks, upload screen with frame extraction, first 3D room with a robot stand-in and the scenario executor.
- 22.11: server-side AI analysis (video frames → floor plan + tasks), job rating, first ROI calculation, demo mode, `/jobs` page, landing page, English UI.
- 23.11: local-first AI (Ollama), business-type task templates, whole-shift scenario, first Booster K1 Python export, `/report` page, end-to-end tests, procedural 3D furniture, Present mode.

**During the hackathon (24–28.11.2026):**
- 24.11: multi-industry business presets, two-laptop sync check.
- 26.11: catalog replaced with 15 real commercial robots, Latvia 2026 wages; robot voice removed.
- 27.11: honest economics (hours freed per day, rent vs buy, verified prices); Booster K1 EDU made the primary robot with its own economics; `/report` sources, sellers and "How we calculate"; HackTribe texts and video script; Safety & navigation check (aisle width, route, steps/elevators, crowded zones) on `/robot` and `/report`; numbers aligned with the deck; Python export re-checked against the Booster SDK; this disclosure.
