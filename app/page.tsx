"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startDemo } from "@/lib/ai/demo";

const HOW_IT_WORKS_STEPS = [
  {
    step: "01",
    title: "Upload a Space Video",
    description:
      "Record a short video (up to 60 seconds) of your café, retail floor, or reception area and enter your weekly hours and staff hourly cost.",
  },
  {
    step: "02",
    title: "Match Booster K1 Jobs & ROI",
    description:
      "AI maps your floor zones, identifies repetitive tasks, ranks Booster K1 fit (0–100) with honest hardware limitations, and calculates monthly € savings and payback.",
  },
  {
    step: "03",
    title: "Hire & Simulate in 3D",
    description:
      "Click Hire on any suitable job to deploy the Booster K1 inside an interactive 3D replica of your space and watch it execute the scenario live.",
  },
] as const;

export default function Home() {
  const router = useRouter();

  return (
    <main className="flex flex-1 flex-col justify-between bg-slate-50 px-6 py-10 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-10">
      {/* Hero + How It Works */}
      <div className="mx-auto my-8 w-full max-w-5xl space-y-14">
        <section className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3.5 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
            <span>A Recruitment Agency for Robots • Booster K1 Humanoid</span>
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-6xl">
            RoboHire
          </h1>

          <p className="mt-5 text-lg leading-relaxed text-slate-600 dark:text-slate-300 sm:text-xl">
            Upload a short video of your business space to discover which
            repetitive jobs a Booster K1 humanoid robot can take over, estimate
            monthly savings and payback, and watch it work in a 3D replica of
            your room.
          </p>

          {/* Primary Action Buttons */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/upload"
              data-testid="landing-start-btn"
              className="rounded-xl border border-sky-400/50 bg-sky-600 px-8 py-3.5 text-base font-bold text-white shadow-lg transition hover:bg-sky-500 active:scale-95"
            >
              Start
            </Link>
            <button
              type="button"
              data-testid="landing-demo-btn"
              onClick={() => {
                startDemo();
                router.push("/jobs");
              }}
              className="cursor-pointer rounded-xl border border-slate-300 bg-white px-8 py-3.5 text-base font-bold text-slate-800 shadow-sm transition hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Try demo
            </button>
          </div>
        </section>

        {/* 3-Step How It Works */}
        <section aria-labelledby="how-it-works-heading" className="space-y-6">
          <div className="text-center">
            <h2
              id="how-it-works-heading"
              className="text-sm font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400"
            >
              How it works
            </h2>
            <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              From smartphone video to 3D robot deployment in three steps
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {HOW_IT_WORKS_STEPS.map((item) => (
              <div
                key={item.step}
                className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <span className="inline-block rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 font-mono text-xs font-bold text-sky-700 dark:text-sky-300">
                    Step {item.step}
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-5xl border-t border-slate-200 pt-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-500">
        RobotHack 2026 • Booster K1 Humanoid Job Matcher & 3D Workspace
        Simulator
      </footer>
    </main>
  );
}
