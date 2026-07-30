import { calendarFromDay, getLocation, timeOfDayFootfall } from "./locations";
import type { Atmosphere, Dish, GameState, Guest, LocationId, Security, TasteTag } from "./types";

export function tasteScore(dish: Dish, taste: TasteTag): number {
  if (!dish.onMenu || dish.stock <= 0) return 0;
  const hit = dish.tags.includes(taste) ? 1.7 : 0.65;
  const valueBias = taste === "value" ? Math.max(0.4, 1.5 - dish.price / 100) : 1;
  const formalBias = taste === "formal" ? 0.8 + dish.quality * 0.12 + dish.portion * 0.06 + dish.price / 180 : 1;
  const portionBias = 0.75 + dish.portion * 0.08;
  const intensityBias = 0.8 + dish.intensity * 0.06;
  return dish.demand * hit * valueBias * formalBias * portionBias * intensityBias;
}

export function chooseDishForGuest(dishes: Dish[], guest: Guest): Dish | undefined {
  const available = dishes.filter((d) => d.onMenu && d.kind === "food" && d.stock >= guest.size);
  if (!available.length) return undefined;
  const scored = available.map((d) => {
    let w = Math.max(0.05, tasteScore(d, guest.taste));
    if (guest.wantsLuxury) w *= 0.6 + d.quality * 0.15 + d.price / 120;
    else w *= Math.max(0.4, 1.3 - d.price / 100);
    return { d, w };
  });
  const total = scored.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const row of scored) {
    r -= row.w;
    if (r <= 0) return row.d;
  }
  return scored[0]?.d;
}

export function chooseDrinkForGuest(dishes: Dish[], guest: Guest, orderedDish?: Dish): Dish | undefined {
  const drinks = dishes.filter((d) => d.onMenu && (d.kind === "drink" || d.kind === "alcohol") && d.stock > 0);
  if (!drinks.length) return undefined;
  if (Math.random() < 0.32) return undefined;

  // 优先推荐酒水搭配
  if (orderedDish && orderedDish.pairDrink !== "none" && Math.random() < 0.55) {
    const pairMap = { beer: "罐装啤酒", red: "红酒", white: "白酒" } as const;
    const target = pairMap[orderedDish.pairDrink];
    const paired = drinks.find((d) => d.name === target || d.pairDrink === orderedDish.pairDrink);
    if (paired) return paired;
  }

  const preferAlcohol = guest.budget > 120 && Math.random() < 0.45;
  const pool = preferAlcohol ? drinks.filter((d) => d.kind === "alcohol") : drinks.filter((d) => d.kind === "drink");
  const use = pool.length ? pool : drinks;
  return use[Math.floor(Math.random() * use.length)];
}

/** 任意酒水品类全断货时惩罚 */
export function alcoholStockoutPenalty(dishes: Dish[]): number {
  const alcohols = dishes.filter((d) => d.kind === "alcohol" && d.onMenu);
  if (!alcohols.length) return 0;
  const anyOut = alcohols.some((d) => d.stock <= 0);
  return anyOut ? 12 : 0;
}

export function patienceDecay(atmosphere: Atmosphere, cleanNeed: number): number {
  let d = 1.05;
  const t = atmosphere.temperature;
  // 原作常见 23–26℃，这里映射到显示温度 50–74 舒适带（UI 用摄氏感）
  if (t < 20 || t > 30) d += 0.65;
  else if (t < 22 || t > 27) d += 0.25;
  if (atmosphere.music === "off") d += 0.12;
  else if (atmosphere.music === "dream" || atmosphere.music === "classic") d -= 0.12;
  const cleanGap = Math.max(0, cleanNeed * 100 - atmosphere.cleanliness);
  d += cleanGap / 120;
  if (atmosphere.uniform === "formal") d -= 0.06;
  return Math.max(0.35, d);
}

export function spawnRateModifier(state: GameState): number {
  const loc = getLocation(state.locationId);
  const cal = calendarFromDay(state.day);
  let m = loc.footfall * (0.8 + state.rating / 12);
  m *= timeOfDayFootfall(state.minute);
  if (loc.weekdayMul?.[cal.weekday] != null) m *= loc.weekdayMul[cal.weekday]!;
  if (state.atmosphere.ads) m *= 1.3;
  if (state.atmosphere.cleanliness < 35 * loc.cleanNeed + 20) m *= 0.82;
  if (state.atmosphere.music !== "off") m *= 1.06;
  // 装潢贡献有效高级感
  const decorLux =
    (state.atmosphere.floorStyle === "carpet" ? 12 : state.atmosphere.floorStyle === "tile" ? 4 : 0) +
    (state.atmosphere.wallStyle === "panel" ? 14 : state.atmosphere.wallStyle === "brick" ? 6 : 0) +
    (state.atmosphere.entranceStyle === "glass" ? 10 : state.atmosphere.entranceStyle === "lattice" ? 5 : 0);
  const effectiveLux = Math.min(100, state.atmosphere.luxury + decorLux * 0.6);
  const luxGap = Math.abs(effectiveLux - loc.luxuryNeed * 100);
  if (luxGap > 35) m *= 0.78;
  else if (luxGap > 20) m *= 0.9;
  const trendGap = Math.abs(state.atmosphere.trend - loc.trendNeed * 100);
  if (trendGap > 40) m *= 0.88;
  return m;
}

export function satisfactionScore(
  guest: Guest,
  dish: Dish | undefined,
  drink: Dish | undefined,
  overBudget: boolean,
  alcoholPenalty: number,
  locLuxuryNeed: number,
  atmosphere: Atmosphere,
  staff?: { charm: number; role: string }[],
): number {
  if (!dish) return 38;
  let score = guest.mood * 0.5 + dish.quality * 9 + dish.portion * 3 + dish.intensity * 2;
  score += dish.oiliness * 0.8;
  score += (guest.memory ?? 0) * 0.12;
  const value = dish.price / Math.max(1, dish.cost);
  score -= Math.max(0, value - 3.2) * 5;
  if (overBudget) score -= 16;
  if (dish.tags.includes(guest.taste)) score += 8;
  if (guest.patience < 30) score -= 12;
  if (drink) score += 4;
  // 酒水搭配命中加分
  if (drink && dish.pairDrink !== "none") {
    const hit =
      (dish.pairDrink === "beer" && drink.name.includes("啤")) ||
      (dish.pairDrink === "red" && drink.name.includes("红")) ||
      (dish.pairDrink === "white" && drink.name.includes("白")) ||
      drink.pairDrink === dish.pairDrink;
    if (hit) score += 6;
  }
  score -= alcoholPenalty;
  const lux = atmosphere.luxury;
  if (locLuxuryNeed > 0.6 && lux < 50) score -= 10;
  if (locLuxuryNeed < 0.3 && lux > 70) score -= 8;
  if (atmosphere.cleanliness < 40) score -= 8;
  if (staff?.length) {
    const waiters = staff.filter((s) => s.role === "waiter");
    const avgCharm = waiters.length ? waiters.reduce((a, s) => a + s.charm, 0) / waiters.length : 50;
    score += (avgCharm - 50) * 0.08;
  }
  return Math.max(30, Math.min(100, score));
}

export function computeDayCosts(state: GameState): {
  payroll: number;
  rent: number;
  ingredient: number;
  ads: number;
  security: number;
  total: number;
} {
  const loc = getLocation(state.locationId);
  const payroll = state.staff.filter((s) => !s.onLeave).reduce((sum, s) => sum + s.wage, 0);
  const ingredient = state.dishes.reduce((sum, d) => {
    const target = d.kind === "food" ? 35 : 18;
    return sum + Math.max(0, target - Math.min(target, d.stock)) * d.cost;
  }, 0);
  const ads = state.atmosphere.ads ? 650 : 0;
  const security =
    (state.security.camera ? 200 : 0) +
    (state.security.infrared ? 180 : 0) +
    (state.security.fire ? 220 : 0) +
    (state.security.alarm ? 150 : 0);
  return {
    payroll,
    rent: loc.rent,
    ingredient,
    ads,
    security,
    total: payroll + loc.rent + ingredient + ads + security,
  };
}

export function updateStars(state: GameState): number {
  const avg =
    state.ratingHistory.length > 0
      ? state.ratingHistory.reduce((a, b) => a + b, 0) / state.ratingHistory.length
      : state.rating;
  let stars = 1;
  if (avg >= 2.2 && state.totalServed >= 25) stars = 2;
  if (avg >= 2.8 && state.totalServed >= 70 && state.totalProfit >= 8000) stars = 3;
  if (avg >= 3.4 && state.totalServed >= 140 && state.totalProfit >= 30000) stars = 4;
  if (avg >= 4.0 && state.totalServed >= 240 && state.totalProfit >= 70000) stars = 5;
  if (state.rating < avg - 0.85) stars = Math.max(1, stars - 1);
  return stars;
}

export function canRelocate(state: GameState, targetId: string): { ok: boolean; reason: string } {
  if (targetId === state.locationId) return { ok: false, reason: "已在此地" };
  const loc = getLocation(targetId as LocationId);
  if (!loc) return { ok: false, reason: "无效地点" };
  if (loc.id === "kiba" && state.locationId !== "kiba") {
    // 允许退回木场但几乎没人这么干
  }
  if (state.stars < loc.relocateStars) return { ok: false, reason: `需要 ${loc.relocateStars}★` };
  if (state.cash < loc.relocateCash) return { ok: false, reason: `需要资金 ¥${loc.relocateCash.toLocaleString()}` };
  return { ok: true, reason: "" };
}

export function monthEndBonus(state: GameState): number {
  // 星级上榜奖金
  const base = [0, 3000, 8000, 18000, 40000, 90000][state.stars] ?? 3000;
  const guestBonus = Math.min(20000, state.served * 40);
  return Math.round(base + guestBonus + state.rating * 800);
}

export function securityLevel(sec: Security): number {
  return (sec.camera ? 1 : 0) + (sec.infrared ? 1 : 0) + (sec.fire ? 1 : 0) + (sec.alarm ? 1 : 0);
}
