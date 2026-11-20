# RoboHire — project rules (shared by Claude Code and Antigravity)

## What we build
Web app: user uploads a short video of a business space → AI finds repetitive tasks →
matches them to Booster K1 humanoid capabilities → ranked "robot jobs" with savings/payback →
"Hire" → K1 performs the job in a 3D replica of the space.

## Stack
Next.js (TypeScript, App Router), react-three-fiber, Vercel. AI calls only on the server.
Next.js 16 has API changes — check node_modules/next/dist/docs/ before using Next.js APIs.

## Ownership (do NOT edit the other person's folders)
- Person 1 (Claude Code, "brain"): app/upload, app/jobs, app/api, lib/ai, lib/roi
- Person 2 (Antigravity, "body"): app/robot, components/three, lib/executor
- Shared (change only if both agree): types/contracts.ts, mocks/, AGENTS.md, package.json

## Data contracts (source of truth: types/contracts.ts)
- scene.json: room {width, depth}, zones [{id, label, x, z, w, d}] — meters, x/z = zone center
- jobs.json: business_type, jobs [{id, title, fit, score, why, limits,
  hours_per_week, savings_eur_month, payback_months}]
- scenario.json: job_id, steps [{action, target?, text?, seconds?}]
- Allowed actions ONLY: walk_to, turn_to, wave, point_to, say, wait

## Rules
- Before work: git pull and read PROGRESS.md.
- After each working step: update PROGRESS.md, then commit + push.
- Never change contracts silently: if needed, write it in PROGRESS.md under "CONTRACT CHANGE".
- Keep a "demo mode" that loads mocks/ so the app works even if AI fails.
- Note in PROGRESS.md what AI generated (required for hackathon AI disclosure).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
