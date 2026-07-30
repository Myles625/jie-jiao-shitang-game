import {
  alcoholStockoutPenalty,
  chooseDishForGuest,
  chooseDrinkForGuest,
  computeDayCosts,
  dailyGoalFor,
  monthEndBonus,
  patienceDecay,
  satisfactionScore,
  spawnRateModifier,
  updateStars,
} from "./economy";
import { rollDailyEvent } from "./events";
import { calendarFromDay, getLocation, pickTaste } from "./locations";
import { entranceCell, findPath, nearestStandSpot, queueCell, stepAlongPath } from "./pathfinding";
import type { CellItem, DaySummary, GameState, Guest, Staff, Task, TaskKind, Vec2 } from "./types";
import { SECRET_DISH_NAME } from "./types";

const TASK_PRIORITY: Record<TaskKind, number> = {
  seat: 60,
  takeOrder: 70,
  deliverOrder: 75,
  cook: 80,
  serve: 85,
  checkout: 90,
  clean: 40,
};

const WAITER_NAMES = ["唐泽", "春原", "工藤", "秋原", "小平", "堀切", "仓户", "柳泽", "小陈", "阿美"];
const CHEF_NAMES = ["三门", "王厨", "李厨", "张厨", "陈厨"];

const TABLE_TYPES = new Set(["table1", "table2", "table4", "table6"]);

function cloneState(state: GameState): GameState {
  return {
    ...state,
    items: state.items.map((i) => ({ ...i })),
    dishes: state.dishes.map((d) => ({ ...d, tags: [...d.tags] })),
    guests: state.guests.map((g) => ({ ...g, path: [...g.path] })),
    staff: state.staff.map((s) => ({ ...s, path: [...s.path] })),
    tasks: state.tasks.map((t) => ({ ...t })),
    regulars: state.regulars.map((r) => ({ ...r })),
    ratingHistory: [...state.ratingHistory],
    atmosphere: { ...state.atmosphere },
    security: { ...state.security },
    settings: { ...state.settings },
  };
}

export function createStaff(role: "waiter" | "chef", id: number, wage: number, items: CellItem[]): Staff {
  const names = role === "waiter" ? WAITER_NAMES : CHEF_NAMES;
  const name = names[id % names.length];
  const kitchen = items.find((i) => i.type === "kitchen");
  const start =
    role === "chef" && kitchen
      ? (nearestStandSpot(items, entranceCell(), kitchen.x, kitchen.y) ?? entranceCell())
      : entranceCell();
  return {
    id,
    name,
    role,
    exp: Math.random() * 8,
    wage,
    mood: 78,
    onLeave: false,
    lowMoodDays: 0,
    x: start.x,
    y: start.y,
    path: [],
    cleanInterval: role === "waiter" ? 240 : 0,
    lastCleanMinute: 0,
    speedStat: 55 + Math.floor(Math.random() * 40),
    receptionStat: role === "waiter" ? 50 + Math.floor(Math.random() * 45) : 30,
    charm: role === "waiter" ? 45 + Math.floor(Math.random() * 40) : 35 + Math.floor(Math.random() * 25),
    learnRate: 40 + Math.floor(Math.random() * 45),
    endurance: 45 + Math.floor(Math.random() * 40),
    cookSkill: role === "chef" ? 50 + Math.floor(Math.random() * 40) : 15 + Math.floor(Math.random() * 20),
  };
}

function staffSpeed(s: Staff): number {
  const expBonus = 1 + Math.min(0.5, s.exp / 100);
  const moodMul = s.mood < 35 ? 0.55 : s.mood < 55 ? 0.78 : 1;
  const statMul = 0.7 + s.speedStat / 200;
  return 1.25 * expBonus * moodMul * statMul;
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
  if (type === "table1") return 1;
  if (type === "table2") return 2;
  if (type === "table4") return 4;
  if (type === "table6") return 6;
  return 0;
}

function isTable(type: string): boolean {
  return TABLE_TYPES.has(type);
}

/** 带位：按 buyOrder 从小到大；选能坐下且浪费最少的桌 */
function pickTableForGuest(state: GameState, guest: Guest): CellItem | undefined {
  const occupied = new Set(
    state.guests.filter((g) => g.tableId && g.stage !== "queue" && g.stage !== "leaving").map((g) => g.tableId),
  );
  const tables = state.items
    .filter((t) => isTable(t.type) && !occupied.has(t.id) && tableCapacity(t.type) >= guest.size)
    .sort((a, b) => a.buyOrder - b.buyOrder || tableCapacity(a.type) - tableCapacity(b.type));
  // 在购买顺序靠前的候选里，优先浪费座位最少的
  if (!tables.length) return undefined;
  const early = tables.slice(0, Math.min(4, tables.length));
  early.sort((a, b) => tableCapacity(a.type) - tableCapacity(b.type) || a.buyOrder - b.buyOrder);
  return early[0];
}

function guestAt(state: GameState, id: number): Guest | undefined {
  return state.guests.find((g) => g.id === id);
}

function moveEntity(items: CellItem[], ent: { x: number; y: number; path: Vec2[] }, speed: number): void {
  const stepped = stepAlongPath(ent.x, ent.y, ent.path, speed);
  ent.x = stepped.x;
  ent.y = stepped.y;
  ent.path = stepped.path;
}

function setPathTo(items: CellItem[], ent: { x: number; y: number; path: Vec2[] }, goal: Vec2): boolean {
  const path = findPath(items, { x: ent.x, y: ent.y }, goal);
  ent.path = path;
  return path.length > 0 || Math.hypot(ent.x - goal.x, ent.y - goal.y) < 0.35;
}

function arrived(ent: { x: number; y: number; path: Vec2[] }, goal?: Vec2 | null): boolean {
  if (!goal) return ent.path.length === 0;
  return ent.path.length === 0 && Math.hypot(ent.x - goal.x, ent.y - goal.y) < 0.35;
}

function taskTarget(state: GameState, task: Task): Vec2 | null {
  if (task.kind === "clean") {
    const toilet = state.items.find((i) => i.type === "toilet");
    if (toilet) return nearestStandSpot(state.items, entranceCell(), toilet.x, toilet.y);
    return entranceCell();
  }
  const guest = guestAt(state, task.guestId);
  if (!guest) return null;
  const items = state.items;

  if (task.kind === "seat") return queueCell(0);
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
  const pending = state.tasks.filter((t) => t.assigneeId == null).sort((a, b) => b.priority - a.priority);

  for (const task of pending) {
    const candidates =
      task.kind === "cook"
        ? free.filter((s) => s.role === "chef")
        : free.filter((s) => s.role === "waiter");
    // 接待任务优先高 receptionStat
    if (task.kind === "seat" || task.kind === "checkout") {
      candidates.sort((a, b) => b.receptionStat - a.receptionStat);
    }
    const worker = candidates[0];
    if (!worker) continue;
    const target = taskTarget(state, task);
    if (!target || !setPathTo(state.items, worker, target)) {
      state.toast = "服务动线被家具挡住了，暂停后调整桌椅或设备";
      continue;
    }
    task.assigneeId = worker.id;
    worker.taskId = task.id;
    const idx = free.findIndex((s) => s.id === worker.id);
    if (idx >= 0) free.splice(idx, 1);
  }
}

function completeTask(state: GameState, task: Task, worker: Staff): void {
  worker.taskId = undefined;
  worker.exp += 0.7 + worker.learnRate / 80;
  if (worker.role === "chef" && task.kind === "cook") {
    worker.cookSkill = Math.min(100, worker.cookSkill + 0.15 * (worker.learnRate / 60));
  }
  if (worker.role === "waiter") {
    worker.speedStat = Math.min(100, worker.speedStat + 0.04 * (worker.learnRate / 70));
    worker.receptionStat = Math.min(100, worker.receptionStat + 0.03 * (worker.learnRate / 70));
  }
  worker.mood = Math.min(100, worker.mood + 0.4);
  state.tasks = state.tasks.filter((t) => t.id !== task.id);

  if (task.kind === "clean") {
    state.atmosphere.cleanliness = Math.min(100, state.atmosphere.cleanliness + 18);
    for (const waiter of state.staff) {
      if (waiter.role === "waiter") waiter.lastCleanMinute = state.minute;
    }
    return;
  }

  const guest = guestAt(state, task.guestId);
  if (!guest) return;

  if (task.kind === "seat") {
    const table = pickTableForGuest(state, guest);
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
    const drink = chooseDrinkForGuest(state.dishes, guest, dish);
    if (drink) guest.drink = drink.name;
    // 酒水断货失望
    const alcPenalty = alcoholStockoutPenalty(state.dishes);
    if (alcPenalty) {
      guest.mood -= alcPenalty;
      guest.patience -= 8;
      if (Math.random() < 0.4) state.toast = "有酒水售罄，客人有些失望";
    }
    // 接待魅力影响心情
    guest.mood = Math.min(100, guest.mood + (worker.charm - 50) * 0.12);
    guest.stage = "waitingCook";
    guest.taskQueued = false;
    ensureTask(state, "deliverOrder", guest.id);
  } else if (task.kind === "deliverOrder") {
    guest.stage = "waitingCook";
    guest.taskQueued = false;
    ensureTask(state, "cook", guest.id);
  } else if (task.kind === "cook") {
    const dish = state.dishes.find((d) => d.name === guest.dish);
    const drink = state.dishes.find((d) => d.name === guest.drink);
    const cookMul = dish?.cookTime ?? 1;
    state.dayIngredientCost += (dish?.cost ?? 0) * guest.size + (drink?.cost ?? 0);
    // cookTime 已在进度里体现；此处扣库存
    state.dishes = state.dishes.map((d) => {
      if (d.name === guest.dish) return { ...d, stock: Math.max(0, d.stock - guest.size) };
      if (guest.drink && d.name === guest.drink) return { ...d, stock: Math.max(0, d.stock - 1) };
      return d;
    });
    void cookMul;
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
  const drink = state.dishes.find((d) => d.name === guest.drink);
  const bill = (dish?.price ?? 0) * guest.size + (drink?.price ?? 0);
  const overBudget = bill > guest.budget;
  const loc = getLocation(state.locationId);
  const score = satisfactionScore(
    guest,
    dish,
    drink,
    overBudget,
    alcoholStockoutPenalty(state.dishes),
    loc.luxuryNeed,
    state.atmosphere,
    state.staff,
  );
  state.cash += bill;
  state.revenue += bill;
  state.served += guest.size;
  state.monthGuestPeak = Math.max(state.monthGuestPeak, state.served);
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
    state.toast = "新的老顾客记住了这家店";
  } else if (guest.memory != null && guest.memory >= 70) {
    state.toast = "老顾客又来了，心情不错";
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
  const tables = state.items.filter((i) => isTable(i.type));
  const pick = Math.random() < 0.45 || !tables.length ? entranceCell() : tables[Math.floor(Math.random() * tables.length)];
  const goal = "type" in pick ? nearestStandSpot(state.items, { x: s.x, y: s.y }, pick.x, pick.y) : pick;
  if (goal) setPathTo(state.items, s, goal);
}

function maybeQueueClean(state: GameState): void {
  if (state.tasks.some((t) => t.kind === "clean")) return;
  const due = state.staff
    .filter((s) => s.role === "waiter" && !s.onLeave && s.cleanInterval > 0)
    .some((s) => state.minute - s.lastCleanMinute >= s.cleanInterval);
  if (!due) return;
  state.tasks.push({
    id: state.nextId++,
    kind: "clean",
    guestId: -1,
    priority: TASK_PRIORITY.clean,
    progress: 0,
  });
}

function spawnGuest(state: GameState): void {
  const tables = state.items.filter((i) => isTable(i.type));
  const kitchens = state.items.filter((i) => i.type === "kitchen").length;
  if (!tables.length || !kitchens || state.guests.length > 18) return;

  const { openMinute, closeMinute, closedWeekday, difficulty } = state.settings;
  if (state.minute < openMinute || state.minute >= closeMinute) return;
  const cal = calendarFromDay(state.day);
  if (closedWeekday >= 0 && cal.weekday === closedWeekday) return;

  const loc = getLocation(state.locationId);
  const sizes = [1, 1, 1, 2, 2, 2, 3, 4, 4, 5, 6];
  let size = sizes[Math.floor(Math.random() * sizes.length)];
  const maxCap = Math.max(...tables.map((t) => tableCapacity(t.type)));
  size = Math.min(size, maxCap);
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
  const budgetBase = (400 + size * 260 + Math.random() * 500) * loc.budgetMul;
  const diffPatience = difficulty === "easy" ? 12 : difficulty === "hard" ? -10 : 0;
  const patience =
    65 +
    Math.random() * 30 +
    (memory && memory > 70 ? 10 : 0) +
    (loc.cleanNeed > 0.7 ? -5 : 0) +
    diffPatience;
  const wantsLuxury = Math.random() < loc.luxuryNeed;

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
    wantsLuxury,
  });
  state.maxQueue = Math.max(state.maxQueue, state.guests.filter((g) => g.stage === "queue").length);
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
    moveEntity(state.items, worker, staffSpeed(worker) * Math.max(1, speed));

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
    if (!target) {
      worker.taskId = undefined;
      task.assigneeId = undefined;
      state.toast = "服务动线缺少必要设备，请检查料理台、收银台与卫生间";
      continue;
    }
    if (!arrived(worker, target)) {
      if (!worker.path.length && !setPathTo(state.items, worker, target)) {
        worker.taskId = undefined;
        task.assigneeId = undefined;
        state.toast = "服务动线被家具挡住了，暂停后调整桌椅或设备";
      }
      continue;
    }
    let rate = 42 * staffSpeed(worker) * (speed || 1);
    if (task.kind === "cook") {
      const guest = guestAt(state, task.guestId);
      const dish = state.dishes.find((d) => d.name === guest?.dish);
      rate /= dish?.cookTime ?? 1;
      rate *= 0.75 + worker.cookSkill / 200;
    }
    if (task.kind === "seat" || task.kind === "takeOrder") {
      rate *= 0.85 + worker.receptionStat / 200;
    }
    // 忍耐力低时忙碌心情下降更快
    if (worker.endurance < 40 && Math.random() < 0.02) {
      worker.mood = Math.max(10, worker.mood - 0.5);
    }
    task.progress += rate;
    if (task.progress >= 100) completeTask(state, task, worker);
  }
}

function advanceGuests(state: GameState, speed: number): void {
  const loc = getLocation(state.locationId);
  const decay = patienceDecay(state.atmosphere, loc.cleanNeed) * Math.max(1, speed);
  const leaving: number[] = [];

  for (const guest of state.guests) {
    moveEntity(state.items, guest, 0.7 * Math.max(1, speed));

    if (guest.stage === "leaving") {
      if (arrived(guest, entranceCell()) || guest.path.length === 0) leaving.push(guest.id);
      continue;
    }

    if (guest.stage === "queue") {
      guest.patience -= decay * 1.15;
      guest.mood -= decay * 0.85;
      if (!guest.taskQueued) {
        ensureTask(state, "seat", guest.id);
        guest.taskQueued = true;
      }
      if (guest.patience <= 0 || guest.mood <= 0) {
        state.rating = Math.max(1, state.rating - 0.04);
        state.toast = "有客人等不及离开了";
        state.queueWalkouts += guest.size;
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

    if (
      guest.stage === "order" ||
      guest.stage === "waitingCook" ||
      guest.stage === "waitingServe" ||
      guest.stage === "pay"
    ) {
      guest.patience -= decay * 0.7;
      guest.mood -= decay * 0.45;
      if (guest.patience <= 0) {
        state.rating = Math.max(1, state.rating - 0.03);
        state.toast = "客人因等待过久离店";
        state.serviceWalkouts += guest.size;
        guest.stage = "leaving";
        guest.tableId = undefined;
        state.tasks = state.tasks.filter((t) => t.guestId !== guest.id);
        for (const s of state.staff) {
          if (s.taskId && !state.tasks.some((t) => t.id === s.taskId)) s.taskId = undefined;
        }
        setPathTo(state.items, guest, entranceCell());
      }
      continue;
    }

    if (guest.stage === "eat") {
      const dish = state.dishes.find((d) => d.name === guest.dish);
      const eatRate = 9 * (speed || 1) * (dish ? 0.85 + dish.portion * 0.04 : 1);
      guest.progress += eatRate;
      if (guest.progress >= 100) {
        guest.stage = "pay";
        guest.progress = 0;
        guest.taskQueued = false;
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

  if (leaving.length) state.guests = state.guests.filter((g) => !leaving.includes(g.id));
}

function tickAtmosphere(state: GameState, speed: number): void {
  const loc = getLocation(state.locationId);
  const drop = (0.06 + loc.cleanNeed * 0.08) * Math.max(1, speed);
  if (state.atmosphere.cleanliness > 12) {
    state.atmosphere.cleanliness = Math.max(8, state.atmosphere.cleanliness - drop);
  }
}

export function tick(prev: GameState, tickIndex: number): GameState {
  const state = cloneState(prev);
  const speed = state.speed;
  if (!speed) return state;

  state.minute += 5 * speed;
  const closeAt = state.settings.closeMinute;
  if (state.minute >= closeAt) {
    state.minute = closeAt;
    state.speed = 0;
  }

  const diffMul = state.settings.difficulty === "easy" ? 1.2 : state.settings.difficulty === "hard" ? 0.78 : 1;
  const baseSpawnTicks =
    8 / Math.max(0.35, spawnRateModifier(state) * diffMul) - Math.floor(state.rating) * 0.25;
  const spawnEvery = Math.max(1, Math.round(baseSpawnTicks / Math.max(1, speed)));
  if (tickIndex % spawnEvery === 0) spawnGuest(state);

  maybeQueueClean(state);
  assignTasks(state);
  processStaffTasks(state, speed);
  advanceGuests(state, speed);
  tickAtmosphere(state, speed);

  return state;
}

export function closeDay(state: GameState): { state: GameState; summary: DaySummary } {
  const next = cloneState(state);
  const costs = computeDayCosts(next);
  const profit = next.revenue - costs.total;
  const dailyGoal = dailyGoalFor(next);
  const goalBonus =
    next.served >= dailyGoal.guestTarget && profit >= dailyGoal.profitTarget
      ? dailyGoal.bonus
      : 0;
  next.cash -= costs.total;
  next.cash += goalBonus;
  next.totalProfit += profit + goalBonus;
  next.totalServed += next.served;
  next.guests = [];
  next.tasks = [];
  const eventNotes: string[] =
    goalBonus > 0 ? [`达成今日目标 +¥${goalBonus.toLocaleString()}`] : [];

  for (const s of next.staff) {
    s.taskId = undefined;
    s.path = [];
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
      eventNotes.push(`${s.name}离职`);
    }
  }

  const ev = rollDailyEvent(next);
  if (ev) {
    next.cash = Math.max(0, next.cash + ev.cashDelta);
    next.rating = Math.max(1, Math.min(5, next.rating + ev.ratingDelta));
    next.atmosphere.cleanliness = Math.max(0, Math.min(100, next.atmosphere.cleanliness + ev.cleanlinessDelta));
    next.toast = ev.toast;
    next.lastEventDay = next.day;
    eventNotes.push(ev.note);
  }

  next.ratingHistory = [...next.ratingHistory.slice(-9), next.rating];
  const prevStars = next.stars;
  next.stars = updateStars(next);

  const cal = calendarFromDay(next.day);
  const isMonthEnd = cal.date === 30;
  let monthBonus = 0;
  if (isMonthEnd) {
    monthBonus = monthEndBonus(next);
    next.cash += monthBonus;
    next.toast = `月末评比：获得上榜奖金 ¥${monthBonus.toLocaleString()}`;
    eventNotes.push(`月末奖金 ¥${monthBonus}`);
  }

  let yearAward = false;
  if (cal.month === 12 && cal.date === 30 && next.stars >= 5 && !next.yearAwarded) {
    next.yearAwarded = true;
    next.cookbookUnlocked = true;
    next.cash += 200000;
    yearAward = true;
    next.dishes = next.dishes.map((d) =>
      d.name === SECRET_DISH_NAME ? { ...d, onMenu: true, stock: Math.max(d.stock, 12) } : d,
    );
    next.toast = "荣获「年度最佳食堂」！解锁蓝宝石秘传菜谱";
    eventNotes.push("年度最佳");
  }

  if (next.stars > prevStars && !isMonthEnd) {
    next.toast = `餐厅升至 ${next.stars}★！`;
  }

  if (!ev && !isMonthEnd && !yearAward && !next.toast.includes("离职")) {
    next.toast = "今日营业结束，账簿已经结算";
  }

  const summary: DaySummary = {
    revenue: next.revenue,
    guests: next.served,
    queueWalkouts: next.queueWalkouts,
    serviceWalkouts: next.serviceWalkouts,
    maxQueue: next.maxQueue,
    rating: next.rating,
    costs: costs.total,
    profit,
    goalGuestTarget: dailyGoal.guestTarget,
    goalProfitTarget: dailyGoal.profitTarget,
    goalBonus,
    stars: next.stars,
    isMonthEnd,
    monthBonus,
    yearAward,
    eventNotes,
  };
  return { state: next, summary };
}

export function nextDay(state: GameState): GameState {
  const next = cloneState(state);
  next.day += 1;
  next.minute = next.settings.openMinute;
  next.revenue = 0;
  next.served = 0;
  next.dayIngredientCost = 0;
  next.queueWalkouts = 0;
  next.serviceWalkouts = 0;
  next.maxQueue = 0;
  next.guests = [];
  next.tasks = [];
  next.dishes = next.dishes.map((d) => {
    if (d.name === SECRET_DISH_NAME && next.cookbookUnlocked) {
      return { ...d, stock: Math.max(d.stock, 8), onMenu: d.onMenu };
    }
    return {
      ...d,
      stock: Math.max(d.stock, d.kind === "food" ? 28 : 15),
    };
  });
  const cal = calendarFromDay(next.day);
  if (cal.date === 1) next.monthGuestPeak = 0;
  if (next.settings.closedWeekday >= 0 && cal.weekday === next.settings.closedWeekday) {
    next.toast = "今日定休，可布置店面或调整菜单";
  } else {
    next.toast = "新的一天，准备开门迎客";
  }
  for (const s of next.staff) {
    s.taskId = undefined;
    s.path = [];
    s.lastCleanMinute = next.minute;
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

export function hireCleanCompany(state: GameState): GameState {
  const next = cloneState(state);
  if (next.cash < 1500) {
    next.toast = "清洁公司需要 ¥1,500";
    return next;
  }
  next.cash -= 1500;
  next.atmosphere.cleanliness = Math.min(100, next.atmosphere.cleanliness + 55);
  next.toast = "已预约清洁公司，店内焕然一新";
  return next;
}
