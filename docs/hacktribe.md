# RoboHire — HackTribe project page + video script

Challenge PCH1 (Latvian IT Cluster & AI Studio): "Could a robot be your next employee? Create a business use case for Booster K1 EDU — show it working in simulation."

All numbers below come from the app (FINAL_SPEC.md decisions 3–6). Prices were verified on 26.11.2026. They are reference data, not quotes.

---

## Project page texts (English, ≤ 150 words each)

### Problem

Small businesses in Latvia keep hearing that "robots are coming", but an owner can't easily tell which job a robot could actually take over in *their* space, or whether it pays off. Vendor brochures promise to "replace a waiter". Real robots free a few hours of staff time per day, and there are honest limits: battery, no hands, aisle width. Without a quick, honest first check, owners either ignore robots or buy the wrong one. Hardware like the Booster K1 EDU has no ready business case. Buyers ask "what would it *do* here?" and nobody can show them before they spend €9,000.

### Solution

RoboHire turns a short phone video of a business space into an honest robot job offer. A local vision AI (it runs on a laptop, no cloud) maps the floor plan and finds repetitive tasks. Code, not AI, works out the money: hours freed per day × the Latvian 2026 staff cost, with rent vs buy, payback and a low/expected/high range for each. Booster K1 EDU is the primary candidate, as a greeter and guide. RoboHire also checks the K1 honestly against 15 specialised commercial robots and says plainly when, for example, a tray robot fits better. Click "Hire this K1" and the K1 does the shift in a 3D replica of your space. RoboHire then produces an owner report and a Python script for the real K1 (Booster SDK).

### What's done

A working prototype runs offline on a MacBook (Next.js, react-three-fiber, local Ollama qwen3-vl).
- Video → floor plan + tasks in about 15–25 s, with a demo mode that needs no AI.
- Honest economics: hours freed per day, rent vs buy, 10%/yr upkeep and payback. Waiter cost is €9.24/h (CSB Q2 2026). The Keenon T8 price and rent are a distributor quote.
- Booster K1 EDU as the best match. The 15 commercial robots give an honest comparison, with the ones that don't fit collapsed.
- A 3D simulation: K1 walks the replica of the space and the checklist ticks off; there is a Present mode.
- An owner report with sources, "How we calculate" and Latvian sellers.
- "Export for real K1": a Booster SDK Python script with safety notes.
- Automated tests, an end-to-end demo test and a one-command readiness check.

### Next steps

1. Run the exported script on a real Booster K1 at the AI Studio demonstration area (RTU). Calibrate walking against the 3D plan and measure the real hours freed.
2. Pilot with 2–3 Riga venues (a café, a hotel lobby, an office reception). Replace our assumptions with measured data.
3. Get written offers from the Latvian sellers (Keen Robotic, LAP Robotics, ProRobotics, aio.lv) so the report can include a real quote.
4. Add K1 battery-swap and charging planning, plus multi-robot plans (K1 greeting + a tray robot running food).
5. Business model: free scan for owners, with a referral fee paid by the distributor (an assumption still to be validated).

---

## 5-minute video script (English)

Record at 100% zoom, full screen, at http://localhost:3000. Run `npm run demo:check` (it must say READY) and start Ollama before recording. If the AI is slow, use **Try real example**: it needs no AI.

| Time | Screen | Voice-over (spoken by a human; the robot never speaks) |
| --- | --- | --- |
| 0:00–0:25 | Face to camera / landing page | "Could a robot be your next employee? Owners hear that a lot, but nobody tells them *which* job, in *their* space, and whether it pays off. We built RoboHire to answer that honestly, for the Booster K1." |
| 0:25–0:40 | Landing → "Try demo" / /upload | "All you need is a short phone video of your space." |
| 0:40–1:20 | /upload: pick the phone video (RTU hall / AI Studio area or a café), business type, hours per week → Extract frames → Analyze | "A local vision AI runs right on this laptop, no cloud. It maps the floor plan and the repetitive tasks. Important: the AI only describes the space. Every euro and hour comes from transparent formulas." |
| 1:20–2:20 | /jobs: Booster K1 EDU "Best match" card on top | "Best match: Booster K1 EDU as a greeter and guide. On one 80-minute charge it frees one to 1.3 hours a day of reception time, worth €290 to €340 a month at €9.93 an hour. There's no rent offer, so you buy it, €7,500 before VAT, €9,000 with it, and it pays back in 27 to 33 months. That's a Partial fit, and we say so. And the honest limits: no hands, so no carrying, no cleaning, no payments." |
| 2:20–2:50 | Scroll to "Specialised alternatives" (others collapsed) | "We also check 15 real commercial robots. For running food, a Keenon T8 fits better. It frees two to three hours a day, rents for €370 a month, and that's a real distributor quote. We'd rather tell you that than oversell the K1." |
| 2:50–3:40 | Click "Hire this K1" → /robot, Start, press P for Present mode | "Hire this K1, and it does the shift in a 3D replica of *your* space. It walks to the entrance, waves, points visitors to the right zone, and the checklist ticks off each step. Captions instead of speech, like a real deployment where you control what it says." |
| 3:40–4:25 | /report: Best match block, "How we calculate", Sources & sellers, "Export for real K1" → Download .py | "The owner gets a printable report: the formulas, the sources and the Latvian sellers. Prices were verified yesterday and are reference data, not a quote. And this is the bridge to reality: the same scenario exported as a Python script for the official Booster SDK." |
| 4:25–5:00 | Face to camera / roadmap slide | "Next step: run this script on the real K1 at the AI Studio demo area, then pilot with three Riga venues. RoboHire: find the job where a robot can honestly be your next employee. Thank you." |

**Backup:** if live Analyze fails, say "here's one we recorded earlier" and click **Try real example**. The rest of the flow is identical.
