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

const SETTLE_PAUSE_SECONDS = 0.75;

interface EngineInternalState {
  status: ExecutorStatus;
  stepIndex: number;
  phase: StepPhase;
  targetInfo: WalkTargetInfo | null;
  settleTimer: number;
}

export interface WalkExecutorController {
  status: ExecutorStatus;
  currentStepIndex: number;
  phase: StepPhase;
  activeZoneId: string | null;
  animation: RobotAnimationName;
  validSteps: ScenarioStep[];
  startPosition: Vec2XZ;
  currentTargetInfo: WalkTargetInfo | null;
  poseRef: React.MutableRefObject<RobotPose>;
  startOrReplay: () => void;
  resetToStart: () => void;
  tick: (deltaSeconds: number) => void;
}

export function useWalkExecutor(
  scene: Scene,
  rawSteps: ScenarioStep[],
  autoStart = true,
): WalkExecutorController {
  const zoneMap = useMemo(() => {
    const map = new Map<string, Zone>();
    for (const z of scene.zones) {
      map.set(z.id, z);
    }
    return map;
  }, [scene.zones]);

  const validSteps = useMemo(() => {
    const zoneIds = scene.zones.map((z) => z.id);
    return filterValidSteps(rawSteps, zoneIds);
  }, [rawSteps, scene.zones]);

  const startPosition = useMemo(
    () => getDefaultStartPosition(scene),
    [scene],
  );

  // Initial orientation faces toward the first target zone if available, else -Z
  const initialRotationY = useMemo(() => {
    const firstStep = validSteps[0];
    if (firstStep?.target) {
      const z = zoneMap.get(firstStep.target);
      if (z) {
        return Math.atan2(z.x - startPosition.x, z.z - startPosition.z) - 0.65;
      }
    }
    return Math.PI;
  }, [validSteps, zoneMap, startPosition]);

  const poseRef = useRef<RobotPose>({
    x: startPosition.x,
    z: startPosition.z,
    rotationY: initialRotationY,
    animation: "Idle",
  });

  const engineRef = useRef<EngineInternalState>({
    status: "idle",
    stepIndex: -1,
    phase: "idle",
    targetInfo: null,
    settleTimer: 0,
  });

  const [status, setStatus] = useState<ExecutorStatus>("idle");
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [phase, setPhase] = useState<StepPhase>("idle");
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [animation, setAnimation] = useState<RobotAnimationName>("Idle");
  const [currentTargetInfo, setCurrentTargetInfo] =
    useState<WalkTargetInfo | null>(null);

  const syncUiState = useCallback(() => {
    const eng = engineRef.current;
    const pose = poseRef.current;
    setStatus(eng.status);
    setCurrentStepIndex(eng.stepIndex);
    setPhase(eng.phase);
    setAnimation(pose.animation);
    setCurrentTargetInfo(eng.targetInfo);
    const step = validSteps[eng.stepIndex];
    setActiveZoneId(step?.target ?? eng.targetInfo?.zone.id ?? null);
  }, [validSteps]);

  const resetToStart = useCallback(() => {
    poseRef.current = {
      x: startPosition.x,
      z: startPosition.z,
      rotationY: initialRotationY,
      animation: "Idle",
    };
    engineRef.current = {
      status: "idle",
      stepIndex: -1,
      phase: "idle",
      targetInfo: null,
      settleTimer: 0,
    };
    syncUiState();
  }, [startPosition, initialRotationY, syncUiState]);

  const beginStep = useCallback(
    (index: number): boolean => {
      const eng = engineRef.current;
      const pose = poseRef.current;

      for (let i = index; i < validSteps.length; i++) {
        const step = validSteps[i];
        // Stage 1 implements walk_to ONLY; safely skip other action types
        if (step.action !== "walk_to" || !step.target) {
          continue;
        }
        const zone = zoneMap.get(step.target);
        if (!zone) continue;

        const targetInfo = calculateZoneStopPoint(
          { x: pose.x, z: pose.z },
          zone,
          scene.room,
        );

        eng.status = "running";
        eng.stepIndex = i;
        eng.phase = "rotating";
        eng.targetInfo = targetInfo;
        eng.settleTimer = 0;
        pose.animation = "Idle";
        syncUiState();
        return true;
      }

      // No more walk_to steps left
      eng.status = "completed";
      eng.phase = "idle";
      pose.animation = "Idle";
      syncUiState();
      return false;
    },
    [validSteps, zoneMap, scene.room, syncUiState],
  );

  const startOrReplay = useCallback(() => {
    poseRef.current = {
      x: startPosition.x,
      z: startPosition.z,
      rotationY: initialRotationY,
      animation: "Idle",
    };
    beginStep(0);
  }, [startPosition, initialRotationY, beginStep]);

  useEffect(() => {
    if (!autoStart || validSteps.length === 0) return;
    const timer = window.setTimeout(() => {
      startOrReplay();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [autoStart, validSteps.length, startOrReplay]);

  const tick = useCallback(
    (deltaSeconds: number) => {
      const eng = engineRef.current;
      if (eng.status !== "running") return;

      const dt = Math.min(Math.max(deltaSeconds, 0), 0.1);
      if (dt === 0) return;

      const pose = poseRef.current;
      const targetInfo = eng.targetInfo;

      if (!targetInfo) {
        beginStep(eng.stepIndex + 1);
        return;
      }

      if (eng.phase === "rotating") {
        const { angle, reached } = stepAngleTowards(
          pose.rotationY,
          targetInfo.lookAtAngle,
          ROBOT_TURN_SPEED * dt,
        );
        pose.rotationY = angle;

        if (reached) {
          eng.phase = "walking";
          pose.animation = "Walking";
          syncUiState();
        }
        return;
      }

      if (eng.phase === "walking") {
        const dx = targetInfo.stopPoint.x - pose.x;
        const dz = targetInfo.stopPoint.z - pose.z;
        const remainingDist = Math.hypot(dx, dz);
        const stepDist = ROBOT_WALK_SPEED * dt;

        // Keep facing the target zone while walking
        pose.rotationY = targetInfo.lookAtAngle;

        if (remainingDist <= stepDist || remainingDist < 0.005) {
          pose.x = targetInfo.stopPoint.x;
          pose.z = targetInfo.stopPoint.z;
          pose.rotationY = targetInfo.lookAtAngle;
          pose.animation = "Idle";

          const hasMoreSteps = eng.stepIndex + 1 < validSteps.length;
          if (hasMoreSteps) {
            eng.phase = "settling";
            eng.settleTimer = SETTLE_PAUSE_SECONDS;
            syncUiState();
          } else {
            eng.status = "completed";
            eng.phase = "idle";
            syncUiState();
          }
        } else {
          pose.x += (dx / remainingDist) * stepDist;
          pose.z += (dz / remainingDist) * stepDist;
        }
        return;
      }

      if (eng.phase === "settling") {
        eng.settleTimer -= dt;
        pose.animation = "Idle";
        if (eng.settleTimer <= 0) {
          beginStep(eng.stepIndex + 1);
        }
      }
    },
    [beginStep, syncUiState, validSteps.length],
  );

  return {
    status,
    currentStepIndex,
    phase,
    activeZoneId,
    animation,
    validSteps,
    startPosition,
    currentTargetInfo,
    poseRef,
    startOrReplay,
    resetToStart,
    tick,
  };
}
