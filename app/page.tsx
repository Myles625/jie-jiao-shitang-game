"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { canRelocate } from "./game/economy";
import { LOCATION_ORDER, getLocation } from "./game/locations";
import { createInitialState, loadSave, toolData, writeSave } from "./game/save";
import {
  cleanShop,
  closeDay,
  createStaff,
  nextDay,
  relocate,
  tick,
} from "./game/simulation";
import type {
  DaySummary,
  FurnitureType,
  GameState,
  GuestStage,
  LocationId,
  Panel,
  TaskKind,
  Tool,
} from "./game/types";
import { H, W } from "./game/types";

function timeLabel(minute: number) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function cellKey(x: number, y: number) {
  return `${x}-${y}`;
}

const STAGE_LABEL: Record<GuestStage, string> = {
  queue: "排队",
  seating: "入座",
  order: "点餐",
  waitingCook: "等菜",
  waitingServe: "待上",
  eat: "用餐",
  pay: "结账",
  leaving: "离店",
};

const TASK_LABEL: Record<TaskKind, string> = {
  seat: "领位",
  takeOrder: "点餐",
  deliverOrder: "传菜",
  cook: "烹饪",
  serve: "上菜",
  checkout: "结账",
};

const UNIFORM_LABEL = {
  casual: "便装",
  apron: "围裙",
  formal: "正装",
} as const;

function actorStyle(x: number, y: number): CSSProperties {
  return {
    left: `${((x + 0.5) / W) * 100}%`,
    top: `${((y + 0.5) / H) * 100}%`,
  };
}

export default function Home() {
  const [panel, setPanel] = useState<Panel>("build");
  const [tool, setTool] = useState<Tool>("select");
  const [game, setGame] = useState<GameState>(() => createInitialState());
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const tickRef = useRef(0);
  const closingRef = useRef(false);

  useEffect(() => {
    const saved = loadSave();
    if (saved) setGame(saved);
  }, []);

  useEffect(() => {
    if (!game.speed || summary) return;
    const timer = window.setInterval(() => {
      tickRef.current += 1;
      setGame((prev) => {
        const next = tick(prev, tickRef.current);
        if (next.minute >= 23 * 60 && !closingRef.current) {
          closingRef.current = true;
          window.setTimeout(() => {
            setGame((current) => {
              const result = closeDay(current);
              setSummary(result.summary);
              return result.state;
            });
          }, 0);
        }
        return next;
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [game.speed, summary]);

  const location = getLocation(game.locationId);
  const tables = useMemo(
    () => game.items.filter((i) => i.type === "table2" || i.type === "table4"),
    [game.items],
  );
  const kitchens = game.items.filter((i) => i.type === "kitchen").length;
  const queue = game.guests.filter((g) => g.stage === "queue").length;
  const activeGuests = game.guests
    .filter((g) => g.stage !== "queue" && g.stage !== "leaving")
    .reduce((sum, g) => sum + g.size, 0);
  const seatCount = tables.reduce((sum, t) => sum + (t.type === "table4" ? 4 : 2), 0);
  const waiters = game.staff.filter((s) => s.role === "waiter").length;
  const chefs = game.staff.filter((s) => s.role === "chef").length;
  const payrollPreview = game.staff.filter((s) => !s.onLeave).reduce((sum, s) => sum + s.wage, 0);

  const itemMap = useMemo(
    () => new Map(game.items.map((i) => [cellKey(i.x, i.y), i])),
    [game.items],
  );

  const taskById = useMemo(() => new Map(game.tasks.map((t) => [t.id, t])), [game.tasks]);
  const taskByGuest = useMemo(() => {
    const m = new Map<number, (typeof game.tasks)[0]>();
    for (const t of game.tasks) {
      if (!m.has(t.guestId) || (t.assigneeId != null && m.get(t.guestId)?.assigneeId == null)) {
        m.set(t.guestId, t);
      }
    }
    return m;
  }, [game.tasks]);

  function setSpeed(speed: number) {
    if (summary) return;
    setGame((g) => ({ ...g, speed }));
  }

  function clickCell(x: number, y: number) {
    if (game.speed) {
      setGame((g) => ({ ...g, toast: "营业中不能改装，先暂停营业" }));
      return;
    }
    const existing = game.items.find((i) => i.x === x && i.y === y);
    if (tool === "erase") {
      if (!existing) return;
      const refund = Math.round(toolData[existing.type].price * 0.4);
      setGame((g) => ({
        ...g,
        items: g.items.filter((i) => i.id !== existing.id),
        cash: g.cash + refund,
        toast: `已拆除${toolData[existing.type].name}，回收 ¥${refund}`,
      }));
      return;
    }
    if (tool === "select" || existing) return;
    const data = toolData[tool as FurnitureType];
    if (game.cash < data.price) {
      setGame((g) => ({ ...g, toast: "资金不足，先多经营几天吧" }));
      return;
    }
    setGame((g) => ({
      ...g,
      items: [...g.items, { id: g.nextId, type: tool as FurnitureType, x, y }],
      nextId: g.nextId + 1,
      cash: g.cash - data.price,
      toast: `已购入${data.name}`,
    }));
  }

  function updateDish(index: number, key: "price" | "quality", delta: number) {
    setGame((g) => ({
      ...g,
      dishes: g.dishes.map((d, i) =>
        i === index
          ? {
              ...d,
              [key]:
                key === "quality"
                  ? Math.max(1, Math.min(3, d.quality + delta))
                  : Math.max(d.cost + 5, d.price + delta),
            }
          : d,
      ),
    }));
  }

  function hire(role: "waiter" | "chef") {
    if (game.cash < 1200) {
      setGame((g) => ({ ...g, toast: "招聘需要 ¥1,200 手续费" }));
      return;
    }
    const count = game.staff.filter((s) => s.role === role).length;
    if (role === "waiter" && count >= 6) {
      setGame((g) => ({ ...g, toast: "服务生已达上限" }));
      return;
    }
    if (role === "chef" && count >= 5) {
      setGame((g) => ({ ...g, toast: "厨师已达上限" }));
      return;
    }
    setGame((g) => {
      const staff = createStaff(role, g.nextId, role === "chef" ? g.baseWage + 50 : g.baseWage, g.items);
      return {
        ...g,
        staff: [...g.staff, staff],
        nextId: g.nextId + 1,
        cash: g.cash - 1200,
        toast: `已招聘${staff.name}`,
      };
    });
  }

  function fireStaff(id: number) {
    setGame((g) => {
      const target = g.staff.find((s) => s.id === id);
      if (!target) return g;
      const sameRole = g.staff.filter((s) => s.role === target.role);
      if (sameRole.length <= 1) {
        return { ...g, toast: "至少保留一位同职位员工" };
      }
      return {
        ...g,
        staff: g.staff.filter((s) => s.id !== id),
        tasks: g.tasks.map((t) => (t.assigneeId === id ? { ...t, assigneeId: undefined, progress: 0 } : t)),
        toast: `${target.name}已被解雇`,
      };
    });
  }

  function toggleLeave(id: number) {
    setGame((g) => {
      const worker = g.staff.find((s) => s.id === id);
      if (!worker) return g;
      const goingOnLeave = !worker.onLeave;
      return {
        ...g,
        staff: g.staff.map((s) => {
          if (s.id !== id) return s;
          if (goingOnLeave) return { ...s, onLeave: true, taskId: undefined, path: [] };
          return { ...s, onLeave: false };
        }),
        tasks: goingOnLeave
          ? g.tasks.map((t) => (t.assigneeId === id ? { ...t, assigneeId: undefined, progress: 0 } : t))
          : g.tasks,
        toast: goingOnLeave ? `${worker.name}开始休假恢复心情` : `${worker.name}已结束休假`,
      };
    });
  }

  function setStaffWage(id: number, wage: number) {
    setGame((g) => ({
      ...g,
      staff: g.staff.map((s) => (s.id === id ? { ...s, wage } : s)),
    }));
  }

  function setBaseWage(wage: number) {
    setGame((g) => ({
      ...g,
      baseWage: wage,
      staff: g.staff.map((s) => ({
        ...s,
        wage: s.role === "chef" ? wage + 50 : wage,
      })),
    }));
  }

  function patchAtmosphere<K extends keyof GameState["atmosphere"]>(key: K, value: GameState["atmosphere"][K]) {
    setGame((g) => ({
      ...g,
      atmosphere: { ...g.atmosphere, [key]: value },
    }));
  }

  function tryRelocate(targetId: LocationId) {
    const check = canRelocate(game, targetId);
    if (!check.ok) {
      setGame((g) => ({ ...g, toast: check.reason }));
      return;
    }
    if (game.speed) {
      setGame((g) => ({ ...g, toast: "请先暂停营业再迁店" }));
      return;
    }
    setGame((g) => relocate(g, targetId));
  }

  function saveGame() {
    writeSave(game);
    setGame((g) => ({ ...g, toast: "经营记录已保存在这台设备" }));
  }

  function handleNextDay() {
    closingRef.current = false;
    tickRef.current = 0;
    setSummary(null);
    setGame((g) => nextDay(g));
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">街</span>
          <div>
            <strong>街角食堂</strong>
            <small>经营模拟 · 1998 MODE</small>
          </div>
        </div>
        <div className="datebox">
          <small>美食历 第一年</small>
          <b>
            1月 {game.day}日 · {game.stars}★
          </b>
        </div>
        <div className="clock">
          <span>{timeLabel(game.minute)}</span>
          <small>{game.speed ? "营业中" : "暂停"}</small>
        </div>
        <div className="stat">
          <small>总资金</small>
          <b>¥ {game.cash.toLocaleString()}</b>
        </div>
        <div className="stat">
          <small>今日营业额</small>
          <b>¥ {game.revenue.toLocaleString()}</b>
        </div>
        <div className="stat compact">
          <small>客人数</small>
          <b>{game.served}人</b>
        </div>
        <div className="stars" aria-label={`餐厅评价 ${game.rating.toFixed(1)} 星`}>
          <small>餐厅评价</small>
          <b>
            {"★".repeat(Math.round(game.rating))}
            <i>{"☆".repeat(5 - Math.round(game.rating))}</i>
          </b>
        </div>
        <button className="save" onClick={saveGame}>
          保存
        </button>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <nav>
            {(
              [
                ["build", "▦", "布置"],
                ["menu", "▤", "菜单"],
                ["staff", "♟", "员工"],
                ["ambiance", "♨", "氛围"],
                ["manual", "?", "规则"],
              ] as [Panel, string, string][]
            ).map(([id, icon, label]) => (
              <button key={id} className={panel === id ? "active" : ""} onClick={() => setPanel(id)}>
                <span>{icon}</span>
                {label}
              </button>
            ))}
          </nav>
          <div className="side-foot">
            <span>版本 0.2</span>
            <span>忠于经典规则的原创原型</span>
          </div>
        </aside>

        <section className="restaurant-wrap">
          <div className="street">
            <div className="sign">
              {location.name} · {location.sizeLabel}
            </div>
            <div className="passers">
              {["♙", "♟", "♙", "♟"].map((p, i) => (
                <span key={i} style={{ animationDelay: `${i * -2.1}s` }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div className="restaurant">
            <div className="wall back">
              <span>今日推荐</span>
              <span className="window">▥　▥</span>
              <span>营业中</span>
            </div>
            <div className="wall left" />
            <div className="grid" style={{ gridTemplateColumns: `repeat(${W}, 1fr)` }}>
              {Array.from({ length: W * H }, (_, n) => {
                const x = n % W;
                const y = Math.floor(n / W);
                const item = itemMap.get(cellKey(x, y));
                return (
                  <button
                    key={n}
                    className={`cell ${item ? `has-item ${item.type}` : ""} ${tool !== "select" && !item ? "buildable" : ""}`}
                    onClick={() => clickCell(x, y)}
                    aria-label={`${x + 1},${y + 1}${item ? ` ${toolData[item.type].name}` : " 空地"}`}
                  >
                    {item && (
                      <span className="furniture">
                        <i>{toolData[item.type].icon}</i>
                        <em>{toolData[item.type].name}</em>
                      </span>
                    )}
                  </button>
                );
              })}

              {game.guests.map((guest) => {
                const task = taskByGuest.get(guest.id);
                return (
                  <div
                    key={`g-${guest.id}`}
                    className={`actor guest mood-${guest.mood < 45 ? "bad" : "good"}`}
                    style={actorStyle(guest.x, guest.y)}
                    title={`${STAGE_LABEL[guest.stage]} · ${guest.size}人`}
                  >
                    <span className="actor-sprite">♟</span>
                    <span className="actor-meta">
                      {guest.size}
                      {guest.regularId ? "★" : ""}
                    </span>
                    {(task || guest.stage === "eat") && (
                      <span className="task-bubble">
                        {guest.stage === "eat" ? "用餐" : task ? TASK_LABEL[task.kind] : STAGE_LABEL[guest.stage]}
                      </span>
                    )}
                  </div>
                );
              })}

              {game.staff
                .filter((s) => !s.onLeave)
                .map((staff) => {
                  const task = staff.taskId != null ? taskById.get(staff.taskId) : undefined;
                  return (
                    <div
                      key={`s-${staff.id}`}
                      className={`actor staff role-${staff.role} ${task ? "busy" : "idle"}`}
                      style={actorStyle(staff.x, staff.y)}
                      title={`${staff.name} · ${staff.role === "chef" ? "厨师" : "服务生"}`}
                    >
                      <span className="actor-sprite">{staff.role === "chef" ? "♨" : "♙"}</span>
                      {task && <span className="task-bubble">{TASK_LABEL[task.kind]}</span>}
                    </div>
                  );
                })}
            </div>
            <div className="entrance">
              入口 <span>▼</span>
            </div>
            <div className="queue">
              {game.guests
                .filter((g) => g.stage === "queue")
                .slice(0, 5)
                .map((g) => (
                  <span key={g.id}>
                    ♟<i>{g.size}</i>
                  </span>
                ))}
              {queue > 5 && <b>+{queue - 5}</b>}
            </div>
          </div>
          <div className="status-strip">
            <span>
              座位 <b>{seatCount}</b>
            </span>
            <span>
              店内顾客 <b>{activeGuests}</b>
            </span>
            <span>
              排队 <b className={queue > 3 ? "danger" : ""}>{queue}</b>
            </span>
            <span>
              料理台 <b>{kitchens}</b>
            </span>
            <span>
              员工 <b>
                {waiters}服/{chefs}厨
              </b>
            </span>
            <p>{game.toast}</p>
          </div>
        </section>

        <aside className="control-panel">
          {panel === "build" && (
            <>
              <div className="panel-title">
                <span>01</span>
                <div>
                  <h2>店内布置</h2>
                  <p>选择设备，再点击地板放置</p>
                </div>
              </div>
              <div className="tool-grid">
                <button className={tool === "select" ? "selected" : ""} onClick={() => setTool("select")}>
                  <i>↖</i>
                  <b>查看</b>
                  <small>不改动</small>
                </button>
                {(Object.keys(toolData) as FurnitureType[]).map((key) => (
                  <button key={key} className={tool === key ? "selected" : ""} onClick={() => setTool(key)}>
                    <i>{toolData[key].icon}</i>
                    <b>{toolData[key].name}</b>
                    <small>¥{toolData[key].price.toLocaleString()}</small>
                  </button>
                ))}
                <button className={`erase-tool ${tool === "erase" ? "selected" : ""}`} onClick={() => setTool("erase")}>
                  <i>×</i>
                  <b>拆除</b>
                  <small>返还40%</small>
                </button>
              </div>
              <div className="tip-card">
                <b>布局诀窍</b>
                <p>不同桌型决定能接待的客群。厨房不足会让等菜时间变长；当客人失去耐心，评价会下降。</p>
              </div>
            </>
          )}

          {panel === "menu" && (
            <>
              <div className="panel-title">
                <span>02</span>
                <div>
                  <h2>菜单与食材</h2>
                  <p>价格、品质与库存相互制衡</p>
                </div>
              </div>
              <div className="dish-list">
                {game.dishes.map((dish, i) => (
                  <article key={dish.name}>
                    <div className="dish-head">
                      <i>{dish.icon}</i>
                      <div>
                        <b>{dish.name}</b>
                        <small>
                          成本 ¥{dish.cost} · 库存 {dish.stock}
                        </small>
                      </div>
                    </div>
                    <label>
                      售价{" "}
                      <span>
                        <button onClick={() => updateDish(i, "price", -5)}>−</button>
                        <b>¥{dish.price}</b>
                        <button onClick={() => updateDish(i, "price", 5)}>＋</button>
                      </span>
                    </label>
                    <label>
                      材料等级{" "}
                      <span>
                        <button onClick={() => updateDish(i, "quality", -1)}>−</button>
                        <b>
                          {"◆".repeat(dish.quality)}
                          {"◇".repeat(3 - dish.quality)}
                        </b>
                        <button onClick={() => updateDish(i, "quality", 1)}>＋</button>
                      </span>
                    </label>
                  </article>
                ))}
              </div>
              <div className="tip-card">
                <b>经典规则</b>
                <p>便宜、份量足、材料好，会提高评价；但食材成本也会在打烊时结算。</p>
              </div>
            </>
          )}

          {panel === "staff" && (
            <>
              <div className="panel-title">
                <span>03</span>
                <div>
                  <h2>员工管理</h2>
                  <p>经验、工资与心情决定速度</p>
                </div>
              </div>
              <div className="hire-row">
                <button onClick={() => hire("waiter")}>招聘服务生 · ¥1,200</button>
                <button onClick={() => hire("chef")}>招聘厨师 · ¥1,200</button>
              </div>
              <div className="wage-box">
                <label>
                  基准日薪 <b>¥{game.baseWage}</b>
                </label>
                <input
                  type="range"
                  min="450"
                  max="1200"
                  step="50"
                  value={game.baseWage}
                  onChange={(e) => setBaseWage(Number(e.target.value))}
                />
                <small>调整基准会同步服务生/厨师日薪（厨师 +50）。过低会降心情并可能离职。</small>
              </div>
              <div className="staff-list">
                {game.staff.map((s) => (
                  <article key={s.id} className={`staff-card detailed ${s.onLeave ? "on-leave" : ""}`}>
                    <i>{s.role === "chef" ? "♨" : "♟"}</i>
                    <div>
                      <b>
                        {s.name}
                        {s.onLeave ? " · 休假中" : ""}
                      </b>
                      <small>
                        {s.role === "chef" ? "厨师" : "服务生"} · 经验 {Math.floor(s.exp)} · 心情{" "}
                        {Math.round(s.mood)}
                      </small>
                      <label className="wage-inline">
                        日薪
                        <input
                          type="range"
                          min="400"
                          max="1400"
                          step="25"
                          value={s.wage}
                          onChange={(e) => setStaffWage(s.id, Number(e.target.value))}
                        />
                        <em>¥{s.wage}</em>
                      </label>
                    </div>
                    <div className="staff-actions">
                      <button onClick={() => toggleLeave(s.id)}>{s.onLeave ? "复工" : "休假"}</button>
                      <button className="danger" onClick={() => fireStaff(s.id)}>
                        解雇
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="cost-preview">
                <span>预计每日工资</span>
                <b>¥{payrollPreview.toLocaleString()}</b>
              </div>
            </>
          )}

          {panel === "ambiance" && (
            <>
              <div className="panel-title">
                <span>04</span>
                <div>
                  <h2>店铺氛围</h2>
                  <p>温度、音乐、制服与清洁影响耐心</p>
                </div>
              </div>
              <div className="ambiance-panel">
                <label>
                  店内温度 <b>{game.atmosphere.temperature}°</b>
                  <input
                    type="range"
                    min="30"
                    max="90"
                    value={game.atmosphere.temperature}
                    onChange={(e) => patchAtmosphere("temperature", Number(e.target.value))}
                  />
                  <small>约 50–74° 最舒适</small>
                </label>
                <label className="toggle-row">
                  <span>背景音乐</span>
                  <button
                    className={game.atmosphere.music ? "on" : ""}
                    onClick={() => patchAtmosphere("music", !game.atmosphere.music)}
                  >
                    {game.atmosphere.music ? "开" : "关"}
                  </button>
                </label>
                <label>
                  制服风格
                  <div className="chip-row">
                    {(["casual", "apron", "formal"] as const).map((u) => (
                      <button
                        key={u}
                        className={game.atmosphere.uniform === u ? "on" : ""}
                        onClick={() => patchAtmosphere("uniform", u)}
                      >
                        {UNIFORM_LABEL[u]}
                      </button>
                    ))}
                  </div>
                </label>
                <div className="clean-meter">
                  <span>
                    清洁度 <b>{Math.round(game.atmosphere.cleanliness)}</b>
                  </span>
                  <i style={{ width: `${game.atmosphere.cleanliness}%` }} />
                  <button onClick={() => setGame((g) => cleanShop(g))}>打扫 · ¥200</button>
                </div>
                <label className="toggle-row">
                  <span>街头广告（日费 ¥650）</span>
                  <button
                    className={game.atmosphere.ads ? "on" : ""}
                    onClick={() => patchAtmosphere("ads", !game.atmosphere.ads)}
                  >
                    {game.atmosphere.ads ? "投放中" : "未投放"}
                  </button>
                </label>
              </div>

              <div className="panel-title relocate-title">
                <span>★</span>
                <div>
                  <h2>迁店</h2>
                  <p>
                    当前 {location.name} · 星级 {game.stars}★
                  </p>
                </div>
              </div>
              <div className="relocate-list">
                {LOCATION_ORDER.map((id) => {
                  const loc = getLocation(id);
                  const here = id === game.locationId;
                  const check = canRelocate(game, id);
                  return (
                    <article key={id} className={here ? "here" : ""}>
                      <div>
                        <b>
                          {loc.name} · {loc.sizeLabel}
                        </b>
                        <small>
                          租金 ¥{loc.rent}/日 · 人流 ×{loc.footfall}
                          {!here && ` · 需 ${loc.relocateStars}★ / ¥${loc.relocateCash.toLocaleString()}`}
                        </small>
                      </div>
                      {here ? (
                        <em>营业中</em>
                      ) : (
                        <button disabled={!check.ok} onClick={() => tryRelocate(id)} title={check.reason || "迁店"}>
                          {check.ok ? "迁入" : check.reason}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {panel === "manual" && (
            <>
              <div className="panel-title">
                <span>?</span>
                <div>
                  <h2>规则手册</h2>
                  <p>根据旧说明与攻略还原</p>
                </div>
              </div>
              <div className="manual">
                <section>
                  <b>经营目标</b>
                  <p>从木场的小店起步，通过满意度、营业额与利润提升星级，再迁往更热闹的街区。</p>
                </section>
                <section>
                  <b>顾客循环</b>
                  <p>排队 → 服务生领位 → 点餐 → 厨房制作 → 上菜 → 用餐 → 结账 → 评价离店。</p>
                </section>
                <section>
                  <b>评价逻辑</b>
                  <p>价格、材料、等待时间、口味匹配与预算共同影响评价；老顾客会保留印象。</p>
                </section>
                <section>
                  <b>地点差异</b>
                  <p>
                    当前：{location.name}。木场租金低但人流少；高田马场看重性价比；神田偏正式高消费。
                  </p>
                </section>
                <section>
                  <b>氛围与人事</b>
                  <p>温度/音乐/清洁/广告影响耐心与客流；工资过低会降心情，连续低落可能离职。</p>
                </section>
              </div>
            </>
          )}
        </aside>
      </section>

      <footer className="bottombar">
        <div className="day-goal">
          <small>今日建议</small>
          <b>接待 20 位客人且不让排队超过 4 组 · 保持店面整洁</b>
        </div>
        <div className="speed-controls">
          <button className={game.speed === 0 ? "on" : ""} onClick={() => setSpeed(0)}>
            Ⅱ
          </button>
          <button className={game.speed === 1 ? "on" : ""} onClick={() => setSpeed(1)}>
            ▶
          </button>
          <button className={game.speed === 3 ? "on" : ""} onClick={() => setSpeed(3)}>
            ▶▶
          </button>
        </div>
        <button
          className="open-button"
          onClick={() => setSpeed(game.speed ? 0 : 1)}
          disabled={game.minute >= 23 * 60 || !!summary}
        >
          <span>{game.speed ? "暂停营业" : game.minute >= 23 * 60 ? "今日已打烊" : "开始营业"}</span>
          <small>
            {timeLabel(game.minute)} — 23:00
          </small>
        </button>
      </footer>

      {summary && (
        <div className="modal-backdrop">
          <section className="ledger">
            <div className="ledger-top">
              <small>DAILY REPORT</small>
              <h2>第 {game.day} 日营业账簿</h2>
              <p>今天的店铺表现已经汇总 · 星级 {summary.stars}★</p>
            </div>
            <div className="ledger-grid">
              <span>
                接待客人<b>{summary.guests} 人</b>
              </span>
              <span>
                餐厅评价<b>{summary.rating.toFixed(1)} ★</b>
              </span>
              <span>
                营业收入<b>¥{summary.revenue.toLocaleString()}</b>
              </span>
              <span>
                工资·租金·食材·广告<b>−¥{summary.costs.toLocaleString()}</b>
              </span>
            </div>
            <div className={`profit ${summary.profit < 0 ? "loss" : ""}`}>
              <small>今日纯利润</small>
              <b>
                {summary.profit >= 0 ? "+" : "−"} ¥{Math.abs(summary.profit).toLocaleString()}
              </b>
            </div>
            <p className="ledger-note">
              {summary.guests < 15
                ? "客流还不够。试试增加桌位、投放广告，并维持合理价格。"
                : summary.rating < 3
                  ? "客人等得有点久，增聘员工、打扫店面或增加料理台吧。"
                  : "口碑正在传开，明天会有更多客人慕名而来。"}
            </p>
            <button onClick={handleNextDay}>进入第 {game.day + 1} 日</button>
          </section>
        </div>
      )}
    </main>
  );
}
