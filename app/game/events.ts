import { securityLevel } from "./economy";
import type { GameState } from "./types";

export type EventResult = {
  toast: string;
  cashDelta: number;
  ratingDelta: number;
  cleanlinessDelta: number;
  note: string;
};

/** 日结后随机事件（对齐强盗/火灾/卫生检查/评论家/霸王餐） */
export function rollDailyEvent(state: GameState): EventResult | null {
  if (state.day - state.lastEventDay < 2 && Math.random() < 0.55) return null;
  const sec = securityLevel(state.security);
  const r = Math.random();

  // 强盗
  if (r < 0.08 && state.stars >= 2) {
    if (sec >= 3) {
      return {
        toast: "有可疑人物靠近，安保系统拦住了！",
        cashDelta: 0,
        ratingDelta: 0.02,
        cleanlinessDelta: 0,
        note: "安保奏效",
      };
    }
    const loss = Math.min(state.cash, 8000 + state.stars * 4000);
    const recovered = sec >= 2;
    return {
      toast: recovered ? `遭抢 ¥${loss.toLocaleString()}，翌日可追回部分` : `强盗掠走 ¥${loss.toLocaleString()}！`,
      cashDelta: recovered ? -Math.round(loss * 0.35) : -loss,
      ratingDelta: -0.05,
      cleanlinessDelta: 0,
      note: "强盗事件",
    };
  }

  // 火灾
  if (r < 0.12) {
    if (state.security.fire) {
      return {
        toast: "厨房冒烟，消防设备及时压住火势。",
        cashDelta: -400,
        ratingDelta: 0,
        cleanlinessDelta: -5,
        note: "轻微火警",
      };
    }
    return {
      toast: "厨房失火！损失惨重，清洁度暴跌。",
      cashDelta: -Math.min(state.cash, 15000),
      ratingDelta: -0.15,
      cleanlinessDelta: -40,
      note: "火灾",
    };
  }

  // 卫生检查
  if (r < 0.22) {
    if (state.atmosphere.cleanliness >= 70) {
      return {
        toast: "卫生突击检查顺利通过。",
        cashDelta: 500,
        ratingDelta: 0.04,
        cleanlinessDelta: 0,
        note: "卫检通过",
      };
    }
    return {
      toast: "卫生检查不合格，被罚款并扣评。",
      cashDelta: -2500,
      ratingDelta: -0.12,
      cleanlinessDelta: 0,
      note: "卫检不合格",
    };
  }

  // 美食评论家
  if (r < 0.32) {
    const good = state.rating >= 3.2 && state.atmosphere.cleanliness >= 55;
    return {
      toast: good ? "美食评论家暗访后给出好评！" : "美食评论家皱着眉离开了……",
      cashDelta: good ? 2000 : 0,
      ratingDelta: good ? 0.18 : -0.1,
      cleanlinessDelta: 0,
      note: good ? "评论家好评" : "评论家差评",
    };
  }

  // 霸王餐
  if (r < 0.4) {
    const loss = 800 + Math.floor(Math.random() * 1200);
    return {
      toast: `有客人未付账就溜走了（约 ¥${loss}）。`,
      cashDelta: -loss,
      ratingDelta: -0.02,
      cleanlinessDelta: 0,
      note: "霸王餐",
    };
  }

  // 杂志采访（正面）
  if (r < 0.48 && state.stars >= 3) {
    return {
      toast: "地方杂志采访了本店，人气上升。",
      cashDelta: 0,
      ratingDelta: 0.08,
      cleanlinessDelta: 0,
      note: "杂志采访",
    };
  }

  return null;
}
