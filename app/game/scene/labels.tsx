"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function makeShopSignTexture(title: string, subtitle: string) {
  return canvasTexture(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#f0e6c8";
      ctx.font = `800 ${title.length > 4 ? 30 : 36}px "Hiragino Mincho ProN", "Songti SC", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#0a100c";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 1;
      ctx.fillText(title, w / 2, h * 0.38);
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = "#a8b8b0";
      ctx.font = "600 16px monospace";
      ctx.fillText(subtitle, w / 2, h * 0.72);
    },
    320,
    96,
  );
}

export function makeKanbanTexture(label: string) {
  return canvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = "#c34f3a";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#1e1510";
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.fillStyle = "#f8f0e0";
      ctx.font = "800 42px \"Hiragino Mincho ProN\", \"Songti SC\", serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const chars = [...label];
      const step = h / (chars.length + 1);
      chars.forEach((ch, i) => {
        ctx.fillText(ch, w / 2, step * (i + 1));
      });
    },
    64,
    Math.max(96, label.length * 56),
  );
}

export function makeBubbleTexture(text: string) {
  return canvasTexture(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const padX = 14;
      ctx.font = "700 28px \"PingFang SC\", \"Hiragino Sans GB\", sans-serif";
      const tw = Math.ceil(ctx.measureText(text).width);
      const boxW = Math.min(w - 8, tw + padX * 2);
      const boxH = 40;
      const x = (w - boxW) / 2;
      const y = 8;
      ctx.fillStyle = "#1e2a24";
      ctx.strokeStyle = "#c9a84a";
      ctx.lineWidth = 3;
      ctx.fillRect(x, y, boxW, boxH);
      ctx.strokeRect(x, y, boxW, boxH);
      // caret
      ctx.beginPath();
      ctx.moveTo(w / 2 - 8, y + boxH);
      ctx.lineTo(w / 2, y + boxH + 10);
      ctx.lineTo(w / 2 + 8, y + boxH);
      ctx.closePath();
      ctx.fillStyle = "#1e2a24";
      ctx.fill();
      ctx.fillStyle = "#f0e6c8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, w / 2, y + boxH / 2 + 1);
    },
    256,
    72,
  );
}

/** Screen-facing label sprite — never uses DOM/Html (avoids ortho+CSS matrix strip bugs). */
export function SpriteLabel({
  text,
  kind,
  position,
  scale = [1, 0.35, 1],
}: {
  text: string;
  kind: "bubble" | "shop" | "kanban";
  position: [number, number, number];
  scale?: [number, number, number];
}) {
  const map = useMemo(() => {
    if (kind === "bubble") return makeBubbleTexture(text);
    if (kind === "kanban") return makeKanbanTexture(text);
    const [title, ...rest] = text.split("\n");
    return makeShopSignTexture(title, rest.join("\n"));
  }, [text, kind]);

  useEffect(() => () => map.dispose(), [map]);

  return (
    <sprite position={position} scale={scale} renderOrder={20}>
      <spriteMaterial map={map} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

export function ShopSignPlane({
  title,
  subtitle,
  position,
}: {
  title: string;
  subtitle: string;
  position: [number, number, number];
}) {
  const map = useMemo(() => makeShopSignTexture(title, subtitle), [title, subtitle]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh position={position} renderOrder={5}>
      <planeGeometry args={[2.8, 0.55]} />
      <meshBasicMaterial map={map} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function KanbanPlane({
  label,
  position,
}: {
  label: string;
  position: [number, number, number];
}) {
  const map = useMemo(() => makeKanbanTexture(label), [label]);
  useEffect(() => () => map.dispose(), [map]);
  const h = Math.max(0.9, label.length * 0.55);
  return (
    <sprite position={position} scale={[0.4, h, 1]} renderOrder={4}>
      <spriteMaterial map={map} transparent depthTest depthWrite={false} toneMapped={false} />
    </sprite>
  );
}
