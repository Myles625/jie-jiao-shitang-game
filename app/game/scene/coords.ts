import { H, W } from "../types";

/** 一格世界单位；餐厅原点在地板中心 */
export const CELL = 1;
export const FLOOR_Y = 0;

export function gridToWorld(x: number, y: number, yLift = 0) {
  return {
    x: (x - (W - 1) / 2) * CELL,
    y: FLOOR_Y + yLift,
    z: (y - (H - 1) / 2) * CELL,
  };
}

export function worldToGrid(wx: number, wz: number) {
  const x = Math.round(wx / CELL + (W - 1) / 2);
  const y = Math.round(wz / CELL + (H - 1) / 2);
  return { x, y };
}

export function isKitchenZone(x: number, y: number) {
  return x <= 3 && y <= 2;
}

export const ROOM = {
  w: W * CELL,
  d: H * CELL,
  wallH: 2.35,
  cutH: 1.15,
};
