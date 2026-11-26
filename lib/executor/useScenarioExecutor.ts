"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  filterValidSteps,
  type ScenarioStep,
  type Scene,
  type Zone,
} from "@/types/contracts";
import {
  calculateZoneStopPoint,
  getDefaultStartPosition,
  ROBOT_TURN_SPEED,
  ROBOT_WALK_SPEED,
  shortestAngleDelta,
  stepAngleTowards,
} from "./geometry";
import type {
  ExecutorStatus,
  RobotAnimationName,
  RobotPose,
  StepPhase,
  Vec2XZ,
  WalkTargetInfo,
} from "./types";

const FIVE_DEGREES_RAD = (5 * Math.PI) / 180;
const WAVE_DURATION_SECONDS = 1.65;
const POINT_HOLD_SECONDS = 1.25;

interface EngineInternalState {
  status: ExecutorStatus;
  stepIndex: number | null;
  phase: StepPhase;
  targetInfo: WalkTargetInfo | null;
  waypointIndex: number;
  targetAngle: number | null;
  phaseTimer: number;
}

export interface ScenarioExecutorController {
  steps: ScenarioStep[];
  currentStepIndex: number | null;
  status: ExecutorStatus;
  phase: StepPhase;
  activeZoneId: string | null;
  /** Silent visual on-screen status caption for `say` steps (no audio/TTS). */
  activeCaption: string | null;
  animation: RobotAnimationName;
  isPointing: boolean;
  pointTarget: Vec2XZ | null;
  startPosition: Vec2XZ;
  currentTargetInfo: WalkTargetInfo | null;
  poseRef: React.MutableRefObject<RobotPose>;
  start: () => void;
  replay: () => void;
  reset: () => void;
  tick: (deltaSeconds: number) => void;
}

export function useScenarioExecutor(
  scene: Scene,
  rawSteps: ScenarioStep[],
  autoStart = true,
): ScenarioExecutorController {
  const zoneMap = useMemo(() => {
    const map = new Map<string, Zone>();
    for (const z of scene.zones) {
      map.set(z.id, z);
    }
    return map;
  }, [scene.zones]);

  const steps = useMemo(() => {
    const zoneIds = scene.zones.map((z) => z.id);
    return filterValidSteps(rawSteps, zoneIds);
  }, [rawSteps, scene.zones]);

  const startPosition = useMemo(
    () => getDefaultStartPosition(scene),
    [scene],
  );

  const initialRotationY = useMemo(() => {
    const firstStep = steps[0];
    if (firstStep?.target) {
      const z = zoneMap.get(firstStep.target);
      if (z) {
        return Math.atan2(z.x - startPosition.x, z.z - startPosition.z) - 0.6;
      }
    }
    return Math.PI;
  }, [steps, zoneMap, startPosition]);

  const poseRef = useRef<RobotPose>({
    x: startPosition.x,
    z: startPosition.z,
    rotationY: initialRotationY,
    animation: "Idle",
    isPointing: false,
    pointTarget: null,
  });

  const engineRef = useRef<EngineInternalState>({
    status: "idle",
    stepIndex: null,
    phase: "idle",
    targetInfo: null,
    waypointIndex: 0,
    targetAngle: null,
    phaseTimer: 0,
  });

  const runIdRef = useRef<number>(0);

  const [status, setStatus] = useState<ExecutorStatus>("idle");
  const [currentStepIndex, setCurrentStepIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<StepPhase>("idle");
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [activeCaption, setActiveCaption] = useState<string | null>(null);
  const [animation, setAnimation] = useState<RobotAnimationName>("Idle");
  const [isPointing, setIsPointing] = useState<boolean>(false);
  const [pointTarget, setPointTarget] = useState<Vec2XZ | null>(null);
  const [currentTargetInfo, setCurrentTargetInfo] =
    useState<WalkTargetInfo | null>(null);

  const syncUiState = useCallback(() => {
    const eng = engineRef.current;
    const pose = poseRef.current;
    setStatus(eng.status);
    setCurrentStepIndex(eng.stepIndex);
    setPhase(eng.phase);
    setAnimation(pose.animation);
    setIsPointing(pose.isPointing);
    setPointTarget(pose.pointTarget);
    setCurrentTargetInfo(eng.targetInfo);

    const step = eng.stepIndex !== null ? steps[eng.stepIndex] : undefined;
    setActiveZoneId(step?.target ?? eng.targetInfo?.zone.id ?? null);
    setActiveCaption(
      eng.status === "running" && step?.action === "say" && step.text
        ? step.text
        : null,
    );
  }, [steps]);

  const beginStep = useCallback(
    (startIndex: number, runId: number) => {
      if (runId !== runIdRef.current) return;

      const eng = engineRef.current;
      const pose = poseRef.current;

      for (let i = startIndex; i < steps.length; i++) {
        if (runId !== runIdRef.current) return;
        const step = steps[i];

        eng.status = "running";
        eng.stepIndex = i;
        eng.targetInfo = null;
        eng.waypointIndex = 0;
        eng.targetAngle = null;
        eng.phaseTimer = 0;
        pose.isPointing = false;
        pose.pointTarget = null;

        switch (step.action) {
          case "walk_to": {
            const zone = step.target ? zoneMap.get(step.target) : undefined;
            if (!zone) continue;

            const targetInfo = calculateZoneStopPoint(
              { x: pose.x, z: pose.z },
              zone,
              scene.room,
              scene.zones,
            );
            const firstWp = targetInfo.waypoints[0] ?? targetInfo.stopPoint;
            const firstLegAngle = Math.atan2(
              firstWp.x - pose.x,
              firstWp.z - pose.z,
            );

            eng.targetInfo = targetInfo;
            eng.waypointIndex = 0;
            eng.targetAngle = firstLegAngle;

            const angleDiff = Math.abs(
              shortestAngleDelta(pose.rotationY, firstLegAngle),
            );
            if (angleDiff <= FIVE_DEGREES_RAD) {
              pose.rotationY = firstLegAngle;
              eng.phase = "walking";
              pose.animation = "Walking";
            } else {
              eng.phase = "rotating";
              pose.animation = "Idle";
            }
            syncUiState();
            return;
          }

          case "turn_to": {
            const zone = step.target ? zoneMap.get(step.target) : undefined;
            if (!zone) continue;

            const dx = zone.x - pose.x;
            const dz = zone.z - pose.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 0.05) continue;
            const targetAngle = Math.atan2(dx, dz);
            const angleDiff = Math.abs(
              shortestAngleDelta(pose.rotationY, targetAngle),
            );
            if (angleDiff <= FIVE_DEGREES_RAD) {
              pose.rotationY = targetAngle;
              continue;
            }

            eng.targetAngle = targetAngle;
            eng.phase = "rotating";
            pose.animation = "Idle";
            syncUiState();
            return;
          }

          case "wave": {
            eng.phase = "waving";
            eng.phaseTimer = WAVE_DURATION_SECONDS;
            pose.animation = "Wave";
            syncUiState();
            return;
          }

          case "point_to": {
            const zone = step.target ? zoneMap.get(step.target) : undefined;
            if (!zone) continue;

            const dx = zone.x - pose.x;
            const dz = zone.z - pose.z;
            const dist = Math.hypot(dx, dz);
            const targetAngle =
              dist >= 0.05 ? Math.atan2(dx, dz) : pose.rotationY;

            eng.targetAngle = targetAngle;
            pose.pointTarget = { x: zone.x, z: zone.z };

            const angleDiff = Math.abs(
              shortestAngleDelta(pose.rotationY, targetAngle),
            );
            if (angleDiff <= FIVE_DEGREES_RAD) {
              pose.rotationY = targetAngle;
              eng.phase = "pointing";
              eng.phaseTimer = POINT_HOLD_SECONDS;
              pose.animation = "Idle";
              pose.isPointing = true;
            } else {
              eng.phase = "rotating";
              pose.animation = "Idle";
              pose.isPointing = false;
            }
            syncUiState();
            return;
          }

          case "say": {
            // Silent timed visual status / on-screen caption step (zero audio/TTS)
            const line = (step.text ?? "").trim();
            if (!line) continue;
            const wordCount = line.split(/\s+/).length;
            const captionDurationSeconds = Math.min(
              2.8,
              Math.max(1.5, wordCount * 0.22 + 0.8),
            );
            eng.phase = "caption";
            eng.phaseTimer = captionDurationSeconds;
            pose.animation = "Yes";
            syncUiState();
            return;
          }

          case "wait": {
            const seconds = Math.max(0, step.seconds ?? 0);
            if (seconds <= 0) continue;

            eng.phase = "waiting";
            eng.phaseTimer = seconds;
            pose.animation = "Idle";
            syncUiState();
            return;
          }
        }
      }

      // All steps finished
      eng.status = "completed";
      eng.stepIndex = null;
      eng.phase = "idle";
      eng.targetInfo = null;
      eng.waypointIndex = 0;
      eng.targetAngle = null;
      eng.phaseTimer = 0;
      pose.animation = "Idle";
      pose.isPointing = false;
      pose.pointTarget = null;
      syncUiState();
    },
    [steps, zoneMap, scene.room, scene.zones, syncUiState],
  );

  const reset = useCallback(() => {
    runIdRef.current += 1;

    poseRef.current = {
      x: startPosition.x,
      z: startPosition.z,
      rotationY: initialRotationY,
      animation: "Idle",
      isPointing: false,
      pointTarget: null,
    };
    engineRef.current = {
      status: "idle",
      stepIndex: null,
      phase: "idle",
      targetInfo: null,
      waypointIndex: 0,
      targetAngle: null,
      phaseTimer: 0,
    };
    syncUiState();
  }, [startPosition, initialRotationY, syncUiState]);

  const replay = useCallback(() => {
    runIdRef.current += 1;
    const nextRunId = runIdRef.current;

    poseRef.current = {
      x: startPosition.x,
      z: startPosition.z,
      rotationY: initialRotationY,
      animation: "Idle",
      isPointing: false,
      pointTarget: null,
    };
    engineRef.current = {
      status: "running",
      stepIndex: 0,
      phase: "idle",
      targetInfo: null,
      waypointIndex: 0,
      targetAngle: null,
      phaseTimer: 0,
    };
    beginStep(0, nextRunId);
  }, [startPosition, initialRotationY, beginStep]);

  const start = useCallback(() => {
    replay();
  }, [replay]);

  useEffect(() => {
    if (!autoStart || steps.length === 0) {
      return () => {
        runIdRef.current += 1;
      };
    }
    const timerId = window.setTimeout(() => {
      replay();
    }, 500);
    return () => {
      window.clearTimeout(timerId);
      runIdRef.current += 1;
    };
  }, [autoStart, steps.length, replay]);

  const tick = useCallback(
    (deltaSeconds: number) => {
      const eng = engineRef.current;
      if (eng.status !== "running" || eng.stepIndex === null) return;

      const dt = Math.min(Math.max(deltaSeconds, 0), 0.1);
      if (dt === 0) return;

      const activeRunId = runIdRef.current;
      const stepIndex = eng.stepIndex;
      const step = steps[stepIndex];
      if (!step) {
        beginStep(stepIndex + 1, activeRunId);
        return;
      }

      const pose = poseRef.current;

      if (eng.phase === "rotating") {
        const targetAngle =
          eng.targetAngle ?? eng.targetInfo?.lookAtAngle ?? pose.rotationY;

        const { angle, reached } = stepAngleTowards(
          pose.rotationY,
          targetAngle,
          ROBOT_TURN_SPEED * dt,
        );
        pose.rotationY = angle;

        if (reached) {
          pose.rotationY = targetAngle;
          if (step.action === "walk_to") {
            eng.phase = "walking";
            pose.animation = "Walking";
            syncUiState();
          } else if (step.action === "point_to") {
            eng.phase = "pointing";
            eng.phaseTimer = POINT_HOLD_SECONDS;
            pose.animation = "Idle";
            pose.isPointing = true;
            syncUiState();
          } else {
            pose.animation = "Idle";
            beginStep(stepIndex + 1, activeRunId);
          }
        }
        return;
      }

      if (eng.phase === "walking") {
        const targetInfo = eng.targetInfo;
        if (!targetInfo) {
          beginStep(stepIndex + 1, activeRunId);
          return;
        }

        const currentWp =
          targetInfo.waypoints[eng.waypointIndex] ?? targetInfo.stopPoint;
        const dx = currentWp.x - pose.x;
        const dz = currentWp.z - pose.z;
        const remainingDist = Math.hypot(dx, dz);
        const stepDist = ROBOT_WALK_SPEED * dt;

        const legAngle =
          remainingDist > 0.01
            ? Math.atan2(dx, dz)
            : (eng.targetAngle ?? targetInfo.lookAtAngle);
        pose.rotationY = legAngle;

        if (remainingDist <= stepDist || remainingDist < 0.005) {
          pose.x = currentWp.x;
          pose.z = currentWp.z;

          if (eng.waypointIndex + 1 < targetInfo.waypoints.length) {
            eng.waypointIndex += 1;
            const nextWp = targetInfo.waypoints[eng.waypointIndex];
            const nextLegAngle = Math.atan2(
              nextWp.x - pose.x,
              nextWp.z - pose.z,
            );
            eng.targetAngle = nextLegAngle;
            if (
              Math.abs(shortestAngleDelta(pose.rotationY, nextLegAngle)) >
              FIVE_DEGREES_RAD
            ) {
              eng.phase = "rotating";
              pose.animation = "Idle";
              syncUiState();
            }
          } else {
            pose.rotationY = targetInfo.lookAtAngle;
            pose.animation = "Idle";
            beginStep(stepIndex + 1, activeRunId);
          }
        } else {
          pose.x += (dx / remainingDist) * stepDist;
          pose.z += (dz / remainingDist) * stepDist;
        }
        return;
      }

      if (eng.phase === "waving") {
        eng.phaseTimer -= dt;
        if (eng.phaseTimer <= 0) {
          pose.animation = "Idle";
          beginStep(stepIndex + 1, activeRunId);
        }
        return;
      }

      if (eng.phase === "pointing") {
        eng.phaseTimer -= dt;
        if (eng.phaseTimer <= 0) {
          pose.isPointing = false;
          pose.pointTarget = null;
          pose.animation = "Idle";
          beginStep(stepIndex + 1, activeRunId);
        }
        return;
      }

      if (eng.phase === "caption") {
        eng.phaseTimer -= dt;
        if (eng.phaseTimer <= 0) {
          pose.animation = "Idle";
          beginStep(stepIndex + 1, activeRunId);
        }
        return;
      }

      if (eng.phase === "waiting") {
        eng.phaseTimer -= dt;
        if (eng.phaseTimer <= 0) {
          pose.animation = "Idle";
          beginStep(stepIndex + 1, activeRunId);
        }
      }
    },
    [steps, beginStep, syncUiState],
  );

  return {
    steps,
    currentStepIndex,
    status,
    phase,
    activeZoneId,
    activeCaption,
    animation,
    isPointing,
    pointTarget,
    startPosition,
    currentTargetInfo,
    poseRef,
    start,
    replay,
    reset,
    tick,
  };
}
