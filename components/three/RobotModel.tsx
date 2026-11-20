"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { RobotAnimationName, RobotPose, Vec2XZ } from "@/lib/executor";
import { LabelSprite } from "./LabelSprite";

const ROBOT_MODEL_URL = "/models/RobotExpressive.glb";
/** RobotExpressive raw height is ~4.5 units; 0.26 scale ≈ 1.17m (Booster K1 height) */
const ROBOT_SCALE = 0.26;

export interface RobotModelProps {
  poseRef: React.MutableRefObject<RobotPose>;
  startPosition: Vec2XZ;
  animation: RobotAnimationName;
  onTick: (deltaSeconds: number) => void;
}

export function RobotModel({
  poseRef,
  startPosition,
  animation,
  onTick,
}: RobotModelProps) {
  const outerGroupRef = useRef<THREE.Group>(null);
  const modelRootRef = useRef<THREE.Group>(null);
  const activeAnimRef = useRef<RobotAnimationName>("Idle");

  const gltf = useGLTF(ROBOT_MODEL_URL);

  const clonedScene = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return clone;
  }, [gltf.scene]);

  const { actions } = useAnimations(gltf.animations, modelRootRef);

  const playAnimation = useCallback(
    (nextAnim: RobotAnimationName) => {
      if (!actions) return;
      const prevAnim = activeAnimRef.current;
      const nextAction = actions[nextAnim] ?? actions["Idle"];
      if (!nextAction) return;

      if (prevAnim !== nextAnim && actions[prevAnim]) {
        actions[prevAnim]?.fadeOut(0.18);
      }

      nextAction.reset().fadeIn(0.18).play();
      activeAnimRef.current = nextAnim;
    },
    [actions],
  );

  // Sync initial pose and start Idle animation on mount
  useEffect(() => {
    const group = outerGroupRef.current;
    const pose = poseRef.current;
    if (group) {
      group.position.set(pose.x, 0, pose.z);
      group.rotation.y = pose.rotationY;
    }
    if (!actions) return;
    const idleAction = actions["Idle"];
    if (idleAction) {
      idleAction.reset().play();
      activeAnimRef.current = "Idle";
    }
  }, [actions, poseRef]);

  // React to animation prop changes
  useEffect(() => {
    if (animation !== activeAnimRef.current) {
      playAnimation(animation);
    }
  }, [animation, playAnimation]);

  useFrame((_, delta) => {
    onTick(delta);

    const pose = poseRef.current;
    const group = outerGroupRef.current;
    if (group) {
      group.position.set(pose.x, 0, pose.z);
      group.rotation.y = pose.rotationY;
    }

    if (pose.animation !== activeAnimRef.current) {
      playAnimation(pose.animation);
    }
  });

  return (
    <group
      ref={outerGroupRef}
      position={[startPosition.x, 0, startPosition.z]}
    >
      {/* Scaled model standing cleanly on y = 0 */}
      <group ref={modelRootRef} scale={ROBOT_SCALE}>
        <primitive object={clonedScene} />
      </group>

      {/* Subtle direction indicator ring at the robot's feet (y = 0.012) */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.24, 0.31, 32]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 0.014, 0.32]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.06, 16]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>

      {/* Robot identifier badge above head */}
      <LabelSprite
        title="K1 (stand-in)"
        position={[0, 1.48, 0]}
        accentColor="#38bdf8"
        bgColor="rgba(15, 23, 42, 0.94)"
        scale={[1.65, 0.52, 1]}
      />
    </group>
  );
}

useGLTF.preload(ROBOT_MODEL_URL);
