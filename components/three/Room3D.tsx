"use client";

import { Edges } from "@react-three/drei";
import type { Scene } from "@/types/contracts";
import type { Vec2XZ, WalkTargetInfo } from "@/lib/executor";
import { ZoneBox } from "./ZoneBox";

const FLOOR_THICKNESS = 0.08;
const WALL_HEIGHT = 0.65;
const WALL_THICKNESS = 0.14;

export interface Room3DProps {
  scene: Scene;
  activeZoneId: string | null;
  startPosition: Vec2XZ;
  currentTargetInfo: WalkTargetInfo | null;
}

export function Room3D({
  scene,
  activeZoneId,
  startPosition,
  currentTargetInfo,
}: Room3DProps) {
  const { width, depth } = scene.room;
  const cx = width / 2;
  const cz = depth / 2;

  return (
    <group>
      {/* Room floor slab: top surface sits accurately at y = 0, spanning [0..width] x [0..depth] */}
      <mesh
        position={[cx, -FLOOR_THICKNESS / 2, cz]}
        receiveShadow
      >
        <boxGeometry args={[width, FLOOR_THICKNESS, depth]} />
        <meshStandardMaterial color="#1e293b" roughness={0.85} metalness={0.08} />
        <Edges threshold={15} color="#475569" />
      </mesh>

      {/* Subtle 1-meter floor grid lines across [0..width] x [0..depth] */}
      <group position={[0, 0.002, 0]}>
        {Array.from({ length: Math.floor(width) + 1 }, (_, i) => (
          <mesh
            key={`grid-x-${i}`}
            position={[i, 0, cz]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.015, depth]} />
            <meshBasicMaterial color="#334155" transparent opacity={0.55} />
          </mesh>
        ))}
        {Array.from({ length: Math.floor(depth) + 1 }, (_, i) => (
          <mesh
            key={`grid-z-${i}`}
            position={[cx, 0, i]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[width, 0.015]} />
            <meshBasicMaterial color="#334155" transparent opacity={0.55} />
          </mesh>
        ))}
      </group>

      {/* Low perimeter walls around the room */}
      {/* North wall (z = 0) */}
      <mesh
        position={[cx, WALL_HEIGHT / 2, -WALL_THICKNESS / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[width + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS]}
        />
        <meshStandardMaterial
          color="#334155"
          roughness={0.7}
          metalness={0.1}
          transparent
          opacity={0.85}
        />
        <Edges threshold={15} color="#64748b" />
      </mesh>

      {/* South wall (z = depth) */}
      <mesh
        position={[cx, WALL_HEIGHT / 2, depth + WALL_THICKNESS / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[width + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS]}
        />
        <meshStandardMaterial
          color="#334155"
          roughness={0.7}
          metalness={0.1}
          transparent
          opacity={0.5}
        />
        <Edges threshold={15} color="#64748b" />
      </mesh>

      {/* West wall (x = 0) */}
      <mesh
        position={[-WALL_THICKNESS / 2, WALL_HEIGHT / 2, cz]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, depth]} />
        <meshStandardMaterial
          color="#334155"
          roughness={0.7}
          metalness={0.1}
          transparent
          opacity={0.85}
        />
        <Edges threshold={15} color="#64748b" />
      </mesh>

      {/* East wall (x = width) */}
      <mesh
        position={[width + WALL_THICKNESS / 2, WALL_HEIGHT / 2, cz]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, depth]} />
        <meshStandardMaterial
          color="#334155"
          roughness={0.7}
          metalness={0.1}
          transparent
          opacity={0.75}
        />
        <Edges threshold={15} color="#64748b" />
      </mesh>

      {/* Start marker pad on the floor */}
      <group position={[startPosition.x, 0.008, startPosition.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.2, 0.28, 32]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.65} />
        </mesh>
      </group>

      {/* Target edge stop-point marker on the floor (outside target zone bounds) */}
      {currentTargetInfo && (
        <group
          position={[
            currentTargetInfo.stopPoint.x,
            0.01,
            currentTargetInfo.stopPoint.z,
          ]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.18, 0.27, 32]} />
            <meshBasicMaterial color="#facc15" transparent opacity={0.85} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.09, 24]} />
            <meshBasicMaterial color="#fef08a" transparent opacity={0.75} />
          </mesh>
        </group>
      )}

      {/* Render all zones from scene.zones */}
      {scene.zones.map((zone, idx) => (
        <ZoneBox
          key={zone.id}
          zone={zone}
          index={idx}
          isActive={activeZoneId === zone.id}
        />
      ))}
    </group>
  );
}
