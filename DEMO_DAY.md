# DEMO_DAY — stage checklist (10 lines)

1. Night before / 1 h before: `git pull && npm install`, then `npm run demo:check` → must say **READY**. (`npm run doctor` shows what is red and the fix command.)
2. Start Ollama (menu-bar app, or `ollama serve`); model is `qwen3-vl:4b-instruct` (`ollama pull qwen3-vl:4b-instruct` if missing). Close heavy apps; plug in power.
3. `npm run dev` → wait for `[ai] warm-up: ... loaded` in the terminal (model is now in RAM, first Analyze takes ~15–25 s, not 45 s).
4. Open http://localhost:3000/upload in a fresh tab (full screen, 100% zoom) and check the **Try real example: Real hotel lobby** button exists.
5. Story: click **Try real example: Real hotel lobby** → /jobs (tasks fit a hotel) → **Hire this K1** → /robot **Start**: watch the checklist turn ✓ → net €/month card → **Export for real K1 (.py)**.
6. Live AI (only if time + room video ready): Upload → business type + hours/week → **Extract frames** → **Analyze** (~20–40 s) → /jobs. Otherwise stay on the real example.
7. If the AI is slow or fails ("Start Ollama…", timeout): click **Try real example** or **Try demo (no video needed)** — both work with no AI at all. Don't retry more than once on stage.
8. If the app itself misbehaves: reload `/upload` and start again from the real example; `sessionStorage` is cleared on every new run.
9. Backup laptop: set up with README → "Backup laptop setup", keep it open on /upload with the same showcase, Ollama running, `npm run dev` already started.
10. Last resort: https://robohire-six.vercel.app (demo mode only, no local AI) — `npm run e2e:prod` checks it.
