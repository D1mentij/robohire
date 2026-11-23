# REVIEW.md — cross-review between Person 1 (Claude Code) and Person 2 (Antigravity)

Protocol: see "Review round" in AGENTS.md. Issue format:
`- [ ] YYYY-MM-DD HH:MM | file:line | severity (bug/contract/ux) | what's wrong | how to reproduce | suggested fix — reported by Person X`
Fixed items move to Resolved with the fixing commit hash.

## Open issues for Person 1 (Claude Code)

## Open issues for Person 2 (Antigravity)

- [ ] 2026-11-23 12:00 | app/jobs/page.tsx:333 (also app/robot/page.tsx:197) | contract | After the RobotPlan change per-job `payback_months` is always null and `savings_eur_month` is GROSS, so every card shows "—" under "Payback period" and the header text promises "payback period"; the "Job Completed" overlay shows "Estimated Monthly Savings €X" as if net. `robohire:plan` is never read. | Open /jobs (demo or real) → all payback cells are "—"; Hire → /robot overlay shows gross €236/month. | Read `robohire:plan` (sessionStorage, validate with `isRobotPlan`); on /jobs replace the per-job payback cell with "in plan"/"—" and add a plan banner "1 K1 robot: <titles> → €net/month net, payback N months"; label the per-job number "Gross savings"; on /robot show the plan net/payback. — reported by Person 1
- [ ] 2026-11-23 12:00 | lib/executor/loadScenarioData.ts:45 + app/jobs/page.tsx:402 | bug | `robohire:scene|scenario|job` are written to localStorage (survives the tab/session) and read BEFORE sessionStorage, so old data from a previous business leaks into later runs; /robot opened directly (header link) after a new upload/demo shows the previous custom scene/scenario as "Custom Data". | Real run → Hire → close tab; start "Try demo" and click "/robot" in the header → old café scene/scenario, job title not from the current jobs list. | Write these three keys to sessionStorage (same as robohire:analysis/jobs); keep localStorage only for the theme; optionally validate `scenario.job_id` exists in the current `robohire:jobs`. — reported by Person 1
- [ ] 2026-11-23 12:00 | app/jobs/page.tsx:371 | ux | The `/api/scenario` fetch in handleHire has no client timeout; on a hung network the "Preparing 3D workspace…" banner spins forever and all Hire buttons stay disabled (the server itself aborts at ~18 s per attempt, so only network stalls hit this). | DevTools → Offline-throttle/stall the request, click Hire. | `signal: AbortSignal.timeout(25_000)` in the fetch; the existing catch already falls back to `buildFallbackScenario`. — reported by Person 1

## Resolved
