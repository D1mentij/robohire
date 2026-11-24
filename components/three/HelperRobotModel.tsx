"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Scene } from "@/types/contracts";
import type { RobotPose, Vec2XZ } from "@/lib/executor";
import { getRobotMeta, type HelperRobotType } from "@/lib/robots/catalog";
import { LabelSprite } from "./LabelSprite";

export interface HelperRobotModelProps {
  robotType: HelperRobotType;
  scene: Scene;
  poseRef: React.MutableRefObject<RobotPose>;
  startPosition: Vec2XZ;
  onTick: (deltaSeconds: number) => void;
}

const LABEL_HEIGHT: Record<HelperRobotType, number> = {
  vacuum: 0.72,
  window_cleaner: 0.62,
  tray_delivery: 1.48,
  uvc_disinfection: 1.62,
  shelf_scanner: 1.88,
  air_purifier: 1.38,
  security_rover: 0.92,
};

export function HelperRobotModel({
  robotType,
  scene,
  poseRef,
  startPosition,
  onTick,
}: HelperRobotModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const spinRefA = useRef<THREE.Object3D>(null);
  const spinRefB = useRef<THREE.Object3D>(null);
  const pulseMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const elapsedRef = useRef<number>(0);

  const meta = getRobotMeta(robotType);

  // North wall window strip geometry (matches Room3D.tsx)
  const roomW = scene.room.width;
  const cx = roomW / 2;
  const windowStripWidth = Math.max(1.8, roomW * 0.62);
  const winMinX = cx - windowStripWidth / 2 + 0.25;
  const winMaxX = cx + windowStripWidth / 2 - 0.25;

  useEffect(() => {
    const group = groupRef.current;
    const pose = poseRef.current;
    if (!group) return;
    if (robotType === "window_cleaner") {
      const clampedX = Math.min(winMaxX, Math.max(winMinX, pose.x));
      group.position.set(clampedX, 0.68, 0.04);
      group.rotation.set(0, 0, 0);
    } else {
      group.position.set(pose.x, 0, pose.z);
      group.rotation.set(0, pose.rotationY, 0);
    }
  }, [poseRef, robotType, winMinX, winMaxX]);

  useFrame((_, delta) => {
    onTick(delta);
    const dt = Math.min(Math.max(delta, 0), 0.1);
    elapsedRef.current += dt;
    const t = elapsedRef.current;

    const pose = poseRef.current;
    const group = groupRef.current;

    if (group) {
      if (robotType === "window_cleaner") {
        // Glide horizontally along the North window glass plane & sweep vertically
        const clampedX = Math.min(winMaxX, Math.max(winMinX, pose.x));
        const sweepY = 0.68 + Math.sin(t * 2.1) * 0.16;
        group.position.set(clampedX, sweepY, 0.04);
        group.rotation.set(0, 0, 0);
      } else {
        group.position.set(pose.x, 0, pose.z);
        group.rotation.set(0, pose.rotationY, 0);
      }
    }

    // Subtle per-robot mechanical animations
    if (robotType === "vacuum") {
      if (spinRefA.current) spinRefA.current.rotation.y = t * 5.0;
    } else if (robotType === "window_cleaner") {
      if (spinRefA.current) spinRefA.current.rotation.z = t * 6.0;
      if (spinRefB.current) spinRefB.current.rotation.z = -t * 6.0;
    } else if (robotType === "uvc_disinfection") {
      if (pulseMatRef.current) {
        pulseMatRef.current.emissiveIntensity = 1.6 + Math.sin(t * 4.2) * 0.45;
      }
    } else if (robotType === "shelf_scanner") {
      if (spinRefA.current) {
        spinRefA.current.rotation.y = Math.sin(t * 2.2) * 0.55;
      }
    } else if (robotType === "air_purifier") {
      if (spinRefA.current) {
        spinRefA.current.position.y = 0.98 + ((t * 0.35) % 0.28);
      }
    } else if (robotType === "security_rover") {
      if (spinRefA.current) {
        spinRefA.current.rotation.y = Math.sin(t * 1.9) * 1.1;
      }
    }
  });

  return (
    <>
      {/* Stationary Auto-Empty Dock for Robot Vacuum & Mop at startPosition */}
      {robotType === "vacuum" && (
        <group position={[startPosition.x, 0, startPosition.z - 0.38]}>
          <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.32, 0.48, 0.24]} />
            <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.02, 0.16]} receiveShadow>
            <boxGeometry args={[0.34, 0.04, 0.24]} />
            <meshStandardMaterial color="#334155" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.42, 0.125]}>
            <boxGeometry args={[0.16, 0.025, 0.01]} />
            <meshBasicMaterial color="#14b8a6" />
          </mesh>
        </group>
      )}

      <group
        ref={groupRef}
        position={
          robotType === "window_cleaner"
            ? [Math.min(winMaxX, Math.max(winMinX, startPosition.x)), 0.68, 0.04]
            : [startPosition.x, 0, startPosition.z]
        }
      >
        {/* 1. Robot Vacuum & Mop */}
        {robotType === "vacuum" && (
          <group>
            {/* Main circular puck body */}
            <mesh position={[0, 0.065, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.24, 0.25, 0.11, 32]} />
              <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.35} />
            </mesh>
            {/* Top metallic lid */}
            <mesh position={[0, 0.125, 0]} castShadow>
              <cylinderGeometry args={[0.21, 0.22, 0.018, 32]} />
              <meshStandardMaterial color="#334155" roughness={0.25} metalness={0.5} />
            </mesh>
            {/* LiDAR sensor turret */}
            <mesh position={[0, 0.155, -0.02]} castShadow>
              <cylinderGeometry args={[0.06, 0.065, 0.045, 24]} />
              <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.6} />
            </mesh>
            {/* Glowing teal status ring */}
            <mesh position={[0, 0.136, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.14, 0.165, 32]} />
              <meshBasicMaterial color="#14b8a6" />
            </mesh>
            {/* Spinning dual mop pad ring underneath */}
            <group ref={spinRefA} position={[0, 0.012, 0]}>
              <mesh position={[-0.09, 0, -0.05]}>
                <cylinderGeometry args={[0.085, 0.085, 0.014, 16]} />
                <meshStandardMaterial color="#5eead4" roughness={0.8} />
              </mesh>
              <mesh position={[0.09, 0, -0.05]}>
                <cylinderGeometry args={[0.085, 0.085, 0.014, 16]} />
                <meshStandardMaterial color="#5eead4" roughness={0.8} />
              </mesh>
            </group>
          </group>
        )}

        {/* 2. Window Cleaning Robot (mounted vertically on North glass wall) */}
        {robotType === "window_cleaner" && (
          <group>
            {/* Compact rectangular body flush against glass */}
            <mesh position={[0, 0, 0.045]} castShadow>
              <boxGeometry args={[0.34, 0.2, 0.075]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.3} metalness={0.2} />
            </mesh>
            {/* Cyan accent handle/bumper */}
            <mesh position={[0, 0, 0.088]}>
              <boxGeometry args={[0.2, 0.05, 0.025]} />
              <meshStandardMaterial
                color="#06b6d4"
                emissive="#0891b2"
                emissiveIntensity={0.45}
                roughness={0.3}
              />
            </mesh>
            {/* Dual rotating suction cleaning pads against glass */}
            <mesh
              ref={spinRefA}
              position={[-0.09, 0, 0.005]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.085, 0.085, 0.015, 20]} />
              <meshStandardMaterial color="#22d3ee" roughness={0.7} />
            </mesh>
            <mesh
              ref={spinRefB}
              position={[0.09, 0, 0.005]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.085, 0.085, 0.015, 20]} />
              <meshStandardMaterial color="#22d3ee" roughness={0.7} />
            </mesh>
            {/* Safety tether & power cord line to upper window lintel */}
            <mesh position={[0, 0.28, 0.04]}>
              <cylinderGeometry args={[0.006, 0.006, 0.42, 8]} />
              <meshBasicMaterial color="#facc15" />
            </mesh>
          </group>
        )}

        {/* 3. Tray Delivery & Busser Bot */}
        {robotType === "tray_delivery" && (
          <group>
            {/* Wheeled base */}
            <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.28, 0.3, 0.22, 24]} />
              <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.3} />
            </mesh>
            {/* Orange bumper LED strip */}
            <mesh position={[0, 0.14, 0]}>
              <cylinderGeometry args={[0.295, 0.295, 0.03, 24]} />
              <meshStandardMaterial
                color="#f97316"
                emissive="#f97316"
                emissiveIntensity={0.6}
              />
            </mesh>
            {/* Two vertical side frame pillars */}
            {[-0.22, 0.22].map((px) => (
              <mesh key={px} position={[px, 0.62, -0.04]} castShadow>
                <boxGeometry args={[0.05, 0.88, 0.08]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.35} metalness={0.25} />
              </mesh>
            ))}
            {/* Three stacked delivery trays */}
            {[0.38, 0.64, 0.9].map((ty) => (
              <mesh key={ty} position={[0, ty, 0.02]} castShadow receiveShadow>
                <boxGeometry args={[0.42, 0.035, 0.36]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.4} metalness={0.15} />
              </mesh>
            ))}
            {/* Angled top display screen head */}
            <mesh position={[0, 1.12, 0.02]} rotation={[-0.28, 0, 0]} castShadow>
              <boxGeometry args={[0.32, 0.2, 0.07]} />
              <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.5} />
            </mesh>
            <mesh position={[0, 1.12, 0.058]} rotation={[-0.28, 0, 0]}>
              <planeGeometry args={[0.26, 0.14]} />
              <meshBasicMaterial color="#fb923c" />
            </mesh>
          </group>
        )}

        {/* 4. UV-C Disinfection Bot */}
        {robotType === "uvc_disinfection" && (
          <group>
            {/* Heavy wheeled base */}
            <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.28, 0.31, 0.3, 28]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.35} metalness={0.25} />
            </mesh>
            {/* Glowing vertical UV-C lamp column */}
            <mesh position={[0, 0.78, 0]}>
              <cylinderGeometry args={[0.095, 0.095, 0.94, 24]} />
              <meshStandardMaterial
                ref={pulseMatRef}
                color="#c084fc"
                emissive="#a855f7"
                emissiveIntensity={1.6}
                roughness={0.15}
              />
            </mesh>
            {/* Protective vertical cage bars */}
            {[0, 1, 2, 3].map((i) => {
              const a = (i * Math.PI) / 2 + Math.PI / 4;
              return (
                <mesh
                  key={i}
                  position={[Math.cos(a) * 0.16, 0.78, Math.sin(a) * 0.16]}
                >
                  <cylinderGeometry args={[0.012, 0.012, 0.94, 8]} />
                  <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} />
                </mesh>
              );
            })}
            {/* Top cap & warning beacon */}
            <mesh position={[0, 1.28, 0]} castShadow>
              <cylinderGeometry args={[0.2, 0.22, 0.08, 24]} />
              <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.3} />
            </mesh>
            <mesh position={[0, 1.35, 0]}>
              <sphereGeometry args={[0.05, 16, 16]} />
              <meshBasicMaterial color="#e879f9" />
            </mesh>
            <pointLight
              position={[0, 0.85, 0]}
              color="#a855f7"
              intensity={1.4}
              distance={4.2}
            />
          </group>
        )}

        {/* 5. Shelf-Scanning Inventory Bot */}
        {robotType === "shelf_scanner" && (
          <group>
            {/* Compact wheeled base */}
            <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.42, 0.24, 0.48]} />
              <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.3} />
            </mesh>
            {/* Tall vertical sensor mast */}
            <mesh position={[0, 0.88, -0.02]} castShadow>
              <boxGeometry args={[0.14, 1.36, 0.14]} />
              <meshStandardMaterial color="#f1f5f9" roughness={0.35} metalness={0.2} />
            </mesh>
            {/* Stacked optical camera/sensor modules along mast */}
            {[0.55, 0.9, 1.25].map((sy) => (
              <mesh key={sy} position={[0, sy, 0.06]}>
                <boxGeometry args={[0.16, 0.09, 0.04]} />
                <meshStandardMaterial
                  color="#4f46e5"
                  emissive="#6366f1"
                  emissiveIntensity={0.65}
                  roughness={0.2}
                />
              </mesh>
            ))}
            {/* Sweeping optical scan beam */}
            <group ref={spinRefA} position={[0, 0.95, 0.08]}>
              <mesh position={[0, 0, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.22, 0.7, 16, 1, true]} />
                <meshBasicMaterial
                  color="#818cf8"
                  transparent
                  opacity={0.22}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
            {/* Top LiDAR dome */}
            <mesh position={[0, 1.6, -0.02]} castShadow>
              <cylinderGeometry args={[0.075, 0.085, 0.08, 20]} />
              <meshStandardMaterial color="#312e81" metalness={0.5} roughness={0.3} />
            </mesh>
          </group>
        )}

        {/* 6. Mobile Air Purifier Bot */}
        {robotType === "air_purifier" && (
          <group>
            {/* Sleek cylindrical tower */}
            <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.23, 0.27, 0.92, 32]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.3} metalness={0.12} />
            </mesh>
            {/* Perforated dark intake band */}
            <mesh position={[0, 0.34, 0]}>
              <cylinderGeometry args={[0.252, 0.264, 0.3, 32]} />
              <meshStandardMaterial color="#334155" roughness={0.7} metalness={0.2} />
            </mesh>
            {/* Glowing emerald air-quality ring */}
            <mesh position={[0, 0.945, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.14, 0.21, 32]} />
              <meshBasicMaterial color="#10b981" />
            </mesh>
            {/* Rising purified airflow ring animation */}
            <mesh
              ref={spinRefA}
              position={[0, 1.02, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[0.16, 0.19, 28]} />
              <meshBasicMaterial color="#34d399" transparent opacity={0.48} />
            </mesh>
          </group>
        )}

        {/* 7. Indoor Security & Patrol Rover */}
        {robotType === "security_rover" && (
          <group>
            {/* Rugged 4-wheel chassis */}
            <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.42, 0.18, 0.54]} />
              <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.4} />
            </mesh>
            {/* 4 Rover Wheels */}
            {[
              [-0.24, 0.11, 0.18],
              [0.24, 0.11, 0.18],
              [-0.24, 0.11, -0.18],
              [0.24, 0.11, -0.18],
            ].map(([wx, wy, wz], idx) => (
              <mesh
                key={idx}
                position={[wx, wy, wz]}
                rotation={[0, 0, Math.PI / 2]}
                castShadow
              >
                <cylinderGeometry args={[0.11, 0.11, 0.08, 18]} />
                <meshStandardMaterial color="#0f172a" roughness={0.85} />
              </mesh>
            ))}
            {/* Front LED patrol light bar */}
            <mesh position={[0, 0.23, 0.275]}>
              <boxGeometry args={[0.28, 0.04, 0.015]} />
              <meshBasicMaterial color="#fb7185" />
            </mesh>
            {/* Rotating 360° camera turret */}
            <group ref={spinRefA} position={[0, 0.42, 0]}>
              <mesh position={[0, -0.06, 0]} castShadow>
                <cylinderGeometry args={[0.07, 0.09, 0.1, 16]} />
                <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.35} />
              </mesh>
              <mesh position={[0, 0.04, 0]} castShadow>
                <boxGeometry args={[0.18, 0.14, 0.2]} />
                <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.35} />
              </mesh>
              <mesh position={[0, 0.04, 0.105]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.045, 0.045, 0.03, 16]} />
                <meshStandardMaterial
                  color="#f43f5e"
                  emissive="#f43f5e"
                  emissiveIntensity={0.8}
                />
              </mesh>
            </group>
          </group>
        )}

        {/* Ground direction ring (for floor-based helper robots) */}
        {robotType !== "window_cleaner" && (
          <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.28, 0.34, 32]} />
            <meshBasicMaterial color={meta.accentHex} transparent opacity={0.8} />
          </mesh>
        )}

        {/* Robot identifier badge above unit */}
        <LabelSprite
          title={meta.shortName}
          position={[0, LABEL_HEIGHT[robotType], 0]}
          accentColor={meta.accentHex}
          bgColor="rgba(15, 23, 42, 0.94)"
          scale={[1.55, 0.48, 1]}
        />
      </group>
    </>
  );
}
