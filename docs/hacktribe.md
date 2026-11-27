# RoboHire — HackTribe project page + video script

Challenge **PCH1 "Let a Robot Assist You"** (Latvian IT Cluster & AI Studio): a business use case for **Booster K1 EDU**, shown working in simulation.

All numbers come from the app (`src/data/*.ts`, `lib/roi/*`) and match the deck. Prices verified 26.11.2026: reference data, not quotes. AI use: `docs/AI_DISCLOSURE.md`.

---

## Project page texts (English, ready to paste)

### Problem

Owners keep hearing "a robot could be your next employee", but nobody shows them *which* job, in *their* space, and whether it pays off. Brochures promise to "replace a waiter". Real robots free a few hours a day and have hard limits: battery, no hands, aisle width, steps. A Booster K1 EDU costs €9,000 incl. VAT and has no ready business case, so owners either ignore robots or buy the wrong one.

### Solution

RoboHire turns a short phone video of a venue into an honest robot job offer. A local vision AI maps the zones. Code, not AI, does the money: hours freed × Latvian 2026 staff cost, rent vs buy, payback. Booster K1 EDU is the primary candidate (greeter and guide), checked against 15 specialised robots. Before the real K1 walks, a **safety & navigation check** tests the route, aisle widths and crowded zones in the 3D twin. Then K1 does the shift in 3D and RoboHire exports a Booster SDK Python script.

### What's done so far

**Works (offline on a laptop):**
- Phone video → zones in ~15–25 s with local Ollama qwen3-vl; demo mode without AI.
- Honest ROI: K1 frees 1–1.3 h/day (one 80-min charge), €290–340/mo at €9.93/h, payback 27–33 months at €7,500 ex VAT. Fit: Partial, and we say so.
- 15-robot benchmark, €4.1k (Temi) → €87.4k (Gausium 75P). Keenon T8 frees 2–3 h/day for food runs.
- Safety & navigation check: aisle width vs K1 minimum, steps/elevators/doors flagged, crowded zones marked "slow / pause".
- Owner report with sources, and a Python export that compiles.

**Simulated / not yet real:** K1 walking is a 3D simulation; the script has not run on a physical K1; zones and aisle widths are estimated from video, not measured; hours freed are assumptions.

### Goal & next steps

1. Run the exported script on a real K1 at the RTU AI Studio demo area; measure walking and hours freed.
2. Pilot in 2–3 Riga venues (café, hotel lobby, office reception).
3. Get written quotes from Latvian sellers (Keen Robotic, LAP Robotics, ProRobotics, aio.lv).
4. Business model: free scan for owners, referral fee paid by the distributor (assumption to validate).

### Ask

A K1 pilot in the RTU AI Studio demo area and time on the real K1 to run our exported script.

---

## Video script (≤ 5:00, follows the deck)

One journey only: **upload video → zones + safety check → K1 job + honest ROI → 3D K1 shift → Python export.**

| Time | Screen to record | Narration |
| --- | --- | --- |
| 0:00–0:45 | Face to camera, then landing page | "Could a robot be your next employee? Owners hear that all the time. But nobody tells them *which* job, in *their* space, and whether it pays off. A Booster K1 costs nine thousand euros, and it has no ready business case. That's the problem we took on for PCH1." |
| 0:45–1:15 | Landing page: positioning line, 3 steps | "RoboHire turns a short phone video of your venue into an honest robot job for the Booster K1, checks it's safe to walk, shows it in 3D, and exports code for the real robot." |
| 1:15–1:50 | /upload: pick the café video, venue type "Tight Café" (56 h/week = 6 days) → Extract frames → Analyze | "Here's a phone video of a venue. A vision model runs locally on this laptop, no cloud. It only maps the zones. Every hour and every euro comes from transparent formulas, not from the AI." |
| 1:50–2:25 | /jobs: Booster K1 EDU "Best match" card | "Best match: Booster K1 as greeter and guide. On one 80-minute charge it frees one to 1.3 hours a day, worth €290 to €340 a month at €9.93 an hour. Buy only, €7,500 before VAT, payback 27 to 33 months. That's a Partial fit, and we say so. No hands means no carrying, no cleaning, no payments." |
| 2:25–2:35 | Scroll to "Specialised alternatives" | "For food runs, a Keenon T8 fits better: two to three hours a day. We'd rather tell you that than oversell the K1." |
| 2:35–3:00 | "Hire this K1" → /robot, Start, sidebar "Safety & navigation check", press P | "Hire this K1. Before a real K1 walks this route, we check it in the 3D twin: aisle width against the K1 minimum, steps and elevators flagged, crowded zones marked slow or pause. Then it does the shift, and the checklist ticks off. Export for real K1 gives a Python script for the Booster SDK. It hasn't run on a physical K1 yet; that's our next step." |
| 3:00–4:00 | /report: Best match, "How we calculate", Sources & sellers; then a deck slide (users + business model) | "Who is it for? Café, hotel and office owners who want a first honest answer before they spend money. The owner gets a report with formulas, sources and Latvian sellers. We compare against 15 real robots, from €4,100 to €87,400. Business model: the scan is free for owners; distributors pay a referral fee. That's an assumption we still have to validate." |
| 4:00–5:00 | Face to camera / team slide | "We're [Name 1] and [Name 2]. We built this with AI tools, all listed in our disclosure. Our ask: a K1 pilot in the RTU AI Studio demo area, and time on the real K1 to run our exported script. RoboHire: find the job where a robot can honestly be your next employee. Thank you." |

**Backup:** if Analyze is slow, say "here's one we analysed earlier" and click **Try real example: Real café space**. The rest of the flow is the same. Use the café, not the hotel example: the deck numbers are the café case (6 days/week); the hotel example is open 7 days, so the app shows €340–400/mo and 22–27 months there.

### Recording checklist

- [ ] `npm run demo:check` says READY; `npm run dev`, open http://localhost:3000.
- [ ] Ollama running and warmed up: run one Analyze before recording (first call loads the model).
- [ ] Demo data ready: the café video on the desktop; **Try real example: Real café space** as backup. Check the K1 card says 1.1–1.3 h/day, €290–340/mo, payback 27–33 months.
- [ ] Browser zoom 100%, window full screen, light theme, notifications off, bookmarks bar hidden.
- [ ] Clear old runs: start from the landing page in a fresh tab (sessionStorage resets).
- [ ] On /robot, wait for the K1 model to load before pressing Start; P for Present mode, Esc to exit.
- [ ] Keep the take ≤ 5:00, English, upload to YouTube before 28.11 09:30.
