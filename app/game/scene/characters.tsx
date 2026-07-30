"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import {
  LinearFilter,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Group,
  type Texture,
} from "three";
import type { Guest, GuestStage, Staff, Task, TaskKind } from "../types";
import { gridToWorld } from "./coords";
import { SpriteLabel } from "./labels";

/** 与 page.tsx setInterval 一致：逻辑每 500ms 推进一步 */
const SIM_TICK_SEC = 0.5;
const WALK_COLUMNS = 3;
const WALK_SEQUENCE = [0, 1, 2, 1] as const;
const WALK_FPS = 8;
const ATLAS_PROMISES = new Map<string, Promise<Texture>>();

const STAGE_BUBBLE: Partial<Record<GuestStage, string>> = {
  queue: "候位",
  order: "点餐",
  waitingCook: "等菜",
  waitingServe: "待上",
  eat: "用餐",
  pay: "结账",
};

const TASK_LABEL: Record<TaskKind, string> = {
  seat: "领位",
  takeOrder: "点餐",
  deliverOrder: "传菜",
  cook: "烹饪",
  serve: "上菜",
  checkout: "结账",
  clean: "清扫",
};

const SEATED = new Set<GuestStage>(["seating", "order", "waitingCook", "waitingServe", "eat", "pay"]);
type WalkState = { moving: boolean; phase: number; facing: -1 | 1 };

function cloneAtlas(source: Texture, rows: number): Texture {
  const texture = source.clone();
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / WALK_COLUMNS, 1 / rows);
  texture.magFilter = NearestFilter;
  texture.minFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function loadAtlas(url: string): Promise<Texture> {
  const cached = ATLAS_PROMISES.get(url);
  if (cached) return cached;
  const pending = new Promise<Texture>((resolve, reject) => {
    new TextureLoader().load(url, resolve, undefined, reject);
  });
  ATLAS_PROMISES.set(url, pending);
  return pending;
}

function useAtlas(url: string): Texture | null {
  const [source, setSource] = useState<Texture | null>(null);
  useEffect(() => {
    let active = true;
    loadAtlas(url)
      .then((texture) => {
        if (active) setSource(texture);
      })
      .catch((error: unknown) => {
        ATLAS_PROMISES.delete(url);
        console.error(`人物精灵加载失败：${url}`, error);
      });
    return () => {
      active = false;
    };
  }, [url]);
  return source;
}

/**
 * 真正用于场景内移动的全身角色。每次步行依次播放左脚、并步、右脚三帧，
 * 保留 3D 场景和可旋转镜头，但人物像 1990 年代经营游戏一样始终清楚可读。
 */
function AnimatedPersonSprite({
  atlasUrl,
  rows,
  row,
  seated,
  walkRef,
  carrying = false,
}: {
  atlasUrl: string;
  rows: number;
  row: number;
  seated: boolean;
  walkRef: MutableRefObject<WalkState>;
  carrying?: boolean;
}) {
  const source = useAtlas(atlasUrl);
  const texture = useMemo(() => (source ? cloneAtlas(source, rows) : null), [rows, source]);
  const sprite = useRef<Group>(null);
  const safeRow = Math.abs(row) % rows;

  useEffect(() => () => texture?.dispose(), [texture]);

  useFrame(() => {
    if (!texture) return;
    const moving = walkRef.current.moving && !seated;
    const frame = moving
      ? WALK_SEQUENCE[Math.floor(walkRef.current.phase * WALK_FPS) % WALK_SEQUENCE.length]
      : 1;
    texture.offset.set(frame / WALK_COLUMNS, 1 - (safeRow + 1) / rows);
    if (sprite.current) {
      const stride = Math.sin(walkRef.current.phase * Math.PI * 4);
      const bob = moving ? Math.abs(stride) * 0.055 : 0;
      sprite.current.position.y = (seated ? 0.66 : 0.76) + bob;
      sprite.current.rotation.z = moving ? stride * 0.025 : 0;
      sprite.current.scale.x = walkRef.current.facing;
    }
  });

  const height = seated ? 1.18 : 1.62;
  const width = height * (rows === 4 ? 1.33 : 2);

  return (
    <group>
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[seated ? 0.2 : 0.25, 18]} />
        <meshStandardMaterial color="#1a120c" transparent opacity={0.24} depthWrite={false} />
      </mesh>
      <group ref={sprite} position={[0, seated ? 0.66 : 0.76, 0]}>
        {texture ? (
          <sprite scale={[width, height, 1]} renderOrder={4}>
            <spriteMaterial
              map={texture}
              transparent
              alphaTest={0.08}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        ) : null}
        {texture && carrying && !seated ? (
          <group position={[0.34, -0.06, 0.08]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.22, 0.22, 0.035, 16]} />
              <meshStandardMaterial color="#d8c9a7" metalness={0.35} roughness={0.42} />
            </mesh>
            <mesh position={[0, 0.05, 0]}>
              <sphereGeometry args={[0.08, 12, 8]} />
              <meshStandardMaterial color="#e79a3b" />
            </mesh>
          </group>
        ) : null}
      </group>
    </group>
  );
}

function staffCellsPerSec(s: Staff, simSpeed: number): number {
  const speed = Math.max(0, simSpeed);
  const expBonus = 1 + Math.min(0.5, s.exp / 100);
  const moodMul = s.mood < 35 ? 0.55 : s.mood < 55 ? 0.78 : 1;
  const statMul = 0.7 + s.speedStat / 200;
  const cellsPerTick = 1.25 * expBonus * moodMul * statMul * Math.max(1, speed);
  return cellsPerTick / SIM_TICK_SEC;
}

function guestCellsPerSec(simSpeed: number): number {
  return (0.7 * Math.max(1, Math.max(0, simSpeed))) / SIM_TICK_SEC;
}

function MovingActor({
  x,
  y,
  pathLen,
  cellsPerSec,
  seated,
  figure,
  overlay,
  walkRef,
}: {
  x: number;
  y: number;
  pathLen: number;
  cellsPerSec: number;
  seated: boolean;
  figure: ReactNode;
  overlay?: ReactNode;
  walkRef: MutableRefObject<WalkState>;
}) {
  const group = useRef<Group>(null);
  const motion = useRef({
    vx: x,
    vy: y,
    tx: x,
    ty: y,
    segSpeed: 0,
    walkTail: 0,
    ready: false,
  });

  useFrame((_, dt) => {
    const m = motion.current;
    const clampedDt = Math.min(0.05, Math.max(0, dt));
    if (!m.ready) {
      m.vx = x;
      m.vy = y;
      m.tx = x;
      m.ty = y;
      m.ready = true;
    }

    if (m.tx !== x || m.ty !== y) {
      const jump = Math.hypot(x - m.vx, y - m.vy);
      m.tx = x;
      m.ty = y;
      if (jump > 2.2) {
        m.vx = x;
        m.vy = y;
        m.segSpeed = 0;
      } else {
        m.segSpeed = jump < 1e-5 ? 0 : Math.max(cellsPerSec, jump / SIM_TICK_SEC);
      }
    }

    const dx = m.tx - m.vx;
    const dy = m.ty - m.vy;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.015) walkRef.current.facing = dx > 0 ? 1 : -1;
    const arriveSnap = pathLen === 0 && dist < 0.06;
    if (dist < 1e-4 || arriveSnap) {
      m.vx = m.tx;
      m.vy = m.ty;
      m.segSpeed = 0;
    } else {
      if (m.segSpeed <= 0) m.segSpeed = Math.max(cellsPerSec, dist / SIM_TICK_SEC);
      const step = m.segSpeed * clampedDt;
      if (step >= dist) {
        m.vx = m.tx;
        m.vy = m.ty;
        m.segSpeed = 0;
        m.walkTail = 0.18;
      } else {
        m.vx += (dx / dist) * step;
        m.vy += (dy / dist) * step;
        m.walkTail = 0.22;
      }
    }

    m.walkTail = Math.max(0, m.walkTail - clampedDt);
    walkRef.current.moving = !seated && (m.segSpeed > 0.02 || m.walkTail > 0);
    if (walkRef.current.moving) walkRef.current.phase += clampedDt;
    const w = gridToWorld(m.vx, m.vy);
    group.current?.position.set(w.x, 0, w.z);
  });

  const w0 = gridToWorld(x, y);
  return (
    <group ref={group} position={[w0.x, 0, w0.z]}>
      {figure}
      {overlay}
    </group>
  );
}

function ActorWithWalk(props: {
  x: number;
  y: number;
  pathLen: number;
  cellsPerSec: number;
  seated: boolean;
  atlasUrl: string;
  rows: number;
  row: number;
  carrying?: boolean;
  overlay?: ReactNode;
}) {
  const walkRef = useRef<WalkState>({ moving: false, phase: 0, facing: 1 });
  return (
    <MovingActor
      x={props.x}
      y={props.y}
      pathLen={props.pathLen}
      cellsPerSec={props.cellsPerSec}
      seated={props.seated}
      walkRef={walkRef}
      figure={
        <AnimatedPersonSprite
          atlasUrl={props.atlasUrl}
          rows={props.rows}
          row={props.row}
          seated={props.seated}
          walkRef={walkRef}
          carrying={props.carrying}
        />
      }
      overlay={props.overlay}
    />
  );
}

export function ActorsLayer({
  guests,
  staff,
  simSpeed,
  taskByGuest,
  taskById,
  showBubbles = true,
}: {
  guests: Guest[];
  staff: Staff[];
  simSpeed: number;
  taskByGuest: Map<number, Task>;
  taskById: Map<number, Task>;
  showBubbles?: boolean;
}) {
  const guestSpeed = guestCellsPerSec(simSpeed || 1);
  return (
    <group>
      {guests.map((guest) => {
        const moving = guest.path.length > 0;
        const seated = guest.tableId != null && !moving && SEATED.has(guest.stage);
        const task = taskByGuest.get(guest.id);
        const stageBubble = STAGE_BUBBLE[guest.stage];
        const bubbleText =
          (task && TASK_LABEL[task.kind]) ||
          (stageBubble && !task && guest.stage !== "seating" && guest.stage !== "leaving" ? stageBubble : "");
        return (
          <ActorWithWalk
            key={`g-${guest.id}`}
            x={guest.x}
            y={guest.y}
            pathLen={guest.path.length}
            cellsPerSec={guestSpeed}
            seated={!!seated}
            atlasUrl="/guest-walk-atlas.png"
            rows={6}
            row={guest.id % 6}
            overlay={
              showBubbles && bubbleText ? (
                <SpriteLabel
                  kind="bubble"
                  text={String(bubbleText)}
                  position={[0, seated ? 1.62 : 1.96, 0]}
                  scale={[1.15, 0.36, 1]}
                />
              ) : null
            }
          />
        );
      })}
      {staff.map((member) => {
        if (member.onLeave) return null;
        const task = member.taskId != null ? taskById.get(member.taskId) : undefined;
        const carrying = task?.kind === "serve" || task?.kind === "deliverOrder";
        const row = member.role === "chef" ? 2 + (member.id % 2) : member.id % 2;
        return (
          <ActorWithWalk
            key={`s-${member.id}`}
            x={member.x}
            y={member.y}
            pathLen={member.path.length}
            cellsPerSec={staffCellsPerSec(member, simSpeed || 1)}
            seated={false}
            atlasUrl="/staff-walk-atlas.png"
            rows={4}
            row={row}
            carrying={carrying}
            overlay={
              showBubbles && task ? (
                <SpriteLabel
                  kind="bubble"
                  text={TASK_LABEL[task.kind]}
                  position={[0, 1.96, 0]}
                  scale={[1.15, 0.36, 1]}
                />
              ) : null
            }
          />
        );
      })}
    </group>
  );
}
