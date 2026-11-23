"use client";

import { useMemo } from "react";
import { Edges } from "@react-three/drei";
import type { Zone } from "@/types/contracts";
import { classifyZoneFurniture, type ZoneFurnitureKind } from "@/lib/executor";
import { LabelSprite } from "./LabelSprite";

const ZONE_COLOR_MAP: Record<
  ZoneFurnitureKind,
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
  menu: {
    fill: "#8b5cf6",
    edge: "#a78bfa",
    bg: "rgba(46, 16, 101, 0.92)",
  },
  waiting: {
    fill: "#ec4899",
    edge: "#f472b6",
    bg: "rgba(80, 7, 36, 0.92)",
  },
  shelves: {
    fill: "#3b82f6",
    edge: "#60a5fa",
    bg: "rgba(23, 37, 84, 0.92)",
  },
  unknown: {
    fill: "#64748b",
    edge: "#94a3b8",
    bg: "rgba(30, 41, 59, 0.92)",
  },
};

function EntranceFurniture({ w, d }: { w: number; d: number }) {
  const doorW = Math.min(1.25, Math.max(0.7, w * 0.65));
  const doorH = 1.4;
  const matW = Math.min(1.35, Math.max(0.65, w * 0.7));
  const matD = Math.min(0.75, Math.max(0.4, d * 0.55));
  const frameZ = -d / 2 + 0.08;

  return (
    <group>
      {/* Textured welcome mat */}
      <mesh position={[0, 0.015, 0.05]} castShadow receiveShadow>
        <boxGeometry args={[matW, 0.025, matD]} />
        <meshStandardMaterial color="#475569" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.028, 0.05]} receiveShadow>
        <boxGeometry args={[matW * 0.86, 0.006, matD * 0.82]} />
        <meshStandardMaterial color="#334155" roughness={0.95} />
      </mesh>

      {/* Door frame: left post, right post, top lintel */}
      <mesh
        position={[-doorW / 2, doorH / 2, frameZ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.08, doorH, 0.1]} />
        <meshStandardMaterial color="#78350f" roughness={0.6} />
      </mesh>
      <mesh
        position={[doorW / 2, doorH / 2, frameZ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.08, doorH, 0.1]} />
        <meshStandardMaterial color="#78350f" roughness={0.6} />
      </mesh>
      <mesh
        position={[0, doorH + 0.04, frameZ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[doorW + 0.14, 0.08, 0.12]} />
        <meshStandardMaterial color="#78350f" roughness={0.6} />
      </mesh>

      {/* Glass door panel + handle */}
      <mesh position={[0, doorH / 2, frameZ]}>
        <boxGeometry args={[doorW - 0.08, doorH - 0.04, 0.03]} />
        <meshStandardMaterial
          color="#bae6fd"
          transparent
          opacity={0.35}
          roughness={0.15}
          metalness={0.2}
        />
      </mesh>
      <mesh
        position={[doorW * 0.32, doorH * 0.48, frameZ + 0.035]}
        castShadow
      >
        <boxGeometry args={[0.03, 0.18, 0.04]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

function CounterFurniture({ w, d }: { w: number; d: number }) {
  const isAlongZ = d >= w;
  const counterLen = Math.min(
    Math.max(w, d) * 0.78,
    Math.max(0.8, Math.max(w, d) - 0.25),
  );
  const counterThick = Math.min(
    0.82,
    Math.max(0.45, Math.min(w, d) * 0.55),
  );
  const counterH = 0.86;

  return (
    <group rotation={[0, isAlongZ ? Math.PI / 2 : 0, 0]}>
      {/* Main wooden counter cabinet */}
      <mesh position={[0, counterH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[counterLen, counterH, counterThick]} />
        <meshStandardMaterial color="#92400e" roughness={0.65} />
      </mesh>

      {/* Front decorative wood panel inset */}
      <mesh
        position={[0, counterH / 2, counterThick / 2 + 0.008]}
        receiveShadow
      >
        <boxGeometry
          args={[counterLen * 0.9, counterH * 0.76, 0.015]}
        />
        <meshStandardMaterial color="#78350f" roughness={0.7} />
      </mesh>

      {/* Overhanging stone countertop */}
      <mesh position={[0, counterH + 0.025, 0]} castShadow receiveShadow>
        <boxGeometry
          args={[counterLen + 0.08, 0.05, counterThick + 0.08]}
        />
        <meshStandardMaterial color="#f1f5f9" roughness={0.35} metalness={0.05} />
      </mesh>

      {/* POS Terminal / Monitor Screen */}
      <group position={[-counterLen * 0.2, counterH + 0.05, 0]}>
        <mesh position={[0, 0.015, 0]} castShadow>
          <boxGeometry args={[0.2, 0.03, 0.16]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.1, -0.02]} castShadow>
          <boxGeometry args={[0.04, 0.16, 0.04]} />
          <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.5} />
        </mesh>
        <mesh
          position={[0, 0.22, 0.01]}
          rotation={[-0.22, 0, 0]}
          castShadow
        >
          <boxGeometry args={[0.34, 0.22, 0.03]} />
          <meshStandardMaterial color="#0f172a" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.22, 0.027]} rotation={[-0.22, 0, 0]}>
          <planeGeometry args={[0.29, 0.17]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      </group>

      {/* Espresso / Service Machine Accent */}
      {counterLen >= 1.2 && (
        <group position={[counterLen * 0.24, counterH + 0.05, 0]}>
          <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.32, 0.28, 0.26]} />
            <meshStandardMaterial
              color="#475569"
              metalness={0.65}
              roughness={0.3}
            />
          </mesh>
          <mesh position={[0, 0.29, 0]} castShadow>
            <boxGeometry args={[0.3, 0.02, 0.24]} />
            <meshStandardMaterial
              color="#cbd5e1"
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

function SingleTableWithChairs({
  position,
  chairCount,
}: {
  position: [number, number, number];
  chairCount: number;
}) {
  const chairAngles = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < chairCount; i++) {
      out.push((i * Math.PI * 2) / chairCount + Math.PI / 4);
    }
    return out;
  }, [chairCount]);

  return (
    <group position={position}>
      {/* Floor base disc */}
      <mesh position={[0, 0.015, 0]} receiveShadow>
        <cylinderGeometry args={[0.2, 0.22, 0.025, 16]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Central table leg */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.68, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Round wooden tabletop */}
      <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.04, 22]} />
        <meshStandardMaterial color="#d97706" roughness={0.55} />
      </mesh>

      {/* Low-poly chairs around table */}
      {chairAngles.map((ang, idx) => {
        const dist = 0.56;
        const cx = Math.sin(ang) * dist;
        const cz = Math.cos(ang) * dist;
        return (
          <group
            key={idx}
            position={[cx, 0, cz]}
            rotation={[0, ang + Math.PI, 0]}
          >
            {/* Chair leg post */}
            <mesh position={[0, 0.21, 0]} castShadow>
              <cylinderGeometry args={[0.03, 0.03, 0.42, 10]} />
              <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.5} />
            </mesh>
            {/* Chair seat */}
            <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.28, 0.045, 0.28]} />
              <meshStandardMaterial color="#0f766e" roughness={0.7} />
            </mesh>
            {/* Chair backrest */}
            <mesh position={[0, 0.58, -0.12]} castShadow receiveShadow>
              <boxGeometry args={[0.28, 0.28, 0.04]} />
              <meshStandardMaterial color="#115e59" roughness={0.7} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function TablesFurniture({ w, d }: { w: number; d: number }) {
  const layout = useMemo(() => {
    const cols = Math.max(1, Math.min(2, Math.floor(w / 1.95)));
    const rows = Math.max(1, Math.min(2, Math.floor(d / 1.85)));
    const cellW = w / cols;
    const cellD = d / rows;
    const chairCount = Math.min(cellW, cellD) >= 1.75 ? 4 : 2;

    const items: { pos: [number, number, number]; chairs: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -w / 2 + cellW * (c + 0.5);
        const z = -d / 2 + cellD * (r + 0.5);
        items.push({ pos: [x, 0, z], chairs: chairCount });
      }
    }
    return items;
  }, [w, d]);

  return (
    <group>
      {layout.map((t, i) => (
        <SingleTableWithChairs
          key={i}
          position={t.pos}
          chairCount={t.chairs}
        />
      ))}
    </group>
  );
}

function MenuBoardFurniture({ w, d }: { w: number; d: number }) {
  const isAlongZ = d > w * 1.3;
  const boardW = Math.min(1.5, Math.max(0.75, Math.max(w, d) * 0.76));
  const boardH = 0.74;
  const postH = 1.42;

  return (
    <group rotation={[0, isAlongZ ? Math.PI / 2 : 0, 0]}>
      {/* Left and right stand posts */}
      <mesh
        position={[-boardW / 2 + 0.06, postH / 2, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.035, 0.04, postH, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh
        position={[boardW / 2 - 0.06, postH / 2, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.035, 0.04, postH, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Board housing */}
      <mesh position={[0, 1.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[boardW, boardH, 0.07]} />
        <meshStandardMaterial color="#1e1b4b" roughness={0.4} />
      </mesh>

      {/* Menu display accents on both front and back faces */}
      {[-0.038, 0.038].map((zOffset, idx) => (
        <group
          key={idx}
          position={[0, 1.06, zOffset]}
          rotation={[0, zOffset < 0 ? Math.PI : 0, 0]}
        >
          <mesh position={[0, 0.22, 0]}>
            <planeGeometry args={[boardW * 0.84, 0.11]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
          <mesh position={[0, 0.04, 0]}>
            <planeGeometry args={[boardW * 0.8, 0.07]} />
            <meshBasicMaterial color="#e2e8f0" />
          </mesh>
          <mesh position={[0, -0.1, 0]}>
            <planeGeometry args={[boardW * 0.8, 0.07]} />
            <meshBasicMaterial color="#cbd5e1" />
          </mesh>
          <mesh position={[0, -0.24, 0]}>
            <planeGeometry args={[boardW * 0.6, 0.07]} />
            <meshBasicMaterial color="#38bdf8" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function WaitingSofaFurniture({ w, d }: { w: number; d: number }) {
  const isAlongZ = d > w;
  const sofaW = Math.min(1.85, Math.max(0.85, Math.max(w, d) * 0.7));
  const sofaD = Math.min(0.76, Math.max(0.5, Math.min(w, d) * 0.55));

  return (
    <group rotation={[0, isAlongZ ? Math.PI / 2 : 0, 0]}>
      {/* Warm area rug */}
      <mesh position={[0, 0.012, 0.08]} receiveShadow>
        <boxGeometry args={[sofaW + 0.35, 0.012, sofaD + 0.45]} />
        <meshStandardMaterial color="#4c1d95" roughness={0.9} />
      </mesh>

      {/* Wooden sofa plinth */}
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[sofaW, 0.12, sofaD]} />
        <meshStandardMaterial color="#78350f" roughness={0.65} />
      </mesh>

      {/* Seat cushion */}
      <mesh position={[0, 0.25, 0.03]} castShadow receiveShadow>
        <boxGeometry args={[sofaW - 0.2, 0.18, sofaD - 0.08]} />
        <meshStandardMaterial color="#be185d" roughness={0.75} />
      </mesh>

      {/* Backrest cushion */}
      <mesh
        position={[0, 0.52, -sofaD / 2 + 0.11]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[sofaW - 0.2, 0.38, 0.18]} />
        <meshStandardMaterial color="#9d174d" roughness={0.75} />
      </mesh>

      {/* Left & right armrests */}
      <mesh
        position={[-sofaW / 2 + 0.08, 0.38, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.16, 0.44, sofaD]} />
        <meshStandardMaterial color="#831843" roughness={0.75} />
      </mesh>
      <mesh
        position={[sofaW / 2 - 0.08, 0.38, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.16, 0.44, sofaD]} />
        <meshStandardMaterial color="#831843" roughness={0.75} />
      </mesh>
    </group>
  );
}

function ShelvesFurniture({ w, d }: { w: number; d: number }) {
  const isAlongZ = d > w;
  const rackW = Math.min(1.65, Math.max(0.75, Math.max(w, d) * 0.74));
  const rackD = Math.min(0.48, Math.max(0.32, Math.min(w, d) * 0.45));
  const rackH = 1.32;
  const shelfLevels = [0.16, 0.52, 0.88, 1.24];

  return (
    <group rotation={[0, isAlongZ ? Math.PI / 2 : 0, 0]}>
      {/* 4 corner uprights */}
      {[-rackW / 2 + 0.03, rackW / 2 - 0.03].map((px, xi) =>
        [-rackD / 2 + 0.03, rackD / 2 - 0.03].map((pz, zi) => (
          <mesh
            key={`post-${xi}-${zi}`}
            position={[px, rackH / 2, pz]}
            castShadow
          >
            <boxGeometry args={[0.045, rackH, 0.045]} />
            <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.5} />
          </mesh>
        )),
      )}

      {/* Horizontal shelf planks + book/item blocks */}
      {shelfLevels.map((y, idx) => (
        <group key={`shelf-${idx}`} position={[0, y, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[rackW, 0.035, rackD]} />
            <meshStandardMaterial color="#b45309" roughness={0.65} />
          </mesh>
          {idx < 3 && (
            <>
              <mesh
                position={[-rackW * 0.25, 0.11, 0]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[rackW * 0.24, 0.18, rackD * 0.7]} />
                <meshStandardMaterial color="#38bdf8" roughness={0.5} />
              </mesh>
              <mesh
                position={[rackW * 0.08, 0.12, 0]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[rackW * 0.2, 0.2, rackD * 0.68]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.5} />
              </mesh>
              <mesh
                position={[rackW * 0.3, 0.09, 0]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[rackW * 0.16, 0.14, rackD * 0.65]} />
                <meshStandardMaterial color="#34d399" roughness={0.5} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
}

export interface ZoneBoxProps {
  zone: Zone;
  index: number;
  isActive: boolean;
}

export function ZoneBox({ zone, isActive }: ZoneBoxProps) {
  const kind = useMemo(() => classifyZoneFurniture(zone), [zone]);
  const theme = ZONE_COLOR_MAP[kind];

  const labelY =
    kind === "entrance" || kind === "menu" || kind === "shelves"
      ? 1.72
      : kind === "counter"
        ? 1.48
        : 1.15;

  return (
    <group position={[zone.x, 0, zone.z]}>
      {/* Faint floor outline and subtle zone pad so zone bounds stay readable */}
      <mesh
        position={[0, 0.006, 0]}
        receiveShadow
      >
        <boxGeometry args={[zone.w, 0.012, zone.d]} />
        <meshStandardMaterial
          color={theme.fill}
          transparent
          opacity={isActive ? 0.28 : 0.12}
          roughness={0.8}
        />
        <Edges
          threshold={15}
          color={isActive ? "#ffffff" : theme.edge}
          scale={1}
        />
      </mesh>

      {/* Low-poly procedural furniture by zone archetype */}
      {kind === "entrance" && <EntranceFurniture w={zone.w} d={zone.d} />}
      {kind === "counter" && <CounterFurniture w={zone.w} d={zone.d} />}
      {kind === "tables" && <TablesFurniture w={zone.w} d={zone.d} />}
      {kind === "menu" && <MenuBoardFurniture w={zone.w} d={zone.d} />}
      {kind === "waiting" && <WaitingSofaFurniture w={zone.w} d={zone.d} />}
      {kind === "shelves" && <ShelvesFurniture w={zone.w} d={zone.d} />}

      {/* Native Three.js billboard label sprite above zone */}
      <LabelSprite
        title={zone.label}
        subtitle={`${zone.w}m × ${zone.d}m`}
        position={[0, labelY, 0]}
        accentColor={theme.edge}
        bgColor={theme.bg}
        isActive={isActive}
        scale={[1.85, 0.68, 1]}
      />
    </group>
  );
}
