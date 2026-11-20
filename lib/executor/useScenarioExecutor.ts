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
const WAVE_DURATION_SECONDS = 1.78;
const POINT_HOLD_SECONDS = 1.25;

interface EngineInternalState {
  status: ExecutorStatus;
  stepIndex: number | null;
  phase: StepPhase;
  targetInfo: WalkTargetInfo | null;
  targetAngle: number | null;
  phaseTimer: number;
  activeSpeech: string | null;
  speechDone: boolean;
}

export interface ScenarioExecutorController {
  /** Validated scenario steps via filterValidSteps() */
  steps: ScenarioStep[];
  /** Active step index (0..steps.length-1) while running, or null when idle/completed */
  currentStepIndex: number | null;
  /** Overall execution status */
  status: ExecutorStatus;
  /** Currently spoken text for the speech bubble, or null */
  activeSpeech: string | null;
  /** Granular sub-phase of the active step */
  phase: StepPhase;
  /** Target zone id of the active step (if any) */
  activeZoneId: string | null;
  /** Current robot skeletal animation clip name */
  animation: RobotAnimationName;
  /** Whether the robot is currently holding a point_to arm gesture */
  isPointing: boolean;
  /** World XZ coordinates of the zone being pointed at */
  pointTarget: Vec2XZ | null;
  /** Initial floor position of the robot */
  startPosition: Vec2XZ;
  /** Current walk_to edge stop target info (for floor indicator) */
  currentTargetInfo: WalkTargetInfo | null;
  /** Mutable 60fps pose reference read by Three.js useFrame */
  poseRef: React.MutableRefObject<RobotPose>;
  /** Start execution from step 0 */
  start: () => void;
  /** Immediately abort any active step/speech, reset to start pose, and restart from step 0 */
  replay: () => void;
  /** Abort any active step/speech and return robot to start pose in idle state */
  reset: () => void;
  /** Frame tick called by R3F useFrame */
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

  // Start slightly angled so initial rotation is visible
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
    targetAngle: null,
    phaseTimer: 0,
    activeSpeech: null,
    speechDone: false,
  });

  const runIdRef = useRef<number>(0);
  const timersRef = useRef<number[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const [status, setStatus] = useState<ExecutorStatus>("idle");
  const [currentStepIndex, setCurrentStepIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<StepPhase>("idle");
  const [activeSpeech, setActiveSpeech] = useState<string | null>(null);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [animation, setAnimation] = useState<RobotAnimationName>("Idle");
  const [isPointing, setIsPointing] = useState<boolean>(false);
  const [pointTarget, setPointTarget] = useState<Vec2XZ | null>(null);
  const [currentTargetInfo, setCurrentTargetInfo] =
    useState<WalkTargetInfo | null>(null);

  const clearTimersAndSpeech = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];

    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
      utteranceRef.current = null;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore speechSynthesis errors
      }
    }
  }, []);

  const syncUiState = useCallback(() => {
    const eng = engineRef.current;
    const pose = poseRef.current;
    setStatus(eng.status);
    setCurrentStepIndex(eng.stepIndex);
    setPhase(eng.phase);
    setActiveSpeech(eng.activeSpeech);
    setAnimation(pose.animation);
    setIsPointing(pose.isPointing);
    setPointTarget(pose.pointTarget);
    setCurrentTargetInfo(eng.targetInfo);

    const step = eng.stepIndex !== null ? steps[eng.stepIndex] : undefined;
    setActiveZoneId(step?.target ?? eng.targetInfo?.zone.id ?? null);
  }, [steps]);

  const beginStep = useCallback(
    (startIndex: number, runId: number) => {
      if (runId !== runIdRef.current) return;

      const eng = engineRef.current;
      const pose = poseRef.current;

      for (let i = startIndex; i < steps.length; i++) {
        if (runId !== runIdRef.current) return;
        const step = steps[i];

        // Reset step-scoped state
        eng.status = "running";
        eng.stepIndex = i;
        eng.targetInfo = null;
        eng.targetAngle = null;
        eng.phaseTimer = 0;
        eng.activeSpeech = null;
        eng.speechDone = false;
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
            );
            eng.targetInfo = targetInfo;
            eng.targetAngle = targetInfo.lookAtAngle;

            const angleDiff = Math.abs(
              shortestAngleDelta(pose.rotationY, targetInfo.lookAtAngle),
            );
            if (angleDiff <= FIVE_DEGREES_RAD) {
              pose.rotationY = targetInfo.lookAtAngle;
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
            if (dist < 0.05) {
              // Already standing at target -> no-op
              continue;
            }
            const targetAngle = Math.atan2(dx, dz);
            const angleDiff = Math.abs(
              shortestAngleDelta(pose.rotationY, targetAngle),
            );
            if (angleDiff <= FIVE_DEGREES_RAD) {
              // Already facing within ~5° -> no-op
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
            const text = (step.text ?? "").trim();
            if (!text) continue;

            const wordCount = text.split(/\s+/).filter(Boolean).length;
            const fallbackMs = Math.max(2500, wordCount * 550 + 1500);
            const minBubbleSeconds =
              Math.min(fallbackMs, Math.max(1700, wordCount * 200)) / 1000;

            eng.phase = "speaking";
            eng.activeSpeech = text;
            eng.phaseTimer = minBubbleSeconds;
            eng.speechDone = false;
            pose.animation = "Idle";
            syncUiState();

            const markSpeechFinished = () => {
              if (
                runId !== runIdRef.current ||
                engineRef.current.stepIndex !== i
              ) {
                return;
              }
              engineRef.current.speechDone = true;
            };

            const fallbackId = window.setTimeout(() => {
              if (
                runId === runIdRef.current &&
                engineRef.current.stepIndex === i &&
                !engineRef.current.speechDone
              ) {
                if (
                  typeof window !== "undefined" &&
                  "speechSynthesis" in window
                ) {
                  try {
                    window.speechSynthesis.cancel();
                  } catch {
                    // Ignore
                  }
                }
                markSpeechFinished();
              }
            }, fallbackMs);
            timersRef.current.push(fallbackId);

            if (
              typeof window !== "undefined" &&
              "speechSynthesis" in window &&
              typeof SpeechSynthesisUtterance !== "undefined"
            ) {
              try {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                const voices = window.speechSynthesis.getVoices();
                const englishVoice =
                  voices.find(
                    (v) => /^en(-|_|$)/i.test(v.lang) && v.localService,
                  ) ??
                  voices.find((v) => /^en(-|_|$)/i.test(v.lang)) ??
                  null;
                if (englishVoice) {
                  utterance.voice = englishVoice;
                }
                utterance.lang = englishVoice?.lang ?? "en-US";
                utterance.rate = 1.0;
                utterance.onend = () => markSpeechFinished();
                utterance.onerror = () => markSpeechFinished();
                utteranceRef.current = utterance;
                window.speechSynthesis.speak(utterance);
              } catch {
                markSpeechFinished();
              }
            } else {
              markSpeechFinished();
            }
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
      eng.targetAngle = null;
      eng.phaseTimer = 0;
      eng.activeSpeech = null;
      eng.speechDone = false;
      pose.animation = "Idle";
      pose.isPointing = false;
      pose.pointTarget = null;
      syncUiState();
    },
    [steps, zoneMap, scene.room, syncUiState],
  );

  const reset = useCallback(() => {
    runIdRef.current += 1;
    clearTimersAndSpeech();

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
      targetAngle: null,
      phaseTimer: 0,
      activeSpeech: null,
      speechDone: false,
    };
    syncUiState();
  }, [clearTimersAndSpeech, startPosition, initialRotationY, syncUiState]);

  const replay = useCallback(() => {
    runIdRef.current += 1;
    const nextRunId = runIdRef.current;
    clearTimersAndSpeech();

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
      targetAngle: null,
      phaseTimer: 0,
      activeSpeech: null,
      speechDone: false,
    };
    beginStep(0, nextRunId);
  }, [clearTimersAndSpeech, startPosition, initialRotationY, beginStep]);

  const start = useCallback(() => {
    replay();
  }, [replay]);

  // Auto-start on mount and clean up timers + speechSynthesis on unmount
  useEffect(() => {
    if (!autoStart || steps.length === 0) {
      return () => {
        runIdRef.current += 1;
        clearTimersAndSpeech();
      };
    }
    const timerId = window.setTimeout(() => {
      replay();
    }, 500);
    return () => {
      window.clearTimeout(timerId);
      runIdRef.current += 1;
      clearTimersAndSpeech();
    };
  }, [autoStart, steps.length, replay, clearTimersAndSpeech]);

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
          eng.targetAngle ??
          eng.targetInfo?.lookAtAngle ??
          pose.rotationY;

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
            // turn_to finished rotating
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

        const dx = targetInfo.stopPoint.x - pose.x;
        const dz = targetInfo.stopPoint.z - pose.z;
        const remainingDist = Math.hypot(dx, dz);
        const stepDist = ROBOT_WALK_SPEED * dt;

        pose.rotationY = targetInfo.lookAtAngle;

        if (remainingDist <= stepDist || remainingDist < 0.005) {
          pose.x = targetInfo.stopPoint.x;
          pose.z = targetInfo.stopPoint.z;
          pose.rotationY = targetInfo.lookAtAngle;
          pose.animation = "Idle";
          beginStep(stepIndex + 1, activeRunId);
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

      if (eng.phase === "speaking") {
        eng.phaseTimer -= dt;
        if (eng.speechDone && eng.phaseTimer <= 0) {
          eng.activeSpeech = null;
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
    activeSpeech,
    phase,
    activeZoneId,
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
