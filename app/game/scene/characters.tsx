"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import type { Group } from "three";
import type { Guest, GuestStage, Staff, Task, TaskKind } from "../types";
import { gridToWorld } from "./coords";
import { SpriteLabel } from "./labels";

/** 与 page.tsx setInterval 一致：逻辑每 500ms 推进一步 */
const SIM_TICK_SEC = 0.5;

const STAGE_BUBBLE: Partial<Record<GuestStage, string>> = {
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

type Look = {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  accent?: string;
  hairStyle?: "short" | "bob" | "spiky" | "bun";
};

const GUEST_PALETTE: Look[] = [
  { skin: "#f0c9a0", hair: "#2b2118", shirt: "#3d6b8c", pants: "#2f3a44", hairStyle: "short" },
  { skin: "#e8b48a", hair: "#8b3a18", shirt: "#c45a6e", pants: "#5a3040", hairStyle: "bob", accent: "#f2e6d8" },
  { skin: "#f3d2b0", hair: "#1a1a1a", shirt: "#4a7c59", pants: "#2c3530", hairStyle: "spiky" },
  { skin: "#d9a57a", hair: "#c8a040", shirt: "#d4a84a", pants: "#6b4a28", hairStyle: "short" },
  { skin: "#f2c4ae", hair: "#4a2060", shirt: "#6a5a8c", pants: "#3a3450", hairStyle: "bob", accent: "#e8d0e8" },
  { skin: "#eac09a", hair: "#111111", shirt: "#b85c38", pants: "#2a3038", hairStyle: "bun" },
  { skin: "#f5d0b0", hair: "#5c4030", shirt: "#2a6a8c", pants: "#1e2830", hairStyle: "short", accent: "#d8e8f0" },
  { skin: "#e0b090", hair: "#d8c8b0", shirt: "#e8e0d0", pants: "#6a6058", hairStyle: "bob" },
];

type WalkState = { moving: boolean; phase: number };

function Voxel({
  position,
  size,
  color,
  castShadow = true,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  castShadow?: boolean;
}) {
  return (
    <mesh position={position} castShadow={castShadow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.88} flatShading />
    </mesh>
  );
}

function HairCap({ style, color, y }: { style: Look["hairStyle"]; color: string; y: number }) {
  if (style === "bob") {
    return (
      <>
        <Voxel position={[0, y + 0.06, -0.02]} size={[0.3, 0.12, 0.28]} color={color} />
        <Voxel position={[0, y - 0.02, -0.1]} size={[0.28, 0.16, 0.1]} color={color} />
        <Voxel position={[-0.14, y - 0.04, 0]} size={[0.06, 0.18, 0.22]} color={color} />
        <Voxel position={[0.14, y - 0.04, 0]} size={[0.06, 0.18, 0.22]} color={color} />
      </>
    );
  }
  if (style === "spiky") {
    return (
      <>
        <Voxel position={[0, y + 0.05, -0.02]} size={[0.28, 0.1, 0.26]} color={color} />
        <Voxel position={[-0.08, y + 0.14, 0]} size={[0.08, 0.1, 0.08]} color={color} />
        <Voxel position={[0.02, y + 0.16, 0.02]} size={[0.08, 0.12, 0.08]} color={color} />
        <Voxel position={[0.1, y + 0.13, -0.02]} size={[0.07, 0.09, 0.07]} color={color} />
      </>
    );
  }
  if (style === "bun") {
    return (
      <>
        <Voxel position={[0, y + 0.05, -0.02]} size={[0.28, 0.1, 0.26]} color={color} />
        <Voxel position={[0, y + 0.14, -0.08]} size={[0.14, 0.12, 0.14]} color={color} />
      </>
    );
  }
  return (
    <>
      <Voxel position={[0, y + 0.06, -0.02]} size={[0.28, 0.1, 0.26]} color={color} />
      <Voxel position={[0, y + 0.02, -0.12]} size={[0.26, 0.12, 0.08]} color={color} />
    </>
  );
}

/**
 * 像素块状人偶：头/脸/四肢可读，厨/侍/客外形可辨。
 * walkRef 由 MovingActor 每帧写入，避免走路动画触发 React 重渲染。
 */
function PixelFigure({
  look,
  role,
  seated,
  carrying,
  walkRef,
}: {
  look: Look;
  role: "guest" | "waiter" | "chef";
  seated: boolean;
  carrying?: boolean;
  walkRef?: MutableRefObject<WalkState>;
}) {
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const bodyBob = useRef<Group>(null);

  const face = useMemo(() => {
    if (role === "chef") return { mouth: "#c34f3a", brow: look.hair };
    if (role === "waiter") return { mouth: "#6a4030", brow: look.hair };
    return { mouth: "#8a5040", brow: look.hair };
  }, [role, look.hair]);

  useFrame(() => {
    const moving = !seated && !!walkRef?.current.moving;
    const phase = walkRef?.current.phase ?? 0;
    const swing = moving ? Math.sin(phase) * 0.45 : 0;
    const bob = moving ? Math.abs(Math.sin(phase)) * 0.028 : 0;
    if (bodyBob.current) bodyBob.current.position.y = bob;
    if (leftArm.current) leftArm.current.rotation.x = swing;
    if (rightArm.current) rightArm.current.rotation.x = -swing;
    if (leftLeg.current) leftLeg.current.rotation.x = -swing * 0.7;
    if (rightLeg.current) rightLeg.current.rotation.x = swing * 0.7;
  });

  // 等比略放大，正投影远距也能读出四肢与脸
  const scale = seated ? 1.05 : 1.28;
  const yBase = seated ? 0.22 : 0;
  const torsoY = seated ? 0.36 : 0.5;
  const headY = seated ? 0.68 : 0.9;
  const armY = seated ? 0.42 : 0.56;
  const shirt = role === "chef" ? "#f4f0e6" : role === "waiter" ? "#f7f4ec" : look.shirt;
  const pants = role === "chef" ? "#3a3a42" : role === "waiter" ? "#2f4a3d" : look.pants;

  return (
    <group scale={scale} position={[0, yBase, 0]}>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.22, 12]} />
        <meshStandardMaterial color="#1a120c" transparent opacity={0.3} />
      </mesh>

      <group ref={bodyBob}>
        {/* legs — 分色鞋底，走动时摆动更明显 */}
        {!seated && (
          <>
            <group ref={leftLeg} position={[-0.1, 0.2, 0]}>
              <Voxel position={[0, 0, 0]} size={[0.12, 0.32, 0.14]} color={pants} />
              <Voxel position={[0, -0.18, 0.03]} size={[0.13, 0.07, 0.16]} color="#2a2218" />
            </group>
            <group ref={rightLeg} position={[0.1, 0.2, 0]}>
              <Voxel position={[0, 0, 0]} size={[0.12, 0.32, 0.14]} color={pants} />
              <Voxel position={[0, -0.18, 0.03]} size={[0.13, 0.07, 0.16]} color="#2a2218" />
            </group>
          </>
        )}
        {seated && (
          <>
            <Voxel position={[-0.1, 0.14, 0.1]} size={[0.12, 0.14, 0.26]} color={pants} />
            <Voxel position={[0.1, 0.14, 0.1]} size={[0.12, 0.14, 0.26]} color={pants} />
          </>
        )}

        {/* torso */}
        <Voxel position={[0, torsoY, 0]} size={[0.34, seated ? 0.3 : 0.4, 0.2]} color={shirt} />
        {look.accent && role === "guest" && (
          <Voxel position={[0, torsoY + 0.02, 0.11]} size={[0.16, 0.12, 0.03]} color={look.accent} />
        )}

        {/* waiter apron */}
        {role === "waiter" && (
          <>
            <Voxel position={[0, torsoY - 0.04, 0.12]} size={[0.3, 0.34, 0.04]} color="#2f4a3d" />
            <Voxel position={[0, torsoY + 0.14, 0.12]} size={[0.28, 0.05, 0.05]} color="#1e3028" />
            <Voxel position={[-0.08, torsoY - 0.02, 0.15]} size={[0.07, 0.1, 0.02]} color="#c9a84a" />
          </>
        )}

        {/* chef coat + scarf */}
        {role === "chef" && (
          <>
            <Voxel position={[0, torsoY, 0.11]} size={[0.08, 0.32, 0.03]} color="#e8e4dc" />
            <Voxel position={[-0.07, torsoY + 0.08, 0.12]} size={[0.05, 0.05, 0.02]} color="#c34f3a" />
            <Voxel position={[0.07, torsoY + 0.08, 0.12]} size={[0.05, 0.05, 0.02]} color="#c34f3a" />
            <Voxel position={[0, torsoY + 0.16, 0.12]} size={[0.28, 0.07, 0.05]} color="#c34f3a" />
          </>
        )}

        {/* arms — 明显外伸 */}
        <group ref={leftArm} position={[-0.24, armY, 0]}>
          <Voxel position={[0, -0.12, 0]} size={[0.11, 0.32, 0.11]} color={shirt} />
          <Voxel position={[0, -0.3, 0.02]} size={[0.11, 0.1, 0.11]} color={look.skin} />
        </group>
        <group ref={rightArm} position={[0.24, armY, 0]}>
          <Voxel position={[0, -0.12, 0]} size={[0.11, 0.32, 0.11]} color={shirt} />
          <Voxel position={[0, -0.3, 0.02]} size={[0.11, 0.1, 0.11]} color={look.skin} />
          {carrying && (
            <group position={[0.02, -0.32, 0.14]}>
              <Voxel position={[0, 0, 0]} size={[0.18, 0.04, 0.18]} color="#eee8dc" />
              <Voxel position={[0, 0.05, 0]} size={[0.12, 0.06, 0.12]} color="#e8a040" />
            </group>
          )}
        </group>

        {/* head + face — 大眼大嘴，正投影可读 */}
        <group position={[0, headY, 0]}>
          <Voxel position={[0, 0, 0]} size={[0.32, 0.3, 0.28]} color={look.skin} />
          <Voxel position={[-0.08, 0.04, 0.15]} size={[0.07, 0.07, 0.03]} color="#1a1410" castShadow={false} />
          <Voxel position={[0.08, 0.04, 0.15]} size={[0.07, 0.07, 0.03]} color="#1a1410" castShadow={false} />
          <Voxel position={[-0.06, 0.06, 0.165]} size={[0.03, 0.03, 0.02]} color="#f8f4f0" castShadow={false} />
          <Voxel position={[0.1, 0.06, 0.165]} size={[0.03, 0.03, 0.02]} color="#f8f4f0" castShadow={false} />
          <Voxel position={[-0.08, 0.1, 0.15]} size={[0.08, 0.03, 0.02]} color={face.brow} castShadow={false} />
          <Voxel position={[0.08, 0.1, 0.15]} size={[0.08, 0.03, 0.02]} color={face.brow} castShadow={false} />
          <Voxel position={[0, -0.06, 0.15]} size={[0.1, 0.04, 0.02]} color={face.mouth} castShadow={false} />
          <Voxel position={[-0.18, 0, 0]} size={[0.05, 0.08, 0.06]} color={look.skin} castShadow={false} />
          <Voxel position={[0.18, 0, 0]} size={[0.05, 0.08, 0.06]} color={look.skin} castShadow={false} />

          {role === "chef" ? (
            <>
              <Voxel position={[0, 0.22, 0]} size={[0.34, 0.1, 0.3]} color="#f4f0e6" />
              <Voxel position={[0, 0.4, 0]} size={[0.26, 0.28, 0.26]} color="#f8f4ec" />
              <Voxel position={[0, 0.4, 0.02]} size={[0.18, 0.2, 0.28]} color="#efeae0" />
            </>
          ) : (
            <HairCap style={look.hairStyle ?? "short"} color={look.hair} y={0.12} />
          )}
        </group>
      </group>
    </group>
  );
}

/** 与 simulation.staffSpeed × moveEntity 倍率一致，换算成格/秒 */
function staffCellsPerSec(s: Staff, simSpeed: number): number {
  const speed = Math.max(0, simSpeed);
  const expBonus = 1 + Math.min(0.5, s.exp / 100);
  const moodMul = s.mood < 35 ? 0.55 : s.mood < 55 ? 0.78 : 1;
  const statMul = 0.7 + s.speedStat / 200;
  const cellsPerTick = 1.25 * expBonus * moodMul * statMul * Math.max(1, speed);
  return cellsPerTick / SIM_TICK_SEC;
}

function guestCellsPerSec(simSpeed: number): number {
  const speed = Math.max(0, simSpeed);
  const cellsPerTick = 0.7 * Math.max(1, speed);
  return cellsPerTick / SIM_TICK_SEC;
}

function shortestAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * 渲染层匀速移动：逻辑坐标仍按 tick 更新，角色用恒定格速追目标；
 * 到达/坐下时对齐格点，瞬移（>2.2 格）直接吸附。
 */
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
  const body = useRef<Group>(null);
  const motion = useRef({
    vx: x,
    vy: y,
    tx: x,
    ty: y,
    /** 本段追赶速度（格/秒），目标更新时按「一 tick 内走完」定速，保证匀速 */
    segSpeed: 0,
    faceY: 0,
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
      } else if (jump < 1e-5) {
        m.segSpeed = 0;
      } else {
        // 优先用属性速度；若本段更长则提速，避免追不上造成拖尾停顿
        const needed = jump / SIM_TICK_SEC;
        m.segSpeed = Math.max(cellsPerSec, needed);
      }
    }

    const dx = m.tx - m.vx;
    const dy = m.ty - m.vy;
    const dist = Math.hypot(dx, dy);
    const arriveSnap = pathLen === 0 && dist < 0.06;

    if (dist < 1e-4 || arriveSnap) {
      m.vx = m.tx;
      m.vy = m.ty;
      m.segSpeed = 0;
    } else {
      if (m.segSpeed <= 0) {
        m.segSpeed = Math.max(cellsPerSec, dist / SIM_TICK_SEC);
      }
      const step = m.segSpeed * clampedDt;
      if (step >= dist) {
        m.vx = m.tx;
        m.vy = m.ty;
        m.segSpeed = 0;
      } else {
        const inv = 1 / dist;
        m.vx += dx * inv * step;
        m.vy += dy * inv * step;
        const targetYaw = Math.atan2(dx, dy);
        m.faceY += shortestAngle(m.faceY, targetYaw) * Math.min(1, 14 * clampedDt);
      }
    }

    // 坐下时朝向复位，避免歪坐
    if (seated && pathLen === 0) {
      m.faceY += shortestAngle(m.faceY, 0) * Math.min(1, 10 * clampedDt);
    }

    walkRef.current.moving = m.segSpeed > 0.02 && !seated;
    if (walkRef.current.moving) {
      walkRef.current.phase += clampedDt * 10;
    }

    const w = gridToWorld(m.vx, m.vy);
    if (group.current) group.current.position.set(w.x, 0, w.z);
    if (body.current) body.current.rotation.y = m.faceY;
  });

  const w0 = gridToWorld(x, y);
  return (
    <group ref={group} position={[w0.x, 0, w0.z]}>
      <group ref={body}>{figure}</group>
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
  look: Look;
  role: "guest" | "waiter" | "chef";
  carrying?: boolean;
  overlay?: ReactNode;
}) {
  const walkRef = useRef<WalkState>({ moving: false, phase: 0 });
  return (
    <MovingActor
      x={props.x}
      y={props.y}
      pathLen={props.pathLen}
      cellsPerSec={props.cellsPerSec}
      seated={props.seated}
      walkRef={walkRef}
      figure={
        <PixelFigure
          look={props.look}
          role={props.role}
          seated={props.seated}
          carrying={props.carrying}
          walkRef={walkRef}
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
        if (guest.stage === "queue") return null;
        const look = GUEST_PALETTE[guest.id % GUEST_PALETTE.length];
        const moving = guest.path.length > 0;
        const seated = guest.tableId != null && !moving && SEATED.has(guest.stage);
        const task = taskByGuest.get(guest.id);
        const stageBubble = STAGE_BUBBLE[guest.stage];
        const showBubble =
          (task && TASK_LABEL[task.kind]) ||
          (stageBubble &&
            !task &&
            guest.stage !== "seating" &&
            guest.stage !== "leaving");
        return (
          <ActorWithWalk
            key={`g-${guest.id}`}
            x={guest.x}
            y={guest.y}
            pathLen={guest.path.length}
            cellsPerSec={guestSpeed}
            seated={!!seated}
            look={look}
            role="guest"
            overlay={
              showBubbles && showBubble ? (
                <SpriteLabel
                  kind="bubble"
                  text={task ? TASK_LABEL[task.kind] : String(stageBubble)}
                  position={[0, seated ? 1.25 : 1.55, 0]}
                  scale={[1.15, 0.36, 1]}
                />
              ) : null
            }
          />
        );
      })}
      {staff.map((s) => {
        if (s.onLeave) return null;
        const task = s.taskId != null ? taskById.get(s.taskId) : undefined;
        const carrying = task?.kind === "serve" || task?.kind === "deliverOrder";
        const look: Look =
          s.role === "chef"
            ? { skin: "#efc49a", hair: "#2a2218", shirt: "#f4f0e6", pants: "#3a3a42", hairStyle: "short" }
            : { skin: "#efc49a", hair: "#1e1812", shirt: "#f7f4ec", pants: "#2f4a3d", hairStyle: "short" };
        return (
          <ActorWithWalk
            key={`s-${s.id}`}
            x={s.x}
            y={s.y}
            pathLen={s.path.length}
            cellsPerSec={staffCellsPerSec(s, simSpeed || 1)}
            seated={false}
            look={look}
            role={s.role}
            carrying={carrying}
            overlay={
              showBubbles && task ? (
                <SpriteLabel
                  kind="bubble"
                  text={TASK_LABEL[task.kind]}
                  position={[0, 1.55, 0]}
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
