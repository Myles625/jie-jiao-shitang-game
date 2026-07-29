import { getLocation } from "./locations";
import type { Atmosphere, Dish, GameState, Guest, TasteTag } from "./types";

export function tasteScore(dish: Dish, taste: TasteTag): number {
  const hit = dish.tags.includes(taste) ? 1.6 : 0.7;
  const valueBias = taste === "value" ? Math.max(0.5, 1.4 - dish.price / 90) : 1;
  const formalBias = taste === "formal" ? 0.85 + dish.quality * 0.15 + dish.price / 200 : 1;
  return dish.demand * hit * valueBias * formalBias;
}

export function chooseDishForGuest(dishes: Dish[], guest: Guest): Dish | undefined {
  const available = dishes.filter((d) => d.stock >= guest.size);
  if (!available.length) return undefined;
  const scored = available.map((d) => ({ d, w: Math.max(0.05, tasteScore(d, guest.taste)) }));
  const total = scored.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const row of scored) {
    r -= row.w;
    if (r <= 0) return row.d;
  }
  return scored[0]?.d;
}

export function patienceDecay(atmosphere: Atmosphere): number {
  let d = 1.1;
  const t = atmosphere.temperature;
  if (t < 40 || t > 82) d += 0.55;
  else if (t < 50 || t > 74) d += 0.2;
  if (atmosphere.music) d -= 0.15;
  if (atmosphere.cleanliness < 40) d += 0.45;
  else if (atmosphere.cleanliness < 65) d += 0.15;
  if (atmosphere.uniform === "formal") d -= 0.08;
  return Math.max(0.4, d);
}

export function spawnRateModifier(state: GameState): number {
  const loc = getLocation(state.locationId);
  let m = loc.footfall * (0.85 + state.rating / 10);
  if (state.atmosphere.ads) m *= 1.35;
  if (state.atmosphere.cleanliness < 35) m *= 0.85;
  if (state.atmosphere.music) m *= 1.05;
  return m;
}

export function satisfactionScore(guest: Guest, dish: Dish | undefined, overBudget: boolean): number {
  if (!dish) return 40;
  let score = guest.mood * 0.55 + dish.quality * 10 + (guest.memory ?? 0) * 0.15;
  const value = dish.price / Math.max(1, dish.cost);
  score -= Math.max(0, value - 3) * 6;
  if (overBudget) score -= 18;
  if (dish.tags.includes(guest.taste)) score += 8;
  if (guest.patience < 30) score -= 10;
  return Math.max(35, Math.min(100, score));
}

export function computeDayCosts(state: GameState): { payroll: number; rent: number; ingredient: number; ads: number; total: number } {
  const loc = getLocation(state.locationId);
  const payroll = state.staff.filter((s) => !s.onLeave).reduce((sum, s) => sum + s.wage, 0);
  const ingredient = state.dishes.reduce((sum, d) => sum + (40 - Math.min(40, d.stock)) * d.cost, 0);
  const ads = state.atmosphere.ads ? 650 : 0;
  const rent = loc.rent;
  return { payroll, rent, ingredient, ads, total: payroll + rent + ingredient + ads };
}

export function updateStars(state: GameState): number {
  const avg =
    state.ratingHistory.length > 0
      ? state.ratingHistory.reduce((a, b) => a + b, 0) / state.ratingHistory.length
      : state.rating;
  let stars = 1;
  if (avg >= 2.2 && state.totalServed >= 30) stars = 2;
  if (avg >= 2.8 && state.totalServed >= 80 && state.totalProfit >= 5000) stars = 3;
  if (avg >= 3.4 && state.totalServed >= 160 && state.totalProfit >= 25000) stars = 4;
  if (avg >= 4.0 && state.totalServed >= 280 && state.totalProfit >= 60000) stars = 5;
  // slow decay if rating crashes
  if (state.rating < avg - 0.8) stars = Math.max(1, stars - 1);
  return stars;
}

export function canRelocate(state: GameState, targetId: string): { ok: boolean; reason: string } {
  if (targetId === state.locationId) return { ok: false, reason: "已在此地" };
  const loc = getLocation(targetId as never);
  if (!loc || loc.id === "kiba") return { ok: false, reason: "无效地点" };
  if (state.stars < loc.relocateStars) return { ok: false, reason: `需要 ${loc.relocateStars}★` };
  if (state.cash < loc.relocateCash) return { ok: false, reason: `需要资金 ¥${loc.relocateCash.toLocaleString()}` };
  return { ok: true, reason: "" };
}
