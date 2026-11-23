"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Edges } from "@react-three/drei";
import type { Scene } from "@/types/contracts";
import type { Vec2XZ, WalkTargetInfo } from "@/lib/executor";
import { ZoneBox } from "./ZoneBox";

const FLOOR_THICKNESS = 0.08;
const WALL_HEIGHT = 1.15;
const WALL_THICKNESS = 0.14;

export interface Room3DProps {
  scene: Scene;
  businessType?: string;
  activeZoneId: string | null;
  startPosition: Vec2XZ;
  currentTargetInfo: WalkTargetInfo | null;
}

type FloorSurfaceKind = "wood" | "tiles";

function pickFloorSurfaceKind(businessType?: string): FloorSurfaceKind {
  const text = (businessType ?? "").toLowerCase();
  if (
    /retail|shop|store|supermarket|clinic|hospital|pharmacy|gym|warehouse|kitchen|lab/.test(
      text,
    )
  ) {
    return "tiles";
  }
  return "wood";
}

function createFloorCanvasTexture(
  kind: FloorSurfaceKind,
  roomWidth: number,
  roomDepth: number,
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (kind === "tiles") {
    // Warm ceramic / stone tiles with subtle grout lines
    ctx.fillStyle = "#475569";
    ctx.fillRect(0, 0, 512, 512);

    const tileCount = 4;
    const tileSize = 512 / tileCount;
    const grout = 4;

    for (let row = 0; row < tileCount; row += 1) {
      for (let col = 0; col < tileCount; col += 1) {
        const shadeOffset = ((row + col) % 2 === 0 ? 1 : -1) * 4;
        const r = 104 + shadeOffset;
        const g = 114 + shadeOffset;
        const b = 128 + shadeOffset;
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(
          col * tileSize + grout / 2,
          row * tileSize + grout / 2,
          tileSize - grout,
          tileSize - grout,
        );

        // Subtle inner highlight bevel
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          col * tileSize + grout,
          row * tileSize + grout,
          tileSize - grout * 2,
          tileSize - grout * 2,
        );
      }
    }
  } else {
    // Warm oak / walnut wood planks
    ctx.fillStyle = "#5c4028";
    ctx.fillRect(0, 0, 512, 512);

    const plankRows = 8;
    const plankH = 512 / plankRows;
    const tones = ["#785233", "#6e4a2d", "#825a38", "#684529"];

    for (let row = 0; row < plankRows; row += 1) {
      const y = row * plankH;
      const stagger = (row % 2) * 128;

      for (let seg = -1; seg < 3; seg += 1) {
        const x = seg * 256 + stagger;
        const tone = tones[(row + seg + 4) % tones.length];
        ctx.fillStyle = tone;
        ctx.fillRect(x + 2, y + 1.5, 252, plankH - 3);

        // Subtle wood grain streaks
        ctx.fillStyle = "rgba(255, 236, 209, 0.05)";
        ctx.fillRect(x + 12, y + plankH * 0.28, 228, 3);
        ctx.fillStyle = "rgba(30, 15, 5, 0.08)";
        ctx.fillRect(x + 20, y + plankH * 0.65, 210, 2.5);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    Math.max(1, roomWidth / 2.2),
    Math.max(1, roomDepth / 2.2),
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function Room3D({
  scene,
  businessType,
  activeZoneId,
  startPosition,
  currentTargetInfo,
}: Room3DProps) {
  const { width, depth } = scene.room;
  const cx = width / 2;
  const cz = depth / 2;

  const floorKind = pickFloorSurfaceKind(businessType);

  const floorTexture = useMemo(
    () => createFloorCanvasTexture(floorKind, width, depth),
    [floorKind, width, depth],
  );

  useEffect(() => {
    return () => {
      floorTexture?.dispose();
    };
  }, [floorTexture]);

  // Window strip dimensions along the North wall (z = 0)
  const windowStripWidth = Math.max(1.8, width * 0.62);
  const sidePillarWidth = Math.max(
    0.2,
    (width + WALL_THICKNESS * 2 - windowStripWidth) / 2,
  );
  const sillHeight = 0.42;
  const lintelHeight = 0.22;
  const windowOpeningHeight = WALL_HEIGHT - sillHeight - lintelHeight;
  const windowCenterY = sillHeight + windowOpeningHeight / 2;

  const intermediateWaypoint =
    currentTargetInfo && currentTargetInfo.waypoints.length > 1
      ? currentTargetInfo.waypoints[0]
      : null;

  return (
    <group>
      {/* Room floor slab with procedural wood or tile texture */}
      <mesh position={[cx, -FLOOR_THICKNESS / 2, cz]} receiveShadow>
        <boxGeometry args={[width, FLOOR_THICKNESS, depth]} />
        <meshStandardMaterial
          map={floorTexture ?? undefined}
          color={floorKind === "tiles" ? "#cbd5e1" : "#e7cba9"}
          roughness={floorKind === "tiles" ? 0.55 : 0.68}
          metalness={0.06}
        />
        <Edges threshold={15} color="#64748b" />
      </mesh>

      {/* Subtle 1-meter architectural grid overlay */}
      <group position={[0, 0.002, 0]}>
        {Array.from({ length: Math.floor(width) + 1 }, (_, i) => (
          <mesh
            key={`grid-x-${i}`}
            position={[i, 0, cz]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.01, depth]} />
            <meshBasicMaterial color="#0f172a" transparent opacity={0.18} />
          </mesh>
        ))}
        {Array.from({ length: Math.floor(depth) + 1 }, (_, i) => (
          <mesh
            key={`grid-z-${i}`}
            position={[cx, 0, i]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[width, 0.01]} />
            <meshBasicMaterial color="#0f172a" transparent opacity={0.18} />
          </mesh>
        ))}
      </group>

      {/* North wall (z = 0) with integrated window strip */}
      <group position={[cx, 0, -WALL_THICKNESS / 2]}>
        {/* Lower wall sill */}
        <mesh position={[0, sillHeight / 2, 0]} castShadow receiveShadow>
          <boxGeometry
            args={[width + WALL_THICKNESS * 2, sillHeight, WALL_THICKNESS]}
          />
          <meshStandardMaterial color="#475569" roughness={0.75} metalness={0.08} />
          <Edges threshold={15} color="#64748b" />
        </mesh>

        {/* Upper wall lintel */}
        <mesh
          position={[0, WALL_HEIGHT - lintelHeight / 2, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry
            args={[width + WALL_THICKNESS * 2, lintelHeight, WALL_THICKNESS]}
          />
          <meshStandardMaterial color="#475569" roughness={0.75} metalness={0.08} />
          <Edges threshold={15} color="#64748b" />
        </mesh>

        {/* Left structural wall pier */}
        <mesh
          position={[
            -(windowStripWidth / 2 + sidePillarWidth / 2),
            windowCenterY,
            0,
          ]}
          castShadow
          receiveShadow
        >
          <boxGeometry
            args={[sidePillarWidth, windowOpeningHeight, WALL_THICKNESS]}
          />
          <meshStandardMaterial color="#475569" roughness={0.75} metalness={0.08} />
        </mesh>

        {/* Right structural wall pier */}
        <mesh
          position={[
            windowStripWidth / 2 + sidePillarWidth / 2,
            windowCenterY,
            0,
          ]}
          castShadow
          receiveShadow
        >
          <boxGeometry
            args={[sidePillarWidth, windowOpeningHeight, WALL_THICKNESS]}
          />
          <meshStandardMaterial color="#475569" roughness={0.75} metalness={0.08} />
        </mesh>

        {/* Window glass strip + mullions */}
        <mesh position={[0, windowCenterY, 0]}>
          <boxGeometry
            args={[windowStripWidth, windowOpeningHeight, WALL_THICKNESS * 0.35]}
          />
          <meshStandardMaterial
            color="#bae6fd"
            emissive="#38bdf8"
            emissiveIntensity={0.28}
            roughness={0.15}
            metalness={0.2}
            transparent
            opacity={0.48}
          />
          <Edges threshold={15} color="#e0f2fe" />
        </mesh>
        {[-0.25, 0, 0.25].map((ratio) => (
          <mesh
            key={`mullion-${ratio}`}
            position={[windowStripWidth * ratio, windowCenterY, 0]}
            castShadow
          >
            <boxGeometry
              args={[0.04, windowOpeningHeight, WALL_THICKNESS * 0.6]}
            />
            <meshStandardMaterial color="#1e293b" roughness={0.5} />
          </mesh>
        ))}
      </group>

      {/* South wall (z = depth) — low cutaway cutaway rim so camera has clear sightline */}
      <mesh
        position={[cx, 0.24, depth + WALL_THICKNESS / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[width + WALL_THICKNESS * 2, 0.48, WALL_THICKNESS]}
        />
        <meshStandardMaterial
          color="#475569"
          roughness={0.75}
          metalness={0.08}
          transparent
          opacity={0.38}
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
          color="#475569"
          roughness={0.75}
          metalness={0.08}
          transparent
          opacity={0.82}
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
          color="#475569"
          roughness={0.75}
          metalness={0.08}
          transparent
          opacity={0.72}
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

      {/* Intermediate obstacle-avoidance waypoint marker when bypassing furniture */}
      {intermediateWaypoint && (
        <group
          position={[intermediateWaypoint.x, 0.01, intermediateWaypoint.z]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.11, 0.17, 24]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.8} />
          </mesh>
        </group>
      )}

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

      {/* Render all zones with procedural low-poly furniture */}
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
