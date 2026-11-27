"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startDemo } from "@/lib/ai/demo";
import { clearHandoffStorage } from "@/lib/executor";

const HOW_IT_WORKS_STEPS = [
  {
    step: "01",
    title: "Record a Phone Video",
    description:
      "Walk through your venue with a phone camera (or pick a venue preset) so AI maps layout zones, aisle clearances, and shift schedules.",
  },
  {
    step: "02",
    title: "See Which Real Robot Fits & Honest ROI",
    description:
      "Compare commercial robots relevant to your venue against local employer payroll — including clear reasons when a robot does not fit.",
  },
  {
    step: "03",
    title: "Simulate in 3D, Then Rent or Buy",
    description:
      "Watch your best-match robot complete its tasks in a 3D replica of the space, then rent on monthly RaaS or buy from a local partner.",
  },
] as const;

export default function Home() {
  const router = useRouter();

  return (
    <main className="flex flex-1 flex-col justify-between bg-slate-50 px-6 py-10 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-10">
      <div className="mx-auto my-8 w-full max-w-5xl space-y-14">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-6xl">
            RoboHire
          </h1>

          <p
            data-testid="landing-value-prop"
            className="mt-5 text-lg font-medium leading-relaxed text-slate-700 dark:text-slate-200 sm:text-xl"
          >
            AI robot audit for venues: phone video → which real robot fits →
            honest ROI → rent or buy from a local partner
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              data-testid="landing-demo-btn"
              onClick={() => {
                clearHandoffStorage();
                startDemo();
                window.dispatchEvent(new Event("robohire:storage"));
                router.push("/jobs");
              }}
              className="cursor-pointer rounded-xl border border-sky-400/50 bg-sky-600 px-8 py-3.5 text-base font-bold text-white shadow-lg transition hover:bg-sky-500 active:scale-95"
            >
              Try demo
            </button>
            <Link
              href="/upload"
              data-testid="landing-start-btn"
              className="rounded-xl border border-slate-300 bg-white px-8 py-3.5 text-base font-bold text-slate-800 shadow-sm transition hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Upload venue video
            </Link>
          </div>
        </section>

        <section aria-labelledby="how-it-works-heading" className="space-y-6">
          <div className="text-center">
            <h2
              id="how-it-works-heading"
              className="text-sm font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400"
            >
              How it works
            </h2>
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

      <footer className="mx-auto w-full max-w-5xl border-t border-slate-200 pt-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-500">
        RoboHire • AI Robot Audit &amp; 3D Venue Simulation
      </footer>
    </main>
  );
}
