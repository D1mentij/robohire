"use client";

import { Edges } from "@react-three/drei";
import type { Zone } from "@/types/contracts";
import { LabelSprite } from "./LabelSprite";

const ZONE_HEIGHT = 0.5;

const ZONE_COLOR_MAP: Record<
  string,
  { fill: string; edge: string; bg: string }
> = {
  entrance: {
    fill: "#06b6d4",
    edge: "#22d3ee",
    bg: "rgba(8, 51, 68, 0.92)",
  },
  counter: {
    fill: "#f59e0b",
    edge: "#fbbf24",
    bg: "rgba(69, 26, 3, 0.92)",
  },
  tables: {
    fill: "#10b981",
    edge: "#34d399",
    bg: "rgba(6, 78, 59, 0.92)",
  },
  menu_board: {
    fill: "#8b5cf6",
    edge: "#a78bfa",
    bg: "rgba(46, 16, 101, 0.92)",
  },
  waiting_area: {
    fill: "#ec4899",
    edge: "#f472b6",
    bg: "rgba(80, 7, 36, 0.92)",
  },
};

const FALLBACK_PALETTE = [
  {
    fill: "#3b82f6",
    edge: "#60a5fa",
    bg: "rgba(23, 37, 84, 0.92)",
  },
  {
    fill: "#14b8a6",
    edge: "#2dd4bf",
    bg: "rgba(19, 78, 74, 0.92)",
  },
  {
    fill: "#eab308",
    edge: "#facc15",
    bg: "rgba(66, 32, 6, 0.92)",
  },
];

function getZoneTheme(id: string, index: number) {
  return ZONE_COLOR_MAP[id] ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

export interface ZoneBoxProps {
  zone: Zone;
  index: number;
  isActive: boolean;
}

export function ZoneBox({ zone, index, isActive }: ZoneBoxProps) {
  const theme = getZoneTheme(zone.id, index);

  return (
    <group position={[zone.x, 0, zone.z]}>
      {/* Floor base pad at y = 0.005 */}
      <mesh
        position={[0, 0.005, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[zone.w, zone.d]} />
        <meshStandardMaterial
          color={theme.fill}
          transparent
          opacity={isActive ? 0.38 : 0.2}
          roughness={0.7}
        />
      </mesh>

      {/* Translucent 3D zone volume centered at (x, ZONE_HEIGHT/2, z) with size (w, ZONE_HEIGHT, d) */}
      <mesh position={[0, ZONE_HEIGHT / 2, 0]}>
        <boxGeometry args={[zone.w, ZONE_HEIGHT, zone.d]} />
        <meshStandardMaterial
          color={theme.fill}
          transparent
          opacity={isActive ? 0.42 : 0.24}
          depthWrite={false}
          roughness={0.35}
          metalness={0.1}
        />
        <Edges
          threshold={15}
          color={isActive ? "#ffffff" : theme.edge}
          scale={1}
        />
      </mesh>

      {/* Native Three.js billboard label sprite above zone center */}
      <LabelSprite
        title={zone.label}
        subtitle={`${zone.w}m × ${zone.d}m`}
        position={[0, ZONE_HEIGHT + 0.42, 0]}
        accentColor={theme.edge}
        bgColor={theme.bg}
        isActive={isActive}
        scale={[1.85, 0.68, 1]}
      />
    </group>
  );
}
