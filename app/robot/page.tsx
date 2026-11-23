"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SimCanvas } from "@/components/three/SimCanvas";
import { useScenarioExecutor, useSimulationData } from "@/lib/executor";
import { shortLabel } from "@/lib/ai/labels";
import {
  scriptFileName,
  toBoosterScript,
} from "@/lib/k1export/toBoosterScript";
import type { ScenarioStep, Zone } from "@/types/contracts";

interface ShiftTaskGroup {
  id: string;
  label: string;
  zoneName: string | null;
  startIndex: number;
  endIndex: number;
}

const META_LABELS = new Set(["Shift start", "Shift end"]);

function buildShiftTaskGroups(
  steps: ScenarioStep[],
  zones: Zone[],
  fallbackTitle: string,
): ShiftTaskGroup[] {
  const zoneLabelById = new Map<string, string>();
  for (const z of zones) {
    zoneLabelById.set(z.id, z.label);
  }

  const fallbackLabel = shortLabel(fallbackTitle);
  const rawGroups: {
    label: string;
    startIndex: number;
    endIndex: number;
    steps: ScenarioStep[];
  }[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const label = step.label?.trim() || fallbackLabel;
    const prev = rawGroups[rawGroups.length - 1];
    if (prev && prev.label === label) {
      prev.endIndex = i;
      prev.steps.push(step);
    } else {
      rawGroups.push({
        label,
        startIndex: i,
        endIndex: i,
        steps: [step],
      });
    }
  }

  const hasNonMeta = rawGroups.some((g) => !META_LABELS.has(g.label));
  const filtered = hasNonMeta
    ? rawGroups.filter((g) => !META_LABELS.has(g.label))
    : rawGroups;

  return filtered.map((group, idx) => {
    const walkTarget = group.steps.find(
      (s) => s.action === "walk_to" && s.target,
    )?.target;
    const anyTarget = group.steps.find((s) => s.target)?.target;
    const targetId = walkTarget ?? anyTarget ?? null;
    const zoneName = targetId ? (zoneLabelById.get(targetId) ?? targetId) : null;

    return {
      id: `${group.label}-${idx}`,
      label: group.label,
      zoneName,
      startIndex: group.startIndex,
      endIndex: group.endIndex,
    };
  });
}

function formatCurrentActionLine(
  status: "idle" | "running" | "completed",
  step: ScenarioStep | undefined,
  zones: Zone[],
  activeTaskZoneName: string | null,
): string {
  if (status === "idle") return "Ready to start shift";
  if (status === "completed") return "All shift tasks completed";
  if (!step) return "Running shift…";

  const zoneLabel = step.target
    ? (zones.find((z) => z.id === step.target)?.label ?? step.target)
    : activeTaskZoneName;

  switch (step.action) {
    case "walk_to":
      return zoneLabel ? `Walking to ${zoneLabel}` : "Walking across space";
    case "turn_to":
      return zoneLabel ? `Turning to ${zoneLabel}` : "Turning";
    case "point_to":
      return zoneLabel ? `Pointing at ${zoneLabel}` : "Pointing";
    case "wave":
      return zoneLabel ? `Waving at ${zoneLabel}` : "Waving to guests";
    case "say":
      if (step.label === "Shift start") return "Starting shift…";
      if (step.label === "Shift end") return "Finishing shift…";
      return zoneLabel ? `Assisting at ${zoneLabel}` : "Assisting guests";
    case "wait":
      return zoneLabel ? `Pausing at ${zoneLabel}` : "Pausing briefly";
  }
}

export default function RobotSimulationPage() {
  const simData = useSimulationData();
  const executor = useScenarioExecutor(simData.scene, simData.steps, true);
  const [followCamera, setFollowCamera] = useState<boolean>(true);
  const [presentMode, setPresentMode] = useState<boolean>(false);

  const enterPresentMode = useCallback(() => {
    setPresentMode(true);
    document.documentElement.classList.add("robohire-present-mode");
    try {
      if (
        !document.fullscreenElement &&
        typeof document.documentElement.requestFullscreen === "function"
      ) {
        void document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {
      // Fullscreen may be blocked by browser policy; visual present mode still activates
    }
  }, []);

  const exitPresentMode = useCallback(() => {
    setPresentMode(false);
    document.documentElement.classList.remove("robohire-present-mode");
    try {
      if (
        document.fullscreenElement &&
        typeof document.exitFullscreen === "function"
      ) {
        void document.exitFullscreen().catch(() => {});
      }
    } catch {
      // Ignore fullscreen exit errors
    }
  }, []);

  const togglePresentMode = useCallback(() => {
    if (presentMode) {
      exitPresentMode();
    } else {
      enterPresentMode();
    }
  }, [presentMode, enterPresentMode, exitPresentMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape" && presentMode) {
        e.preventDefault();
        exitPresentMode();
      } else if (
        (e.key === "p" || e.key === "P") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        togglePresentMode();
      }
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement && presentMode) {
        setPresentMode(false);
        document.documentElement.classList.remove("robohire-present-mode");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [presentMode, exitPresentMode, togglePresentMode]);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove("robohire-present-mode");
    };
  }, []);

  const isShiftScenario = simData.scenario.job_id === "shift";

  const taskGroups = useMemo(
    () =>
      buildShiftTaskGroups(
        executor.steps,
        simData.scene.zones,
        simData.job.title,
      ),
    [executor.steps, simData.scene.zones, simData.job.title],
  );

  const activeTaskGroup = useMemo(() => {
    if (executor.status !== "running" || executor.currentStepIndex === null) {
      return null;
    }
    return (
      taskGroups.find(
        (g) =>
          executor.currentStepIndex! >= g.startIndex &&
          executor.currentStepIndex! <= g.endIndex,
      ) ?? null
    );
  }, [executor.status, executor.currentStepIndex, taskGroups]);

  const currentStep =
    executor.currentStepIndex !== null
      ? executor.steps[executor.currentStepIndex]
      : undefined;

  const currentActionText = useMemo(
    () =>
      formatCurrentActionLine(
        executor.status,
        currentStep,
        simData.scene.zones,
        activeTaskGroup?.zoneName ?? null,
      ),
    [
      executor.status,
      currentStep,
      simData.scene.zones,
      activeTaskGroup?.zoneName,
    ],
  );

  const shiftJobTitles = useMemo(
    () => taskGroups.map((g) => g.label),
    [taskGroups],
  );

  function handleExportForRealK1() {
    const py = toBoosterScript(simData.scenario, simData.scene, {
      businessType: simData.businessType,
      what: isShiftScenario
        ? `whole shift: ${shiftJobTitles.join(", ")}`
        : simData.job.title,
    });
    const fileName = scriptFileName(simData.scenario);
    const url = URL.createObjectURL(
      new Blob([py], { type: "text/x-python;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

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
    <main
      data-present-mode={presentMode ? "true" : "false"}
      className={`relative flex w-full flex-col overflow-hidden bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 ${
        presentMode ? "h-screen" : "h-[calc(100vh-3.5rem)]"
      }`}
    >
      {/* Simulation Sub-Toolbar (hidden in Present mode) */}
      {!presentMode && (
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
                {simData.businessType}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              Room: {simData.scene.room.width}m × {simData.scene.room.depth}m •{" "}
              {simData.scene.zones.length} zones •{" "}
              <span className="font-semibold text-slate-900 dark:text-white">
                {isShiftScenario ? "Full Shift" : simData.job.title}
              </span>{" "}
              <span className="font-mono text-slate-500 dark:text-slate-400">
                ({taskGroups.length} {taskGroups.length === 1 ? "task" : "tasks"})
              </span>
            </p>
          </div>

          {/* Execution Controls */}
          <div className="flex flex-wrap items-center gap-2">
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

            <button
              type="button"
              data-testid="present-mode-btn"
              title="Fullscreen presentation mode (Press P)"
              onClick={enterPresentMode}
              className="cursor-pointer rounded-xl border border-indigo-400/50 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-indigo-500 active:scale-95"
            >
              ⛶ Present
            </button>

            <button
              type="button"
              data-testid="export-k1-btn"
              onClick={handleExportForRealK1}
              className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Export for real K1 (.py)
            </button>
          </div>
        </div>
      )}

      {/* Main Content: Unobstructed 3D Viewport + Shift Tasks Checklist Sidebar */}
      <div className="relative flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="relative flex-1 overflow-hidden">
          {presentMode && (
            <button
              type="button"
              data-testid="exit-present-btn"
              onClick={exitPresentMode}
              className="absolute left-4 top-4 z-30 cursor-pointer rounded-xl border border-slate-600/70 bg-slate-900/75 px-3 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur-md transition hover:bg-slate-800"
            >
              Exit Present (Esc)
            </button>
          )}
          <SimCanvas
            scene={simData.scene}
            businessType={simData.businessType}
            activeZoneId={executor.activeZoneId}
            startPosition={executor.startPosition}
            currentTargetInfo={executor.currentTargetInfo}
            poseRef={executor.poseRef}
            animation={executor.animation}
            isPointing={executor.isPointing}
            followCamera={followCamera}
            onTick={executor.tick}
          />

          {/* Job / Shift Completed ✓ Overlay Card */}
          {executor.status === "completed" && (
            <div
              data-testid="job-completed-card"
              className="pointer-events-auto absolute bottom-6 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 px-4"
            >
              <div className="rounded-2xl border-2 border-emerald-400/80 bg-white/95 p-5 text-slate-900 shadow-2xl backdrop-blur-md dark:bg-slate-900/95 dark:text-white">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/15 px-3 py-1 text-xs font-extrabold tracking-wide text-emerald-700 dark:text-emerald-300">
                    {isShiftScenario ? "Shift completed ✓" : "Job Completed ✓"}
                  </span>
                  <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    {taskGroups.length}/{taskGroups.length} tasks done
                  </span>
                </div>

                {/* Same checklist, all ✓ */}
                <ul className="mt-3 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {taskGroups.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-50/70 px-3 py-2 text-sm dark:bg-emerald-950/40"
                    >
                      <span className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-100">
                        <span className="text-base text-emerald-600 dark:text-emerald-400">
                          ✓
                        </span>
                        <span>{task.label}</span>
                      </span>
                      {task.zoneName && (
                        <span className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                          {task.zoneName}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {/* Plan Net €/month + Payback from robohire:plan */}
                <div className="mt-3 space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Net Shift Plan Savings
                    </span>
                    <span className="font-mono text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                      €{simData.plan.net_savings_eur_month}/month net
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-emerald-500/20 pt-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <span>
                      Payback:{" "}
                      <strong className="font-mono text-slate-900 dark:text-white">
                        {simData.plan.payback_months !== null
                          ? `${simData.plan.payback_months} months`
                          : "—"}
                      </strong>
                    </span>
                    <span>
                      Robot price:{" "}
                      <strong className="font-mono text-slate-900 dark:text-white">
                        €{simData.plan.robot_price_eur}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <Link
                    href="/jobs"
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    ← Back to Jobs
                  </Link>
                  <button
                    type="button"
                    data-testid="export-k1-completed-btn"
                    onClick={handleExportForRealK1}
                    className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Export for real K1
                  </button>
                  <button
                    type="button"
                    onClick={executor.replay}
                    className="cursor-pointer rounded-xl border border-sky-400/60 bg-sky-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-sky-500 active:scale-95"
                  >
                    ↻ Replay
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dedicated "Shift tasks" Checklist Sidebar */}
        <aside
          data-testid="shift-tasks-panel"
          className="z-20 flex max-h-72 w-full shrink-0 flex-col border-t border-slate-200 bg-white p-5 transition-colors dark:border-slate-800 dark:bg-slate-900/95 lg:max-h-none lg:w-96 lg:border-l lg:border-t-0 xl:w-[26rem]"
        >
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                Shift tasks
              </h2>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {simData.businessType}
              </p>
            </div>
            <span
              className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-bold ${statusBadgeClass}`}
            >
              {statusLabel}
            </span>
          </div>

          {/* One row per task grouped by step.label */}
          <ol className="flex-1 space-y-2.5 overflow-y-auto pr-1">
            {taskGroups.map((task) => {
              const isDone =
                executor.status === "completed" ||
                (executor.status === "running" &&
                  executor.currentStepIndex !== null &&
                  executor.currentStepIndex > task.endIndex);
              const isInProgress =
                executor.status === "running" &&
                executor.currentStepIndex !== null &&
                executor.currentStepIndex >= task.startIndex &&
                executor.currentStepIndex <= task.endIndex;

              return (
                <li
                  key={task.id}
                  data-testid="shift-task-row"
                  data-status={
                    isDone ? "done" : isInProgress ? "in_progress" : "pending"
                  }
                  className={`flex items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3.5 transition ${
                    isInProgress
                      ? "border-sky-500 bg-sky-50 text-slate-900 shadow-sm ring-1 ring-sky-400/40 dark:border-sky-400 dark:bg-sky-950/80 dark:text-white"
                      : isDone
                        ? "border-emerald-500/40 bg-emerald-50/70 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"
                        : "border-slate-200 bg-slate-50/80 text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                        isDone
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300"
                          : isInProgress
                            ? "bg-sky-500/20 text-sky-600 dark:text-sky-300"
                            : "bg-slate-200/80 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                      }`}
                    >
                      {isDone ? "✓" : isInProgress ? "▶" : "○"}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-base font-bold leading-snug">
                        {task.label}
                      </div>
                      {task.zoneName && (
                        <div className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">
                          {task.zoneName}
                        </div>
                      )}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-lg px-2 py-1 font-mono text-xs font-bold ${
                      isDone
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : isInProgress
                          ? "bg-sky-500/20 text-sky-700 dark:text-sky-200"
                          : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {isDone ? "✓ done" : isInProgress ? "▶ active" : "○ pending"}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Single line below with the current action */}
          <div
            data-testid="current-action-line"
            className="mt-4 flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-100/90 px-4 py-3 text-base font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-950/90 dark:text-sky-200"
          >
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                executor.status === "running"
                  ? "animate-pulse bg-sky-500"
                  : executor.status === "completed"
                    ? "bg-emerald-500"
                    : "bg-slate-400"
              }`}
            />
            <span className="truncate">{currentActionText}</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
