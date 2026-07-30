"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { memo, Suspense, useLayoutEffect, useMemo } from "react";
import type { CellItem, EntranceStyle, FloorStyle, Guest, Staff, Task, Tool, WallStyle } from "../types";
import { BuildingShell } from "./building";
import { ActorsLayer } from "./characters";
import { DecorProps, FurnitureLayer } from "./furniture";
import { tableFoodFor } from "./tableFood";

const CAMERA_CONFIG = { position: [12, 14, 12] as [number, number, number], zoom: 28, near: -80, far: 200, up: [0, 1, 0] as [number, number, number] };
const GL_CONFIG = { antialias: true, alpha: false, powerPreference: "default" as const };
const CANVAS_DPR: [number, number] = [1, 1.25];
const RESIZE_CONFIG = { scroll: false, debounce: { scroll: 0, resize: 0 } };

export type SceneProps = {
  items: CellItem[];
  guests: Guest[];
  staff: Staff[];
  tasks: Task[];
  tool: Tool;
  locationLabel: string;
  restaurantName: string;
  /** 游戏倍速，用于渲染层匀速移动 */
  simSpeed: number;
  onCellClick: (x: number, y: number) => void;
  floorStyle?: FloorStyle;
  wallStyle?: WallStyle;
  entranceStyle?: EntranceStyle;
  showBubbles?: boolean;
};

const Lights = memo(function Lights() {
  return (
    <>
      <ambientLight intensity={0.42} color="#fff4e0" />
      <hemisphereLight args={["#c8e4f8", "#6a5040", 0.35]} />
      <directionalLight
        castShadow
        position={[8, 14, 6]}
        intensity={1.35}
        color="#fff0d0"
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-6, 6, -4]} intensity={0.25} color="#a8c8e8" />
    </>
  );
});

const CameraRig = memo(function CameraRig() {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    camera.position.set(12, 14, 12);
    camera.lookAt(0, 0.4, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return (
    <OrbitControls
      makeDefault
      enablePan
      enableZoom
      minZoom={16}
      maxZoom={60}
      maxPolarAngle={Math.PI / 2.35}
      minPolarAngle={Math.PI / 4.5}
      target={[0, 0.4, 0]}
    />
  );
});

function World({
  items,
  guests,
  staff,
  tasks,
  tool,
  locationLabel,
  restaurantName,
  simSpeed,
  onCellClick,
  floorStyle = "wood",
  wallStyle = "cream",
  entranceStyle = "classic",
  showBubbles = true,
}: SceneProps) {
  const foodById = useMemo(() => {
    const m = new Map<number, ReturnType<typeof tableFoodFor>>();
    for (const g of guests) {
      if (g.tableId == null) continue;
      if (g.stage === "order" || g.stage === "waitingCook" || g.stage === "waitingServe" || g.stage === "eat") {
        m.set(g.tableId, tableFoodFor(g.stage));
      }
    }
    return m;
  }, [guests]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const taskByGuest = useMemo(() => {
    const m = new Map<number, Task>();
    for (const t of tasks) {
      if (t.guestId < 0) continue;
      if (!m.has(t.guestId) || (t.assigneeId != null && m.get(t.guestId)?.assigneeId == null)) {
        m.set(t.guestId, t);
      }
    }
    return m;
  }, [tasks]);

  const buildable = tool !== "select";
  const staticEnvironment = useMemo(
    () => (
      <>
        <BuildingShell
          locationLabel={locationLabel}
          restaurantName={restaurantName}
          buildable={buildable}
          onCellClick={onCellClick}
          floorStyle={floorStyle}
          wallStyle={wallStyle}
          entranceStyle={entranceStyle}
        />
        <DecorProps />
      </>
    ),
    [
      buildable,
      entranceStyle,
      floorStyle,
      locationLabel,
      onCellClick,
      restaurantName,
      wallStyle,
    ],
  );

  return (
    <>
      <CameraRig />
      <Lights />
      {staticEnvironment}
      <FurnitureLayer items={items} foodById={foodById} />
      <ActorsLayer
        guests={guests}
        staff={staff}
        simSpeed={simSpeed}
        taskByGuest={taskByGuest}
        taskById={taskById}
        showBubbles={showBubbles}
      />
    </>
  );
}

export default function RestaurantScene(props: SceneProps) {
  return (
    <div className="r3f-stage iso-world">
      <Canvas
        className="r3f-canvas"
        orthographic
        camera={CAMERA_CONFIG}
        shadows="basic"
        dpr={CANVAS_DPR}
        gl={GL_CONFIG}
        resize={RESIZE_CONFIG}
        onCreated={({ camera, gl }) => {
          gl.setClearColor("#6aa8c8");
          gl.domElement.style.display = "block";
          camera.lookAt(0, 0.4, 0);
          camera.updateProjectionMatrix();
        }}
      >
        <Suspense fallback={null}>
          <World {...props} />
        </Suspense>
      </Canvas>
      <div className="scene-hint" aria-hidden>
        拖拽旋转 · 滚轮缩放
      </div>
    </div>
  );
}
