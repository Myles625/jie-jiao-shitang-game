import type { CellItem, Vec2 } from "./types";
import { H, W } from "./types";

const BLOCKING = new Set(["table1", "table2", "table4", "table6", "kitchen", "cashier", "toilet"]);

export function isWalkable(items: CellItem[], x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  const item = items.find((i) => i.x === x && i.y === y);
  if (!item) return true;
  return !BLOCKING.has(item.type);
}

export function neighbors(x: number, y: number): Vec2[] {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ];
}

/** BFS shortest path. Start may be blocked (entity already there); goal must be walkable unless allowGoalBlocked. */
export function findPath(
  items: CellItem[],
  start: Vec2,
  goal: Vec2,
  opts?: { allowGoalBlocked?: boolean },
): Vec2[] {
  const sx = Math.round(start.x);
  const sy = Math.round(start.y);
  const gx = Math.round(goal.x);
  const gy = Math.round(goal.y);
  if (sx === gx && sy === gy) return [];

  const key = (x: number, y: number) => `${x},${y}`;
  const walk = (x: number, y: number) => {
    if (x === gx && y === gy && opts?.allowGoalBlocked) return x >= 0 && y >= 0 && x < W && y < H;
    return isWalkable(items, x, y);
  };

  const queue: Vec2[] = [{ x: sx, y: sy }];
  const came = new Map<string, string | null>();
  came.set(key(sx, sy), null);

  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.x === gx && cur.y === gy) {
      const path: Vec2[] = [];
      let k: string | null = key(gx, gy);
      while (k) {
        const [px, py] = k.split(",").map(Number);
        path.push({ x: px, y: py });
        k = came.get(k) ?? null;
      }
      path.reverse();
      path.shift(); // drop start
      return path;
    }
    for (const n of neighbors(cur.x, cur.y)) {
      const nk = key(n.x, n.y);
      if (came.has(nk)) continue;
      if (!walk(n.x, n.y) && !(n.x === sx && n.y === sy)) continue;
      came.set(nk, key(cur.x, cur.y));
      queue.push(n);
    }
  }
  return [];
}

/** Prefer walkable adjacent cells around furniture. */
export function standSpots(items: CellItem[], fx: number, fy: number): Vec2[] {
  return neighbors(fx, fy).filter((p) => isWalkable(items, p.x, p.y));
}

export function nearestStandSpot(items: CellItem[], from: Vec2, fx: number, fy: number): Vec2 | null {
  const spots = standSpots(items, fx, fy);
  if (!spots.length) return null;
  let best: Vec2 | null = null;
  let bestLen = Infinity;
  for (const s of spots) {
    const path = findPath(items, from, s);
    if (path.length < bestLen || (path.length === bestLen && best === null)) {
      // empty path with same cell counts as 0
      const dist = path.length || (Math.round(from.x) === s.x && Math.round(from.y) === s.y ? 0 : 999);
      if (dist < bestLen) {
        bestLen = dist;
        best = s;
      }
    }
  }
  // if no path, still return closest manhattan walkable
  if (!best) {
    spots.sort(
      (a, b) =>
        Math.abs(a.x - from.x) + Math.abs(a.y - from.y) - (Math.abs(b.x - from.x) + Math.abs(b.y - from.y)),
    );
    return spots[0] ?? null;
  }
  return best;
}

export function entranceCell(): Vec2 {
  return { x: Math.floor(W / 2), y: H - 1 };
}

export function queueCell(index: number): Vec2 {
  // Outside along bottom edge, slightly right of entrance conceptually (same grid, bottom row)
  const base = entranceCell();
  return { x: Math.min(W - 1, base.x + 1 + (index % 3)), y: base.y };
}

export function stepAlongPath(
  x: number,
  y: number,
  path: Vec2[],
  speed: number,
): { x: number; y: number; path: Vec2[] } {
  if (!path.length) return { x, y, path };
  let nx = x;
  let ny = y;
  let remaining = Math.max(0.15, speed);
  let nextPath = [...path];
  while (remaining > 0 && nextPath.length) {
    const target = nextPath[0];
    const dx = target.x - nx;
    const dy = target.y - ny;
    const dist = Math.hypot(dx, dy);
    if (dist <= remaining || dist < 0.05) {
      nx = target.x;
      ny = target.y;
      remaining -= dist;
      nextPath.shift();
    } else {
      nx += (dx / dist) * remaining;
      ny += (dy / dist) * remaining;
      remaining = 0;
    }
  }
  return { x: nx, y: ny, path: nextPath };
}
