"use client";

import { useState } from "react";
import Link from "next/link";
import { SimCanvas } from "@/components/three/SimCanvas";
import { useScenarioExecutor, useSimulationData } from "@/lib/executor";
import type { ScenarioStep, Zone } from "@/types/contracts";

function formatStepSummary(step: ScenarioStep, zones: Zone[]): string {
  const zoneLabel = step.target
    ? (zones.find((z) => z.id === step.target)?.label ?? step.target)
    : "";

  switch (step.action) {
    case "walk_to":
    case "turn_to":
    case "point_to":
      return `→ ${zoneLabel}`;
    case "say":
      return step.text ? `"${step.text}"` : "";
    case "wait":
      return `${step.seconds ?? 0}s`;
    case "wave":
      return zoneLabel ? `→ ${zoneLabel}` : "gesture";
  }
}

export default function RobotSimulationPage() {
  const simData = useSimulationData();
  const executor = useScenarioExecutor(simData.scene, simData.steps, true);
  const [followCamera, setFollowCamera] = useState<boolean>(true);

  const statusBadgeClass =
    executor.status === "running"
      ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-200"
      : executor.status === "completed"
        ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
        : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";

  const statusLabel =
    executor.status === "running"
      ? "Running"
      : executor.status === "completed"
        ? "Completed"
        : "Idle";

  return (
    <main className="relative flex h-[calc(100vh-3.5rem)] w-full flex-col overflow-hidden bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      {/* Simulation Sub-Toolbar */}
      <div className="z-20 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-2.5 backdrop-blur-md transition-colors dark:border-slate-800 dark:bg-slate-900/95">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              3D Workspace Simulation
            </h1>
            <span className="rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-200">
              K1 (simulation stand-in)
            </span>
            <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {simData.source === "mock" ? "Demo Mode (mocks)" : "Custom Data"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
            Room: {simData.scene.room.width}m × {simData.scene.room.depth}m •{" "}
            {simData.scene.zones.length} zones • Job:{" "}
            <span className="font-semibold text-slate-900 dark:text-white">
              {simData.job.title}
            </span>{" "}
            <span className="font-mono text-slate-500 dark:text-slate-400">
              ({simData.scenario.job_id} • {executor.steps.length} steps)
            </span>
          </p>
        </div>

        {/* Execution Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-950/90">
            <span className="text-slate-500 dark:text-slate-400">Status:</span>
            <span
              className={`rounded border px-2 py-0.5 font-mono text-xs font-bold ${statusBadgeClass}`}
            >
              {statusLabel}
            </span>
            {executor.status === "running" && (
              <>
                <span className="text-slate-400 dark:text-slate-600">•</span>
                <span className="font-mono text-xs font-semibold text-sky-600 dark:text-sky-300">
                  {executor.phase}
                </span>
              </>
            )}
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-slate-500 dark:text-slate-400">Anim:</span>
            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
              {executor.animation}
            </span>
          </div>

          <button
            type="button"
            onClick={executor.start}
            className="cursor-pointer rounded-xl border border-emerald-500/50 bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-500 active:scale-95"
          >
            ▶ Start
          </button>

          <button
            type="button"
            onClick={executor.replay}
            className="cursor-pointer rounded-xl border border-sky-400/50 bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-sky-500 active:scale-95"
          >
            ↻ Replay
          </button>

          <button
            type="button"
            onClick={executor.reset}
            className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={() => setFollowCamera((v) => !v)}
            className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              followCamera
                ? "border-sky-500/50 bg-sky-500/15 text-sky-700 hover:bg-sky-500/25 dark:border-sky-400/50 dark:bg-sky-950/80 dark:text-sky-200"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            Follow Cam: {followCamera ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* Main Content: Unobstructed 3D Viewport + Dedicated Step List Sidebar */}
      <div className="relative flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="relative flex-1 overflow-hidden">
          <SimCanvas
            scene={simData.scene}
            businessType={simData.businessType}
            activeZoneId={executor.activeZoneId}
            startPosition={executor.startPosition}
            currentTargetInfo={executor.currentTargetInfo}
            poseRef={executor.poseRef}
            animation={executor.animation}
            isPointing={executor.isPointing}
            activeSpeech={executor.activeSpeech}
            followCamera={followCamera}
            onTick={executor.tick}
          />

          {/* High-Contrast Speech Banner (synced with 3D speech bubble) */}
          {executor.activeSpeech && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 w-full max-w-xl -translate-x-1/2 px-4">
              <div className="flex items-center gap-3 rounded-2xl border-2 border-sky-400 bg-slate-900/95 px-5 py-3 text-white shadow-2xl backdrop-blur-md">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-base text-sky-300">
                  🔊
                </span>
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-sky-300">
                    K1 (simulation stand-in) speaking
                  </div>
                  <p className="text-sm font-semibold leading-snug text-white">
                    &ldquo;{executor.activeSpeech}&rdquo;
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Job Completed ✓ Overlay Card showing NET savings from the RobotPlan */}
          {executor.status === "completed" && (
            <div
              data-testid="job-completed-card"
              className="pointer-events-auto absolute bottom-6 left-1/2 z-30 w-full max-w-md -translate-x-1/2 px-4"
            >
              <div className="rounded-2xl border-2 border-emerald-400/80 bg-white/95 p-5 text-slate-900 shadow-2xl backdrop-blur-md dark:bg-slate-900/95 dark:text-white">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/15 px-3 py-1 text-xs font-extrabold tracking-wide text-emerald-700 dark:text-emerald-300">
                    Job Completed ✓
                  </span>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {executor.steps.length}/{executor.steps.length} steps
                  </span>
                </div>

                <h3 className="mt-3 text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {simData.job.title}
                </h3>

                <div className="mt-3 space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Net Shift Plan Savings
                    </span>
                    <span className="font-mono text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                      €{simData.plan.net_savings_eur_month}/month net
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-emerald-500/20 pt-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                    <span>
                      Payback:{" "}
                      <strong className="font-mono">
                        {simData.plan.payback_months !== null
                          ? `${simData.plan.payback_months} mo`
                          : "—"}
                      </strong>
                    </span>
                    <span>
                      This job gross:{" "}
                      <strong className="font-mono">
                        €{simData.job.savings_eur_month}/mo
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5">
                  <Link
                    href="/jobs"
                    className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    ← Back to Jobs
                  </Link>
                  <button
                    type="button"
                    onClick={executor.replay}
                    className="cursor-pointer rounded-xl border border-sky-400/60 bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-sky-500 active:scale-95"
                  >
                    ↻ Replay Job
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dedicated Step List Sidebar (never overlaps 3D scene) */}
        <aside className="z-20 flex max-h-64 w-full shrink-0 flex-col border-t border-slate-200 bg-white p-4 transition-colors dark:border-slate-800 dark:bg-slate-900/95 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0 xl:w-96">
          <div className="mb-2.5 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                Scenario Steps ({executor.steps.length})
              </h2>
              <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                Start ({executor.startPosition.x.toFixed(1)}m,{" "}
                {executor.startPosition.z.toFixed(1)}m)
              </p>
            </div>
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold ${statusBadgeClass}`}
            >
              {statusLabel}
            </span>
          </div>

          <ol className="flex-1 space-y-1.5 overflow-y-auto pr-1 text-xs">
            {executor.steps.map((step, index) => {
              const isCurrent =
                executor.status === "running" &&
                executor.currentStepIndex === index;
              const isDone =
                executor.status === "completed" ||
                (executor.status === "running" &&
                  executor.currentStepIndex !== null &&
                  executor.currentStepIndex > index);
              const summary = formatStepSummary(step, simData.scene.zones);

              return (
                <li
                  key={`${step.action}-${step.target ?? index}-${index}`}
                  className={`flex items-start justify-between gap-2 rounded-xl border px-2.5 py-2 transition ${
                    isCurrent
                      ? "border-sky-500 bg-sky-50 text-slate-900 shadow-xs ring-1 ring-sky-400/50 dark:border-sky-400 dark:bg-sky-950/90 dark:text-white"
                      : isDone
                        ? "border-emerald-500/40 bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                        : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold opacity-75">
                        #{index + 1}
                      </span>
                      <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[11px] font-bold text-sky-700 dark:bg-slate-800/90 dark:text-sky-300">
                        {step.action}
                      </span>
                      {step.action !== "say" && summary && (
                        <span className="truncate font-semibold text-slate-900 dark:text-white">
                          {summary}
                        </span>
                      )}
                    </div>
                    {step.action === "say" && summary && (
                      <p className="mt-1 line-clamp-2 text-[11px] italic text-slate-600 dark:text-slate-200">
                        {summary}
                      </p>
                    )}
                  </div>

                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                      isCurrent
                        ? "bg-sky-500/20 text-sky-700 dark:bg-sky-500/30 dark:text-sky-200"
                        : isDone
                          ? "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                          : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {isCurrent
                      ? executor.phase
                      : isDone
                        ? "✓ done"
                        : "queued"}
                  </span>
                </li>
              );
            })}
          </ol>

          {executor.currentTargetInfo && (
            <div className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-300">
              Edge stop: (
              {executor.currentTargetInfo.stopPoint.x.toFixed(2)}m,{" "}
              {executor.currentTargetInfo.stopPoint.z.toFixed(2)}m) • outside{" "}
              {executor.currentTargetInfo.zone.id}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
