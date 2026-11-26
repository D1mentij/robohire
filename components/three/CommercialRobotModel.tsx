"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RobotType } from "@/types/contracts";
import type { RobotPose, Vec2XZ } from "@/lib/executor";
import { getRobotSpec } from "@/lib/robots/catalog";
import { LabelSprite } from "./LabelSprite";

export interface CommercialRobotModelProps {
  robotType: RobotType;
  poseRef: React.MutableRefObject<RobotPose>;
  startPosition: Vec2XZ;
  isPointing: boolean;
  onTick: (deltaSeconds: number) => void;
}

export function CommercialRobotModel({
  robotType,
  poseRef,
  startPosition,
  isPointing,
  onTick,
}: CommercialRobotModelProps) {
  const outerGroupRef = useRef<THREE.Group>(null);
  const animPartRefA = useRef<THREE.Object3D>(null);
  const animPartRefB = useRef<THREE.Object3D>(null);
  const beaconMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const elapsedRef = useRef<number>(0);

  const spec = getRobotSpec(robotType);
  const archetype = spec.archetype;

  const isHeavyScrubber =
    robotType === "avidbots_neo_2" || robotType === "gausium_scrubber_75p";
  const isCompactT8 = robotType === "keenon_t8";
  const isServi = robotType === "bear_servi";
  const isTemi = robotType === "temi";
  const isW3 = robotType === "keenon_w3";

  const labelHeight =
    archetype === "warehouse_amr"
      ? 1.15
      : archetype === "floor_scrubber"
        ? isHeavyScrubber
          ? 1.38
          : 1.18
        : archetype === "enclosed_cabinet"
          ? 1.56
          : 1.48;

  useEffect(() => {
    const group = outerGroupRef.current;
    const pose = poseRef.current;
    if (!group) return;
    group.position.set(pose.x, 0, pose.z);
    group.rotation.set(0, pose.rotationY, 0);
  }, [poseRef, robotType]);

  useFrame((_, delta) => {
    onTick(delta);
    const dt = Math.min(Math.max(delta, 0), 0.1);
    elapsedRef.current += dt;
    const t = elapsedRef.current;

    const pose = poseRef.current;
    const group = outerGroupRef.current;
    if (group) {
      group.position.set(pose.x, 0, pose.z);
      group.rotation.set(0, pose.rotationY, 0);
    }

    // Mechanical & status animations per archetype
    if (archetype === "floor_scrubber") {
      if (animPartRefA.current) animPartRefA.current.rotation.y = t * 6.5;
      if (animPartRefB.current) animPartRefB.current.rotation.y = -t * 6.5;
    } else if (archetype === "greeter_screen" || archetype === "tray_waiter") {
      if (animPartRefA.current) {
        const nod =
          pose.animation === "Wave" || pose.animation === "Yes"
            ? Math.sin(t * 7.5) * 0.12
            : Math.sin(t * 1.8) * 0.03;
        animPartRefA.current.rotation.x = -0.22 + nod;
      }
    } else if (archetype === "warehouse_amr") {
      if (animPartRefA.current) {
        animPartRefA.current.rotation.z = Math.sin(t * 2.5) * 0.08;
      }
    }

    if (beaconMatRef.current) {
      beaconMatRef.current.emissiveIntensity =
        pose.animation === "Walking" || pose.animation === "Wave"
          ? 1.4 + Math.sin(t * 6.0) * 0.5
          : 0.75;
    }
  });

  return (
    <group
      ref={outerGroupRef}
      position={[startPosition.x, 0, startPosition.z]}
    >
      {/* =====================================================================
          1. TRAY WAITER BOT (BellaBot Pro, Keenon T8, Keenon T10, Bear Servi)
          ===================================================================== */}
      {archetype === "tray_waiter" && (
        <group scale={[isCompactT8 ? 0.82 : 1, 1, isCompactT8 ? 0.84 : 1]}>
          {/* Wheeled drive base */}
          <mesh position={[0, 0.11, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.25, 0.28, 0.2, 28]} />
            <meshStandardMaterial
              color="#1e293b"
              roughness={0.38}
              metalness={0.35}
            />
          </mesh>
          {/* Glowing bumper LED strip */}
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.282, 0.282, 0.025, 28]} />
            <meshStandardMaterial
              ref={beaconMatRef}
              color={spec.accentHex}
              emissive={spec.accentHex}
              emissiveIntensity={0.9}
            />
          </mesh>

          {/* Vertical structural spine / side pillars */}
          {isServi ? (
            <mesh position={[0, 0.58, -0.1]} castShadow>
              <cylinderGeometry args={[0.06, 0.08, 0.88, 20]} />
              <meshStandardMaterial
                color="#e2e8f0"
                roughness={0.3}
                metalness={0.3}
              />
            </mesh>
          ) : (
            [-0.2, 0.2].map((px) => (
              <mesh key={px} position={[px, 0.62, -0.04]} castShadow>
                <boxGeometry args={[0.045, 0.92, 0.09]} />
                <meshStandardMaterial
                  color="#f1f5f9"
                  roughness={0.32}
                  metalness={0.2}
                />
              </mesh>
            ))
          )}

          {/* Bear Servi lower dirty-dish bussing tub vs standard open trays */}
          {isServi ? (
            <>
              {/* Deep bussing tub */}
              <mesh position={[0, 0.34, 0.03]} castShadow receiveShadow>
                <boxGeometry args={[0.42, 0.16, 0.38]} />
                <meshStandardMaterial color="#334155" roughness={0.5} />
              </mesh>
              {/* 2 upper serving trays */}
              {[0.62, 0.86].map((ty) => (
                <mesh key={ty} position={[0, ty, 0.03]} castShadow receiveShadow>
                  <cylinderGeometry args={[0.21, 0.2, 0.03, 24]} />
                  <meshStandardMaterial color="#f8fafc" roughness={0.35} />
                </mesh>
              ))}
            </>
          ) : (
            (isCompactT8 ? [0.36, 0.62, 0.88] : [0.32, 0.52, 0.72, 0.92]).map(
              (ty, idx) => (
                <group key={ty} position={[0, ty, 0.02]}>
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[0.4, 0.03, 0.36]} />
                    <meshStandardMaterial
                      color="#f8fafc"
                      roughness={0.35}
                      metalness={0.12}
                    />
                  </mesh>
                  {/* Stylized plate/cup load on middle tray */}
                  {idx === 1 && (
                    <mesh position={[0, 0.045, 0.02]} castShadow>
                      <cylinderGeometry args={[0.09, 0.07, 0.05, 16]} />
                      <meshStandardMaterial color="#fde68a" roughness={0.4} />
                    </mesh>
                  )}
                </group>
              ),
            )
          )}

          {/* Expressive front face / touchscreen head */}
          <group ref={animPartRefA} position={[0, 1.13, 0.03]} rotation={[-0.22, 0, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.32, 0.2, 0.08]} />
              <meshStandardMaterial
                color="#0f172a"
                roughness={0.22}
                metalness={0.45}
              />
            </mesh>
            {/* BellaBot cat-ear accents */}
            {robotType === "pudu_bellabot" &&
              [-0.11, 0.11].map((ex) => (
                <mesh key={ex} position={[ex, 0.12, 0]}>
                  <coneGeometry args={[0.04, 0.07, 4]} />
                  <meshStandardMaterial color="#f8fafc" roughness={0.3} />
                </mesh>
              ))}
            {/* Glowing face screen + eyes */}
            <mesh position={[0, 0, 0.042]}>
              <planeGeometry args={[0.27, 0.15]} />
              <meshBasicMaterial color="#020617" />
            </mesh>
            {[-0.065, 0.065].map((ex) => (
              <mesh key={ex} position={[ex, 0.015, 0.045]}>
                <circleGeometry args={[0.026, 16]} />
                <meshBasicMaterial color="#38bdf8" />
              </mesh>
            ))}
            <mesh position={[0, -0.035, 0.045]}>
              <planeGeometry args={[0.08, 0.016]} />
              <meshBasicMaterial color={spec.accentHex} />
            </mesh>
          </group>
        </group>
      )}

      {/* =====================================================================
          2. GREETER / AD-SCREEN BOT (Pudu KettyBot Pro, Temi)
          ===================================================================== */}
      {archetype === "greeter_screen" && (
        <group>
          {/* Compact 55 cm mobile base */}
          <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.22, 0.25, 0.18, 28]} />
            <meshStandardMaterial
              color="#1e293b"
              roughness={0.35}
              metalness={0.35}
            />
          </mesh>
          <mesh position={[0, 0.045, 0]}>
            <cylinderGeometry args={[0.253, 0.253, 0.022, 28]} />
            <meshStandardMaterial
              ref={beaconMatRef}
              color={spec.accentHex}
              emissive={spec.accentHex}
              emissiveIntensity={0.85}
            />
          </mesh>

          {isTemi ? (
            <>
              {/* Temi curved slender pedestal neck */}
              <mesh position={[0, 0.58, -0.04]} rotation={[0.08, 0, 0]} castShadow>
                <boxGeometry args={[0.07, 0.86, 0.07]} />
                <meshStandardMaterial
                  color="#334155"
                  roughness={0.3}
                  metalness={0.5}
                />
              </mesh>
              {/* Rear accessory tray */}
              <mesh position={[0, 0.68, -0.12]} castShadow>
                <boxGeometry args={[0.22, 0.025, 0.16]} />
                <meshStandardMaterial color="#1e293b" roughness={0.4} />
              </mesh>
              {/* Tilt video-call tablet head */}
              <group
                ref={animPartRefA}
                position={[0, 1.06, 0.04]}
                rotation={[-0.24, 0, 0]}
              >
                <mesh castShadow>
                  <boxGeometry args={[0.34, 0.22, 0.035]} />
                  <meshStandardMaterial color="#0f172a" roughness={0.2} />
                </mesh>
                <mesh position={[0, 0, 0.019]}>
                  <planeGeometry args={[0.3, 0.18]} />
                  <meshBasicMaterial color="#ec4899" />
                </mesh>
                <mesh position={[0, 0.02, 0.021]}>
                  <planeGeometry args={[0.22, 0.08]} />
                  <meshBasicMaterial color="#fdf2f8" />
                </mesh>
              </group>
            </>
          ) : (
            <>
              {/* KettyBot Pro sleek white body + large vertical front ad screen */}
              <mesh position={[0, 0.56, -0.02]} castShadow receiveShadow>
                <boxGeometry args={[0.36, 0.78, 0.3]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.3} />
              </mesh>
              {/* Large vertical front advertising display */}
              <mesh position={[0, 0.56, 0.134]}>
                <planeGeometry args={[0.29, 0.64]} />
                <meshBasicMaterial color="#0284c7" />
              </mesh>
              <mesh position={[0, 0.72, 0.136]}>
                <planeGeometry args={[0.23, 0.14]} />
                <meshBasicMaterial color="#fde047" />
              </mesh>
              <mesh position={[0, 0.48, 0.136]}>
                <planeGeometry args={[0.23, 0.22]} />
                <meshBasicMaterial color="#e0f2fe" />
              </mesh>
              {/* Top head touchscreen */}
              <group
                ref={animPartRefA}
                position={[0, 1.07, 0.02]}
                rotation={[-0.22, 0, 0]}
              >
                <mesh castShadow>
                  <boxGeometry args={[0.28, 0.18, 0.07]} />
                  <meshStandardMaterial color="#0f172a" roughness={0.25} />
                </mesh>
                <mesh position={[0, 0, 0.037]}>
                  <planeGeometry args={[0.23, 0.13]} />
                  <meshBasicMaterial color="#38bdf8" />
                </mesh>
              </group>
            </>
          )}
        </group>
      )}

      {/* =====================================================================
          3. ENCLOSED HOTEL / OFFICE BOT (Pudu FlashBot, Keenon W3 ButlerBot)
          ===================================================================== */}
      {archetype === "enclosed_cabinet" && (
        <group>
          {/* Undercarriage chassis */}
          <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.27, 0.29, 0.18, 28]} />
            <meshStandardMaterial
              color="#1e293b"
              roughness={0.38}
              metalness={0.35}
            />
          </mesh>
          {/* Enclosed hygienic cabinet body */}
          <mesh position={[0, 0.68, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.46, 1.02, 0.44]} />
            <meshStandardMaterial
              color="#f8fafc"
              roughness={0.28}
              metalness={0.15}
            />
          </mesh>

          {/* Compartment doors on front face (+Z) */}
          {isW3 ? (
            // 4 enclosed ButlerBot compartments (2x2 grid)
            [
              [-0.1, 0.86],
              [0.1, 0.86],
              [-0.1, 0.48],
              [0.1, 0.48],
            ].map(([dx, dy], idx) => (
              <group key={idx} position={[dx, dy, 0.223]}>
                <mesh>
                  <planeGeometry args={[0.18, 0.32]} />
                  <meshStandardMaterial
                    color="#e2e8f0"
                    roughness={0.35}
                    metalness={0.25}
                  />
                </mesh>
                <mesh position={[0.06, 0, 0.003]}>
                  <planeGeometry args={[0.015, 0.14]} />
                  <meshBasicMaterial color="#a855f7" />
                </mesh>
              </group>
            ))
          ) : (
            // 2 stacked FlashBot motorized cabin doors
            [0.86, 0.48].map((dy, idx) => (
              <group key={idx} position={[0, dy, 0.223]}>
                <mesh>
                  <planeGeometry args={[0.36, 0.32]} />
                  <meshStandardMaterial
                    color="#e2e8f0"
                    roughness={0.35}
                    metalness={0.25}
                  />
                </mesh>
                <mesh position={[0, 0.13, 0.003]}>
                  <planeGeometry args={[0.26, 0.018]} />
                  <meshBasicMaterial color="#8b5cf6" />
                </mesh>
              </group>
            ))
          )}

          {/* Top LiDAR dome + angled touchscreen header */}
          <mesh position={[0, 1.23, -0.06]} castShadow>
            <cylinderGeometry args={[0.08, 0.095, 0.08, 20]} />
            <meshStandardMaterial
              color="#0f172a"
              metalness={0.6}
              roughness={0.25}
            />
          </mesh>
          <mesh position={[0, 1.22, 0.12]} rotation={[-0.45, 0, 0]} castShadow>
            <boxGeometry args={[0.28, 0.14, 0.04]} />
            <meshStandardMaterial color="#0f172a" roughness={0.2} />
          </mesh>
          <mesh position={[0, 1.225, 0.142]} rotation={[-0.45, 0, 0]}>
            <planeGeometry args={[0.23, 0.1]} />
            <meshBasicMaterial color={spec.accentHex} />
          </mesh>
          {/* Side LED elevator status strips */}
          {[-0.233, 0.233].map((sx) => (
            <mesh
              key={sx}
              position={[sx, 0.68, 0.16]}
              rotation={[0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
            >
              <planeGeometry args={[0.025, 0.78]} />
              <meshStandardMaterial
                ref={sx > 0 ? beaconMatRef : undefined}
                color={spec.accentHex}
                emissive={spec.accentHex}
                emissiveIntensity={0.9}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* =====================================================================
          4. FLOOR SCRUBBER / VAC (LionsBot R3 Vac, CC1, CC1 Pro, Neo 2, 75P)
          ===================================================================== */}
      {archetype === "floor_scrubber" && (
        <group scale={isHeavyScrubber ? [1.22, 1.15, 1.25] : [1, 1, 1]}>
          {/* Front scrub deck housing */}
          <mesh position={[0, 0.08, 0.22]} castShadow receiveShadow>
            <boxGeometry args={[0.52, 0.12, 0.28]} />
            <meshStandardMaterial
              color="#1e293b"
              roughness={0.45}
              metalness={0.35}
            />
          </mesh>
          {/* Twin counter-rotating floor scrub brushes */}
          <mesh ref={animPartRefA} position={[-0.14, 0.02, 0.22]}>
            <cylinderGeometry args={[0.13, 0.13, 0.03, 20]} />
            <meshStandardMaterial color="#2dd4bf" roughness={0.75} />
          </mesh>
          <mesh ref={animPartRefB} position={[0.14, 0.02, 0.22]}>
            <cylinderGeometry args={[0.13, 0.13, 0.03, 20]} />
            <meshStandardMaterial color="#2dd4bf" roughness={0.75} />
          </mesh>

          {/* Main solution/recovery tank body */}
          <mesh position={[0, 0.36, -0.02]} castShadow receiveShadow>
            <boxGeometry
              args={[
                isHeavyScrubber ? 0.56 : 0.44,
                isHeavyScrubber ? 0.54 : 0.44,
                isHeavyScrubber ? 0.66 : 0.52,
              ]}
            />
            <meshStandardMaterial
              color={isHeavyScrubber ? "#1d4ed8" : "#0f766e"}
              roughness={0.35}
              metalness={0.2}
            />
          </mesh>
          {/* White/light upper cowling */}
          <mesh position={[0, 0.62, -0.05]} castShadow>
            <boxGeometry
              args={[
                isHeavyScrubber ? 0.5 : 0.4,
                0.18,
                isHeavyScrubber ? 0.52 : 0.4,
              ]}
            />
            <meshStandardMaterial color="#f8fafc" roughness={0.3} />
          </mesh>

          {/* Rear curved squeegee bar */}
          <mesh position={[0, 0.035, -0.34]} castShadow>
            <boxGeometry args={[0.58, 0.05, 0.06]} />
            <meshStandardMaterial color="#334155" roughness={0.6} />
          </mesh>

          {/* Top safety beacon / AI camera bar */}
          <mesh position={[0, 0.78, -0.06]}>
            <cylinderGeometry args={[0.045, 0.055, 0.09, 16]} />
            <meshStandardMaterial
              ref={beaconMatRef}
              color={isHeavyScrubber ? "#f59e0b" : spec.accentHex}
              emissive={isHeavyScrubber ? "#f59e0b" : spec.accentHex}
              emissiveIntensity={1.1}
            />
          </mesh>

          {/* Subtle clean-lane water sheen behind scrubber */}
          <mesh position={[0, 0.005, -0.52]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.52, 0.42]} />
            <meshBasicMaterial
              color="#38bdf8"
              transparent
              opacity={0.18}
            />
          </mesh>
        </group>
      )}

      {/* =====================================================================
          5. WAREHOUSE / FACTORY AMR (Pudu T300, MiR250)
          ===================================================================== */}
      {archetype === "warehouse_amr" && (
        <group>
          {/* Low-profile industrial AMR deck (80 x 58 x 30 cm scaled) */}
          <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.62, 0.24, 0.84]} />
            <meshStandardMaterial
              color={robotType === "mir250" ? "#f8fafc" : "#1e293b"}
              roughness={0.35}
              metalness={0.4}
            />
          </mesh>
          {/* Perimeter industrial bumper + LiDAR safety slit */}
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[0.64, 0.05, 0.86]} />
            <meshStandardMaterial
              ref={beaconMatRef}
              color={spec.accentHex}
              emissive={spec.accentHex}
              emissiveIntensity={0.85}
            />
          </mesh>
          {/* 4 Industrial drive wheels */}
          {[
            [-0.31, 0.09, 0.26],
            [0.31, 0.09, 0.26],
            [-0.31, 0.09, -0.26],
            [0.31, 0.09, -0.26],
          ].map(([wx, wy, wz], idx) => (
            <mesh
              key={idx}
              position={[wx, wy, wz]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
            >
              <cylinderGeometry args={[0.09, 0.09, 0.05, 16]} />
              <meshStandardMaterial color="#0f172a" roughness={0.85} />
            </mesh>
          ))}

          {/* Wooden Euro-pallet on top lift module */}
          <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.58, 0.06, 0.78]} />
            <meshStandardMaterial color="#b45309" roughness={0.75} />
          </mesh>
          {/* Loaded industrial logistics crates / totes */}
          <mesh position={[0, 0.5, -0.14]} castShadow receiveShadow>
            <boxGeometry args={[0.48, 0.34, 0.36]} />
            <meshStandardMaterial color="#d97706" roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.45, 0.2]} castShadow receiveShadow>
            <boxGeometry args={[0.44, 0.24, 0.28]} />
            <meshStandardMaterial color="#0284c7" roughness={0.5} />
          </mesh>

          {/* Front LiDAR safety scan arc on floor */}
          <group
            ref={animPartRefA}
            position={[0, 0.015, 0.45]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <mesh>
              <ringGeometry args={[0.12, 0.36, 24, 1, -Math.PI * 0.35, Math.PI * 0.7]} />
              <meshBasicMaterial
                color="#10b981"
                transparent
                opacity={0.28}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        </group>
      )}

      {/* Ground direction ring + forward nose marker */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.36, 32]} />
        <meshBasicMaterial color={spec.accentHex} transparent opacity={0.82} />
      </mesh>
      <mesh position={[0, 0.014, 0.38]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.055, 16]} />
        <meshBasicMaterial color={spec.accentHex} />
      </mesh>

      {/* Directional target beam when executing `point_to` */}
      {isPointing && (
        <group position={[0, 0.65, 0.58]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.62, 12]} />
            <meshBasicMaterial color="#facc15" transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.36]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.055, 0.14, 16]} />
            <meshBasicMaterial color="#fde047" />
          </mesh>
        </group>
      )}

      {/* Floating commercial robot identifier badge */}
      <LabelSprite
        title={spec.shortName}
        subtitle={`€${spec.clientRaaSEur}/mo RaaS`}
        position={[0, labelHeight, 0]}
        accentColor={spec.accentHex}
        bgColor="rgba(15, 23, 42, 0.94)"
        scale={[1.7, 0.58, 1]}
      />
    </group>
  );
}
