"use client";

import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { RobotType, Scene } from "@/types/contracts";
import type {
  RobotAnimationName,
  RobotPose,
  Vec2XZ,
  WalkTargetInfo,
} from "@/lib/executor";
import { getRobotSpec } from "@/lib/robots/catalog";
import { K1_SPEC } from "@/src/data/k1";
import { Room3D } from "./Room3D";
import { CommercialRobotModel } from "./CommercialRobotModel";
import { RobotModel } from "./RobotModel";

const FLY_IN_DURATION_SECONDS = 1.65;

interface FollowCameraControllerProps {
  poseRef: React.MutableRefObject<RobotPose>;
  roomCenter: Vec2XZ;
  enabled: boolean;
}

function FollowCameraController({
  poseRef,
  roomCenter,
  enabled,
}: FollowCameraControllerProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const isInteractingRef = useRef<boolean>(false);
  const flyInElapsedRef = useRef<number>(0);
  const flyInCompleteRef = useRef<boolean>(false);

  const flyStartPos = useRef({
    x: roomCenter.x - 6.2,
    y: 13.5,
    z: -9.8,
  });
  const flyEndPos = useRef({
    x: roomCenter.x - 2.2,
    y: 7.4,
    z: -4.2,
  });

  useFrame((state, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const dt = Math.min(Math.max(delta, 0), 0.1);
    const pose = poseRef.current;

    if (!flyInCompleteRef.current) {
      if (isInteractingRef.current) {
        flyInCompleteRef.current = true;
      } else {
        flyInElapsedRef.current += dt;
        const progress = Math.min(
          1,
          flyInElapsedRef.current / FLY_IN_DURATION_SECONDS,
        );
        const eased = 1 - Math.pow(1 - progress, 3);

        const start = flyStartPos.current;
        const end = flyEndPos.current;

        state.camera.position.set(
          start.x + (end.x - start.x) * eased,
          start.y + (end.y - start.y) * eased,
          start.z + (end.z - start.z) * eased,
        );

        const desiredX = pose.x * 0.65 + roomCenter.x * 0.35;
        const desiredY = 0.55;
        const desiredZ = pose.z * 0.65 + roomCenter.z * 0.35;

        controls.target.set(
          roomCenter.x + (desiredX - roomCenter.x) * eased,
          0.2 + (desiredY - 0.2) * eased,
          roomCenter.z + (desiredZ - roomCenter.z) * eased,
        );
        controls.update();

        if (progress >= 1) {
          flyInCompleteRef.current = true;
        }
        return;
      }
    }

    if (!enabled) return;

    const desiredX = pose.x * 0.65 + roomCenter.x * 0.35;
    const desiredY = 0.55;
    const desiredZ = pose.z * 0.65 + roomCenter.z * 0.35;

    const alpha = 1 - Math.exp(-3.2 * dt);
    const dx = (desiredX - controls.target.x) * alpha;
    const dy = (desiredY - controls.target.y) * alpha;
    const dz = (desiredZ - controls.target.z) * alpha;

    controls.target.x += dx;
    controls.target.y += dy;
    controls.target.z += dz;

    if (!isInteractingRef.current) {
      state.camera.position.x += dx * 0.55;
      state.camera.position.z += dz * 0.55;
    }

    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={[roomCenter.x, 0.4, roomCenter.z - 0.3]}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2 - 0.04}
      minDistance={3.5}
      maxDistance={32}
      enableDamping
      dampingFactor={0.08}
      onStart={() => {
        isInteractingRef.current = true;
      }}
      onEnd={() => {
        isInteractingRef.current = false;
      }}
    />
  );
}

export interface SimCanvasProps {
  scene: Scene;
  businessType?: string;
  isK1?: boolean;
  robotType?: RobotType;
  activeZoneId: string | null;
  startPosition: Vec2XZ;
  currentTargetInfo: WalkTargetInfo | null;
  poseRef: React.MutableRefObject<RobotPose>;
  animation: RobotAnimationName;
  isPointing: boolean;
  followCamera?: boolean;
  onTick: (deltaSeconds: number) => void;
}

export function SimCanvas({
  scene,
  businessType,
  isK1 = false,
  robotType = "keenon_t8",
  activeZoneId,
  startPosition,
  currentTargetInfo,
  poseRef,
  animation,
  isPointing,
  followCamera = true,
  onTick,
}: SimCanvasProps) {
  const cx = scene.room.width / 2;
  const cz = scene.room.depth / 2;
  const [canvasReady, setCanvasReady] = useState(false);
  const robotSpec = getRobotSpec(robotType);
  const loadingRobotName = isK1 ? K1_SPEC.name : robotSpec.name;

  return (
    <div className="relative h-full w-full bg-slate-950">
      {!canvasReady && (
        <div
          data-testid="canvas-loading-indicator"
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/90 text-slate-200 backdrop-blur-xs"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-sky-500 border-t-transparent" />
          <p className="font-mono text-xs font-semibold tracking-wide text-sky-300">
            Loading 3D workspace &amp; {loadingRobotName}…
          </p>
        </div>
      )}

      <Canvas
        shadows="soft"
        dpr={[1, 1.75]}
        onCreated={() => setCanvasReady(true)}
        camera={{
          position: [cx - 6.2, 13.5, -9.8],
          fov: 45,
          near: 0.1,
          far: 120,
        }}
      >
        <color attach="background" args={["#0c1220"]} />
        <fog attach="fog" args={["#0c1220", 20, 44]} />

        <ambientLight color="#fff7ed" intensity={0.78} />
        <hemisphereLight
          args={["#fef3c7", "#1e293b", 0.72]}
          position={[0, 10, 0]}
        />
        <directionalLight
          color="#fffbeb"
          position={[cx + 5, 12, -4]}
          intensity={1.45}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.0004}
          shadow-radius={3}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
        />
        <directionalLight
          color="#bae6fd"
          position={[cx, 5, -3]}
          intensity={0.45}
        />
        <directionalLight
          color="#fde68a"
          position={[-4, 7, cz + 5]}
          intensity={0.38}
        />

        <Room3D
          scene={scene}
          businessType={businessType}
          activeZoneId={activeZoneId}
          startPosition={startPosition}
          currentTargetInfo={currentTargetInfo}
        />

        {isK1 ? (
          <RobotModel
            poseRef={poseRef}
            startPosition={startPosition}
            animation={animation}
            isPointing={isPointing}
            onTick={onTick}
          />
        ) : (
          <CommercialRobotModel
            robotType={robotType}
            poseRef={poseRef}
            startPosition={startPosition}
            isPointing={isPointing}
            onTick={onTick}
          />
        )}

        <FollowCameraController
          poseRef={poseRef}
          roomCenter={{ x: cx, z: cz }}
          enabled={followCamera}
        />
      </Canvas>
    </div>
  );
}
