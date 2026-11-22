"use client";

import { useMemo } from "react";
import Link from "next/link";
import { mockJobs } from "@/mocks";
import type { Fit, Job } from "@/types/contracts";

interface FitStyle {
  label: string;
  badgeClass: string;
  scoreBarClass: string;
  cardClass: string;
}

const FIT_STYLES: Record<Fit, FitStyle> = {
  good: {
    label: "Подходит",
    badgeClass:
      "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    scoreBarClass: "bg-emerald-500",
    cardClass:
      "border-emerald-500/40 bg-white shadow-md dark:border-emerald-500/30 dark:bg-slate-900",
  },
  partial: {
    label: "Частично",
    badgeClass:
      "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    scoreBarClass: "bg-amber-500",
    cardClass:
      "border-amber-500/40 bg-white shadow-sm dark:border-amber-500/30 dark:bg-slate-900",
  },
  no: {
    label: "Не подходит",
    badgeClass:
      "border-slate-400/40 bg-slate-500/15 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400",
    scoreBarClass: "bg-slate-400 dark:bg-slate-600",
    cardClass:
      "border-slate-300/70 bg-slate-100/70 opacity-60 grayscale-[35%] dark:border-slate-800 dark:bg-slate-900/40",
  },
};

function JobCard({ job, rank }: { job: Job; rank: number }) {
  const style = FIT_STYLES[job.fit];
  const isNotSuitable = job.fit === "no";

  return (
    <article
      data-testid={`job-card-${job.id}`}
      data-fit={job.fit}
      className={`flex flex-col justify-between rounded-2xl border p-6 transition ${style.cardClass}`}
    >
      <div className="space-y-4">
        {/* Header: Rank, Title, Fit Badge, and Score */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-bold text-slate-400 dark:text-slate-500">
                #{rank}
              </span>
              <h2
                className={`text-xl font-bold tracking-tight ${
                  isNotSuitable
                    ? "text-slate-600 dark:text-slate-400"
                    : "text-slate-900 dark:text-white"
                }`}
              >
                {job.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold tracking-wide ${style.badgeClass}`}
            >
              {style.label}
            </span>
            <div className="flex items-baseline gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono dark:border-slate-800 dark:bg-slate-950">
              <span
                className={`text-base font-extrabold ${
                  isNotSuitable
                    ? "text-slate-500 dark:text-slate-400"
                    : "text-slate-900 dark:text-white"
                }`}
              >
                {job.score}
              </span>
              <span className="text-xs text-slate-400">/100</span>
            </div>
          </div>
        </div>

        {/* Score Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={`h-full rounded-full transition-all ${style.scoreBarClass}`}
            style={{ width: `${Math.max(0, Math.min(100, job.score))}%` }}
          />
        </div>

        {/* Why & Limitations */}
        <div className="grid gap-3 pt-1 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/50">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Почему (Why it fits)
            </div>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {job.why}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/50">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Ограничения (Limitations)
            </div>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {job.limits}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Footer: Hours/week, Savings €/month, Payback months */}
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-200/80 pt-4 text-center dark:border-slate-800/80">
        <div className="rounded-lg bg-slate-100/80 px-3 py-2 dark:bg-slate-950/60">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Часов в неделю
          </dt>
          <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
            {job.hours_per_week} ч/нед
          </dd>
        </div>

        <div className="rounded-lg bg-slate-100/80 px-3 py-2 dark:bg-slate-950/60">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Экономия €/мес
          </dt>
          <dd
            className={`mt-0.5 font-mono text-base font-bold ${
              job.savings_eur_month > 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-slate-500 dark:text-slate-500"
            }`}
          >
            €{job.savings_eur_month}/мес
          </dd>
        </div>

        <div className="rounded-lg bg-slate-100/80 px-3 py-2 dark:bg-slate-950/60">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Окупаемость
          </dt>
          <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
            {job.payback_months !== null ? `${job.payback_months} мес.` : "—"}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function JobsPage() {
  const sortedJobs = useMemo(
    () => [...mockJobs.jobs].sort((a, b) => b.score - a.score),
    [],
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Top Navigation & Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                ← Home
              </Link>
              <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 font-mono text-xs font-semibold text-sky-700 dark:text-sky-300">
                {mockJobs.business_type}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
              Matched Booster K1 Robot Jobs
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Ranked by capability fit score (0–100), weekly hours, estimated
              monthly savings, and payback period.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/upload"
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Upload Video
            </Link>
            <Link
              href="/robot"
              className="rounded-lg border border-sky-500/50 bg-sky-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-sky-500"
            >
              3D Simulation →
            </Link>
          </div>
        </header>

        {/* Sorted Job Cards List */}
        <section className="space-y-4" aria-label="Matched Robot Jobs">
          {sortedJobs.map((job, idx) => (
            <JobCard key={job.id} job={job} rank={idx + 1} />
          ))}
        </section>
      </div>
    </main>
  );
}
