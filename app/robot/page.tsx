"use client";

import Link from "next/link";
import { SimCanvas } from "@/components/three/SimCanvas";
import { useSimulationData, useWalkExecutor } from "@/lib/executor";

export default function RobotSimulationPage() {
  const simData = useSimulationData();
  const executor = useWalkExecutor(simData.scene, simData.walkSteps, true);

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* Top HUD Bar */}
      <header className="z-20 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 bg-slate-900/85 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            ← Home
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold tracking-tight text-white">
                RoboHire 3D Simulation
              </h1>
              <span className="rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
                K1 (simulation stand-in)
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                {simData.source === "mock" ? "Demo Mode (mocks)" : "Custom Data"}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Room: {simData.scene.room.width}m × {simData.scene.room.depth}m •{" "}
              {simData.scene.zones.length} zones • Job:{" "}
              <span className="font-mono text-slate-200">
                {simData.scenario.job_id}
              </span>
            </p>
          </div>
        </div>

        {/* Execution Controls */}
        <div className="flex items-center gap-2.5">
          <div className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-1.5 text-xs sm:flex">
            <span className="text-slate-400">State:</span>
            <span className="font-mono font-semibold text-amber-300">
              {executor.status.toUpperCase()}
              {executor.status === "running" ? ` (${executor.phase})` : ""}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Anim:</span>
            <span className="font-mono font-semibold text-emerald-300">
              {executor.animation}
            </span>
          </div>

          <button
            type="button"
            onClick={executor.startOrReplay}
            className="cursor-pointer rounded-lg border border-sky-400/50 bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-500 active:scale-95"
          >
            {executor.status === "idle" ? "▶ Start Walk" : "↻ Replay Walk"}
          </button>

          <button
            type="button"
            onClick={executor.resetToStart}
            className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 active:scale-95"
          >
            Reset
          </button>
        </div>
      </header>

      {/* Main 3D Viewport */}
      <div className="relative flex-1">
        <SimCanvas
          scene={simData.scene}
          activeZoneId={executor.activeZoneId}
          startPosition={executor.startPosition}
          currentTargetInfo={executor.currentTargetInfo}
          poseRef={executor.poseRef}
          animation={executor.animation}
          onTick={executor.tick}
        />

        {/* Floating Step Sequence Card */}
        <aside className="pointer-events-auto absolute right-4 top-4 z-20 w-72 rounded-xl border border-slate-800/90 bg-slate-900/90 p-3.5 shadow-xl backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Walk Executor (~0.5 m/s)
            </h2>
            <span className="font-mono text-[11px] text-slate-400">
              Start ({executor.startPosition.x.toFixed(1)},{" "}
              {executor.startPosition.z.toFixed(1)})
            </span>
          </div>

          <ol className="space-y-1.5 text-xs">
            {executor.validSteps.map((step, index) => {
              const isCurrent =
                executor.status === "running" &&
                executor.currentStepIndex === index;
              const isDone =
                executor.status === "completed" ||
                (executor.status === "running" &&
                  executor.currentStepIndex > index);
              const zone = simData.scene.zones.find(
                (z) => z.id === step.target,
              );

              return (
                <li
                  key={`${step.action}-${step.target ?? index}-${index}`}
                  className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 transition ${
                    isCurrent
                      ? "border-sky-400/70 bg-sky-950/70 text-sky-100"
                      : isDone
                        ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-200"
                        : "border-slate-800 bg-slate-950/50 text-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] opacity-75">
                      #{index + 1}
                    </span>
                    <span className="font-mono font-semibold">
                      {step.action}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="font-medium text-white">
                      {zone ? zone.label : step.target}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] uppercase">
                    {isCurrent ? executor.phase : isDone ? "done" : "queued"}
                  </span>
                </li>
              );
            })}
          </ol>

          {executor.currentTargetInfo && (
            <div className="mt-2.5 rounded-md border border-slate-800 bg-slate-950/70 px-2.5 py-1.5 font-mono text-[11px] text-slate-300">
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
