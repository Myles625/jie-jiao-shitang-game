"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { H, W, type EntranceStyle, type ExpansionLevel, type FloorStyle, type WallStyle } from "../types";
import { entranceCell, isUnlockedCell, shopBounds } from "../pathfinding";
import { CELL, gridToWorld, isKitchenZone, ROOM } from "./coords";
import { KanbanPlane, ShopSignPlane, SpriteLabel } from "./labels";

function nearestTex(draw: (ctx: CanvasRenderingContext2D, s: number) => void, size = 64) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeWoodTexture() {
  const tex = nearestTex((ctx, s) => {
    ctx.fillStyle = "#8a5a32";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? "#7a4e2a" : "#965f38";
      ctx.fillRect(i * (s / 8), 0, s / 8 - 1, s);
      ctx.fillStyle = "rgba(40,20,8,0.35)";
      ctx.fillRect(i * (s / 8) + s / 16, 0, 1, s);
    }
    // end grain dots
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = "rgba(60,30,10,0.2)";
      ctx.fillRect((i * 17) % s, (i * 29) % s, 2, 2);
    }
  }, 64);
  tex.repeat.set(W / 2, H / 2);
  return tex;
}

function makeTileTexture() {
  const tex = nearestTex((ctx, s) => {
    ctx.fillStyle = "#e8ece8";
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "#b8c0bc";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.fillStyle = "#f2f4f2";
    ctx.fillRect(4, 4, s / 2 - 4, s / 2 - 4);
    ctx.fillStyle = "#dce4e0";
    ctx.fillRect(s / 2 + 2, s / 2 + 2, s / 2 - 6, s / 2 - 6);
  }, 32);
  tex.repeat.set(4, 3);
  return tex;
}

function makeBrickTexture(base: string, mortar = "#d8d0c4") {
  return nearestTex((ctx, s) => {
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, s, s);
    const rows = 8;
    const cols = 4;
    const bh = s / rows;
    const bw = s / cols;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let c = -1; c <= cols; c++) {
        const shade = (r + c) % 3 === 0 ? 0.92 : (r + c) % 3 === 1 ? 1 : 0.85;
        ctx.fillStyle = shadeColor(base, shade);
        ctx.fillRect(c * bw + off + 1, r * bh + 1, bw - 2, bh - 2);
      }
    }
  }, 64);
}

function makeStuccoTexture(base: string) {
  return nearestTex((ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
      ctx.fillRect((i * 13) % s, (i * 29) % s, 2 + (i % 3), 2);
    }
    // panel lines
    ctx.strokeStyle = "rgba(60,40,20,0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s / 2, s);
    ctx.stroke();
  }, 64);
}

function shadeColor(hex: string, mul: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * mul));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * mul));
  const b = Math.min(255, Math.round((n & 255) * mul));
  return `rgb(${r},${g},${b})`;
}

function FloorTiles({
  buildable,
  onCellClick,
  floorStyle,
  expansionLevel,
}: {
  buildable: boolean;
  onCellClick: (x: number, y: number) => void;
  floorStyle: FloorStyle;
  expansionLevel: ExpansionLevel;
}) {
  const wood = useMemo(() => makeWoodTexture(), []);
  const tile = useMemo(() => makeTileTexture(), []);
  const carpet = useMemo(
    () =>
      nearestTex((ctx, s) => {
        ctx.fillStyle = "#6a3a48";
        ctx.fillRect(0, 0, s, s);
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            if ((x + y) % 2 === 0) {
              ctx.fillStyle = "#7a4a58";
              ctx.fillRect(x * 8, y * 8, 8, 8);
            }
          }
        }
      }, 64),
    [],
  );
  carpet.repeat.set(W / 2, H / 2);

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          const gx = Math.round(e.point.x / CELL + (W - 1) / 2);
          const gy = Math.round(e.point.z / CELL + (H - 1) / 2);
          if (gx >= 0 && gx < W && gy >= 0 && gy < H) onCellClick(gx, gy);
        }}
        onPointerMove={(e) => {
          if (buildable) e.stopPropagation();
        }}
      >
        <planeGeometry args={[ROOM.w, ROOM.d]} />
        {floorStyle === "carpet" ? (
          <meshStandardMaterial map={carpet} roughness={0.95} />
        ) : floorStyle === "tile" ? (
          <meshStandardMaterial map={tile} roughness={0.85} />
        ) : (
          <meshStandardMaterial map={wood} roughness={0.9} />
        )}
      </mesh>
      {/* 尚未承租的外圈会在扩建后逐层开放 */}
      {Array.from({ length: W * H }, (_, n) => {
        const x = n % W;
        const y = Math.floor(n / W);
        if (isUnlockedCell(x, y, expansionLevel)) return null;
        const p = gridToWorld(x, y);
        return (
          <mesh key={`locked-${n}`} rotation={[-Math.PI / 2, 0, 0]} position={[p.x, 0.012, p.z]}>
            <planeGeometry args={[0.96, 0.96]} />
            <meshStandardMaterial color={(x + y) % 2 ? "#5f6a6e" : "#738086"} roughness={0.98} />
          </mesh>
        );
      })}
      {/* baseboard ring hint */}
      <mesh position={[0, 0.04, -ROOM.d / 2 + 0.14]}>
        <boxGeometry args={[ROOM.w - 0.2, 0.08, 0.06]} />
        <meshStandardMaterial color="#6a4a30" roughness={0.85} flatShading />
      </mesh>
      {buildable &&
        Array.from({ length: W * H }, (_, n) => {
          const x = n % W;
          const y = Math.floor(n / W);
          const p = gridToWorld(x, y);
          const unlocked = isUnlockedCell(x, y, expansionLevel);
          const kit = unlocked && isKitchenZone(x, y);
          return (
            <mesh
              key={n}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[p.x, 0.02, p.z]}
              onClick={(e) => {
                e.stopPropagation();
                onCellClick(x, y);
              }}
            >
              <planeGeometry args={[0.92, 0.92]} />
              <meshStandardMaterial
                color={!unlocked ? "#c35a45" : kit ? "#a8c8d8" : "#d4c48a"}
                transparent
                opacity={unlocked ? 0.22 : 0.42}
                depthWrite={false}
              />
            </mesh>
          );
        })}
    </group>
  );
}

function PartitionWall({
  position,
  size,
  color = "#d9c8a5",
}: {
  position: [number, number, number];
  size: [number, number, number];
  color?: string;
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.84} flatShading />
      </mesh>
      <mesh position={[0, size[1] / 2 + 0.035, 0]}>
        <boxGeometry args={[size[0] + 0.05, 0.07, size[2] + 0.05]} />
        <meshStandardMaterial color="#6b4930" roughness={0.78} />
      </mesh>
    </group>
  );
}

/** 后场料理间与右后角化粧室是固定建筑分区，家具只决定其中的可用工位。 */
function ServiceRooms({ expansionLevel }: { expansionLevel: ExpansionLevel }) {
  const kitchenCenter = gridToWorld(3.5, 3);
  const toiletCenter = gridToWorld(12, 3);
  const bounds = shopBounds(expansionLevel);
  const rightX = gridToWorld(bounds.maxX + 0.48, bounds.minY).x;
  const frontZ = gridToWorld(bounds.minX, bounds.maxY + 0.48).z;

  return (
    <group>
      {/* 料理间防滑砖地 */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[kitchenCenter.x, 0.018, kitchenCenter.z]}
        receiveShadow
      >
        <planeGeometry args={[4.05, 3.05]} />
        <meshStandardMaterial color="#b9c6c7" roughness={0.72} />
      </mesh>
      <PartitionWall
        position={[gridToWorld(3.5, 1.52).x, 0.62, gridToWorld(3.5, 1.52).z]}
        size={[4.1, 1.24, 0.12]}
      />
      <PartitionWall
        position={[gridToWorld(1.52, 3).x, 0.62, gridToWorld(1.52, 3).z]}
        size={[0.12, 1.24, 3.05]}
      />
      <PartitionWall
        position={[gridToWorld(5.48, 2.75).x, 0.62, gridToWorld(5.48, 2.75).z]}
        size={[0.12, 1.24, 1.55]}
      />
      {/* 冰箱、洗涤池、吊架和抽油烟罩，让料理台读成厨房而非一张小桌 */}
      <group position={[gridToWorld(2.15, 2.35).x, 0, gridToWorld(2.15, 2.35).z]}>
        <mesh position={[0, 0.72, 0]} castShadow>
          <boxGeometry args={[0.68, 1.44, 0.68]} />
          <meshStandardMaterial color="#d9e1df" metalness={0.28} roughness={0.45} />
        </mesh>
        <mesh position={[0.25, 0.72, 0.35]}>
          <boxGeometry args={[0.035, 0.35, 0.04]} />
          <meshStandardMaterial color="#4b5557" metalness={0.8} />
        </mesh>
      </group>
      <group position={[gridToWorld(2.25, 4.05).x, 0, gridToWorld(2.25, 4.05).z]}>
        <mesh position={[0, 0.38, 0]} castShadow>
          <boxGeometry args={[0.72, 0.76, 0.58]} />
          <meshStandardMaterial color="#7d898a" metalness={0.45} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.78, 0]}>
          <boxGeometry args={[0.62, 0.07, 0.48]} />
          <meshStandardMaterial color="#b9c4c4" metalness={0.55} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.83, 0]}>
          <torusGeometry args={[0.14, 0.025, 8, 18, Math.PI]} />
          <meshStandardMaterial color="#384447" metalness={0.7} />
        </mesh>
      </group>
      <mesh position={[gridToWorld(4, 2.25).x, 1.48, gridToWorld(4, 2.25).z]} castShadow>
        <boxGeometry args={[2.2, 0.3, 0.72]} />
        <meshStandardMaterial color="#6f7b7c" metalness={0.58} roughness={0.32} />
      </mesh>
      <mesh position={[gridToWorld(4, 2.25).x, 1.18, gridToWorld(4, 2.25).z]} castShadow>
        <cylinderGeometry args={[0.24, 0.42, 0.5, 4]} />
        <meshStandardMaterial color="#566163" metalness={0.48} roughness={0.38} />
      </mesh>
      <SpriteLabel
        kind="bubble"
        text="料理间"
        position={[gridToWorld(4.7, 2.1).x, 1.52, gridToWorld(4.7, 2.1).z]}
        scale={[1.05, 0.32, 1]}
      />

      {/* 化粧室：专用瓷砖、封闭隔墙、实体门、洗手盆、镜子与小便池 */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[toiletCenter.x, 0.019, toiletCenter.z]}
        receiveShadow
      >
        <planeGeometry args={[3.05, 3.05]} />
        <meshStandardMaterial color="#a9c7cf" roughness={0.66} />
      </mesh>
      <PartitionWall
        position={[gridToWorld(10.52, 3).x, 0.72, gridToWorld(10.52, 3).z]}
        size={[0.12, 1.44, 3.05]}
        color="#c8d7d7"
      />
      <PartitionWall
        position={[gridToWorld(12, 1.52).x, 0.72, gridToWorld(12, 1.52).z]}
        size={[3.05, 1.44, 0.12]}
        color="#c8d7d7"
      />
      <PartitionWall
        position={[gridToWorld(11.25, 4.48).x, 0.72, gridToWorld(11.25, 4.48).z]}
        size={[1.48, 1.44, 0.12]}
        color="#c8d7d7"
      />
      {/* 门洞与向内开启的木门：顾客不会再穿墙 */}
      <mesh position={[gridToWorld(12.02, 4.48).x, 0.82, gridToWorld(12.02, 4.48).z]} castShadow>
        <boxGeometry args={[0.1, 1.64, 0.16]} />
        <meshStandardMaterial color="#6e4c34" roughness={0.72} />
      </mesh>
      <mesh position={[gridToWorld(13.42, 4.48).x, 0.82, gridToWorld(13.42, 4.48).z]} castShadow>
        <boxGeometry args={[0.1, 1.64, 0.16]} />
        <meshStandardMaterial color="#6e4c34" roughness={0.72} />
      </mesh>
      <mesh position={[gridToWorld(12.72, 4.48).x, 1.62, gridToWorld(12.72, 4.48).z]} castShadow>
        <boxGeometry args={[1.5, 0.1, 0.16]} />
        <meshStandardMaterial color="#6e4c34" roughness={0.72} />
      </mesh>
      <group
        position={[gridToWorld(12.08, 4.45).x, 0, gridToWorld(12.08, 4.45).z]}
        rotation={[0, -0.72, 0]}
      >
        <mesh position={[0.58, 0.78, 0]} castShadow>
          <boxGeometry args={[1.16, 1.48, 0.08]} />
          <meshStandardMaterial color="#d7c5a6" roughness={0.74} />
        </mesh>
        <mesh position={[1.02, 0.78, 0.06]}>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshStandardMaterial color="#b58a36" metalness={0.5} roughness={0.3} />
        </mesh>
      </group>
      {/* 独立洗手池：立柱、盆体、龙头与墙镜 */}
      <group position={[gridToWorld(11.1, 2.35).x, 0, gridToWorld(11.1, 2.35).z]}>
        <mesh position={[0, 0.28, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.2, 0.56, 14]} />
          <meshStandardMaterial color="#e9ece5" roughness={0.32} />
        </mesh>
        <mesh position={[0, 0.61, 0]} scale={[1.25, 0.55, 1]}>
          <sphereGeometry args={[0.28, 16, 10]} />
          <meshStandardMaterial color="#f5f6ef" roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.72, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.025, 18]} />
          <meshStandardMaterial color="#a9d0d7" roughness={0.18} />
        </mesh>
        <mesh position={[0, 0.82, -0.12]}>
          <torusGeometry args={[0.11, 0.022, 8, 16, Math.PI]} />
          <meshStandardMaterial color="#68777a" metalness={0.72} roughness={0.2} />
        </mesh>
      </group>
      <group
        position={[gridToWorld(10.6, 2.35).x, 1.22, gridToWorld(11.1, 2.35).z]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <mesh>
          <boxGeometry args={[0.58, 0.72, 0.045]} />
          <meshStandardMaterial color="#7a5a3d" roughness={0.68} />
        </mesh>
        <mesh position={[0, 0, 0.028]}>
          <planeGeometry args={[0.48, 0.62]} />
          <meshStandardMaterial color="#bfe0e8" metalness={0.45} roughness={0.12} />
        </mesh>
      </group>
      {/* 靠后墙的小便池，和坐便器明确分开 */}
      <group position={[gridToWorld(12.9, 2.12).x, 0, gridToWorld(12.9, 2.12).z]}>
        <mesh position={[0, 0.52, 0]} scale={[0.72, 1, 0.5]} castShadow>
          <sphereGeometry args={[0.3, 16, 10]} />
          <meshStandardMaterial color="#f1f3ec" roughness={0.28} />
        </mesh>
        <mesh position={[0, 0.55, 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.12, 18]} />
          <meshStandardMaterial color="#9fc8d1" roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.92, -0.02]}>
          <boxGeometry args={[0.1, 0.18, 0.08]} />
          <meshStandardMaterial color="#9aa8aa" metalness={0.5} roughness={0.26} />
        </mesh>
      </group>
      <SpriteLabel
        kind="bubble"
        text="化粧室"
        position={[gridToWorld(12.72, 4.62).x, 1.86, gridToWorld(12.72, 4.62).z]}
        scale={[1.05, 0.32, 1]}
      />

      {/* 扩建提示放在锁定地面上；实体外墙由 CutawayBuilding 随面积外移。 */}
      {expansionLevel < 2 ? (
        <SpriteLabel
          kind="bubble"
          text={`扩建预留区 ${bounds.width}×${bounds.height}`}
          position={[rightX + 0.45, 0.45, frontZ - 0.55]}
          scale={[1.65, 0.42, 1]}
        />
      ) : null}
    </group>
  );
}

function WindowPane({
  position,
  size = [1.0, 0.7, 0.05] as [number, number, number],
  trim = "#8a6a42",
}: {
  position: [number, number, number];
  size?: [number, number, number];
  trim?: string;
}) {
  const [w, h, d] = size;
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#7ec8e8" emissive="#3a6a88" emissiveIntensity={0.22} transparent opacity={0.82} flatShading />
      </mesh>
      {/* muntins */}
      <mesh position={[0, 0, d / 2 + 0.01]}>
        <boxGeometry args={[0.04, h, 0.02]} />
        <meshStandardMaterial color={trim} flatShading />
      </mesh>
      <mesh position={[0, 0, d / 2 + 0.01]}>
        <boxGeometry args={[w, 0.04, 0.02]} />
        <meshStandardMaterial color={trim} flatShading />
      </mesh>
      {/* frame */}
      <mesh position={[0, h / 2 + 0.03, 0]}>
        <boxGeometry args={[w + 0.08, 0.06, d + 0.02]} />
        <meshStandardMaterial color={trim} flatShading />
      </mesh>
      <mesh position={[0, -h / 2 - 0.03, 0]}>
        <boxGeometry args={[w + 0.08, 0.06, d + 0.02]} />
        <meshStandardMaterial color={trim} flatShading />
      </mesh>
    </group>
  );
}

function CutawayBuilding({
  locationLabel,
  restaurantName,
  wallStyle,
  entranceStyle,
  expansionLevel,
}: {
  locationLabel: string;
  restaurantName: string;
  wallStyle: WallStyle;
  entranceStyle: EntranceStyle;
  expansionLevel: ExpansionLevel;
}) {
  const bounds = shopBounds(expansionLevel);
  const rearZ = gridToWorld(bounds.minX, bounds.minY - 0.5).z;
  const frontZ = gridToWorld(bounds.minX, bounds.maxY + 0.5).z;
  const leftX = gridToWorld(bounds.minX - 0.5, bounds.minY).x;
  const rightX = gridToWorld(bounds.maxX + 0.5, bounds.minY).x;
  const centerX = (leftX + rightX) / 2;
  const centerZ = (rearZ + frontZ) / 2;
  const activeW = rightX - leftX;
  const activeD = frontZ - rearZ;
  const entrance = entranceCell(expansionLevel);
  const entranceX = gridToWorld(entrance.x, entrance.y).x;
  const doorW = 1.24;
  const leftFrontW = entranceX - doorW / 2 - leftX;
  const rightFrontW = rightX - entranceX - doorW / 2;
  const wallColor = wallStyle === "brick" ? "#a87858" : wallStyle === "panel" ? "#d8c8a8" : "#c9b896";
  const trim = wallStyle === "panel" ? "#5a4030" : "#8a6a42";
  const doorColor = entranceStyle === "glass" ? "#7ec8e8" : entranceStyle === "lattice" ? "#3a5a40" : "#6b4428";
  const doorInner = entranceStyle === "glass" ? "#a8e0f4" : entranceStyle === "lattice" ? "#2a4030" : "#4a3020";

  const wallMap = useMemo(() => {
    if (wallStyle === "brick") {
      const t = makeBrickTexture("#a87858");
      t.repeat.set(Math.max(4, activeW / 2), 3);
      return t;
    }
    const t = makeStuccoTexture(wallColor);
    t.repeat.set(Math.max(3, activeW / 3), 2);
    return t;
  }, [activeW, wallStyle, wallColor]);

  return (
    <group>
      {/* 后墙与两侧墙围成真实营业边界；扩建时整圈墙体随 bounds 外移 */}
      <mesh position={[centerX, ROOM.wallH / 2, rearZ]} castShadow receiveShadow>
        <boxGeometry args={[activeW + 0.22, ROOM.wallH, 0.22]} />
        <meshStandardMaterial map={wallMap} color={wallColor} roughness={0.88} flatShading />
      </mesh>
      <mesh position={[centerX, 0.45, rearZ + 0.12]} castShadow>
        <boxGeometry args={[activeW, 0.9, 0.04]} />
        <meshStandardMaterial color="#8a6a42" roughness={0.8} flatShading />
      </mesh>
      <mesh position={[centerX, 0.92, rearZ + 0.13]}>
        <boxGeometry args={[activeW, 0.06, 0.05]} />
        <meshStandardMaterial color="#6a4a30" flatShading />
      </mesh>
      <mesh position={[centerX, ROOM.wallH + 0.05, rearZ + 0.05]} castShadow>
        <boxGeometry args={[activeW + 0.32, 0.12, 0.35]} />
        <meshStandardMaterial color={trim} roughness={0.8} flatShading />
      </mesh>
      <mesh position={[leftX, 0.72, centerZ]} castShadow receiveShadow>
        <boxGeometry args={[0.22, 1.44, activeD + 0.22]} />
        <meshStandardMaterial map={wallMap} color={wallColor} roughness={0.88} flatShading />
      </mesh>
      <mesh position={[leftX + 0.12, 0.45, centerZ]} castShadow>
        <boxGeometry args={[0.04, 0.9, activeD]} />
        <meshStandardMaterial color="#8a6a42" flatShading />
      </mesh>
      <mesh position={[leftX, 1.47, centerZ]} castShadow>
        <boxGeometry args={[0.28, 0.1, activeD + 0.28]} />
        <meshStandardMaterial color={trim} flatShading />
      </mesh>
      <mesh position={[rightX, 0.72, centerZ]} castShadow receiveShadow>
        <boxGeometry args={[0.22, 1.44, activeD + 0.22]} />
        <meshStandardMaterial
          map={wallMap}
          color={wallStyle === "brick" ? "#986848" : "#b8a888"}
          roughness={0.88}
          flatShading
        />
      </mesh>
      <mesh position={[rightX - 0.12, 0.45, centerZ]} castShadow>
        <boxGeometry args={[0.04, 0.9, activeD]} />
        <meshStandardMaterial color="#7b5a38" flatShading />
      </mesh>
      <mesh position={[rightX, 1.47, centerZ]} castShadow>
        <boxGeometry args={[0.28, 0.1, activeD + 0.28]} />
        <meshStandardMaterial color={trim} flatShading />
      </mesh>

      {/* 靠近镜头的墙做低切面，但连续封到入口门框，不再是敞口平台 */}
      {leftFrontW > 0 ? (
        <mesh position={[leftX + leftFrontW / 2, 0.46, frontZ]} castShadow receiveShadow>
          <boxGeometry args={[leftFrontW, 0.92, 0.22]} />
          <meshStandardMaterial map={wallMap} color={wallColor} roughness={0.88} flatShading />
        </mesh>
      ) : null}
      {rightFrontW > 0 ? (
        <mesh position={[entranceX + doorW / 2 + rightFrontW / 2, 0.46, frontZ]} castShadow receiveShadow>
          <boxGeometry args={[rightFrontW, 0.92, 0.22]} />
          <meshStandardMaterial map={wallMap} color={wallColor} roughness={0.88} flatShading />
        </mesh>
      ) : null}
      {leftFrontW > 0 ? (
        <mesh position={[leftX + leftFrontW / 2, 0.95, frontZ]} castShadow>
          <boxGeometry args={[leftFrontW + 0.08, 0.1, 0.28]} />
          <meshStandardMaterial color={trim} roughness={0.78} />
        </mesh>
      ) : null}
      {rightFrontW > 0 ? (
        <mesh position={[entranceX + doorW / 2 + rightFrontW / 2, 0.95, frontZ]} castShadow>
          <boxGeometry args={[rightFrontW + 0.08, 0.1, 0.28]} />
          <meshStandardMaterial color={trim} roughness={0.78} />
        </mesh>
      ) : null}

      {/* 与逻辑入口同格的实体门：门框、门楣、门槛与向内开启的门扇 */}
      <mesh position={[entranceX - doorW / 2, 1.02, frontZ]} castShadow>
        <boxGeometry args={[0.12, 2.04, 0.22]} />
        <meshStandardMaterial color={trim} roughness={0.7} />
      </mesh>
      <mesh position={[entranceX + doorW / 2, 1.02, frontZ]} castShadow>
        <boxGeometry args={[0.12, 2.04, 0.22]} />
        <meshStandardMaterial color={trim} roughness={0.7} />
      </mesh>
      <mesh position={[entranceX, 2.02, frontZ]} castShadow>
        <boxGeometry args={[doorW + 0.14, 0.12, 0.24]} />
        <meshStandardMaterial color={trim} roughness={0.7} />
      </mesh>
      <mesh position={[entranceX, 0.035, frontZ + 0.02]}>
        <boxGeometry args={[doorW, 0.07, 0.38]} />
        <meshStandardMaterial color="#b88c55" roughness={0.58} />
      </mesh>
      <group position={[entranceX - doorW / 2 + 0.04, 0, frontZ - 0.03]} rotation={[0, 0.72, 0]}>
        <mesh position={[doorW / 2 - 0.06, 0.96, 0]} castShadow>
          <boxGeometry args={[doorW - 0.12, 1.82, 0.1]} />
          <meshStandardMaterial
            color={doorColor}
            roughness={entranceStyle === "glass" ? 0.24 : 0.72}
            metalness={entranceStyle === "glass" ? 0.3 : 0}
            transparent={entranceStyle === "glass"}
            opacity={entranceStyle === "glass" ? 0.72 : 1}
          />
        </mesh>
        <mesh position={[doorW / 2 - 0.06, 1.02, 0.058]}>
          <boxGeometry args={[doorW - 0.34, 1.34, 0.025]} />
          <meshStandardMaterial
            color={doorInner}
            roughness={0.35}
            transparent={entranceStyle === "glass"}
            opacity={entranceStyle === "glass" ? 0.42 : 1}
          />
        </mesh>
        {entranceStyle === "lattice" &&
          [-0.25, 0, 0.25].map((ox) => (
            <mesh key={ox} position={[doorW / 2 - 0.06 + ox, 1.02, 0.08]}>
              <boxGeometry args={[0.045, 1.3, 0.035]} />
              <meshStandardMaterial color="#c8b898" />
            </mesh>
          ))}
        <mesh position={[doorW - 0.25, 0.94, 0.09]}>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshStandardMaterial color="#c9a84a" metalness={0.55} roughness={0.25} />
        </mesh>
      </group>
      <SpriteLabel
        kind="bubble"
        text="入口"
        position={[entranceX, 2.38, frontZ + 0.05]}
        scale={[0.82, 0.28, 1]}
      />
      {/* back windows */}
      {[centerX - activeW * 0.28, centerX, centerX + activeW * 0.28].map((x, i) => (
        <WindowPane key={i} position={[x, 1.55, rearZ + 0.12]} size={[1.15, 0.85, 0.06]} trim={trim} />
      ))}
      {/* striped awning */}
      <mesh position={[centerX, ROOM.wallH + 0.25, rearZ - 0.35]} castShadow>
        <boxGeometry args={[activeW + 0.6, 0.08, 0.9]} />
        <meshStandardMaterial color="#2f8f5b" roughness={0.7} flatShading />
      </mesh>
      <mesh position={[centerX, ROOM.wallH + 0.18, rearZ - 0.7]} castShadow>
        <boxGeometry args={[activeW + 0.4, 0.35, 0.08]} />
        <meshStandardMaterial color="#247a4c" flatShading />
      </mesh>
      {[-0.36, -0.18, 0, 0.18, 0.36].map((ratio, i) => (
        <mesh key={i} position={[centerX + activeW * ratio, ROOM.wallH + 0.26, rearZ - 0.35]}>
          <boxGeometry args={[Math.max(0.28, activeW * 0.04), 0.09, 0.92]} />
          <meshStandardMaterial color="#f4f0e8" flatShading />
        </mesh>
      ))}
      {/* front entrance awning */}
      <mesh position={[entranceX, 2.1, frontZ + 0.36]} castShadow>
        <boxGeometry args={[1.72, 0.06, 0.72]} />
        <meshStandardMaterial color="#2f6f9b" flatShading />
      </mesh>
      {[-0.45, 0, 0.45].map((ox, i) => (
        <mesh key={i} position={[entranceX + ox, 2.11, frontZ + 0.36]}>
          <boxGeometry args={[0.28, 0.07, 0.72]} />
          <meshStandardMaterial color="#e8f0f4" flatShading />
        </mesh>
      ))}
      {/* shop sign */}
      <group position={[centerX, ROOM.wallH + 0.85, rearZ - 0.2]}>
        <mesh castShadow>
          <boxGeometry args={[3.2, 0.7, 0.12]} />
          <meshStandardMaterial color="#1e2a24" flatShading />
        </mesh>
        <mesh position={[0, 0, 0.02]}>
          <boxGeometry args={[3.0, 0.55, 0.02]} />
          <meshStandardMaterial color="#0e1814" flatShading />
        </mesh>
        <ShopSignPlane title={restaurantName} subtitle={locationLabel} position={[0, 0, 0.08]} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX + 0.35, -0.01, centerZ + 0.35]}>
        <planeGeometry args={[activeW + 1.5, activeD + 1.5]} />
        <meshStandardMaterial color="#0a0806" transparent opacity={0.2} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ShopWindowRow({
  width,
  floors,
  height,
  depth,
  face = "front",
}: {
  width: number;
  floors: number;
  height: number;
  depth: number;
  face?: "front" | "side" | "back" | "left";
}) {
  const cols = Math.max(2, Math.floor(width / 0.65));
  const items: ReactNode[] = [];
  for (let fi = 0; fi < floors; fi++) {
    const y = 1.35 + fi * (height / Math.max(1, floors));
    for (let ci = 0; ci < cols; ci++) {
      const t = (ci + 0.5) / cols - 0.5;
      const lit = (fi + ci) % 3 !== 0;
      const glow = lit ? "#e8f6ff" : "#5a7080";
      const emit = lit ? "#7aa8c0" : "#182028";
      const emitI = lit ? 0.35 : 0.06;
      if (face === "front") {
        items.push(
          <group key={`${fi}-${ci}`} position={[t * width * 0.78, y, depth / 2 + 0.04]}>
            <mesh>
              <boxGeometry args={[Math.min(0.55, width * 0.28), 0.48, 0.08]} />
              <meshStandardMaterial color={glow} emissive={emit} emissiveIntensity={emitI} flatShading />
            </mesh>
            <mesh position={[0, 0, 0.05]}>
              <boxGeometry args={[0.04, 0.48, 0.02]} />
              <meshStandardMaterial color="#2a1c14" flatShading />
            </mesh>
            <mesh position={[0, 0, 0.05]}>
              <boxGeometry args={[Math.min(0.55, width * 0.28), 0.04, 0.02]} />
              <meshStandardMaterial color="#2a1c14" flatShading />
            </mesh>
            {/* sill */}
            <mesh position={[0, -0.28, 0.06]}>
              <boxGeometry args={[Math.min(0.6, width * 0.3), 0.05, 0.1]} />
              <meshStandardMaterial color="#5a4030" flatShading />
            </mesh>
          </group>,
        );
      } else if (face === "back") {
        items.push(
          <group key={`${fi}-${ci}`} position={[t * width * 0.78, y, -depth / 2 - 0.04]}>
            <mesh>
              <boxGeometry args={[Math.min(0.5, width * 0.26), 0.42, 0.06]} />
              <meshStandardMaterial color={glow} emissive={emit} emissiveIntensity={emitI * 0.7} flatShading />
            </mesh>
          </group>,
        );
      } else if (face === "left") {
        items.push(
          <group key={`${fi}-${ci}`} position={[-width / 2 - 0.04, y, t * depth * 0.78]}>
            <mesh>
              <boxGeometry args={[0.08, 0.48, Math.min(0.5, depth * 0.26)]} />
              <meshStandardMaterial color={glow} emissive={emit} emissiveIntensity={emitI} flatShading />
            </mesh>
          </group>,
        );
      } else {
        items.push(
          <group key={`${fi}-${ci}`} position={[width / 2 + 0.04, y, t * depth * 0.78]}>
            <mesh>
              <boxGeometry args={[0.08, 0.48, Math.min(0.5, depth * 0.26)]} />
              <meshStandardMaterial color={glow} emissive={emit} emissiveIntensity={emitI} flatShading />
            </mesh>
            <mesh position={[0.06, -0.28, 0]}>
              <boxGeometry args={[0.1, 0.05, Math.min(0.55, depth * 0.28)]} />
              <meshStandardMaterial color="#5a4030" flatShading />
            </mesh>
          </group>,
        );
      }
    }
  }
  return <group>{items}</group>;
}

function NeighborTower({
  position,
  size,
  color,
  label,
  accent,
  awning = "#c34f3a",
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  label: string;
  accent?: string;
  awning?: string;
}) {
  const [w, h, d] = size;
  const floors = Math.max(3, Math.floor(h / 1.05));
  const facade = useMemo(() => {
    const t = makeBrickTexture(color);
    t.repeat.set(Math.max(2, Math.round(w)), Math.max(2, Math.round(h)));
    return t;
  }, [color, w, h]);

  return (
    <group position={position}>
      {/* main mass */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial map={facade} color={color} roughness={0.92} flatShading />
      </mesh>
      {/* ground floor storefront darker band */}
      <mesh position={[0, 0.55, d / 2 + 0.01]} castShadow>
        <boxGeometry args={[w * 0.92, 1.05, 0.08]} />
        <meshStandardMaterial color={accent ?? shadeColor(color, 0.7)} roughness={0.85} flatShading />
      </mesh>
      {/* shop door */}
      <mesh position={[-w * 0.22, 0.55, d / 2 + 0.06]} castShadow>
        <boxGeometry args={[0.35, 0.95, 0.06]} />
        <meshStandardMaterial color="#3a2a1c" flatShading />
      </mesh>
      {/* display window */}
      <mesh position={[w * 0.18, 0.65, d / 2 + 0.06]}>
        <boxGeometry args={[0.55, 0.7, 0.05]} />
        <meshStandardMaterial color="#a8d4e8" emissive="#4a7890" emissiveIntensity={0.2} transparent opacity={0.85} flatShading />
      </mesh>
      {/* striped awning */}
      <mesh position={[0, 1.2, d / 2 + 0.28]} castShadow>
        <boxGeometry args={[w * 0.95, 0.06, 0.45]} />
        <meshStandardMaterial color={awning} flatShading />
      </mesh>
      {[-0.35, -0.1, 0.15, 0.4].map((t, i) => (
        <mesh key={i} position={[t * w * 0.7, 1.21, d / 2 + 0.28]}>
          <boxGeometry args={[w * 0.12, 0.07, 0.46]} />
          <meshStandardMaterial color="#f4f0e8" flatShading />
        </mesh>
      ))}
      <mesh position={[0, 1.05, d / 2 + 0.48]} castShadow>
        <boxGeometry args={[w * 0.9, 0.22, 0.05]} />
        <meshStandardMaterial color={shadeColor(awning, 0.75)} flatShading />
      </mesh>
      {/* upper windows on visible faces */}
      <ShopWindowRow width={w} floors={floors - 1} height={h - 1.6} depth={d} face="front" />
      <ShopWindowRow width={w} floors={floors - 1} height={h - 1.6} depth={d} face="side" />
      <ShopWindowRow width={w} floors={floors - 1} height={h - 1.6} depth={d} face="left" />
      <ShopWindowRow width={w} floors={Math.max(2, floors - 2)} height={h - 2.2} depth={d} face="back" />
      {/* floor cornices */}
      {Array.from({ length: floors }, (_, fi) => (
        <mesh key={fi} position={[0, (fi + 1) * (h / floors) - 0.05, 0]}>
          <boxGeometry args={[w + 0.08, 0.06, d + 0.08]} />
          <meshStandardMaterial color="#5a4030" roughness={0.85} flatShading />
        </mesh>
      ))}
      {/* roof overhang + parapet */}
      <mesh position={[0, h + 0.08, 0]} castShadow>
        <boxGeometry args={[w + 0.25, 0.12, d + 0.25]} />
        <meshStandardMaterial color="#4a3a30" flatShading />
      </mesh>
      <mesh position={[0, h + 0.22, 0]} castShadow>
        <boxGeometry args={[w * 0.85, 0.18, d * 0.85]} />
        <meshStandardMaterial color="#6a5040" flatShading />
      </mesh>
      {/* AC units */}
      <mesh position={[w * 0.28, h * 0.62, d / 2 + 0.12]} castShadow>
        <boxGeometry args={[0.28, 0.18, 0.18]} />
        <meshStandardMaterial color="#8a9098" metalness={0.3} flatShading />
      </mesh>
      {/* vertical kanban */}
      <mesh position={[w / 2 + 0.08, h * 0.55, 0]} castShadow>
        <boxGeometry args={[0.12, h * 0.55, 0.45]} />
        <meshStandardMaterial color="#c34f3a" flatShading />
      </mesh>
      <mesh position={[w / 2 + 0.14, h * 0.55, 0]}>
        <boxGeometry args={[0.02, h * 0.5, 0.38]} />
        <meshStandardMaterial color="#1e1510" flatShading />
      </mesh>
      <KanbanPlane label={label} position={[w / 2 + 0.28, h * 0.55, 0]} />
      {/* horizontal shop board */}
      <mesh position={[0, 1.45, d / 2 + 0.1]} castShadow>
        <boxGeometry args={[w * 0.7, 0.22, 0.06]} />
        <meshStandardMaterial color="#1e2a24" flatShading />
      </mesh>
    </group>
  );
}

function StreetLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[0.18, 0.12, 0.18]} />
        <meshStandardMaterial color="#3a3a38" flatShading />
      </mesh>
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[0.07, 2.1, 0.07]} />
        <meshStandardMaterial color="#4a4a48" metalness={0.35} roughness={0.55} flatShading />
      </mesh>
      <mesh position={[0, 2.2, 0]} castShadow>
        <boxGeometry args={[0.22, 0.08, 0.22]} />
        <meshStandardMaterial color="#3a3a38" flatShading />
      </mesh>
      <mesh position={[0, 2.35, 0]} castShadow>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        <meshStandardMaterial color="#f5e6b0" emissive="#e8c860" emissiveIntensity={0.55} flatShading />
      </mesh>
      <pointLight position={[0, 2.1, 0]} intensity={0.55} distance={6} color="#ffe6a8" />
    </group>
  );
}

function Passer({ seed, path }: { seed: number; path: "front" | "side" }) {
  const ref = useRef<THREE.Group>(null);
  const look = useMemo(() => {
    const palette = [
      { shirt: "#3d6b8c", pants: "#2f3a44", hair: "#2b2118" },
      { shirt: "#c45a6e", pants: "#5a3040", hair: "#8b3a18" },
      { shirt: "#4a7c59", pants: "#2c3530", hair: "#1a1a1a" },
      { shirt: "#d4a84a", pants: "#6b4a28", hair: "#c8a040" },
      { shirt: "#6a5a8c", pants: "#3a3450", hair: "#4a2060" },
    ];
    return palette[seed % palette.length];
  }, [seed]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() * (0.35 + (seed % 3) * 0.08) + seed * 1.7;
    const bob = Math.abs(Math.sin(t * 6)) * 0.03;
    if (path === "front") {
      const x = ((t % 20) - 10) * 1.1;
      ref.current.position.set(x, bob, ROOM.d / 2 + 2.2);
      ref.current.rotation.y = Math.PI / 2;
    } else {
      const z = ((t % 16) - 8) * 0.9;
      ref.current.position.set(-ROOM.w / 2 - 2.4, bob, z);
      ref.current.rotation.y = 0;
    }
  });

  return (
    <group ref={ref}>
      <mesh position={[-0.06, 0.16, 0]} castShadow>
        <boxGeometry args={[0.09, 0.24, 0.1]} />
        <meshStandardMaterial color={look.pants} flatShading />
      </mesh>
      <mesh position={[0.06, 0.16, 0]} castShadow>
        <boxGeometry args={[0.09, 0.24, 0.1]} />
        <meshStandardMaterial color={look.pants} flatShading />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.24, 0.28, 0.14]} />
        <meshStandardMaterial color={look.shirt} flatShading />
      </mesh>
      <mesh position={[-0.16, 0.4, 0]} castShadow>
        <boxGeometry args={[0.07, 0.22, 0.07]} />
        <meshStandardMaterial color={look.shirt} flatShading />
      </mesh>
      <mesh position={[0.16, 0.4, 0]} castShadow>
        <boxGeometry args={[0.07, 0.22, 0.07]} />
        <meshStandardMaterial color={look.shirt} flatShading />
      </mesh>
      <mesh position={[0, 0.68, 0]} castShadow>
        <boxGeometry args={[0.2, 0.2, 0.18]} />
        <meshStandardMaterial color="#efc49a" flatShading />
      </mesh>
      <mesh position={[-0.04, 0.7, 0.1]}>
        <boxGeometry args={[0.035, 0.035, 0.02]} />
        <meshStandardMaterial color="#1a1410" flatShading />
      </mesh>
      <mesh position={[0.04, 0.7, 0.1]}>
        <boxGeometry args={[0.035, 0.035, 0.02]} />
        <meshStandardMaterial color="#1a1410" flatShading />
      </mesh>
      <mesh position={[0, 0.78, -0.02]} castShadow>
        <boxGeometry args={[0.22, 0.08, 0.2]} />
        <meshStandardMaterial color={look.hair} flatShading />
      </mesh>
    </group>
  );
}

function CobbleSidewalk({ position, size }: { position: [number, number, number]; size: [number, number] }) {
  const map = useMemo(() => {
    const t = nearestTex((ctx, s) => {
      ctx.fillStyle = "#b8b2a4";
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          ctx.fillStyle = (x + y) % 2 ? "#c4beb0" : "#aea89a";
          ctx.fillRect(x * 8 + 1, y * 8 + 1, 6, 6);
        }
      }
    }, 64);
    t.repeat.set(size[0] / 1.5, size[1] / 1.5);
    return t;
  }, [size]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial map={map} roughness={0.95} />
    </mesh>
  );
}

export function StreetAndNeighbors() {
  const hw = ROOM.w / 2;
  const hd = ROOM.d / 2;

  return (
    <group>
      <CobbleSidewalk position={[0, -0.02, hd + 1.4]} size={[ROOM.w + 8, 2.8]} />
      <CobbleSidewalk position={[-hw - 1.6, -0.02, 0]} size={[3.2, ROOM.d + 6]} />
      <CobbleSidewalk position={[hw + 1.8, -0.02, 0]} size={[3.6, ROOM.d + 6]} />
      {/* asphalt */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, hd + 3.6]} receiveShadow>
        <planeGeometry args={[ROOM.w + 14, 3.2]} />
        <meshStandardMaterial color="#4a4e52" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-hw - 3.4, -0.04, 0]} receiveShadow>
        <planeGeometry args={[2.4, ROOM.d + 10]} />
        <meshStandardMaterial color="#45494d" roughness={1} />
      </mesh>
      {[-4, -1, 2, 5].map((x, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.035, hd + 3.6]}>
          <planeGeometry args={[0.9, 0.12]} />
          <meshStandardMaterial color="#d8d0a8" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.2, -0.03, hd + 3.2]}>
        <circleGeometry args={[0.28, 16]} />
        <meshStandardMaterial color="#3a3e42" metalness={0.3} roughness={0.6} />
      </mesh>
      <StreetLamp position={[-hw - 0.8, 0, hd + 1.1]} />
      <StreetLamp position={[hw + 0.9, 0, hd + 1.3]} />
      <NeighborTower
        position={[-hw - 3.8, 0, -1.5]}
        size={[2.4, 5.5, 3.2]}
        color="#8a6a55"
        label="茶"
        accent="#5a4030"
        awning="#2f8f5b"
      />
      <NeighborTower
        position={[-hw - 4.2, 0, 3.2]}
        size={[2.2, 4.2, 2.4]}
        color="#6a7a68"
        label="麵"
        accent="#3a4a38"
        awning="#c34f3a"
      />
      <NeighborTower
        position={[hw + 4.0, 0, -0.5]}
        size={[2.8, 6.2, 3.6]}
        color="#9a6a58"
        label="文"
        accent="#6a4030"
        awning="#2f6f9b"
      />
      <NeighborTower
        position={[hw + 4.3, 0, 4]}
        size={[2.2, 3.8, 2.2]}
        color="#7a8a75"
        label="花"
        accent="#4a5a40"
        awning="#d4a84a"
      />
      {/* street planter */}
      <mesh position={[hw + 1.2, 0.2, hd + 0.8]} castShadow>
        <boxGeometry args={[0.5, 0.4, 0.5]} />
        <meshStandardMaterial color="#6b4a28" flatShading />
      </mesh>
      <mesh position={[hw + 1.2, 0.55, hd + 0.8]} castShadow>
        <boxGeometry args={[0.36, 0.32, 0.36]} />
        <meshStandardMaterial color="#3d7a48" flatShading />
      </mesh>
      <mesh position={[hw + 1.3, 0.68, hd + 0.9]} castShadow>
        <boxGeometry args={[0.18, 0.18, 0.18]} />
        <meshStandardMaterial color="#4a8f55" flatShading />
      </mesh>
      {/* trash / bollards for street corner feel */}
      <mesh position={[-hw + 0.4, 0.2, hd + 1.0]} castShadow>
        <boxGeometry args={[0.22, 0.4, 0.22]} />
        <meshStandardMaterial color="#4a5054" metalness={0.25} flatShading />
      </mesh>
      <mesh position={[hw - 0.3, 0.25, hd + 1.15]} castShadow>
        <boxGeometry args={[0.12, 0.5, 0.12]} />
        <meshStandardMaterial color="#c9a84a" metalness={0.4} flatShading />
      </mesh>
      <Passer seed={0} path="front" />
      <Passer seed={1} path="front" />
      <Passer seed={2} path="side" />
      <Passer seed={3} path="side" />
    </group>
  );
}

export function BuildingShell({
  locationLabel,
  restaurantName,
  buildable,
  onCellClick,
  floorStyle = "wood",
  wallStyle = "cream",
  entranceStyle = "classic",
  expansionLevel,
}: {
  locationLabel: string;
  restaurantName: string;
  buildable: boolean;
  onCellClick: (x: number, y: number) => void;
  floorStyle?: FloorStyle;
  wallStyle?: WallStyle;
  entranceStyle?: EntranceStyle;
  expansionLevel: ExpansionLevel;
}) {
  return (
    <group>
      <FloorTiles
        buildable={buildable}
        onCellClick={onCellClick}
        floorStyle={floorStyle}
        expansionLevel={expansionLevel}
      />
      <ServiceRooms expansionLevel={expansionLevel} />
      <CutawayBuilding
        locationLabel={locationLabel}
        restaurantName={restaurantName}
        wallStyle={wallStyle}
        entranceStyle={entranceStyle}
        expansionLevel={expansionLevel}
      />
      <StreetAndNeighbors />
      <mesh position={[0, 6, -12]}>
        <planeGeometry args={[40, 16]} />
        <meshStandardMaterial color="#7eb8d8" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[-14, 5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[28, 14]} />
        <meshStandardMaterial color="#6aa8c8" />
      </mesh>
    </group>
  );
}
