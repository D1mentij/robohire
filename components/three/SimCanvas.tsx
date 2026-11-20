"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Scene } from "@/types/contracts";
import type {
  RobotAnimationName,
  RobotPose,
  Vec2XZ,
  WalkTargetInfo,
} from "@/lib/executor";
import { Room3D } from "./Room3D";
import { RobotModel } from "./RobotModel";

export interface SimCanvasProps {
  scene: Scene;
  activeZoneId: string | null;
  startPosition: Vec2XZ;
  currentTargetInfo: WalkTargetInfo | null;
  poseRef: React.MutableRefObject<RobotPose>;
  animation: RobotAnimationName;
  onTick: (deltaSeconds: number) => void;
}

export function SimCanvas({
  scene,
  activeZoneId,
  startPosition,
  currentTargetInfo,
  poseRef,
  animation,
  onTick,
}: SimCanvasProps) {
  const cx = scene.room.width / 2;
  const cz = scene.room.depth / 2;

  return (
    <div className="relative h-full w-full bg-slate-950">
      <Canvas
        shadows
        camera={{
          position: [cx - 2.4, 7.6, -4.4],
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
            onTick={onTick}
          />
        </Suspense>

        <OrbitControls
          target={[cx, 0.3, cz - 0.3]}
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2 - 0.04}
          minDistance={4}
          maxDistance={24}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>
    </div>
  );
}
