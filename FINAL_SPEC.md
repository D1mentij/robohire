# FINAL_SPEC.md — the ONE agreed final version of RoboHire (Demo Day 28.11.2026)

This file is the single source of truth for BOTH agents (Claude Code = Person 1, Antigravity/Gemini = Person 2).
If code, PROGRESS.md or an old prompt disagrees with this file, THIS FILE WINS.
Changing anything in "Locked decisions" requires the proposal protocol below (HANDOFF.md).

## 0. Deadlines (Europe/Riga)
- 27.11 18:00 — FEATURE FREEZE. After this only bug fixes for the video.
- 27.11 18:00–21:00 — humans record the video pitch (≤ 5 min, English) using the app.
- 28.11 09:30 — video on YouTube + HackTribe project page filled (Problem, Solution, What's done, Next steps). Finalists (12) are chosen from the videos.
- Judging: Practical applicability & impact 30%, Working prototype 25%, Team/roadmap/presentation 25%, Innovation 20%.

## 1. Challenge (PCH1, Latvian IT Cluster & AI Studio)
"Could a robot be your next employee? Create a business use case for Booster K1 EDU — show it working in simulation."
Prize angle: a use case suitable for the AI Studio demonstration area (RTU) → up to €2,000 follow-up.

## 2. One-line positioning
RoboHire finds the job where Booster K1 can be your next employee — from a phone video. It checks honestly against 15 specialised commercial robots, shows K1 doing the shift in simulation, and exports SDK code for the real K1.

## 3. Locked decisions
1. Booster K1 EDU is the PRIMARY robot: first card on /jobs, "Hire this K1" → K1 3D model on /robot with checklist, "Export for real K1" (.py) on /robot and /report.
2. The 15 commercial robots (src/data/robots.ts) stay as "Specialised alternatives — honest comparison". Irrelevant ones are collapsed per venue type.
3. Economics = hours freed per day, never "replaces a whole shift":
   savings = hoursFreed{low,expected,high} × roleHourlyCost × daysOpenPerWeek × 4.33
   RENT: netRent = savings − distributor rent (no payback)
   BUY: upkeep = price × 10%/12; netBuy = savings − upkeep; payback = price / netBuy; roi3y
   Check example (tests): café, Keenon T8, 6 days, €9.24/h → savings ≈ €480/€720/€960, netRent ≈ +€110/+€350/+€590, payback ≈ 21.9/13.8/10.0 mo.
4. K1 economics: price from €9,000 incl. VAT (€7,500 ex VAT, generationrobots), battery up to 80 min, archetype greeter/guide (1 / 1.5 / 2 h/day, battery-capped unless swaps), no rent offer, honest limits: no hands → no carrying, no cleaning, no payments.
5. Prices: Keenon T8 €8,900 + rent €370 (verified); W3 €16,000 and T10 €12,000 (Riga retail); others = US list converted, labelled "estimate". Client numbers WITHOUT the +15% markup; commissions only in "Partner view — referral fee paid by distributor (assumption)".
6. Labour: waiter €9.24/h (CSB Q2 2026 €1,256 gross + 23.59%). Other roles labelled estimates.
7. Local AI default: qwen3-vl:4b-instruct (fallback 8b). Robot never speaks aloud; checklist + captions only. Handoff via sessionStorage only.
8. Report shows sources + "verified 26.11.2026, reference data, not a quote" + a short "How we calculate" box. Latvian sellers: Keen Robotic (Riga showroom), LAP Robotics, ProRobotics, aio.lv.

## 4. Demo flow (what the video and live demo show, in this order)
1. /upload: real phone video of a public space (RTU hall / AI Studio area or a café) → analysis (~15–25 s).
2. /jobs: Best match = K1 job (greeting / guiding / information) with honest hours, rent/buy money, limits; below: specialised alternatives (e.g. "food runs → Keenon T8 fits better").
3. Hire this K1 → /robot: K1 walks the 3D replica, checklist ticks, Present mode (P).
4. /report: owner summary, sources, "How we calculate", Export for real K1 (.py, Booster SDK).
Must work offline on the laptop (npm run dev, localhost:3000). Demo mode (mocks) must still work if AI fails.

## 5. Ownership (do NOT edit the other agent's files; ask in HANDOFF.md instead)
- Claude Code: app/upload, app/api, app/report, lib/ai, lib/roi, lib/k1export, src/data, scripts, e2e, README.
- Antigravity: app/jobs, app/robot, app/page.tsx, components/three, lib/executor, lib/robots/catalog.ts UI-only helpers.
- Shared (proposal required): types/contracts.ts, mocks/, AGENTS.md, package.json, FINAL_SPEC.md.

## 6. Task board (owner — status). Take the FIRST unchecked task you own whose dependencies are done.
- [x] C1 Claude: honest economics (hours freed, rent vs buy, verified prices) — commit b093061
- [ ] G1 Gemini: restore Booster K1 as PRIMARY (RobotModel.tsx + RobotExpressive.glb + K1Export from 36e27be; K1 card first on /jobs; Hire → K1 on /robot)
- [ ] C2 Claude: K1 economics + K1 jobs (decision 4) and restore k1export usage in /report (depends: none; coordinate field names in HANDOFF.md)
- [ ] G2 Gemini: /jobs cards show "Frees X–Y h/day", Rent row, Buy row, source badge; Best match card on top; collapse not-suitable; Partner view label; remove any "% cheaper than a human" text (depends: C1, C2)
- [ ] G3 Gemini: /robot overlay shows robot name + model; checklist ticks for K1 and all archetypes; Present mode works
- [ ] C3 Claude: /report "How we calculate" + sellers + Export for real K1; README "AI disclosure" section up to date
- [ ] C4 Claude: write docs/hacktribe.md — project page texts (Problem, Solution, What's done, Next steps; English, ≤ 150 words each) + a 5-min video script with timings
- [ ] G4 Gemini: app/page.tsx landing — positioning line, 3 steps, "Try demo"
- [ ] B1 Both: review the other's last commit (max 5 issues in REVIEW.md), fix own issues
- [ ] B2 Both: npm test + npm run e2e + npm run demo:check READY on both laptops; write result in HANDOFF.md → when all boxes are checked, the agent who finishes last writes "FINAL READY" in HANDOFF.md

## 7. Agent loop (run this EVERY time a human says "next")
1. git pull --rebase.
2. Read FINAL_SPEC.md, HANDOFF.md (messages to you), REVIEW.md (issues for you).
3. Answer every open message addressed to you in HANDOFF.md (ACCEPT / REJECT + reason / DONE).
4. Fix your open REVIEW.md issues, then do the first unchecked task you own (section 6). Small, safe changes only.
5. Need something in the other agent's files or a locked decision changed? Do NOT edit it — write a message in HANDOFF.md (type REQUEST or PROPOSAL, exact field/function names, why).
6. Run npm test (and npm run demo:check after UI/flow changes). Never push red tests.
7. Tick your box in section 6 (only your own boxes), add a short note to PROGRESS.md and a STATUS line in HANDOFF.md, commit, push.
8. Reply to the human in max 5 lines: what you did, what you need from the other agent, what is next.

Disagreement rule: a PROPOSAL is accepted if the other agent writes ACCEPT, or does not object within its next run. If both disagree twice on the same point, write "HUMAN DECISION NEEDED: <question, options A/B>" — humans decide, the spec gets updated.
