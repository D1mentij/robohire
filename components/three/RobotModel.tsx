"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { RobotAnimationName, RobotPose, Vec2XZ } from "@/lib/executor";
import { LabelSprite } from "./LabelSprite";
import { SpeechBubbleSprite } from "./SpeechBubbleSprite";

const ROBOT_MODEL_URL = "/models/RobotExpressive.glb";
/** RobotExpressive raw height is ~4.5 units; 0.26 scale ≈ 1.17m (Booster K1 height) */
const ROBOT_SCALE = 0.26;

// Forward-pointing right arm quaternions derived from RobotExpressive armature
const POINT_UPPER_ARM_R = new THREE.Quaternion(
  0.3554,
  0.6972,
  0.293,
  0.5493,
).normalize();
const POINT_LOWER_ARM_R = new THREE.Quaternion(
  0.0611,
  -0.5744,
  0.0823,
  0.8121,
).normalize();
const POINT_INDEX_R = new THREE.Quaternion(
  0.023,
  -0.6956,
  -0.3429,
  0.6309,
).normalize();
const POINT_INDEX2_R = new THREE.Quaternion(
  0.0257,
  0.0341,
  0.2456,
  0.9684,
).normalize();

interface RightArmBones {
  upperArm?: { bone: THREE.Object3D; rest: THREE.Quaternion; point: THREE.Quaternion };
  lowerArm?: { bone: THREE.Object3D; rest: THREE.Quaternion; point: THREE.Quaternion };
  index1?: { bone: THREE.Object3D; rest: THREE.Quaternion; point: THREE.Quaternion };
  index2?: { bone: THREE.Object3D; rest: THREE.Quaternion; point: THREE.Quaternion };
}

export interface RobotModelProps {
  poseRef: React.MutableRefObject<RobotPose>;
  startPosition: Vec2XZ;
  animation: RobotAnimationName;
  isPointing: boolean;
  activeSpeech: string | null;
  onTick: (deltaSeconds: number) => void;
}

export function RobotModel({
  poseRef,
  startPosition,
  animation,
  isPointing,
  activeSpeech,
  onTick,
}: RobotModelProps) {
  const outerGroupRef = useRef<THREE.Group>(null);
  const modelRootRef = useRef<THREE.Group>(null);
  const activeAnimRef = useRef<RobotAnimationName>("Idle");

  const gltf = useGLTF(ROBOT_MODEL_URL);

  const { clonedScene, rightArmBones } = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    const bones: RightArmBones = {};

    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      if (child.name === "UpperArm.R" && !bones.upperArm) {
        bones.upperArm = {
          bone: child,
          rest: child.quaternion.clone(),
          point: POINT_UPPER_ARM_R,
        };
      } else if (child.name === "LowerArm.R" && !bones.lowerArm) {
        bones.lowerArm = {
          bone: child,
          rest: child.quaternion.clone(),
          point: POINT_LOWER_ARM_R,
        };
      } else if (child.name === "Index.R" && !bones.index1) {
        bones.index1 = {
          bone: child,
          rest: child.quaternion.clone(),
          point: POINT_INDEX_R,
        };
      } else if (child.name === "Index2.R" && !bones.index2) {
        bones.index2 = {
          bone: child,
          rest: child.quaternion.clone(),
          point: POINT_INDEX2_R,
        };
      }
    });

    return { clonedScene: clone, rightArmBones: bones };
  }, [gltf.scene]);

  const { actions } = useAnimations(gltf.animations, modelRootRef);

  const playAnimation = useCallback(
    (nextAnim: RobotAnimationName) => {
      if (!actions) return;
      const prevAnim = activeAnimRef.current;
      const nextAction = actions[nextAnim] ?? actions["Idle"];
      if (!nextAction) return;

      if (prevAnim !== nextAnim && actions[prevAnim]) {
        actions[prevAnim]?.fadeOut(0.16);
      }

      if (nextAnim === "Wave") {
        nextAction.setLoop(THREE.LoopOnce, 1);
      } else {
        nextAction.setLoop(THREE.LoopRepeat, Infinity);
      }

      nextAction.reset().fadeIn(0.16).play();
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

    // Smoothly articulate right arm bones for `point_to` gesture when in Idle
    if (pose.animation === "Idle") {
      const blend = Math.min(1, Math.max(0.05, delta * 12));
      const entries = [
        rightArmBones.upperArm,
        rightArmBones.lowerArm,
        rightArmBones.index1,
        rightArmBones.index2,
      ];
      for (const entry of entries) {
        if (!entry) continue;
        entry.bone.quaternion.slerp(
          pose.isPointing ? entry.point : entry.rest,
          blend,
        );
      }
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

      {/* Visual pointing indicator arrow in front of right hand during point_to */}
      {isPointing && (
        <group position={[-0.18, 0.72, 0.65]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.65, 12]} />
            <meshBasicMaterial color="#facc15" transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.38]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.055, 0.14, 16]} />
            <meshBasicMaterial color="#fde047" />
          </mesh>
        </group>
      )}

      {/* 3D Speech Bubble above robot while speaking */}
      {activeSpeech && (
        <SpeechBubbleSprite text={activeSpeech} position={[0, 2.24, 0]} />
      )}

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
