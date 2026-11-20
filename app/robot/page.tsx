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
      ? "border-amber-400/60 bg-amber-500/20 text-amber-200"
      : executor.status === "completed"
        ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
        : "border-slate-600 bg-slate-800 text-slate-300";

  const statusLabel =
    executor.status === "running"
      ? "Running"
      : executor.status === "completed"
        ? "Completed"
        : "Idle";

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* Top HUD Bar */}
      <header className="z-20 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-slate-900/90 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            ← Home
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-base font-bold tracking-tight text-white">
                RoboHire 3D Simulation
              </h1>
              <span className="rounded-full border border-sky-400/50 bg-sky-500/20 px-2.5 py-0.5 text-xs font-semibold text-sky-200">
                K1 (simulation stand-in)
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 font-mono text-[11px] text-slate-300">
                {simData.source === "mock" ? "Demo Mode (mocks)" : "Custom Data"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-300">
              Room: {simData.scene.room.width}m × {simData.scene.room.depth}m •{" "}
              {simData.scene.zones.length} zones • Job:{" "}
              <span className="font-mono font-semibold text-white">
                {simData.scenario.job_id}
              </span>{" "}
              ({executor.steps.length} steps)
            </p>
          </div>
        </div>

        {/* Execution Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/90 px-3 py-1.5 text-xs">
            <span className="text-slate-400">Status:</span>
            <span
              className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${statusBadgeClass}`}
            >
              {statusLabel}
            </span>
            {executor.status === "running" && (
              <>
                <span className="text-slate-600">•</span>
                <span className="font-mono text-xs text-sky-300">
                  {executor.phase}
                </span>
              </>
            )}
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Anim:</span>
            <span className="font-mono font-semibold text-emerald-300">
              {executor.animation}
            </span>
          </div>

          <button
            type="button"
            onClick={executor.start}
            className="cursor-pointer rounded-lg border border-emerald-400/60 bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500 active:scale-95"
          >
            ▶ Start
          </button>

          <button
            type="button"
            onClick={executor.replay}
            className="cursor-pointer rounded-lg border border-sky-400/60 bg-sky-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-sky-500 active:scale-95"
          >
            ↻ Replay
          </button>

          <button
            type="button"
            onClick={executor.reset}
            className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 active:scale-95"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={() => setFollowCamera((v) => !v)}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              followCamera
                ? "border-indigo-400/60 bg-indigo-950/80 text-indigo-200 hover:bg-indigo-900/80"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Follow Cam: {followCamera ? "ON" : "OFF"}
          </button>
        </div>
      </header>

      {/* Main Content: Unobstructed 3D Viewport + Dedicated Step List Sidebar */}
      <div className="relative flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="relative flex-1 overflow-hidden">
          <SimCanvas
            scene={simData.scene}
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
        </div>

        {/* Dedicated Step List Sidebar (never overlaps 3D scene) */}
        <aside className="z-20 flex max-h-64 w-full shrink-0 flex-col border-t border-slate-800 bg-slate-900/95 p-4 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0 xl:w-96">
          <div className="mb-2.5 flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                Scenario Steps ({executor.steps.length})
              </h2>
              <p className="font-mono text-[11px] text-slate-400">
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
                  className={`flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2 transition ${
                    isCurrent
                      ? "border-sky-400 bg-sky-950/90 text-white shadow-md ring-1 ring-sky-400/50"
                      : isDone
                        ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-100"
                        : "border-slate-800 bg-slate-950/60 text-slate-300"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold opacity-80">
                        #{index + 1}
                      </span>
                      <span className="rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-[11px] font-bold text-sky-300">
                        {step.action}
                      </span>
                      {step.action !== "say" && summary && (
                        <span className="truncate font-semibold text-white">
                          {summary}
                        </span>
                      )}
                    </div>
                    {step.action === "say" && summary && (
                      <p className="mt-1 line-clamp-2 text-[11px] italic text-slate-200">
                        {summary}
                      </p>
                    )}
                  </div>

                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                      isCurrent
                        ? "bg-sky-500/30 text-sky-200"
                        : isDone
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "text-slate-500"
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
            <div className="mt-2.5 rounded-md border border-slate-800 bg-slate-950/80 px-2.5 py-1.5 font-mono text-[11px] text-slate-300">
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
