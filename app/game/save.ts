import { createStaff } from "./simulation";
import {
  DEFAULT_RESTAURANT_NAME,
  LEGACY_SAVE_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  SECRET_DISH_NAME,
  type Atmosphere,
  type CellItem,
  type Dish,
  type DrinkPair,
  type EntranceStyle,
  type FloorStyle,
  type GameSettings,
  type GameState,
  type MusicStyle,
  type SaveState,
  type Security,
  type WallStyle,
} from "./types";

export const toolData = {
  table1: { name: "单人桌", icon: "▪", price: 900 },
  table2: { name: "双人桌", icon: "▣", price: 1800 },
  table4: { name: "四人桌", icon: "▦", price: 2800 },
  table6: { name: "六人桌", icon: "▩", price: 4200 },
  kitchen: { name: "料理台", icon: "♨", price: 4500 },
  cashier: { name: "收银台", icon: "¥", price: 2200 },
  toilet: { name: "卫生间", icon: "WC", price: 3200 },
  plant: { name: "绿植", icon: "♣", price: 500 },
} as const;

export const initialItems: CellItem[] = [
  { id: 1, type: "kitchen", x: 1, y: 1, buyOrder: 1 },
  { id: 2, type: "kitchen", x: 2, y: 1, buyOrder: 2 },
  { id: 3, type: "cashier", x: 10, y: 6, buyOrder: 3 },
  { id: 4, type: "toilet", x: 1, y: 6, buyOrder: 4 },
  { id: 5, type: "table1", x: 4, y: 2, buyOrder: 5 },
  { id: 6, type: "table2", x: 5, y: 2, buyOrder: 6 },
  { id: 7, type: "table2", x: 4, y: 4, buyOrder: 7 },
  { id: 8, type: "table4", x: 7, y: 2, buyOrder: 8 },
  { id: 9, type: "plant", x: 9, y: 1, buyOrder: 9 },
];

/** 蓝宝石原创洋食菜单（气质对齐一代东京西餐厅，非原作菜名商标） */
export const initialDishes: Dish[] = [
  { name: "蓝宝石汉堡排", icon: "🍔", price: 65, cost: 24, quality: 2, stock: 40, demand: 1.3, tags: ["western", "value"], kind: "food", portion: 3, intensity: 3, oiliness: 3, pairDrink: "beer", cookTime: 0.85, onMenu: true },
  { name: "那不勒斯面", icon: "🍝", price: 58, cost: 21, quality: 2, stock: 32, demand: 1.05, tags: ["western", "formal"], kind: "food", portion: 3, intensity: 3, oiliness: 2, pairDrink: "red", cookTime: 1.1, onMenu: true },
  { name: "炸猪排定食", icon: "🍛", price: 72, cost: 29, quality: 2, stock: 28, demand: 0.9, tags: ["japanese", "formal"], kind: "food", portion: 4, intensity: 3, oiliness: 4, pairDrink: "beer", cookTime: 1.2, onMenu: true },
  { name: "咖哩猪肉饭", icon: "🍚", price: 48, cost: 18, quality: 2, stock: 36, demand: 1.4, tags: ["japanese", "value"], kind: "food", portion: 4, intensity: 4, oiliness: 3, pairDrink: "beer", cookTime: 0.75, onMenu: true },
  { name: "三明治拼盘", icon: "🥪", price: 32, cost: 12, quality: 2, stock: 40, demand: 1.25, tags: ["western", "value", "cafe"], kind: "food", portion: 2, intensity: 2, oiliness: 2, pairDrink: "none", cookTime: 0.65, onMenu: true },
  { name: "蛋包饭", icon: "🍳", price: 55, cost: 20, quality: 2, stock: 24, demand: 1.0, tags: ["japanese", "cafe"], kind: "food", portion: 3, intensity: 2, oiliness: 3, pairDrink: "white", cookTime: 1.0, onMenu: false },
  { name: "奶油可乐饼", icon: "🥔", price: 42, cost: 14, quality: 2, stock: 30, demand: 1.15, tags: ["japanese", "value"], kind: "food", portion: 2, intensity: 2, oiliness: 4, pairDrink: "beer", cookTime: 0.9, onMenu: true },
  { name: "鲜虾焗饭", icon: "🦐", price: 68, cost: 26, quality: 3, stock: 20, demand: 0.85, tags: ["western", "formal"], kind: "food", portion: 3, intensity: 3, oiliness: 3, pairDrink: "white", cookTime: 1.15, onMenu: false },
  { name: "奶焗通心粉", icon: "🧀", price: 52, cost: 19, quality: 2, stock: 26, demand: 0.95, tags: ["western", "cafe"], kind: "food", portion: 3, intensity: 3, oiliness: 4, pairDrink: "red", cookTime: 1.05, onMenu: false },
  { name: "姜汁猪排", icon: "🥩", price: 78, cost: 32, quality: 3, stock: 18, demand: 0.8, tags: ["japanese", "formal"], kind: "food", portion: 4, intensity: 4, oiliness: 3, pairDrink: "red", cookTime: 1.25, onMenu: false },
  { name: "热咖啡", icon: "☕", price: 18, cost: 5, quality: 2, stock: 60, demand: 1.45, tags: ["cafe", "value"], kind: "drink", portion: 2, intensity: 3, oiliness: 1, pairDrink: "none", cookTime: 0.4, onMenu: true },
  { name: "柳橙汁", icon: "🧃", price: 16, cost: 4, quality: 2, stock: 40, demand: 1.2, tags: ["cafe", "value"], kind: "drink", portion: 2, intensity: 2, oiliness: 1, pairDrink: "none", cookTime: 0.35, onMenu: true },
  { name: "红茶", icon: "🍵", price: 15, cost: 4, quality: 2, stock: 40, demand: 1.1, tags: ["cafe"], kind: "drink", portion: 2, intensity: 2, oiliness: 1, pairDrink: "none", cookTime: 0.4, onMenu: true },
  { name: "罐装啤酒", icon: "🍺", price: 28, cost: 10, quality: 2, stock: 30, demand: 1.15, tags: ["value"], kind: "alcohol", portion: 2, intensity: 3, oiliness: 1, pairDrink: "beer", cookTime: 0.3, onMenu: true },
  { name: "红酒", icon: "🍷", price: 68, cost: 28, quality: 3, stock: 20, demand: 0.7, tags: ["formal"], kind: "alcohol", portion: 2, intensity: 3, oiliness: 1, pairDrink: "red", cookTime: 0.35, onMenu: true },
  { name: "白酒", icon: "🥂", price: 58, cost: 22, quality: 2, stock: 20, demand: 0.65, tags: ["formal"], kind: "alcohol", portion: 2, intensity: 2, oiliness: 1, pairDrink: "white", cookTime: 0.35, onMenu: true },
  { name: SECRET_DISH_NAME, icon: "🍲", price: 120, cost: 45, quality: 5, stock: 8, demand: 0.55, tags: ["formal", "western"], kind: "food", portion: 5, intensity: 4, oiliness: 3, pairDrink: "red", cookTime: 1.4, onMenu: false },
];

/** 旧品牌菜名 → 新名（存档迁移） */
const DISH_RENAME: Record<string, string> = {
  "街角汉堡排": "蓝宝石汉堡排",
  "街角秘传锅": SECRET_DISH_NAME,
};

export const defaultAtmosphere = (): Atmosphere => ({
  temperature: 24,
  music: "dream",
  uniform: "apron",
  cleanliness: 80,
  ads: false,
  luxury: 25,
  trend: 30,
  floorStyle: "wood",
  wallStyle: "cream",
  entranceStyle: "classic",
});

export const defaultSecurity = (): Security => ({
  camera: false,
  infrared: false,
  fire: false,
  alarm: false,
});

export const defaultSettings = (): GameSettings => ({
  bgmVolume: 60,
  sfxVolume: 50,
  showBubbles: true,
  difficulty: "normal",
  openMinute: 10 * 60,
  closeMinute: 22 * 60 + 30,
  closedWeekday: -1,
});

function normalizeMusic(m: unknown): MusicStyle {
  if (m === true) return "dream";
  if (m === false || m == null) return "off";
  const ok: MusicStyle[] = ["off", "dream", "classic", "rock", "folk", "enka", "tropical"];
  return ok.includes(m as MusicStyle) ? (m as MusicStyle) : "dream";
}

function normalizePair(p: unknown): DrinkPair {
  const ok: DrinkPair[] = ["beer", "red", "white", "none"];
  return ok.includes(p as DrinkPair) ? (p as DrinkPair) : "none";
}

function normalizeFloor(v: unknown): FloorStyle {
  return v === "tile" || v === "carpet" || v === "wood" ? v : "wood";
}

function normalizeWall(v: unknown): WallStyle {
  return v === "brick" || v === "panel" || v === "cream" ? v : "cream";
}

function normalizeEntrance(v: unknown): EntranceStyle {
  return v === "glass" || v === "lattice" || v === "classic" ? v : "classic";
}

export function createInitialState(): GameState {
  const baseWage = 600;
  const items = initialItems.map((i) => ({ ...i }));
  let nextId = 100;
  const staff = [
    createStaff("waiter", nextId++, baseWage, items),
    createStaff("waiter", nextId++, baseWage, items),
    createStaff("chef", nextId++, baseWage + 50, items),
  ];
  const settings = defaultSettings();
  return {
    restaurantName: DEFAULT_RESTAURANT_NAME,
    cash: 50000,
    items,
    dishes: initialDishes.map((d) => ({ ...d, tags: [...d.tags] })),
    guests: [],
    staff,
    tasks: [],
    minute: settings.openMinute,
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
    security: defaultSecurity(),
    settings,
    regulars: [],
    toast: "先布置餐厅，再按「开始营业」",
    nextId,
    ratingHistory: [2.8],
    baseWage,
    nextBuyOrder: 10,
    yearAwarded: false,
    cookbookUnlocked: false,
    lastEventDay: 0,
    monthGuestPeak: 0,
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
    kind: d.kind ?? fallback.kind,
    portion: d.portion ?? fallback.portion,
    intensity: d.intensity ?? fallback.intensity,
    oiliness: d.oiliness ?? fallback.oiliness ?? 2,
    pairDrink: normalizePair(d.pairDrink ?? fallback.pairDrink),
    cookTime: d.cookTime ?? fallback.cookTime,
    onMenu: d.onMenu ?? fallback.onMenu,
  };
}

function normalizeItem(i: Partial<CellItem> & { id: number; type: CellItem["type"]; x: number; y: number }, idx: number): CellItem {
  return {
    id: i.id,
    type: i.type,
    x: i.x,
    y: i.y,
    buyOrder: i.buyOrder ?? idx + 1,
  };
}

function normalizeSettings(raw: Partial<GameSettings> | undefined): GameSettings {
  const base = defaultSettings();
  if (!raw) return base;
  return {
    bgmVolume: Math.max(0, Math.min(100, raw.bgmVolume ?? base.bgmVolume)),
    sfxVolume: Math.max(0, Math.min(100, raw.sfxVolume ?? base.sfxVolume)),
    showBubbles: raw.showBubbles ?? true,
    difficulty: raw.difficulty === "easy" || raw.difficulty === "hard" ? raw.difficulty : "normal",
    openMinute: Math.max(7 * 60, Math.min(14 * 60, raw.openMinute ?? base.openMinute)),
    closeMinute: Math.max(18 * 60, Math.min(23 * 60, raw.closeMinute ?? base.closeMinute)),
    closedWeekday: raw.closedWeekday != null && raw.closedWeekday >= -1 && raw.closedWeekday <= 6 ? raw.closedWeekday : -1,
  };
}

export function loadSave(): GameState | null {
  if (typeof localStorage === "undefined") return null;
  let raw = localStorage.getItem(SAVE_KEY);
  let fromLegacy = false;
  if (!raw) {
    raw = localStorage.getItem(LEGACY_SAVE_KEY);
    fromLegacy = !!raw;
  }
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SaveState;
    const base = createInitialState();
    const wage = s.baseWage ?? s.wage ?? 600;
    const rawItems = (s.items ?? base.items).map((it, idx) => normalizeItem(it as CellItem, idx));

    let staff = Array.isArray(s.staff) && s.staff.length
      ? s.staff.map((st) => ({
          ...createStaff(st.role ?? "waiter", st.id, st.wage ?? wage, rawItems),
          ...st,
          path: [],
          taskId: undefined,
          onLeave: !!st.onLeave,
          lowMoodDays: st.lowMoodDays ?? 0,
          exp: st.exp ?? 0,
          mood: st.mood ?? 70,
          wage: st.wage ?? wage,
          cleanInterval: st.cleanInterval ?? (st.role === "chef" ? 0 : 240),
          lastCleanMinute: st.lastCleanMinute ?? 0,
          speedStat: st.speedStat ?? 70,
          receptionStat: st.receptionStat ?? 60,
          charm: st.charm ?? 55,
          learnRate: st.learnRate ?? 55,
          endurance: st.endurance ?? 60,
          cookSkill: st.cookSkill ?? (st.role === "chef" ? 65 : 20),
        }))
      : [];

    if (!staff.length) {
      const waiters = s.waiters ?? 2;
      const chefs = s.chefs ?? 1;
      let id = 100;
      for (let i = 0; i < waiters; i++) staff.push(createStaff("waiter", id++, wage, rawItems));
      for (let i = 0; i < chefs; i++) staff.push(createStaff("chef", id++, wage + 50, rawItems));
    }

    // 合并新增菜色：旧存档缺的菜补进列表；旧品牌菜名迁到新名
    const savedDishes = (s.dishes ?? []).map((d) => {
      const dish = normalizeDish(d);
      const renamed = DISH_RENAME[dish.name];
      return renamed ? { ...dish, name: renamed } : dish;
    });
    const byName = new Map(savedDishes.map((d) => [d.name, d]));
    for (const d of initialDishes) {
      if (!byName.has(d.name)) byName.set(d.name, { ...d, tags: [...d.tags] });
    }
    // 秘传菜仅在解锁后可上架
    const dishes = [...byName.values()].map((d) => {
      if (d.name === SECRET_DISH_NAME && !s.cookbookUnlocked) return { ...d, onMenu: false };
      return d;
    });

    const nextId = Math.max(200, ...staff.map((x) => x.id), ...rawItems.map((i) => i.id)) + 1;
    const atm = { ...defaultAtmosphere(), ...(s.atmosphere ?? {}) };
    atm.music = normalizeMusic((s.atmosphere as { music?: unknown } | undefined)?.music ?? atm.music);
    atm.floorStyle = normalizeFloor(atm.floorStyle);
    atm.wallStyle = normalizeWall(atm.wallStyle);
    atm.entranceStyle = normalizeEntrance(atm.entranceStyle);

    const knownLoc = [
      "kiba",
      "takadanobaba",
      "akihabara",
      "shinbashi",
      "kanda",
      "ginza",
      "odaiba",
      "aoyama",
      "asakusa",
      "ebisu",
      "kichijoji",
      "shibuya",
      "otemachi",
      "roppongi",
      "ikebukuro",
      "shinjuku",
    ];
    const locId = knownLoc.includes(s.locationId as string) ? s.locationId! : "kiba";
    const settings = normalizeSettings(s.settings);

    let restaurantName = s.restaurantName ?? DEFAULT_RESTAURANT_NAME;
    if (restaurantName === "街角食堂") restaurantName = DEFAULT_RESTAURANT_NAME;

    const loaded: GameState = {
      ...base,
      restaurantName,
      cash: s.cash ?? base.cash,
      items: rawItems,
      dishes,
      day: s.day ?? 1,
      rating: s.rating ?? 2.8,
      stars: s.stars ?? 1,
      totalProfit: s.totalProfit ?? 0,
      totalServed: s.totalServed ?? 0,
      locationId: locId as GameState["locationId"],
      atmosphere: atm,
      security: { ...defaultSecurity(), ...(s.security ?? {}) },
      settings,
      regulars: s.regulars ?? [],
      staff,
      baseWage: wage,
      ratingHistory: s.ratingHistory?.length ? s.ratingHistory : [s.rating ?? 2.8],
      nextId,
      nextBuyOrder: s.nextBuyOrder ?? Math.max(...rawItems.map((i) => i.buyOrder), 10) + 1,
      yearAwarded: !!s.yearAwarded,
      cookbookUnlocked: !!s.cookbookUnlocked,
      toast: "已读取上次的经营记录",
      guests: [],
      tasks: [],
      minute: settings.openMinute,
      speed: 0,
      served: 0,
      revenue: 0,
      lastEventDay: 0,
      monthGuestPeak: 0,
    };

    // 从旧 key 读到后立刻写入新 key 并清理旧 key，避免丢档
    if (fromLegacy) {
      writeSave(loaded);
      localStorage.removeItem(LEGACY_SAVE_KEY);
    }

    return loaded;
  } catch {
    localStorage.removeItem(SAVE_KEY);
    if (fromLegacy) localStorage.removeItem(LEGACY_SAVE_KEY);
    return null;
  }
}

export function writeSave(state: GameState): void {
  const payload: SaveState = {
    v: SAVE_VERSION,
    restaurantName: state.restaurantName,
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
    security: state.security,
    settings: state.settings,
    regulars: state.regulars,
    staff: state.staff.map(({ path: _p, taskId: _t, ...rest }) => rest),
    baseWage: state.baseWage,
    ratingHistory: state.ratingHistory,
    nextBuyOrder: state.nextBuyOrder,
    yearAwarded: state.yearAwarded,
    cookbookUnlocked: state.cookbookUnlocked,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}
