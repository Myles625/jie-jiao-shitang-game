"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { canRelocate } from "./game/economy";
import { LOCATION_ORDER, calendarFromDay, getLocation } from "./game/locations";
import { createInitialState, loadSave, toolData, writeSave } from "./game/save";
import RestaurantSceneClient from "./game/scene/RestaurantSceneClient";
import {
  cleanShop,
  closeDay,
  createStaff,
  hireCleanCompany,
  nextDay,
  relocate,
  tick,
} from "./game/simulation";
import type {
  DaySummary,
  Difficulty,
  DrinkPair,
  EntranceStyle,
  FloorStyle,
  FurnitureType,
  GameState,
  LocationId,
  MusicStyle,
  Panel,
  Tool,
  WallStyle,
} from "./game/types";
import { DEFAULT_RESTAURANT_NAME, SECRET_DISH_NAME } from "./game/types";

function timeLabel(minute: number) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const UNIFORM_LABEL = { casual: "便装", apron: "围裙", formal: "正装" } as const;
const MUSIC_LABEL: Record<MusicStyle, string> = {
  off: "关",
  dream: "梦幻",
  classic: "古典",
  rock: "摇滚",
  folk: "民谣",
  enka: "演歌",
  tropical: "南洋",
};
const PAIR_LABEL: Record<DrinkPair, string> = {
  none: "无",
  beer: "啤酒",
  red: "红酒",
  white: "白酒",
};
const FLOOR_LABEL: Record<FloorStyle, string> = { wood: "木地板", tile: "瓷砖", carpet: "地毯" };
const WALL_LABEL: Record<WallStyle, string> = { cream: "奶油墙", brick: "砖墙", panel: "护墙板" };
const ENTRANCE_LABEL: Record<EntranceStyle, string> = { classic: "木门", glass: "玻璃门", lattice: "格子门" };
const DIFF_LABEL: Record<Difficulty, string> = { easy: "轻松", normal: "标准", hard: "严格" };

const PANEL_LABEL: Record<Panel, string> = {
  build: "店内布置",
  menu: "菜单与食材",
  staff: "员工管理",
  ambiance: "店铺氛围",
  settings: "一般设定",
  manual: "规则手册",
};

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function tableCap(type: string): number {
  if (type === "table1") return 1;
  if (type === "table2") return 2;
  if (type === "table4") return 4;
  if (type === "table6") return 6;
  return 0;
}

export default function Home() {
  const [panel, setPanel] = useState<Panel>("build");
  const [panelOpen, setPanelOpen] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [game, setGame] = useState<GameState>(() => createInitialState());
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const tickRef = useRef(0);
  const closingRef = useRef(false);

  function openPanel(id: Panel) {
    if (panelOpen && panel === id) {
      setPanelOpen(false);
      return;
    }
    setPanel(id);
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
  }

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

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
        if (next.minute >= next.settings.closeMinute && !closingRef.current) {
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
  const cal = calendarFromDay(game.day);
  const tables = useMemo(
    () => game.items.filter((i) => tableCap(i.type) > 0),
    [game.items],
  );
  const kitchens = game.items.filter((i) => i.type === "kitchen").length;
  const queue = game.guests.filter((g) => g.stage === "queue").length;
  const activeGuests = game.guests
    .filter((g) => g.stage !== "queue" && g.stage !== "leaving")
    .reduce((sum, g) => sum + g.size, 0);
  const seatCount = tables.reduce((sum, t) => sum + tableCap(t.type), 0);
  const payrollPreview = game.staff.filter((s) => !s.onLeave).reduce((sum, s) => sum + s.wage, 0);

  function setSpeed(speed: number) {
    if (summary) return;
    if (speed > 0) {
      const cal = calendarFromDay(game.day);
      if (game.settings.closedWeekday >= 0 && cal.weekday === game.settings.closedWeekday) {
        setGame((g) => ({ ...g, toast: "今日定休，无法营业" }));
        return;
      }
      if (game.minute < game.settings.openMinute) {
        setGame((g) => ({ ...g, minute: g.settings.openMinute, speed, toast: "已到开门时间，开始营业" }));
        return;
      }
      if (game.minute >= game.settings.closeMinute) {
        setGame((g) => ({ ...g, toast: "已过打烊时间" }));
        return;
      }
      setGame((g) => ({ ...g, speed, toast: "店内营业中" }));
      return;
    }
    setGame((g) => ({ ...g, speed: 0, toast: "已暂停营业" }));
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
      items: [
        ...g.items,
        { id: g.nextId, type: tool as FurnitureType, x, y, buyOrder: g.nextBuyOrder },
      ],
      nextId: g.nextId + 1,
      nextBuyOrder: g.nextBuyOrder + 1,
      cash: g.cash - data.price,
      toast: `已购入${data.name}（带位序 ${g.nextBuyOrder}）`,
    }));
  }

  function updateDish(
    index: number,
    key: "price" | "quality" | "portion" | "intensity" | "oiliness" | "stock" | "cookTime",
    delta: number,
  ) {
    setGame((g) => ({
      ...g,
      dishes: g.dishes.map((d, i) => {
        if (i !== index) return d;
        if (key === "quality") return { ...d, quality: Math.max(1, Math.min(5, d.quality + delta)) };
        if (key === "portion") return { ...d, portion: Math.max(1, Math.min(5, d.portion + delta)) };
        if (key === "intensity") return { ...d, intensity: Math.max(1, Math.min(5, d.intensity + delta)) };
        if (key === "oiliness") return { ...d, oiliness: Math.max(1, Math.min(5, d.oiliness + delta)) };
        if (key === "stock") return { ...d, stock: Math.max(0, d.stock + delta) };
        if (key === "cookTime")
          return { ...d, cookTime: Math.max(0.3, Math.min(2, Math.round((d.cookTime + delta) * 10) / 10)) };
        return { ...d, price: Math.max(d.cost + 3, d.price + delta) };
      }),
    }));
  }

  function setPairDrink(index: number, pair: DrinkPair) {
    setGame((g) => ({
      ...g,
      dishes: g.dishes.map((d, i) => (i === index ? { ...d, pairDrink: pair } : d)),
    }));
  }

  function patchSettings<K extends keyof GameState["settings"]>(key: K, value: GameState["settings"][K]) {
    setGame((g) => ({ ...g, settings: { ...g.settings, [key]: value } }));
  }

  function toggleMenu(index: number) {
    setGame((g) => {
      const dish = g.dishes[index];
      if (!dish) return g;
      if (dish.name === SECRET_DISH_NAME && !g.cookbookUnlocked && !dish.onMenu) {
        return { ...g, toast: "需先获得「年度最佳食堂」解锁秘传菜谱" };
      }
      return {
        ...g,
        dishes: g.dishes.map((d, i) => (i === index ? { ...d, onMenu: !d.onMenu } : d)),
      };
    });
  }

  function hire(role: "waiter" | "chef") {
    if (game.cash < 1200) {
      setGame((g) => ({ ...g, toast: "招聘需要 ¥1,200 手续费" }));
      return;
    }
    const count = game.staff.filter((s) => s.role === role).length;
    if (role === "waiter" && count >= 8) {
      setGame((g) => ({ ...g, toast: "服务生已满编" }));
      return;
    }
    if (role === "chef" && count >= 5) {
      setGame((g) => ({ ...g, toast: "厨师已满编" }));
      return;
    }
    setGame((g) => {
      const staff = createStaff(role, g.nextId, role === "chef" ? g.baseWage + 50 : g.baseWage, g.items);
      return {
        ...g,
        staff: [...g.staff, staff],
        nextId: g.nextId + 1,
        cash: g.cash - 1200,
        toast: `已招聘 ${staff.name}`,
      };
    });
  }

  function setStaffWage(id: number, wage: number) {
    setGame((g) => ({ ...g, staff: g.staff.map((s) => (s.id === id ? { ...s, wage } : s)) }));
  }

  function setCleanInterval(id: number, minutes: number) {
    setGame((g) => ({
      ...g,
      staff: g.staff.map((s) => (s.id === id ? { ...s, cleanInterval: minutes } : s)),
    }));
  }

  function toggleLeave(id: number) {
    setGame((g) => ({
      ...g,
      staff: g.staff.map((s) => (s.id === id ? { ...s, onLeave: !s.onLeave, taskId: undefined, path: [] } : s)),
      toast: "已更新休假状态",
    }));
  }

  function fireStaff(id: number) {
    const target = game.staff.find((s) => s.id === id);
    if (!target) return;
    const same = game.staff.filter((s) => s.role === target.role);
    if (same.length <= 1) {
      setGame((g) => ({ ...g, toast: "至少保留一名该岗位员工" }));
      return;
    }
    setGame((g) => ({
      ...g,
      staff: g.staff.filter((s) => s.id !== id),
      tasks: g.tasks.map((t) => (t.assigneeId === id ? { ...t, assigneeId: undefined } : t)),
      toast: `${target.name} 已解雇`,
    }));
  }

  function setBaseWage(wage: number) {
    setGame((g) => ({
      ...g,
      baseWage: wage,
      staff: g.staff.map((s) => ({ ...s, wage: s.role === "chef" ? wage + 50 : wage })),
    }));
  }

  function patchAtmosphere<K extends keyof GameState["atmosphere"]>(key: K, value: GameState["atmosphere"][K]) {
    setGame((g) => ({ ...g, atmosphere: { ...g.atmosphere, [key]: value } }));
  }

  function patchSecurity<K extends keyof GameState["security"]>(key: K, value: boolean) {
    const prices = { camera: 8000, infrared: 6000, fire: 10000, alarm: 5000 };
    setGame((g) => {
      if (value && !g.security[key]) {
        const price = prices[key];
        if (g.cash < price) return { ...g, toast: `购置需要 ¥${price.toLocaleString()}` };
        return {
          ...g,
          cash: g.cash - price,
          security: { ...g.security, [key]: true },
          toast: "安保设备已安装",
        };
      }
      return { ...g, security: { ...g.security, [key]: value } };
    });
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

  function goNextDay() {
    setSummary(null);
    closingRef.current = false;
    tickRef.current = 0;
    setGame((g) => nextDay(g));
  }

  return (
    <main className={`game-shell ${panelOpen ? "is-panel-open" : "is-panel-closed"}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">街</span>
          <strong>{game.restaurantName}</strong>
        </div>
        <div className="datebox">
          <small>
            第{cal.year}年 {cal.month}/{cal.date} 周{WEEKDAY[cal.weekday]}
          </small>
        </div>
        <div className="clock">
          <span>{timeLabel(game.minute)}</span>
          <small>{game.speed ? "营业中" : "暂停"}</small>
        </div>
        <div className="stat">
          <small>资金</small>
          <b>¥{game.cash.toLocaleString()}</b>
        </div>
        <div className="stat">
          <small>营业额</small>
          <b>¥{game.revenue.toLocaleString()}</b>
        </div>
        <div className="stat compact">
          <small>客人</small>
          <b>{game.served}</b>
        </div>
        <div className="stars" aria-label={`餐厅评价 ${game.rating.toFixed(1)} 星`}>
          <b>
            {"★".repeat(Math.round(game.stars))}
            <i>{"☆".repeat(5 - Math.round(game.stars))}</i>
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
                ["settings", "⚙", "设定"],
                ["manual", "?", "规则"],
              ] as [Panel, string, string][]
            ).map(([id, icon, label]) => (
              <button
                key={id}
                className={panelOpen && panel === id ? "active" : ""}
                onClick={() => openPanel(id)}
                title={label}
              >
                <span>{icon}</span>
                {label}
              </button>
            ))}
          </nav>
          <div className="side-foot">
            <span>v0.6</span>
            <button type="button" className="panel-toggle" onClick={() => (panelOpen ? closePanel() : openPanel(panel))}>
              {panelOpen ? "收起" : "管理"}
            </button>
          </div>
        </aside>

        <section className="restaurant-wrap">
          <div className="city-stage cutaway-stage scene-host">
            <RestaurantSceneClient
              items={game.items}
              guests={game.guests}
              staff={game.staff}
              tasks={game.tasks}
              tool={tool}
              locationLabel={`${location.name} · ${location.sizeLabel}`}
              restaurantName={game.restaurantName}
              simSpeed={game.speed}
              onCellClick={clickCell}
              floorStyle={game.atmosphere.floorStyle}
              wallStyle={game.atmosphere.wallStyle}
              entranceStyle={game.atmosphere.entranceStyle}
              showBubbles={game.settings.showBubbles}
            />
            <div className="float-status" aria-label="店铺状态">
              <div className="float-row">
                <small>地点</small>
                <b>
                  {location.name}
                  <em>{location.sizeLabel}</em>
                </b>
              </div>
              <div className="float-row">
                <small>店名</small>
                <b>{game.restaurantName}</b>
              </div>
              <div className="float-row dual">
                <span>
                  <small>今日客</small>
                  <b>{game.served}</b>
                </span>
                <span>
                  <small>营业额</small>
                  <b>¥{game.revenue.toLocaleString()}</b>
                </span>
              </div>
              <div className="float-row dual">
                <span>
                  <small>营业</small>
                  <b>
                    {timeLabel(game.settings.openMinute)}–{timeLabel(game.settings.closeMinute)}
                  </b>
                </span>
                <span>
                  <small>难度</small>
                  <b>{DIFF_LABEL[game.settings.difficulty]}</b>
                </span>
              </div>
            </div>
            <div className="queue-dock" aria-label="门外排队">
              <span className="queue-label">门口排队</span>
              <div className="queue">
                {game.guests
                  .filter((g) => g.stage === "queue")
                  .slice(0, 6)
                  .map((g) => (
                    <span key={g.id} className="queue-chip" title={`${g.size}人`}>
                      <i className="queue-avatar" style={{ background: ["#3d6b8c","#c45a6e","#4a7c59","#d4a84a","#6a5a8c"][g.id % 5] }} />
                      <b>{g.size}</b>
                    </span>
                  ))}
                {queue > 6 && <b className="queue-more">+{queue - 6}</b>}
                {queue === 0 && <em className="queue-empty">暂无</em>}
              </div>
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
              清洁 <b>{Math.round(game.atmosphere.cleanliness)}</b>
            </span>
            <p>{game.toast}</p>
          </div>
        </section>
      </section>

      <footer className="bottombar">
        <div className="day-goal">
          <small>今日建议</small>
          <b>
            {location.name}：先小桌后大桌，酒水别断货，温度调到 23–26℃
          </b>
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
          disabled={game.minute >= game.settings.closeMinute}
        >
          <span>{game.speed ? "暂停营业" : game.minute >= game.settings.closeMinute ? "今日已打烊" : "开始营业"}</span>
          <small>
            {timeLabel(game.minute)} — {timeLabel(game.settings.closeMinute)}
          </small>
        </button>
      </footer>

      {panelOpen && panel !== "build" && (
        <button type="button" className="panel-backdrop" aria-label="关闭面板" onClick={closePanel} />
      )}

      <aside
        className={`control-panel ${panel === "build" ? "is-drawer" : "is-modal"} ${panelOpen ? "is-open" : ""}`}
        aria-hidden={!panelOpen}
        role="dialog"
        aria-modal={panel !== "build"}
        aria-label={PANEL_LABEL[panel]}
      >
        <header className="panel-sticky-head">
          <strong>{PANEL_LABEL[panel]}</strong>
          <button type="button" className="panel-close" onClick={closePanel}>
            关闭
          </button>
        </header>
        <div className="panel-body">
          {panel === "build" && (
            <>
              <div className="panel-title">
                <span>01</span>
                <div>
                  <h2>店内布置</h2>
                  <p>先买小桌再买大桌——带位按购买顺序</p>
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
                <b>一代规则</b>
                <p>
                  带位顺序跟购买桌椅顺序走。先摆六人桌，一个人也会占大桌。卫生间影响清洁；厨房近处放高翻台桌。
                </p>
              </div>
            </>
          )}

          {panel === "menu" && (
            <>
              <div className="panel-title">
                <span>02</span>
                <div>
                  <h2>菜单与食材</h2>
                  <p>售价、份量、浓淡、材料、调理时间</p>
                </div>
              </div>
              <div className="dish-list">
                {game.dishes.map((dish, i) => (
                  <article key={dish.name} className={!dish.onMenu ? "off-menu" : ""}>
                    <div className="dish-head">
                      <i>{dish.icon}</i>
                      <div>
                        <b>
                          {dish.name}
                          <small className="kind-tag">
                            {dish.kind === "food" ? "料理" : dish.kind === "drink" ? "饮料" : "酒"}
                          </small>
                        </b>
                        <small>
                          成本 ¥{dish.cost} · 库存 {dish.stock}
                        </small>
                      </div>
                      <button className="menu-toggle" onClick={() => toggleMenu(i)}>
                        {dish.onMenu ? "上架" : "下架"}
                      </button>
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
                      材料{" "}
                      <span>
                        <button onClick={() => updateDish(i, "quality", -1)}>−</button>
                        <b>{"◆".repeat(dish.quality)}{"◇".repeat(Math.max(0, 5 - dish.quality))}</b>
                        <button onClick={() => updateDish(i, "quality", 1)}>＋</button>
                      </span>
                    </label>
                    <label>
                      份量{" "}
                      <span>
                        <button onClick={() => updateDish(i, "portion", -1)}>−</button>
                        <b>{dish.portion}</b>
                        <button onClick={() => updateDish(i, "portion", 1)}>＋</button>
                      </span>
                    </label>
                    <label>
                      浓淡{" "}
                      <span>
                        <button onClick={() => updateDish(i, "intensity", -1)}>−</button>
                        <b>{dish.intensity}</b>
                        <button onClick={() => updateDish(i, "intensity", 1)}>＋</button>
                      </span>
                    </label>
                    <label>
                      油度{" "}
                      <span>
                        <button onClick={() => updateDish(i, "oiliness", -1)}>−</button>
                        <b>{dish.oiliness}</b>
                        <button onClick={() => updateDish(i, "oiliness", 1)}>＋</button>
                      </span>
                    </label>
                    {dish.kind === "food" && (
                      <label>
                        搭配酒水
                        <div className="chip-row compact">
                          {(Object.keys(PAIR_LABEL) as DrinkPair[]).map((p) => (
                            <button
                              key={p}
                              className={dish.pairDrink === p ? "on" : ""}
                              onClick={() => setPairDrink(i, p)}
                            >
                              {PAIR_LABEL[p]}
                            </button>
                          ))}
                        </div>
                      </label>
                    )}
                    {dish.kind === "food" && (
                      <label>
                        调理{" "}
                        <span>
                          <button onClick={() => updateDish(i, "cookTime", -0.1)}>−</button>
                          <b>×{dish.cookTime.toFixed(1)}</b>
                          <button onClick={() => updateDish(i, "cookTime", 0.1)}>＋</button>
                        </span>
                      </label>
                    )}
                    <label>
                      进货{" "}
                      <span>
                        <button onClick={() => updateDish(i, "stock", -5)}>−</button>
                        <b>{dish.stock}</b>
                        <button onClick={() => updateDish(i, "stock", 5)}>＋</button>
                      </span>
                    </label>
                  </article>
                ))}
              </div>
              <div className="tip-card">
                <b>经典规则</b>
                <p>酒水登录要齐；任何酒断货都会让客人失望。份量足、材料好、调理快，翻台更高。</p>
              </div>
            </>
          )}

          {panel === "staff" && (
            <>
              <div className="panel-title">
                <span>03</span>
                <div>
                  <h2>员工管理</h2>
                  <p>速度、接待、清扫间隔与心情</p>
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
                <small>过低会降心情并可能离职。经验提升后动作更快。</small>
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
                      <small className="stat-line">
                        {s.role === "chef"
                          ? `机动${s.speedStat} · 调理${Math.round(s.cookSkill)} · 习得${s.learnRate} · 忍耐${s.endurance}`
                          : `机动${s.speedStat} · 洞察${s.receptionStat} · 魅力${s.charm} · 习得${s.learnRate} · 忍耐${s.endurance}`}
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
                      {s.role === "waiter" && (
                        <label className="wage-inline">
                          清扫间隔
                          <select
                            value={s.cleanInterval}
                            onChange={(e) => setCleanInterval(s.id, Number(e.target.value))}
                          >
                            <option value={0}>不扫</option>
                            <option value={60}>1小时</option>
                            <option value={120}>2小时</option>
                            <option value={240}>4小时</option>
                          </select>
                        </label>
                      )}
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
                  <p>温度、音乐、高级感与安保</p>
                </div>
              </div>
              <div className="ambiance-panel">
                <label>
                  店内温度 <b>{game.atmosphere.temperature}℃</b>
                  <input
                    type="range"
                    min="16"
                    max="34"
                    value={game.atmosphere.temperature}
                    onChange={(e) => patchAtmosphere("temperature", Number(e.target.value))}
                  />
                  <small>约 23–26℃ 最舒适（对齐一代空调习惯）</small>
                </label>
                <label>
                  背景音乐
                  <div className="chip-row">
                    {(Object.keys(MUSIC_LABEL) as MusicStyle[]).map((m) => (
                      <button
                        key={m}
                        className={game.atmosphere.music === m ? "on" : ""}
                        onClick={() => patchAtmosphere("music", m)}
                      >
                        {MUSIC_LABEL[m]}
                      </button>
                    ))}
                  </div>
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
                <label>
                  地板
                  <div className="chip-row">
                    {(Object.keys(FLOOR_LABEL) as FloorStyle[]).map((f) => (
                      <button
                        key={f}
                        className={game.atmosphere.floorStyle === f ? "on" : ""}
                        onClick={() => patchAtmosphere("floorStyle", f)}
                      >
                        {FLOOR_LABEL[f]}
                      </button>
                    ))}
                  </div>
                </label>
                <label>
                  内壁
                  <div className="chip-row">
                    {(Object.keys(WALL_LABEL) as WallStyle[]).map((w) => (
                      <button
                        key={w}
                        className={game.atmosphere.wallStyle === w ? "on" : ""}
                        onClick={() => patchAtmosphere("wallStyle", w)}
                      >
                        {WALL_LABEL[w]}
                      </button>
                    ))}
                  </div>
                </label>
                <label>
                  大门
                  <div className="chip-row">
                    {(Object.keys(ENTRANCE_LABEL) as EntranceStyle[]).map((e) => (
                      <button
                        key={e}
                        className={game.atmosphere.entranceStyle === e ? "on" : ""}
                        onClick={() => patchAtmosphere("entranceStyle", e)}
                      >
                        {ENTRANCE_LABEL[e]}
                      </button>
                    ))}
                  </div>
                  <small>装潢影响有效高级感；学生区太豪华会少客</small>
                </label>
                <label>
                  高级感 <b>{Math.round(game.atmosphere.luxury)}</b>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={game.atmosphere.luxury}
                    onChange={(e) => patchAtmosphere("luxury", Number(e.target.value))}
                  />
                  <small>本地期望约 {Math.round(location.luxuryNeed * 100)}（错配会少客）</small>
                </label>
                <label>
                  流行感 <b>{Math.round(game.atmosphere.trend)}</b>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={game.atmosphere.trend}
                    onChange={(e) => patchAtmosphere("trend", Number(e.target.value))}
                  />
                  <small>本地期望约 {Math.round(location.trendNeed * 100)}</small>
                </label>
                <div className="clean-meter">
                  <span>
                    清洁度 <b>{Math.round(game.atmosphere.cleanliness)}</b>
                  </span>
                  <i style={{ width: `${game.atmosphere.cleanliness}%` }} />
                  <button onClick={() => setGame((g) => cleanShop(g))}>打扫 · ¥200</button>
                  <button onClick={() => setGame((g) => hireCleanCompany(g))}>清洁公司 · ¥1,500</button>
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
                <div className="security-box">
                  <b>安全设备</b>
                  <small>升星后随机事件增多；配齐更抗强盗火灾</small>
                  {(
                    [
                      ["camera", "监视器", 8000],
                      ["infrared", "红外线", 6000],
                      ["fire", "消防", 10000],
                      ["alarm", "警报", 5000],
                    ] as const
                  ).map(([key, label, price]) => (
                    <label key={key} className="toggle-row">
                      <span>
                        {label} {!game.security[key] && `· ¥${price.toLocaleString()}`}
                      </span>
                      <button
                        className={game.security[key] ? "on" : ""}
                        onClick={() => patchSecurity(key, !game.security[key])}
                      >
                        {game.security[key] ? "已装" : "购置"}
                      </button>
                    </label>
                  ))}
                </div>
              </div>

              <div className="panel-title relocate-title">
                <span>★</span>
                <div>
                  <h2>迁店 · 东京16地</h2>
                  <p>
                    当前 {location.name} · {game.stars}★ · {location.blurb}
                  </p>
                </div>
              </div>
              <div className="relocate-list tall">
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
                          租¥{loc.rent} · 流×{loc.footfall}
                          {!here && ` · ${loc.relocateStars}★/¥${loc.relocateCash.toLocaleString()}`}
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

          {panel === "settings" && (
            <>
              <div className="panel-title">
                <span>05</span>
                <div>
                  <h2>一般设定</h2>
                  <p>营业时间、定休、音量、难度与显示</p>
                </div>
              </div>
              <div className="ambiance-panel settings-panel">
                <label>
                  开门时间 <b>{timeLabel(game.settings.openMinute)}</b>
                  <input
                    type="range"
                    min={7 * 60}
                    max={14 * 60}
                    step={30}
                    value={game.settings.openMinute}
                    onChange={(e) => patchSettings("openMinute", Number(e.target.value))}
                  />
                </label>
                <label>
                  打烊时间 <b>{timeLabel(game.settings.closeMinute)}</b>
                  <input
                    type="range"
                    min={18 * 60}
                    max={23 * 60}
                    step={30}
                    value={game.settings.closeMinute}
                    onChange={(e) => patchSettings("closeMinute", Number(e.target.value))}
                  />
                  <small>攻略常用约 10:00–22:30；午晚高峰客流更高</small>
                </label>
                <label>
                  定休日
                  <div className="chip-row">
                    <button
                      className={game.settings.closedWeekday < 0 ? "on" : ""}
                      onClick={() => patchSettings("closedWeekday", -1)}
                    >
                      无
                    </button>
                    {WEEKDAY.map((d, i) => (
                      <button
                        key={d}
                        className={game.settings.closedWeekday === i ? "on" : ""}
                        onClick={() => patchSettings("closedWeekday", i)}
                      >
                        周{d}
                      </button>
                    ))}
                  </div>
                </label>
                <label>
                  难度
                  <div className="chip-row">
                    {(Object.keys(DIFF_LABEL) as Difficulty[]).map((d) => (
                      <button
                        key={d}
                        className={game.settings.difficulty === d ? "on" : ""}
                        onClick={() => patchSettings("difficulty", d)}
                      >
                        {DIFF_LABEL[d]}
                      </button>
                    ))}
                  </div>
                  <small>影响客人心情与客流密度</small>
                </label>
                <label>
                  背景音乐音量 <b>{game.settings.bgmVolume}</b>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={game.settings.bgmVolume}
                    onChange={(e) => patchSettings("bgmVolume", Number(e.target.value))}
                  />
                  <small>当前为设定项预留（场景氛围音乐可后续接播）</small>
                </label>
                <label>
                  效果音音量 <b>{game.settings.sfxVolume}</b>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={game.settings.sfxVolume}
                    onChange={(e) => patchSettings("sfxVolume", Number(e.target.value))}
                  />
                </label>
                <label className="toggle-row">
                  <span>显示场景气泡（点餐/上菜等）</span>
                  <button
                    className={game.settings.showBubbles ? "on" : ""}
                    onClick={() => patchSettings("showBubbles", !game.settings.showBubbles)}
                  >
                    {game.settings.showBubbles ? "开" : "关"}
                  </button>
                </label>
                <label>
                  店名
                  <input
                    className="text-input"
                    value={game.restaurantName}
                    maxLength={12}
                    onChange={(e) => setGame((g) => ({ ...g, restaurantName: e.target.value || DEFAULT_RESTAURANT_NAME }))}
                  />
                </label>
              </div>
            </>
          )}

          {panel === "manual" && (
            <>
              <div className="panel-title">
                <span>?</span>
                <div>
                  <h2>规则手册</h2>
                  <p>按一代东京经营循环还原</p>
                </div>
              </div>
              <div className="manual">
                <section>
                  <b>经营目标</b>
                  <p>
                    木场起步 → 升星迁店 → 冲五星；年末可争夺「年度最佳食堂」并解锁蓝宝石秘传菜谱。
                    {game.cookbookUnlocked ? "（已解锁）" : ""}
                  </p>
                </section>
                <section>
                  <b>顾客循环</b>
                  <p>排队 → 领位（按桌购买序）→ 点餐/酒水 → 烹饪 → 上菜 → 用餐 → 结账 → 清桌/评价。</p>
                </section>
                <section>
                  <b>时段与地点</b>
                  <p>
                    午市与晚市客流最高。当前：{location.name}。涉谷吃清洁，银座/六本木吃高级感，新宿周二人少。
                  </p>
                </section>
                <section>
                  <b>菜单与酒水</b>
                  <p>份量、浓淡、油度、材料、调理时间可调；推荐酒水搭配命中加分，任意酒断货会让客人失望。</p>
                </section>
                <section>
                  <b>月末评比</b>
                  <p>每月 30 日结算上榜奖金。随机事件含强盗、火灾、卫检、评论家、霸王餐。</p>
                </section>
              </div>
            </>
          )}
        </div>
      </aside>

      {summary && (
        <div className="modal-backdrop">
          <section className="ledger">
            <div className="ledger-top">
              <small>DAILY REPORT</small>
              <h2>
                第 {game.day} 日营业账簿
                {summary.isMonthEnd ? " · 月末评比" : ""}
              </h2>
              <p>{summary.yearAward ? "年度最佳食堂！" : "今天的店铺表现已经汇总"}</p>
            </div>
            <div className="ledger-grid">
              <span>
                接待客人<b>{summary.guests} 人</b>
              </span>
              <span>
                星级 / 评价
                <b>
                  {summary.stars}★ / {summary.rating.toFixed(1)}
                </b>
              </span>
              <span>
                营业收入<b>¥{summary.revenue.toLocaleString()}</b>
              </span>
              <span>
                支出合计<b>−¥{summary.costs.toLocaleString()}</b>
              </span>
            </div>
            {summary.monthBonus > 0 && (
              <div className="profit">
                <small>月末上榜奖金</small>
                <b>+ ¥{summary.monthBonus.toLocaleString()}</b>
              </div>
            )}
            <div className={`profit ${summary.profit < 0 ? "loss" : ""}`}>
              <small>今日纯利润</small>
              <b>
                {summary.profit >= 0 ? "+" : "−"} ¥{Math.abs(summary.profit).toLocaleString()}
              </b>
            </div>
            {summary.eventNotes.length > 0 && (
              <p className="ledger-note">事件：{summary.eventNotes.join(" · ")}</p>
            )}
            <p className="ledger-note">
              {summary.guests < 15
                ? "客流还不够。先小桌后大桌，并维持合理价格。"
                : summary.rating < 3
                  ? "等待过久或酒水断货？增聘员工、补货或清扫。"
                  : "口碑正在传开，注意月末奖金与迁店时机。"}
            </p>
            <button onClick={goNextDay}>进入第 {game.day + 1} 日</button>
          </section>
        </div>
      )}
    </main>
  );
}
