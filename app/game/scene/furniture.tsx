"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { CellItem, FurnitureType } from "../types";
import { gridToWorld, isKitchenZone } from "./coords";
import type { TableFood } from "./tableFood";

function tableCap(type: string): number {
  if (type === "table1") return 1;
  if (type === "table2") return 2;
  if (type === "table4") return 4;
  if (type === "table6") return 6;
  return 0;
}

function makeCheckeredCloth() {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  const a = "#f7f4ef";
  const b = "#d94a4a";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? a : b;
      ctx.fillRect(x * 4, y * 4, 4, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function Chair({ x, z, rot = 0 }: { x: number; z: number; rot?: number }) {
  const wood = "#8b4a2e";
  const seat = "#a35a38";
  const back = "#6e3220";
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      {/* seat + thin cushion (木色，避免俯视成红方块) */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.36, 0.06, 0.34]} />
        <meshStandardMaterial color={seat} roughness={0.8} flatShading />
      </mesh>
      <mesh position={[0, 0.35, 0.01]} castShadow>
        <boxGeometry args={[0.3, 0.04, 0.28]} />
        <meshStandardMaterial color="#c4a078" roughness={0.9} flatShading />
      </mesh>
      {/* tall backrest — 俯视/斜视都能认出是椅子 */}
      <mesh position={[0, 0.58, -0.14]} castShadow>
        <boxGeometry args={[0.34, 0.48, 0.05]} />
        <meshStandardMaterial color={back} roughness={0.75} flatShading />
      </mesh>
      <mesh position={[0, 0.84, -0.14]} castShadow>
        <boxGeometry args={[0.38, 0.07, 0.07]} />
        <meshStandardMaterial color={wood} roughness={0.75} flatShading />
      </mesh>
      {[-0.1, 0, 0.1].map((ox, i) => (
        <mesh key={i} position={[ox, 0.58, -0.12]} castShadow>
          <boxGeometry args={[0.04, 0.38, 0.035]} />
          <meshStandardMaterial color="#5a2818" roughness={0.8} flatShading />
        </mesh>
      ))}
      {(
        [
          [-0.13, 0.15, -0.12],
          [0.13, 0.15, -0.12],
          [-0.13, 0.15, 0.12],
          [0.13, 0.15, 0.12],
        ] as [number, number, number][]
      ).map((p, i) => (
        <mesh key={i} position={p} castShadow>
          <boxGeometry args={[0.05, 0.3, 0.05]} />
          <meshStandardMaterial color="#5c3a22" roughness={0.85} flatShading />
        </mesh>
      ))}
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.26, 0.035, 0.035]} />
        <meshStandardMaterial color="#5c3a22" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.035, 0.035, 0.24]} />
        <meshStandardMaterial color="#5c3a22" roughness={0.85} flatShading />
      </mesh>
    </group>
  );
}

function TableCloth({ w, d }: { w: number; d: number }) {
  const map = useMemo(() => {
    const tex = makeCheckeredCloth();
    tex.repeat.set(Math.max(2, Math.round(w * 4)), Math.max(2, Math.round(d * 4)));
    return tex;
  }, [w, d]);

  const overhang = 0.08;
  const drop = 0.2;
  const topW = w + overhang * 2;
  const topD = d + overhang * 2;

  return (
    <group position={[0, 0.44, 0]}>
      {/* cloth top */}
      <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[topW, 0.03, topD]} />
        <meshStandardMaterial map={map} roughness={0.85} flatShading />
      </mesh>
      {/* draped sides */}
      <mesh position={[0, -drop / 2, topD / 2 - 0.01]} castShadow>
        <boxGeometry args={[topW, drop, 0.02]} />
        <meshStandardMaterial map={map} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, -drop / 2, -topD / 2 + 0.01]} castShadow>
        <boxGeometry args={[topW, drop, 0.02]} />
        <meshStandardMaterial map={map} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[topW / 2 - 0.01, -drop / 2, 0]} castShadow>
        <boxGeometry args={[0.02, drop, topD]} />
        <meshStandardMaterial map={map} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-topW / 2 + 0.01, -drop / 2, 0]} castShadow>
        <boxGeometry args={[0.02, drop, topD]} />
        <meshStandardMaterial map={map} roughness={0.85} flatShading />
      </mesh>
    </group>
  );
}

function TableSet({
  seats,
  food,
}: {
  seats: number;
  food: TableFood;
}) {
  const size =
    seats <= 1 ? [0.55, 0.08, 0.55] : seats === 2 ? [0.7, 0.08, 0.55] : seats === 4 ? [0.85, 0.08, 0.85] : [1.15, 0.08, 0.75];
  const chairs =
    seats === 1
      ? [{ x: 0, z: 0.42, rot: 0 }]
      : seats === 2
        ? [
            { x: 0, z: -0.45, rot: Math.PI },
            { x: 0, z: 0.45, rot: 0 },
          ]
        : seats === 4
          ? [
              { x: 0, z: -0.55, rot: Math.PI },
              { x: 0, z: 0.55, rot: 0 },
              { x: -0.55, z: 0, rot: Math.PI / 2 },
              { x: 0.55, z: 0, rot: -Math.PI / 2 },
            ]
          : [
              { x: -0.35, z: -0.5, rot: Math.PI },
              { x: 0.35, z: -0.5, rot: Math.PI },
              { x: -0.35, z: 0.5, rot: 0 },
              { x: 0.35, z: 0.5, rot: 0 },
              { x: -0.7, z: 0, rot: Math.PI / 2 },
              { x: 0.7, z: 0, rot: -Math.PI / 2 },
            ];

  return (
    <group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[size[0] + 0.2, size[2] + 0.2]} />
        <meshStandardMaterial color="#2a1c12" transparent opacity={0.28} />
      </mesh>
      {/* pedestal / legs */}
      {(
        [
          [-size[0] / 2 + 0.08, 0.2, -size[2] / 2 + 0.08],
          [size[0] / 2 - 0.08, 0.2, -size[2] / 2 + 0.08],
          [-size[0] / 2 + 0.08, 0.2, size[2] / 2 - 0.08],
          [size[0] / 2 - 0.08, 0.2, size[2] / 2 - 0.08],
        ] as [number, number, number][]
      ).map((p, i) => (
        <mesh key={i} position={p} castShadow>
          <boxGeometry args={[0.07, 0.4, 0.07]} />
          <meshStandardMaterial color="#6b4428" roughness={0.9} flatShading />
        </mesh>
      ))}
      {/* apron rail */}
      <mesh position={[0, 0.36, 0]} castShadow>
        <boxGeometry args={[size[0] * 0.92, 0.06, size[2] * 0.92]} />
        <meshStandardMaterial color="#7a5230" roughness={0.85} flatShading />
      </mesh>
      {/* wooden top under cloth */}
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={size as [number, number, number]} />
        <meshStandardMaterial color="#c4a070" roughness={0.7} flatShading />
      </mesh>
      <TableCloth w={size[0]} d={size[2]} />
      {food !== "none" && (
        <group position={[0, 0.52, 0]}>
          {food === "menu" && (
            <mesh rotation={[-0.55, 0.35, 0]} castShadow>
              <boxGeometry args={[0.18, 0.02, 0.14]} />
              <meshStandardMaterial color="#f0e4c0" flatShading />
            </mesh>
          )}
          {(food === "waiting" || food === "plated" || food === "eating") && (
            <mesh castShadow>
              <boxGeometry args={[0.18, 0.03, 0.18]} />
              <meshStandardMaterial color={food === "waiting" ? "#cfc8b8" : "#eee8dc"} metalness={0.15} roughness={0.45} flatShading />
            </mesh>
          )}
          {(food === "plated" || food === "eating") && (
            <mesh position={[0, 0.04, 0]} castShadow>
              <boxGeometry args={[0.1, 0.05, 0.1]} />
              <meshStandardMaterial color={food === "eating" ? "#c45a2a" : "#e8a040"} flatShading />
            </mesh>
          )}
        </group>
      )}
      {chairs.map((c, i) => (
        <Chair key={i} x={c.x} z={c.z} rot={c.rot} />
      ))}
    </group>
  );
}

function KitchenCounter() {
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.85, 0.9, 0.55]} />
        <meshStandardMaterial color="#9aa3ab" metalness={0.35} roughness={0.4} flatShading />
      </mesh>
      <mesh position={[0, 0.92, 0]} castShadow>
        <boxGeometry args={[0.82, 0.06, 0.52]} />
        <meshStandardMaterial color="#6a90b8" metalness={0.25} roughness={0.45} flatShading />
      </mesh>
      {/* stove burners */}
      <mesh position={[-0.22, 0.96, 0.05]} castShadow>
        <boxGeometry args={[0.22, 0.04, 0.22]} />
        <meshStandardMaterial color="#3a4048" flatShading />
      </mesh>
      <mesh position={[-0.22, 0.99, 0.05]}>
        <boxGeometry args={[0.14, 0.02, 0.14]} />
        <meshStandardMaterial color="#2a2e34" emissive="#c34f3a" emissiveIntensity={0.2} flatShading />
      </mesh>
      <mesh position={[0.22, 1.05, 0]} castShadow>
        <boxGeometry args={[0.2, 0.22, 0.2]} />
        <meshStandardMaterial color="#d8dde2" metalness={0.35} roughness={0.4} flatShading />
      </mesh>
      <mesh position={[0.22, 1.2, 0]}>
        <boxGeometry args={[0.04, 0.12, 0.04]} />
        <meshStandardMaterial color="#888" metalness={0.5} flatShading />
      </mesh>
      {/* drawers */}
      {[-0.22, 0.22].map((ox, i) => (
        <mesh key={i} position={[ox, 0.35, 0.28]}>
          <boxGeometry args={[0.28, 0.18, 0.02]} />
          <meshStandardMaterial color="#7a848c" flatShading />
        </mesh>
      ))}
    </group>
  );
}

function CashierDesk() {
  return (
    <group>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.8, 0.45]} />
        <meshStandardMaterial color="#7a5230" roughness={0.75} flatShading />
      </mesh>
      <mesh position={[0, 0.82, 0]} castShadow>
        <boxGeometry args={[0.72, 0.05, 0.48]} />
        <meshStandardMaterial color="#8b5e34" roughness={0.7} flatShading />
      </mesh>
      <mesh position={[0.12, 0.95, 0]} castShadow>
        <boxGeometry args={[0.28, 0.22, 0.22]} />
        <meshStandardMaterial color="#2a2e32" roughness={0.5} metalness={0.2} flatShading />
      </mesh>
      <mesh position={[0.12, 1.02, 0.12]}>
        <boxGeometry args={[0.16, 0.1, 0.02]} />
        <meshStandardMaterial color="#4a90c8" emissive="#2a6090" emissiveIntensity={0.25} flatShading />
      </mesh>
      <mesh position={[-0.18, 0.9, 0.05]} castShadow>
        <boxGeometry args={[0.12, 0.1, 0.12]} />
        <meshStandardMaterial color="#3d7a4a" flatShading />
      </mesh>
    </group>
  );
}

function ToiletBooth() {
  return (
    <group>
      <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 1.7, 0.7]} />
        <meshStandardMaterial color="#d8d2c4" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 0.75, 0.36]} castShadow>
        <boxGeometry args={[0.45, 1.3, 0.04]} />
        <meshStandardMaterial color="#c4b89e" roughness={0.8} flatShading />
      </mesh>
      <mesh position={[0.14, 0.75, 0.39]}>
        <boxGeometry args={[0.06, 0.08, 0.04]} />
        <meshStandardMaterial color="#8a7a5a" flatShading />
      </mesh>
      <mesh position={[0, 1.5, 0.37]}>
        <boxGeometry args={[0.2, 0.12, 0.02]} />
        <meshStandardMaterial color="#3a5a8c" flatShading />
      </mesh>
    </group>
  );
}

function PlantPot() {
  return (
    <group>
      <mesh position={[0, 0.16, 0]} castShadow>
        <boxGeometry args={[0.26, 0.28, 0.26]} />
        <meshStandardMaterial color="#8b4a2a" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[0.22, 0.06, 0.22]} />
        <meshStandardMaterial color="#5a3020" flatShading />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.28, 0.28, 0.28]} />
        <meshStandardMaterial color="#3d7a48" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.1, 0.58, 0.08]} castShadow>
        <boxGeometry args={[0.14, 0.14, 0.14]} />
        <meshStandardMaterial color="#4a8f55" flatShading />
      </mesh>
      <mesh position={[-0.08, 0.56, -0.06]} castShadow>
        <boxGeometry args={[0.12, 0.16, 0.12]} />
        <meshStandardMaterial color="#2f6a3a" flatShading />
      </mesh>
    </group>
  );
}

function FurnitureMesh({ type, food }: { type: FurnitureType; food: TableFood }) {
  const seats = tableCap(type);
  if (seats > 0) return <TableSet seats={seats} food={food} />;
  if (type === "kitchen") return <KitchenCounter />;
  if (type === "cashier") return <CashierDesk />;
  if (type === "toilet") return <ToiletBooth />;
  return <PlantPot />;
}

export function FurnitureLayer({
  items,
  foodById,
}: {
  items: CellItem[];
  foodById: Map<number, TableFood>;
}) {
  return (
    <group>
      {items.map((item) => {
        const p = gridToWorld(item.x, item.y);
        return (
          <group key={item.id} position={[p.x, 0, p.z]}>
            <FurnitureMesh type={item.type} food={foodById.get(item.id) ?? "none"} />
          </group>
        );
      })}
    </group>
  );
}

/** 纯装饰，不进存档 */
export function DecorProps() {
  const props = useMemo(
    () => [
      { x: 3.5, z: 5.5, kind: "crate" as const },
      { x: 8.5, z: 0.5, kind: "plant" as const },
      { x: 11, z: 1, kind: "plant" as const },
      { x: 6, z: 6.5, kind: "cart" as const },
      { x: 0.5, z: 3.5, kind: "rack" as const },
      { x: 9.5, z: 4.5, kind: "plant" as const },
    ],
    [],
  );

  return (
    <group>
      {/* rugs */}
      <mesh position={[gridToWorld(10, 7).x, 0.01, gridToWorld(10, 7).z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.6, 1.1]} />
        <meshStandardMaterial color="#8b3a3a" roughness={0.95} />
      </mesh>
      <mesh position={[gridToWorld(6, 3).x, 0.012, gridToWorld(6, 3).z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3.2, 2.4]} />
        <meshStandardMaterial color="#c4a574" roughness={0.95} transparent opacity={0.55} />
      </mesh>
      {props.map((p, i) => {
        const w = gridToWorld(p.x, p.z);
        if (p.kind === "plant") {
          return (
            <group key={i} position={[w.x, 0, w.z]}>
              <PlantPot />
            </group>
          );
        }
        if (p.kind === "crate") {
          return (
            <group key={i} position={[w.x, 0, w.z]}>
              <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.45, 0.4, 0.4]} />
                <meshStandardMaterial color="#6b4a28" roughness={0.9} flatShading />
              </mesh>
              <mesh position={[0, 0.42, 0]}>
                <boxGeometry args={[0.4, 0.04, 0.35]} />
                <meshStandardMaterial color="#8a6038" flatShading />
              </mesh>
            </group>
          );
        }
        if (p.kind === "cart") {
          return (
            <group key={i} position={[w.x, 0, w.z]}>
              <mesh position={[0, 0.35, 0]} castShadow>
                <boxGeometry args={[0.55, 0.5, 0.4]} />
                <meshStandardMaterial color="#c8c2b4" metalness={0.25} roughness={0.45} flatShading />
              </mesh>
              <mesh position={[-0.2, 0.08, 0.15]}>
                <boxGeometry args={[0.1, 0.1, 0.06]} />
                <meshStandardMaterial color="#333" flatShading />
              </mesh>
              <mesh position={[0.2, 0.08, 0.15]}>
                <boxGeometry args={[0.1, 0.1, 0.06]} />
                <meshStandardMaterial color="#333" flatShading />
              </mesh>
            </group>
          );
        }
        return (
          <group key={i} position={[w.x, 0, w.z]}>
            <mesh position={[0, 0.9, 0]} castShadow>
              <boxGeometry args={[0.5, 1.6, 0.2]} />
              <meshStandardMaterial color="#8a9098" metalness={0.35} roughness={0.45} flatShading />
            </mesh>
            {[0.5, 0.95, 1.4].map((yy, j) => (
              <mesh key={j} position={[0, yy, 0.05]}>
                <boxGeometry args={[0.4, 0.05, 0.14]} />
                <meshStandardMaterial color="#d0d4d8" flatShading />
              </mesh>
            ))}
          </group>
        );
      })}
      {/* hanging lamps */}
      {[
        [2, 3],
        [5, 2],
        [8, 3],
        [5, 5],
      ].map(([gx, gy], i) => {
        const p = gridToWorld(gx, gy);
        return (
          <group key={`lamp-${i}`} position={[p.x, 2.1, p.z]}>
            <mesh>
              <boxGeometry args={[0.04, 0.35, 0.04]} />
              <meshStandardMaterial color="#555" flatShading />
            </mesh>
            <mesh position={[0, -0.25, 0]} castShadow>
              <boxGeometry args={[0.22, 0.14, 0.22]} />
              <meshStandardMaterial color="#f0d090" emissive="#c9a040" emissiveIntensity={0.35} flatShading />
            </mesh>
            <pointLight position={[0, -0.35, 0]} intensity={0.35} distance={4} color="#ffe2a8" />
          </group>
        );
      })}
      {/* wall posters / menu boards */}
      <mesh position={[gridToWorld(4, 0).x, 1.4, gridToWorld(4, 0).z - 0.42]} castShadow>
        <boxGeometry args={[0.55, 0.4, 0.04]} />
        <meshStandardMaterial color="#f4e8c8" flatShading />
      </mesh>
      <mesh position={[gridToWorld(8, 0).x, 1.4, gridToWorld(8, 0).z - 0.42]} castShadow>
        <boxGeometry args={[0.55, 0.4, 0.04]} />
        <meshStandardMaterial color="#e8f0e4" flatShading />
      </mesh>
      {isKitchenZone(1, 0) && (
        <mesh position={[gridToWorld(1.5, 0).x, 1.55, gridToWorld(1.5, 0).z - 0.35]}>
          <boxGeometry args={[1.8, 0.08, 0.25]} />
          <meshStandardMaterial color="#b8c0c8" metalness={0.3} flatShading />
        </mesh>
      )}
    </group>
  );
}
