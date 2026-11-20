"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Scene } from "@/types/contracts";
import type {
  RobotAnimationName,
  RobotPose,
  Vec2XZ,
  WalkTargetInfo,
} from "@/lib/executor";
import { Room3D } from "./Room3D";
import { RobotModel } from "./RobotModel";

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

  useFrame((state, delta) => {
    const controls = controlsRef.current;
    if (!controls || !enabled) return;

    const dt = Math.min(Math.max(delta, 0), 0.1);
    const pose = poseRef.current;

    // Blend robot position (65%) with room center overview (35%)
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

    // Gently pan camera horizontally when presenter is not manually orbiting/zooming
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
      maxDistance={24}
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
  activeZoneId: string | null;
  startPosition: Vec2XZ;
  currentTargetInfo: WalkTargetInfo | null;
  poseRef: React.MutableRefObject<RobotPose>;
  animation: RobotAnimationName;
  isPointing: boolean;
  activeSpeech: string | null;
  followCamera?: boolean;
  onTick: (deltaSeconds: number) => void;
}

export function SimCanvas({
  scene,
  activeZoneId,
  startPosition,
  currentTargetInfo,
  poseRef,
  animation,
  isPointing,
  activeSpeech,
  followCamera = true,
  onTick,
}: SimCanvasProps) {
  const cx = scene.room.width / 2;
  const cz = scene.room.depth / 2;

  return (
    <div className="relative h-full w-full bg-slate-950">
      <Canvas
        shadows
        camera={{
          position: [cx - 2.2, 7.4, -4.2],
          fov: 45,
          near: 0.1,
          far: 100,
        }}
      >
        <color attach="background" args={["#090d16"]} />
        <fog attach="fog" args={["#090d16", 18, 34]} />

        {/* Balanced studio & room lighting */}
        <ambientLight intensity={0.75} />
        <hemisphereLight
          args={["#e2e8f0", "#1e293b", 0.65]}
          position={[0, 10, 0]}
        />
        <directionalLight
          position={[cx + 6, 12, -5]}
          intensity={1.35}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />
        <directionalLight position={[-4, 8, cz + 6]} intensity={0.45} />

        {/* Room floor, low walls, and labeled translucent zones */}
        <Room3D
          scene={scene}
          activeZoneId={activeZoneId}
          startPosition={startPosition}
          currentTargetInfo={currentTargetInfo}
        />

        {/* Animated Robot Model */}
        <Suspense fallback={null}>
          <RobotModel
            poseRef={poseRef}
            startPosition={startPosition}
            animation={animation}
            isPointing={isPointing}
            activeSpeech={activeSpeech}
            onTick={onTick}
          />
        </Suspense>

        <FollowCameraController
          poseRef={poseRef}
          roomCenter={{ x: cx, z: cz }}
          enabled={followCamera}
        />
      </Canvas>
    </div>
  );
}
