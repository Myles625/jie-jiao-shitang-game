import { createStaff } from "./simulation";
import { SAVE_KEY, SAVE_VERSION, type Atmosphere, type Dish, type GameState, type SaveState, type Staff } from "./types";

export const toolData = {
  table2: { name: "双人桌", icon: "▣", price: 1800 },
  table4: { name: "四人桌", icon: "▦", price: 2800 },
  kitchen: { name: "料理台", icon: "♨", price: 4500 },
  cashier: { name: "收银台", icon: "¥", price: 2200 },
  plant: { name: "绿植", icon: "♣", price: 500 },
} as const;

export const initialItems = [
  { id: 1, type: "kitchen" as const, x: 1, y: 1 },
  { id: 2, type: "kitchen" as const, x: 2, y: 1 },
  { id: 3, type: "cashier" as const, x: 10, y: 6 },
  { id: 4, type: "table2" as const, x: 4, y: 2 },
  { id: 5, type: "table4" as const, x: 7, y: 2 },
  { id: 6, type: "table2" as const, x: 4, y: 5 },
  { id: 7, type: "plant" as const, x: 9, y: 1 },
];

export const initialDishes: Dish[] = [
  { name: "招牌汉堡", icon: "🍔", price: 65, cost: 24, quality: 2, stock: 40, demand: 1.3, tags: ["western", "value"] },
  { name: "那不勒斯面", icon: "🍝", price: 58, cost: 21, quality: 2, stock: 32, demand: 1.05, tags: ["western", "formal"] },
  { name: "炸猪排", icon: "🍛", price: 72, cost: 29, quality: 2, stock: 28, demand: 0.9, tags: ["japanese", "formal"] },
  { name: "热咖啡", icon: "☕", price: 18, cost: 5, quality: 2, stock: 60, demand: 1.45, tags: ["cafe", "value"] },
];

export const defaultAtmosphere = (): Atmosphere => ({
  temperature: 62,
  music: false,
  uniform: "apron",
  cleanliness: 80,
  ads: false,
});

export function createInitialState(): GameState {
  const baseWage = 600;
  const items = initialItems.map((i) => ({ ...i }));
  let nextId = 100;
  const staff: Staff[] = [
    createStaff("waiter", nextId++, baseWage, items),
    createStaff("waiter", nextId++, baseWage, items),
    createStaff("chef", nextId++, baseWage + 50, items),
  ];
  return {
    cash: 50000,
    items,
    dishes: initialDishes.map((d) => ({ ...d })),
    guests: [],
    staff,
    tasks: [],
    minute: 11 * 60,
    day: 1,
    speed: 0,
    served: 0,
    revenue: 0,
    rating: 2.8,
    stars: 1,
    totalProfit: 0,
    totalServed: 0,
    locationId: "kiba",
    atmosphere: defaultAtmosphere(),
    regulars: [],
    toast: "先布置餐厅，再按「开始营业」",
    nextId,
    ratingHistory: [2.8],
    baseWage,
  };
}

function normalizeDish(d: Partial<Dish> & { name: string }): Dish {
  const fallback = initialDishes.find((x) => x.name === d.name) ?? initialDishes[0];
  return {
    name: d.name,
    icon: d.icon ?? fallback.icon,
    price: d.price ?? fallback.price,
    cost: d.cost ?? fallback.cost,
    quality: d.quality ?? fallback.quality,
    stock: d.stock ?? fallback.stock,
    demand: d.demand ?? fallback.demand,
    tags: d.tags ?? fallback.tags,
  };
}

export function loadSave(): GameState | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SaveState;
    const base = createInitialState();
    const wage = s.baseWage ?? s.wage ?? 600;
    let staff = Array.isArray(s.staff) && s.staff.length
      ? s.staff.map((st) => ({
          ...st,
          path: [],
          taskId: undefined,
          onLeave: !!st.onLeave,
          lowMoodDays: st.lowMoodDays ?? 0,
          exp: st.exp ?? 0,
          mood: st.mood ?? 70,
          wage: st.wage ?? wage,
        }))
      : [];

    // legacy waiters/chefs counts
    if (!staff.length) {
      const waiters = s.waiters ?? 2;
      const chefs = s.chefs ?? 1;
      let id = 100;
      const items = s.items ?? base.items;
      for (let i = 0; i < waiters; i++) staff.push(createStaff("waiter", id++, wage, items));
      for (let i = 0; i < chefs; i++) staff.push(createStaff("chef", id++, wage + 50, items));
    }

    const dishes = (s.dishes ?? initialDishes).map((d) => normalizeDish(d));
    const nextId = Math.max(200, ...staff.map((x) => x.id), ...(s.items ?? []).map((i) => i.id)) + 1;

    return {
      ...base,
      cash: s.cash ?? base.cash,
      items: s.items ?? base.items,
      dishes,
      day: s.day ?? 1,
      rating: s.rating ?? 2.8,
      stars: s.stars ?? 1,
      totalProfit: s.totalProfit ?? 0,
      totalServed: s.totalServed ?? 0,
      locationId: s.locationId ?? "kiba",
      atmosphere: { ...defaultAtmosphere(), ...(s.atmosphere ?? {}) },
      regulars: s.regulars ?? [],
      staff,
      baseWage: wage,
      ratingHistory: s.ratingHistory?.length ? s.ratingHistory : [s.rating ?? 2.8],
      nextId,
      toast: "已读取上次的经营记录",
      guests: [],
      tasks: [],
      minute: 11 * 60,
      speed: 0,
      served: 0,
      revenue: 0,
    };
  } catch {
    localStorage.removeItem(SAVE_KEY);
    return null;
  }
}

export function writeSave(state: GameState): void {
  const payload: SaveState = {
    v: SAVE_VERSION,
    cash: state.cash,
    items: state.items,
    dishes: state.dishes,
    day: state.day,
    rating: state.rating,
    stars: state.stars,
    totalProfit: state.totalProfit,
    totalServed: state.totalServed,
    locationId: state.locationId,
    atmosphere: state.atmosphere,
    regulars: state.regulars,
    staff: state.staff.map(({ path: _p, taskId: _t, ...rest }) => rest),
    baseWage: state.baseWage,
    ratingHistory: state.ratingHistory,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}
