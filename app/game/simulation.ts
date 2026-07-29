import {
  chooseDishForGuest,
  computeDayCosts,
  patienceDecay,
  satisfactionScore,
  spawnRateModifier,
  updateStars,
} from "./economy";
import { getLocation, pickTaste } from "./locations";
import {
  entranceCell,
  findPath,
  isWalkable,
  nearestStandSpot,
  queueCell,
  stepAlongPath,
} from "./pathfinding";
import type {
  CellItem,
  DaySummary,
  GameState,
  Guest,
  Staff,
  Task,
  TaskKind,
  Vec2,
} from "./types";

const TASK_PRIORITY: Record<TaskKind, number> = {
  seat: 60,
  takeOrder: 70,
  deliverOrder: 75,
  cook: 80,
  serve: 85,
  checkout: 90,
};

const WAITER_NAMES = ["小陈", "阿美", "小林", "阿凯", "小周", "阿宁"];
const CHEF_NAMES = ["王厨", "李厨", "张厨", "陈厨", "周厨"];

function cloneState(state: GameState): GameState {
  return {
    ...state,
    items: state.items.map((i) => ({ ...i })),
    dishes: state.dishes.map((d) => ({ ...d })),
    guests: state.guests.map((g) => ({ ...g, path: [...g.path] })),
    staff: state.staff.map((s) => ({ ...s, path: [...s.path] })),
    tasks: state.tasks.map((t) => ({ ...t })),
    regulars: state.regulars.map((r) => ({ ...r })),
    ratingHistory: [...state.ratingHistory],
    atmosphere: { ...state.atmosphere },
  };
}

export function createStaff(
  role: "waiter" | "chef",
  id: number,
  wage: number,
  items: CellItem[],
): Staff {
  const names = role === "waiter" ? WAITER_NAMES : CHEF_NAMES;
  const name = names[id % names.length] + (id > names.length ? String(id % 10) : "");
  const kitchen = items.find((i) => i.type === "kitchen");
  const start =
    role === "chef" && kitchen
      ? nearestStandSpot(items, entranceCell(), kitchen.x, kitchen.y) ?? entranceCell()
      : entranceCell();
  return {
    id,
    name,
    role,
    exp: 0,
    wage,
    mood: 78,
    onLeave: false,
    lowMoodDays: 0,
    x: start.x,
    y: start.y,
    path: [],
  };
}

function staffSpeed(s: Staff): number {
  const expBonus = 1 + Math.min(0.45, s.exp / 120);
  const moodMul = s.mood < 35 ? 0.55 : s.mood < 55 ? 0.78 : 1;
  return 0.55 * expBonus * moodMul;
}

function ensureTask(state: GameState, kind: TaskKind, guestId: number): void {
  if (state.tasks.some((t) => t.guestId === guestId && t.kind === kind)) return;
  state.tasks.push({
    id: state.nextId++,
    kind,
    guestId,
    priority: TASK_PRIORITY[kind],
    progress: 0,
  });
}

function tableCapacity(type: string): number {
  return type === "table4" ? 4 : 2;
}

function guestAt(state: GameState, id: number): Guest | undefined {
  return state.guests.find((g) => g.id === id);
}

function moveEntity(
  items: CellItem[],
  ent: { x: number; y: number; path: Vec2[] },
  speed: number,
): void {
  const stepped = stepAlongPath(ent.x, ent.y, ent.path, speed);
  ent.x = stepped.x;
  ent.y = stepped.y;
  ent.path = stepped.path;
}

function setPathTo(items: CellItem[], ent: { x: number; y: number; path: Vec2[] }, goal: Vec2): boolean {
  const path = findPath(items, { x: ent.x, y: ent.y }, goal);
  if (!path.length && (Math.round(ent.x) !== goal.x || Math.round(ent.y) !== goal.y)) {
    // try allow slight snap if adjacent unreachable due to start on blocked — rare
    return false;
  }
  ent.path = path;
  return true;
}

function arrived(ent: { x: number; y: number; path: Vec2[] }, goal?: Vec2 | null): boolean {
  if (!goal) return ent.path.length === 0;
  return ent.path.length === 0 && Math.hypot(ent.x - goal.x, ent.y - goal.y) < 0.35;
}

function taskTarget(state: GameState, task: Task): Vec2 | null {
  const guest = guestAt(state, task.guestId);
  if (!guest) return null;
  const items = state.items;

  if (task.kind === "seat") {
    return queueCell(0);
  }
  if (task.kind === "takeOrder" || task.kind === "serve") {
    const table = items.find((i) => i.id === guest.tableId);
    if (!table) return null;
    return nearestStandSpot(items, { x: guest.x, y: guest.y }, table.x, table.y);
  }
  if (task.kind === "deliverOrder" || task.kind === "cook") {
    const kitchen = items.find((i) => i.type === "kitchen");
    if (!kitchen) return null;
    return nearestStandSpot(items, { x: guest.x, y: guest.y }, kitchen.x, kitchen.y);
  }
  if (task.kind === "checkout") {
    const cashier = items.find((i) => i.type === "cashier");
    if (!cashier) return entranceCell();
    return nearestStandSpot(items, { x: guest.x, y: guest.y }, cashier.x, cashier.y) ?? entranceCell();
  }
  return null;
}

function assignTasks(state: GameState): void {
  const free = state.staff.filter((s) => !s.onLeave && s.taskId == null);
  const pending = state.tasks
    .filter((t) => t.assigneeId == null)
    .sort((a, b) => b.priority - a.priority);

  for (const task of pending) {
    const candidates =
      task.kind === "cook"
        ? free.filter((s) => s.role === "chef")
        : free.filter((s) => s.role === "waiter");
    const worker = candidates[0];
    if (!worker) continue;
    task.assigneeId = worker.id;
    worker.taskId = task.id;
    const idx = free.findIndex((s) => s.id === worker.id);
    if (idx >= 0) free.splice(idx, 1);

    const target = taskTarget(state, task);
    if (target) {
      if (!setPathTo(state.items, worker, target)) {
        // path fail — release
        task.assigneeId = undefined;
        worker.taskId = undefined;
        free.push(worker);
      }
    }
  }
}

function completeTask(state: GameState, task: Task, worker: Staff): void {
  const guest = guestAt(state, task.guestId);
  worker.taskId = undefined;
  worker.exp += 1.2;
  worker.mood = Math.min(100, worker.mood + 0.4);
  state.tasks = state.tasks.filter((t) => t.id !== task.id);

  if (!guest) return;

  if (task.kind === "seat") {
    const occupied = new Set(
      state.guests.filter((g) => g.tableId && g.stage !== "queue" && g.stage !== "leaving").map((g) => g.tableId),
    );
    const table = state.items.find(
      (t) => (t.type === "table2" || t.type === "table4") && !occupied.has(t.id) && tableCapacity(t.type) >= guest.size,
    );
    if (!table) {
      guest.taskQueued = false;
      return;
    }
    guest.tableId = table.id;
    guest.stage = "seating";
    guest.taskQueued = false;
    const seat = nearestStandSpot(state.items, { x: guest.x, y: guest.y }, table.x, table.y);
    if (seat) setPathTo(state.items, guest, seat);
    else {
      guest.x = table.x;
      guest.y = table.y;
      guest.path = [];
    }
  } else if (task.kind === "takeOrder") {
    const dish = chooseDishForGuest(state.dishes, guest);
    if (!dish) {
      guest.mood -= 25;
      guest.patience -= 20;
      guest.taskQueued = false;
      ensureTask(state, "takeOrder", guest.id);
      return;
    }
    guest.dish = dish.name;
    guest.stage = "waitingCook";
    guest.taskQueued = false;
    ensureTask(state, "deliverOrder", guest.id);
  } else if (task.kind === "deliverOrder") {
    guest.stage = "waitingCook";
    guest.taskQueued = false;
    ensureTask(state, "cook", guest.id);
  } else if (task.kind === "cook") {
    state.dishes = state.dishes.map((d) =>
      d.name === guest.dish ? { ...d, stock: Math.max(0, d.stock - guest.size) } : d,
    );
    guest.stage = "waitingServe";
    guest.taskQueued = false;
    ensureTask(state, "serve", guest.id);
  } else if (task.kind === "serve") {
    guest.stage = "eat";
    guest.progress = 0;
    guest.taskQueued = false;
  } else if (task.kind === "checkout") {
    finishGuest(state, guest);
  }
}

function finishGuest(state: GameState, guest: Guest): void {
  const dish = state.dishes.find((d) => d.name === guest.dish);
  const bill = (dish?.price ?? 0) * guest.size;
  const overBudget = bill > guest.budget;
  const score = satisfactionScore(guest, dish, overBudget);
  state.cash += bill;
  state.revenue += bill;
  state.served += guest.size;
  state.rating = Math.max(1, Math.min(5, state.rating * 0.985 + (score / 20) * 0.015));

  if (guest.regularId) {
    const reg = state.regulars.find((r) => r.id === guest.regularId);
    if (reg) {
      reg.memory = score;
      reg.visits += 1;
    }
  } else if (score >= 78 && Math.random() < 0.35) {
    const id = `r${state.nextId++}`;
    state.regulars.push({
      id,
      name: `常客${state.regulars.length + 1}`,
      taste: guest.taste,
      memory: score,
      visits: 1,
    });
    state.toast = `新的老顾客记住了这家店`;
  } else if (guest.memory != null && guest.memory >= 70) {
    state.toast = `老顾客又来了，心情不错`;
  }

  guest.stage = "leaving";
  guest.tableId = undefined;
  guest.taskQueued = false;
  setPathTo(state.items, guest, entranceCell());
}

function wanderIdle(state: GameState, s: Staff): void {
  if (s.path.length || Math.random() > 0.08) return;
  if (s.role === "chef") {
    const kitchen = state.items.find((i) => i.type === "kitchen");
    if (!kitchen) return;
    const spot = nearestStandSpot(state.items, { x: s.x, y: s.y }, kitchen.x, kitchen.y);
    if (spot) setPathTo(state.items, s, spot);
    return;
  }
  const tables = state.items.filter((i) => i.type === "table2" || i.type === "table4");
  const pick = Math.random() < 0.45 || !tables.length ? entranceCell() : tables[Math.floor(Math.random() * tables.length)];
  const goal =
    "type" in pick
      ? nearestStandSpot(state.items, { x: s.x, y: s.y }, pick.x, pick.y)
      : pick;
  if (goal) setPathTo(state.items, s, goal);
}

function spawnGuest(state: GameState): void {
  const tables = state.items.filter((i) => i.type === "table2" || i.type === "table4");
  const kitchens = state.items.filter((i) => i.type === "kitchen").length;
  if (!tables.length || !kitchens || state.guests.length > 16) return;

  const loc = getLocation(state.locationId);
  const sizes = [1, 1, 2, 2, 2, 3, 4];
  const size = sizes[Math.floor(Math.random() * sizes.length)];
  const taste = pickTaste(loc.tasteWeights);
  let regularId: string | undefined;
  let memory: number | undefined;
  if (state.regulars.length && Math.random() < 0.22) {
    const reg = state.regulars[Math.floor(Math.random() * state.regulars.length)];
    regularId = reg.id;
    memory = reg.memory;
  }
  const qIndex = state.guests.filter((g) => g.stage === "queue").length;
  const pos = queueCell(qIndex);
  const budgetBase = (45 + size * 28 + Math.random() * 40) * loc.budgetMul;
  const patience = 70 + Math.random() * 30 + (memory && memory > 70 ? 10 : 0);

  state.guests.push({
    id: state.nextId++,
    size,
    mood: 100,
    patience,
    taste,
    budget: budgetBase,
    stage: "queue",
    progress: 0,
    x: pos.x,
    y: pos.y,
    path: [],
    regularId,
    memory,
    taskQueued: false,
  });
  if (regularId) state.toast = `老顾客光临：想吃点${tasteLabel(taste)}`;
}

function tasteLabel(t: string): string {
  const map: Record<string, string> = {
    western: "西式",
    japanese: "日式",
    cafe: "轻食咖啡",
    value: "性价比",
    formal: "正式菜",
  };
  return map[t] ?? t;
}

function processStaffTasks(state: GameState, speed: number): void {
  for (const worker of state.staff) {
    if (worker.onLeave) continue;
    moveEntity(state.items, worker, staffSpeed(worker) * (0.7 + speed * 0.15));

    if (worker.taskId == null) {
      wanderIdle(state, worker);
      continue;
    }
    const task = state.tasks.find((t) => t.id === worker.taskId);
    if (!task) {
      worker.taskId = undefined;
      continue;
    }
    const target = taskTarget(state, task);
    if (target && !arrived(worker, target)) {
      if (!worker.path.length) setPathTo(state.items, worker, target);
      continue;
    }
    // work on task
    const rate = 18 * staffSpeed(worker) * (speed || 1);
    task.progress += rate;
    if (task.progress >= 100) completeTask(state, task, worker);
  }
}

function advanceGuests(state: GameState, speed: number): void {
  const decay = patienceDecay(state.atmosphere);
  const leaving: number[] = [];

  for (const guest of state.guests) {
    moveEntity(state.items, guest, 0.45 * (0.8 + speed * 0.1));

    if (guest.stage === "leaving") {
      if (arrived(guest, entranceCell()) || guest.path.length === 0) leaving.push(guest.id);
      continue;
    }

    if (guest.stage === "queue") {
      guest.patience -= decay * 1.2;
      guest.mood -= decay * 0.9;
      if (!guest.taskQueued) {
        ensureTask(state, "seat", guest.id);
        guest.taskQueued = true;
      }
      if (guest.patience <= 0 || guest.mood <= 0) {
        state.rating = Math.max(1, state.rating - 0.04);
        state.toast = "有客人等不及离开了";
        leaving.push(guest.id);
        state.tasks = state.tasks.filter((t) => t.guestId !== guest.id);
      }
      continue;
    }

    if (guest.stage === "seating") {
      if (arrived(guest, null) || guest.path.length === 0) {
        guest.stage = "order";
        guest.taskQueued = false;
        ensureTask(state, "takeOrder", guest.id);
        guest.taskQueued = true;
      }
      continue;
    }

    if (guest.stage === "order" || guest.stage === "waitingCook" || guest.stage === "waitingServe" || guest.stage === "pay") {
      guest.patience -= decay * 0.7;
      guest.mood -= decay * 0.45;
      if (guest.patience <= 0) {
        state.rating = Math.max(1, state.rating - 0.03);
        state.toast = "客人因等待过久离店";
        if (guest.tableId) {
          /* free table */
        }
        guest.stage = "leaving";
        guest.tableId = undefined;
        state.tasks = state.tasks.filter((t) => t.guestId !== guest.id);
        const staffHolding = state.staff.filter((s) => s.taskId && !state.tasks.some((t) => t.id === s.taskId));
        for (const s of staffHolding) s.taskId = undefined;
        setPathTo(state.items, guest, entranceCell());
      }
      continue;
    }

    if (guest.stage === "eat") {
      guest.progress += 10 * (speed || 1);
      if (guest.progress >= 100) {
        guest.stage = "pay";
        guest.progress = 0;
        guest.taskQueued = false;
        // walk toward cashier while waiting checkout
        const cashier = state.items.find((i) => i.type === "cashier");
        if (cashier) {
          const spot = nearestStandSpot(state.items, { x: guest.x, y: guest.y }, cashier.x, cashier.y);
          if (spot) setPathTo(state.items, guest, spot);
        }
        ensureTask(state, "checkout", guest.id);
        guest.taskQueued = true;
      }
    }
  }

  if (leaving.length) {
    state.guests = state.guests.filter((g) => !leaving.includes(g.id));
  }
}

function tickAtmosphere(state: GameState): void {
  if (state.atmosphere.cleanliness > 15) {
    state.atmosphere.cleanliness = Math.max(10, state.atmosphere.cleanliness - 0.08);
  }
}

export function tick(prev: GameState, tickIndex: number): GameState {
  const state = cloneState(prev);
  const speed = state.speed;
  if (!speed) return state;

  state.minute += 5 * speed;
  if (state.minute >= 23 * 60) {
    state.minute = 23 * 60;
    state.speed = 0;
  }

  const spawnEvery = Math.max(2, Math.round(7 / spawnRateModifier(state) - speed - Math.floor(state.rating) * 0.3));
  if (tickIndex % spawnEvery === 0) spawnGuest(state);

  assignTasks(state);
  processStaffTasks(state, speed);
  advanceGuests(state, speed);
  tickAtmosphere(state);

  return state;
}

export function closeDay(state: GameState): { state: GameState; summary: DaySummary } {
  const next = cloneState(state);
  const costs = computeDayCosts(next);
  const profit = next.revenue - costs.total;
  next.cash -= costs.total;
  next.totalProfit += profit;
  next.totalServed += next.served;
  next.guests = [];
  next.tasks = [];
  for (const s of next.staff) {
    s.taskId = undefined;
    s.path = [];
    // wage vs expected
    const fair = next.baseWage;
    if (s.wage < fair - 80) s.mood = Math.max(10, s.mood - 12);
    else if (s.wage >= fair + 100) s.mood = Math.min(100, s.mood + 6);
    else s.mood = Math.max(10, s.mood - 2);

    if (s.onLeave) {
      s.mood = Math.min(100, s.mood + 28);
      s.onLeave = false;
    }

    if (s.mood < 40) s.lowMoodDays += 1;
    else s.lowMoodDays = 0;

    if (s.lowMoodDays >= 2 && Math.random() < 0.35 + (40 - s.mood) / 100) {
      next.toast = `${s.name}因心情低落离职了`;
      next.staff = next.staff.filter((x) => x.id !== s.id);
    }
  }

  next.ratingHistory = [...next.ratingHistory.slice(-9), next.rating];
  next.stars = updateStars(next);
  next.toast = next.toast.includes("离职") ? next.toast : "今日营业结束，账簿已经结算";

  const summary: DaySummary = {
    revenue: next.revenue,
    guests: next.served,
    rating: next.rating,
    costs: costs.total,
    profit,
    stars: next.stars,
  };
  return { state: next, summary };
}

export function nextDay(state: GameState): GameState {
  const next = cloneState(state);
  next.day += 1;
  next.minute = 11 * 60;
  next.revenue = 0;
  next.served = 0;
  next.guests = [];
  next.tasks = [];
  next.dishes = next.dishes.map((d) => ({ ...d, stock: Math.max(d.stock, 30) }));
  next.toast = "新的一天，准备开门迎客";
  for (const s of next.staff) {
    s.taskId = undefined;
    s.path = [];
  }
  return next;
}

export function relocate(state: GameState, targetId: string): GameState {
  const next = cloneState(state);
  const loc = getLocation(targetId as never);
  next.cash -= loc.relocateCash;
  next.locationId = loc.id;
  next.guests = [];
  next.tasks = [];
  next.toast = `迁店成功：${loc.name} · ${loc.sizeLabel}`;
  // keep furniture; staff reset positions near entrance
  for (const s of next.staff) {
    const e = entranceCell();
    s.x = e.x;
    s.y = e.y;
    s.path = [];
    s.taskId = undefined;
  }
  return next;
}

export function cleanShop(state: GameState): GameState {
  const next = cloneState(state);
  if (next.cash < 200) {
    next.toast = "打扫需要 ¥200";
    return next;
  }
  next.cash -= 200;
  next.atmosphere.cleanliness = Math.min(100, next.atmosphere.cleanliness + 35);
  next.toast = "店面打扫干净了";
  return next;
}

export { isWalkable };
