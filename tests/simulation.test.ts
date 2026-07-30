import assert from "node:assert/strict";
import test from "node:test";
import { computeDayCosts, dailyGoalFor } from "../app/game/economy";
import { createInitialState } from "../app/game/save";
import {
  entranceCell,
  entranceOutsideCell,
  findPath,
  isUnlockedCell,
  queueCell,
  shopBounds,
} from "../app/game/pathfinding";
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

test("餐厅面积按 12×8、14×10、16×12 逐级开放", () => {
  assert.deepEqual(
    [shopBounds(0).width, shopBounds(0).height, shopBounds(1).width, shopBounds(1).height, shopBounds(2).width, shopBounds(2).height],
    [12, 8, 14, 10, 16, 12],
  );
  assert.equal(isUnlockedCell(1, 1, 0), false);
  assert.equal(isUnlockedCell(1, 1, 1), true);
  assert.equal(isUnlockedCell(0, 0, 1), false);
  assert.equal(isUnlockedCell(0, 0, 2), true);
});

test("寻路和入口会随扩建边界外移", () => {
  const state = createInitialState();
  assert.deepEqual(entranceCell(0), { x: 8, y: 9 });
  assert.deepEqual(entranceCell(2), { x: 8, y: 11 });
  assert.equal(findPath(state.items, entranceCell(0), { x: 1, y: 1 }, { expansionLevel: 0 }).length, 0);
  assert.ok(findPath(state.items, entranceCell(2), { x: 1, y: 1 }, { expansionLevel: 2 }).length > 0);
});

test("顾客在门外候位并从唯一入口进入", () => {
  const state = createInitialState();
  const bounds = shopBounds(0);
  assert.deepEqual(entranceOutsideCell(0), { x: 8, y: 10 });
  assert.ok(queueCell(0, 0).y > bounds.maxY);
  assert.ok(queueCell(4, 0).y > bounds.maxY);
  assert.ok(
    findPath(state.items, entranceOutsideCell(0), entranceCell(0), { expansionLevel: 0 }).length > 0,
  );
});
