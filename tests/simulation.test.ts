import assert from "node:assert/strict";
import test from "node:test";
import { computeDayCosts, dailyGoalFor } from "../app/game/economy";
import { createInitialState } from "../app/game/save";
import { closeDay, tick } from "../app/game/simulation";

function withSeed<T>(seed: number, run: () => T): T {
  const originalRandom = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
}

function runFreshDay(speed: 1 | 3, seed: number) {
  return withSeed(seed, () => {
    let state = createInitialState();
    state.speed = speed;
    for (let index = 1; state.minute < state.settings.closeMinute && index < 240; index += 1) {
      state = tick(state, index);
    }
    return closeDay(state);
  });
}

test("新店开门时服务生不会同时去清扫", () => {
  const state = withSeed(7, () => {
    const initial = createInitialState();
    initial.speed = 3;
    return tick(initial, 1);
  });

  assert.equal(state.tasks.some((task) => task.kind === "clean"), false);
  assert.equal(state.staff.filter((staff) => staff.role === "waiter" && staff.taskId != null).length, 0);
});

test("首日普通速度能完成完整服务链并产生营业额", () => {
  const { state, summary } = runFreshDay(1, 19);

  assert.equal(state.minute, state.settings.closeMinute);
  assert.ok(summary.guests >= 8, `expected at least 8 served guests, got ${summary.guests}`);
  assert.ok(summary.revenue > 0);
  assert.equal(summary.revenue, state.revenue);
  assert.ok(summary.maxQueue > 0);
});

test("三倍速不会让服务链失效", () => {
  const { summary } = runFreshDay(3, 19);

  assert.ok(summary.guests >= 8, `expected at least 8 served guests, got ${summary.guests}`);
  assert.ok(summary.revenue > 0);
  assert.ok(summary.costs > 0);
});

test("食材成本只按当天实际出餐累计", () => {
  const state = createInitialState();
  state.dayIngredientCost = 1234;

  const costs = computeDayCosts(state);

  assert.equal(costs.ingredient, 1234);
  assert.equal(costs.total, costs.payroll + costs.rent + costs.ingredient + costs.ads + costs.security);
});

test("达成每日经营目标会获得额外奖金", () => {
  const state = createInitialState();
  const goal = dailyGoalFor(state);
  state.served = goal.guestTarget;
  state.revenue = 10_000;
  state.dayIngredientCost = 1_000;

  const { state: closed, summary } = withSeed(31, () => closeDay(state));

  assert.equal(summary.goalGuestTarget, goal.guestTarget);
  assert.equal(summary.goalProfitTarget, goal.profitTarget);
  assert.equal(summary.goalBonus, goal.bonus);
  assert.ok(closed.totalProfit > summary.profit);
});
