"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Tool = "select" | "table2" | "table4" | "kitchen" | "cashier" | "plant" | "erase";
type Panel = "build" | "menu" | "staff" | "manual";
type CellItem = { id: number; type: Exclude<Tool, "select" | "erase">; x: number; y: number; occupied?: boolean };
type Guest = {
  id: number;
  size: number;
  mood: number;
  stage: "queue" | "order" | "cook" | "eat" | "pay";
  progress: number;
  tableId?: number;
  dish?: string;
};
type Dish = { name: string; icon: string; price: number; cost: number; quality: number; stock: number; demand: number };
type DaySummary = { revenue: number; guests: number; rating: number; costs: number; profit: number };

const W = 12;
const H = 8;
const toolData: Record<Exclude<Tool, "select" | "erase">, { name: string; icon: string; price: number }> = {
  table2: { name: "双人桌", icon: "▣", price: 1800 },
  table4: { name: "四人桌", icon: "▦", price: 2800 },
  kitchen: { name: "料理台", icon: "♨", price: 4500 },
  cashier: { name: "收银台", icon: "¥", price: 2200 },
  plant: { name: "绿植", icon: "♣", price: 500 },
};

const initialItems: CellItem[] = [
  { id: 1, type: "kitchen", x: 1, y: 1 },
  { id: 2, type: "kitchen", x: 2, y: 1 },
  { id: 3, type: "cashier", x: 10, y: 6 },
  { id: 4, type: "table2", x: 4, y: 2 },
  { id: 5, type: "table4", x: 7, y: 2 },
  { id: 6, type: "table2", x: 4, y: 5 },
  { id: 7, type: "plant", x: 9, y: 1 },
];

const initialDishes: Dish[] = [
  { name: "招牌汉堡", icon: "🍔", price: 65, cost: 24, quality: 2, stock: 40, demand: 1.3 },
  { name: "那不勒斯面", icon: "🍝", price: 58, cost: 21, quality: 2, stock: 32, demand: 1.05 },
  { name: "炸猪排", icon: "🍛", price: 72, cost: 29, quality: 2, stock: 28, demand: 0.9 },
  { name: "热咖啡", icon: "☕", price: 18, cost: 5, quality: 2, stock: 60, demand: 1.45 },
];

function timeLabel(minute: number) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function cellKey(x: number, y: number) {
  return `${x}-${y}`;
}

export default function Home() {
  const [panel, setPanel] = useState<Panel>("build");
  const [tool, setTool] = useState<Tool>("select");
  const [cash, setCash] = useState(50000);
  const [items, setItems] = useState<CellItem[]>(initialItems);
  const [dishes, setDishes] = useState<Dish[]>(initialDishes);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [minute, setMinute] = useState(11 * 60);
  const [day, setDay] = useState(1);
  const [speed, setSpeed] = useState(0);
  const [served, setServed] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [rating, setRating] = useState(2.8);
  const [waiters, setWaiters] = useState(2);
  const [chefs, setChefs] = useState(1);
  const [wage, setWage] = useState(600);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [toast, setToast] = useState("先布置餐厅，再按「开始营业」");
  const idRef = useRef(100);
  const tickRef = useRef(0);

  const tables = useMemo(() => items.filter((i) => i.type === "table2" || i.type === "table4"), [items]);
  const kitchens = items.filter((i) => i.type === "kitchen").length;
  const queue = guests.filter((g) => g.stage === "queue").length;
  const activeGuests = guests.reduce((sum, g) => sum + g.size, 0);
  const seatCount = tables.reduce((sum, t) => sum + (t.type === "table4" ? 4 : 2), 0);

  useEffect(() => {
    const saved = localStorage.getItem("corner-bistro-save");
    if (!saved) return;
    try {
      const s = JSON.parse(saved);
      setCash(s.cash ?? 50000);
      setItems(s.items ?? initialItems);
      setDishes(s.dishes ?? initialDishes);
      setDay(s.day ?? 1);
      setRating(s.rating ?? 2.8);
      setWaiters(s.waiters ?? 2);
      setChefs(s.chefs ?? 1);
      setWage(s.wage ?? 600);
      setToast("已读取上次的经营记录");
    } catch {
      localStorage.removeItem("corner-bistro-save");
    }
  }, []);

  useEffect(() => {
    if (!speed) return;
    const timer = window.setInterval(() => {
      tickRef.current += 1;
      setMinute((m) => {
        const next = m + 5 * speed;
        if (next >= 23 * 60) {
          setSpeed(0);
          window.setTimeout(closeDay, 0);
          return 23 * 60;
        }
        return next;
      });

      if (tickRef.current % Math.max(2, 7 - speed - Math.floor(rating)) === 0) {
        spawnGuest();
      }
      advanceGuests();
    }, 500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, rating, tables.length, waiters, chefs, kitchens, dishes]);

  function spawnGuest() {
    if (!tables.length || !kitchens || guests.length > 14) return;
    const sizes = [1, 1, 2, 2, 2, 3, 4];
    const size = sizes[Math.floor(Math.random() * sizes.length)];
    setGuests((current) => [
      ...current,
      { id: idRef.current++, size, mood: 100, stage: "queue", progress: 0 },
    ]);
  }

  function chooseDish() {
    const available = dishes.filter((d) => d.stock > 0);
    if (!available.length) return undefined;
    const pool = available.flatMap((d) => Array(Math.max(1, Math.round(d.demand * 4))).fill(d.name));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function advanceGuests() {
    setGuests((current) => {
      const occupied = new Set(current.filter((g) => g.tableId && g.stage !== "queue").map((g) => g.tableId));
      const next: Guest[] = [];
      const finished: Guest[] = [];

      for (const guest of current) {
        let g = { ...guest };
        if (g.stage === "queue") {
          const table = tables.find((t) => !occupied.has(t.id) && (t.type === "table4" ? 4 : 2) >= g.size);
          g.mood -= Math.max(1, 3 - waiters * 0.45);
          if (table) {
            g = { ...g, stage: "order", tableId: table.id, progress: 0 };
            occupied.add(table.id);
          } else if (g.mood <= 0) {
            setRating((r) => Math.max(1, r - 0.03));
            continue;
          }
        } else {
          const rates = {
            order: 12 + waiters * 5,
            cook: 5 + chefs * 4 + kitchens * 2,
            eat: 8,
            pay: 14 + waiters * 4,
          };
          g.progress += rates[g.stage] * (speed || 1);
          if (g.stage === "order" && g.progress >= 100) {
            const dish = chooseDish();
            if (!dish) {
              g.mood -= 35;
              g.progress = 65;
            } else {
              g.stage = "cook";
              g.progress = 0;
              g.dish = dish;
            }
          } else if (g.stage === "cook") {
            g.mood -= Math.max(0.25, 1.8 - chefs * 0.35 - kitchens * 0.15);
            if (g.progress >= 100) {
              g.stage = "eat";
              g.progress = 0;
              setDishes((ds) => ds.map((d) => (d.name === g.dish ? { ...d, stock: Math.max(0, d.stock - g.size) } : d)));
            }
          } else if (g.stage === "eat" && g.progress >= 100) {
            g.stage = "pay";
            g.progress = 0;
          } else if (g.stage === "pay" && g.progress >= 100) {
            finished.push(g);
            continue;
          }
        }
        next.push(g);
      }

      if (finished.length) {
        let earned = 0;
        let people = 0;
        let score = 0;
        for (const g of finished) {
          const dish = dishes.find((d) => d.name === g.dish);
          if (!dish) continue;
          earned += dish.price * g.size;
          people += g.size;
          const value = dish.price / Math.max(1, dish.cost);
          score += Math.max(45, Math.min(100, g.mood + dish.quality * 8 - Math.max(0, value - 3) * 8));
        }
        setCash((c) => c + earned);
        setRevenue((r) => r + earned);
        setServed((s) => s + people);
        if (finished.length) setRating((r) => Math.max(1, Math.min(5, r * 0.985 + (score / finished.length / 20) * 0.015)));
      }
      return next;
    });
  }

  function closeDay() {
    const payroll = (waiters + chefs) * wage;
    const ingredient = dishes.reduce((sum, d) => sum + (40 - Math.min(40, d.stock)) * d.cost, 0);
    const costs = payroll + 900 + ingredient;
    const profit = revenue - costs;
    setCash((c) => c - costs);
    setSummary({ revenue, guests: served, rating, costs, profit });
    setGuests([]);
    setToast("今日营业结束，账簿已经结算");
  }

  function nextDay() {
    setDay((d) => d + 1);
    setMinute(11 * 60);
    setRevenue(0);
    setServed(0);
    setGuests([]);
    setDishes((ds) => ds.map((d) => ({ ...d, stock: Math.max(d.stock, 30) })));
    setSummary(null);
    tickRef.current = 0;
    setToast("新的一天，准备开门迎客");
  }

  function clickCell(x: number, y: number) {
    if (speed) {
      setToast("营业中不能改装，先暂停营业");
      return;
    }
    const existing = items.find((i) => i.x === x && i.y === y);
    if (tool === "erase") {
      if (!existing) return;
      const refund = Math.round(toolData[existing.type].price * 0.4);
      setItems((all) => all.filter((i) => i.id !== existing.id));
      setCash((c) => c + refund);
      setToast(`已拆除${toolData[existing.type].name}，回收 ¥${refund}`);
      return;
    }
    if (tool === "select" || existing) return;
    const data = toolData[tool];
    if (cash < data.price) {
      setToast("资金不足，先多经营几天吧");
      return;
    }
    setItems((all) => [...all, { id: idRef.current++, type: tool, x, y }]);
    setCash((c) => c - data.price);
    setToast(`已购入${data.name}`);
  }

  function updateDish(index: number, key: "price" | "quality", delta: number) {
    setDishes((ds) =>
      ds.map((d, i) =>
        i === index
          ? {
              ...d,
              [key]: key === "quality" ? Math.max(1, Math.min(3, d.quality + delta)) : Math.max(d.cost + 5, d.price + delta),
            }
          : d,
      ),
    );
  }

  function hire(role: "waiter" | "chef", delta: number) {
    if (delta > 0 && cash < 1200) {
      setToast("招聘需要 ¥1,200 手续费");
      return;
    }
    if (role === "waiter") setWaiters((n) => Math.max(1, Math.min(6, n + delta)));
    else setChefs((n) => Math.max(1, Math.min(5, n + delta)));
    if (delta > 0) setCash((c) => c - 1200);
  }

  function saveGame() {
    localStorage.setItem("corner-bistro-save", JSON.stringify({ cash, items, dishes, day, rating, waiters, chefs, wage }));
    setToast("经营记录已保存在这台设备");
  }

  const itemMap = new Map(items.map((i) => [cellKey(i.x, i.y), i]));
  const tableGuests = new Map(guests.filter((g) => g.tableId).map((g) => [g.tableId!, g]));

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">街</span>
          <div><strong>街角食堂</strong><small>经营模拟 · 1998 MODE</small></div>
        </div>
        <div className="datebox"><small>美食历 第一年</small><b>1月 {day}日</b></div>
        <div className="clock"><span>{timeLabel(minute)}</span><small>{speed ? "营业中" : "暂停"}</small></div>
        <div className="stat"><small>总资金</small><b>¥ {cash.toLocaleString()}</b></div>
        <div className="stat"><small>今日营业额</small><b>¥ {revenue.toLocaleString()}</b></div>
        <div className="stat compact"><small>客人数</small><b>{served}人</b></div>
        <div className="stars" aria-label={`餐厅评价 ${rating.toFixed(1)} 星`}>
          <small>餐厅评价</small><b>{"★".repeat(Math.round(rating))}<i>{"☆".repeat(5 - Math.round(rating))}</i></b>
        </div>
        <button className="save" onClick={saveGame}>保存</button>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <nav>
            {([
              ["build", "▦", "布置"],
              ["menu", "▤", "菜单"],
              ["staff", "♟", "员工"],
              ["manual", "?", "规则"],
            ] as [Panel, string, string][]).map(([id, icon, label]) => (
              <button key={id} className={panel === id ? "active" : ""} onClick={() => setPanel(id)}>
                <span>{icon}</span>{label}
              </button>
            ))}
          </nav>
          <div className="side-foot"><span>版本 0.1</span><span>忠于经典规则的原创原型</span></div>
        </aside>

        <section className="restaurant-wrap">
          <div className="street">
            <div className="sign">木场 · 10坪</div>
            <div className="passers">{["♙", "♟", "♙", "♟"].map((p, i) => <span key={i} style={{ animationDelay: `${i * -2.1}s` }}>{p}</span>)}</div>
          </div>
          <div className="restaurant">
            <div className="wall back"><span>今日推荐</span><span className="window">▥　▥</span><span>营业中</span></div>
            <div className="wall left" />
            <div className="grid" style={{ gridTemplateColumns: `repeat(${W}, 1fr)` }}>
              {Array.from({ length: W * H }, (_, n) => {
                const x = n % W;
                const y = Math.floor(n / W);
                const item = itemMap.get(cellKey(x, y));
                const guest = item && tableGuests.get(item.id);
                return (
                  <button
                    key={n}
                    className={`cell ${item ? `has-item ${item.type}` : ""} ${tool !== "select" && !item ? "buildable" : ""}`}
                    onClick={() => clickCell(x, y)}
                    aria-label={`${x + 1},${y + 1}${item ? ` ${toolData[item.type].name}` : " 空地"}`}
                  >
                    {item && <span className="furniture"><i>{toolData[item.type].icon}</i><em>{toolData[item.type].name}</em></span>}
                    {guest && (
                      <span className={`guest-stage mood-${guest.mood < 45 ? "bad" : "good"}`}>
                        <b>{guest.size}人</b><i style={{ width: `${guest.progress}%` }} />
                        <em>{guest.stage === "order" ? "点餐" : guest.stage === "cook" ? "等菜" : guest.stage === "eat" ? "用餐" : "结账"}</em>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="entrance">入口 <span>▼</span></div>
            <div className="queue">
              {guests.filter((g) => g.stage === "queue").slice(0, 5).map((g) => <span key={g.id}>♟<i>{g.size}</i></span>)}
              {queue > 5 && <b>+{queue - 5}</b>}
            </div>
          </div>
          <div className="status-strip">
            <span>座位 <b>{seatCount}</b></span>
            <span>店内顾客 <b>{activeGuests}</b></span>
            <span>排队 <b className={queue > 3 ? "danger" : ""}>{queue}</b></span>
            <span>料理台 <b>{kitchens}</b></span>
            <p>{toast}</p>
          </div>
        </section>

        <aside className="control-panel">
          {panel === "build" && (
            <>
              <div className="panel-title"><span>01</span><div><h2>店内布置</h2><p>选择设备，再点击地板放置</p></div></div>
              <div className="tool-grid">
                <button className={tool === "select" ? "selected" : ""} onClick={() => setTool("select")}><i>↖</i><b>查看</b><small>不改动</small></button>
                {(Object.keys(toolData) as (keyof typeof toolData)[]).map((key) => (
                  <button key={key} className={tool === key ? "selected" : ""} onClick={() => setTool(key)}>
                    <i>{toolData[key].icon}</i><b>{toolData[key].name}</b><small>¥{toolData[key].price.toLocaleString()}</small>
                  </button>
                ))}
                <button className={`erase-tool ${tool === "erase" ? "selected" : ""}`} onClick={() => setTool("erase")}><i>×</i><b>拆除</b><small>返还40%</small></button>
              </div>
              <div className="tip-card"><b>布局诀窍</b><p>不同桌型决定能接待的客群。厨房不足会让等菜时间变长；当客人失去耐心，评价会下降。</p></div>
            </>
          )}

          {panel === "menu" && (
            <>
              <div className="panel-title"><span>02</span><div><h2>菜单与食材</h2><p>价格、品质与库存相互制衡</p></div></div>
              <div className="dish-list">
                {dishes.map((dish, i) => (
                  <article key={dish.name}>
                    <div className="dish-head"><i>{dish.icon}</i><div><b>{dish.name}</b><small>成本 ¥{dish.cost} · 库存 {dish.stock}</small></div></div>
                    <label>售价 <span><button onClick={() => updateDish(i, "price", -5)}>−</button><b>¥{dish.price}</b><button onClick={() => updateDish(i, "price", 5)}>＋</button></span></label>
                    <label>材料等级 <span><button onClick={() => updateDish(i, "quality", -1)}>−</button><b>{"◆".repeat(dish.quality)}{"◇".repeat(3 - dish.quality)}</b><button onClick={() => updateDish(i, "quality", 1)}>＋</button></span></label>
                  </article>
                ))}
              </div>
              <div className="tip-card"><b>经典规则</b><p>便宜、份量足、材料好，会提高评价；但食材成本也会在打烊时结算。</p></div>
            </>
          )}

          {panel === "staff" && (
            <>
              <div className="panel-title"><span>03</span><div><h2>员工管理</h2><p>速度决定客人的耐心</p></div></div>
              <div className="staff-card"><i>♟</i><div><b>服务生</b><small>接待、点餐、结账</small></div><span><button onClick={() => hire("waiter", -1)}>−</button><strong>{waiters}</strong><button onClick={() => hire("waiter", 1)}>＋</button></span></div>
              <div className="staff-card"><i>♨</i><div><b>厨师</b><small>缩短料理等待时间</small></div><span><button onClick={() => hire("chef", -1)}>−</button><strong>{chefs}</strong><button onClick={() => hire("chef", 1)}>＋</button></span></div>
              <div className="wage-box"><label>每日工资／人 <b>¥{wage}</b></label><input type="range" min="450" max="1200" step="50" value={wage} onChange={(e) => setWage(Number(e.target.value))}/><small>本原型中，高工资暂不影响效率；正式版将加入心情、经验与离职。</small></div>
              <div className="cost-preview"><span>预计每日工资</span><b>¥{((waiters + chefs) * wage).toLocaleString()}</b></div>
            </>
          )}

          {panel === "manual" && (
            <>
              <div className="panel-title"><span>?</span><div><h2>规则手册</h2><p>根据旧说明与攻略还原</p></div></div>
              <div className="manual">
                <section><b>经营目标</b><p>从木场的小店起步，通过满意度、营业额与利润提升星级。</p></section>
                <section><b>顾客循环</b><p>进店 → 分桌 → 点餐 → 等待料理 → 用餐 → 结账 → 给出评价。</p></section>
                <section><b>评价逻辑</b><p>价格、材料、等待时间和是否生气离店共同影响评价；老顾客会保留印象。</p></section>
                <section><b>地点差异</b><p>木场租金低但人流少；学生区看重价格；银座、六本木更看重高级感。</p></section>
                <section><b>当前原型范围</b><p>已实现布置、桌型、菜单、库存、员工速度、排队、日结与本地存档。地点迁移、制服、温度、广告和员工经验将在后续加入。</p></section>
              </div>
            </>
          )}
        </aside>
      </section>

      <footer className="bottombar">
        <div className="day-goal"><small>今日建议</small><b>接待 20 位客人且不让排队超过 4 组</b></div>
        <div className="speed-controls">
          <button className={speed === 0 ? "on" : ""} onClick={() => setSpeed(0)}>Ⅱ</button>
          <button className={speed === 1 ? "on" : ""} onClick={() => setSpeed(1)}>▶</button>
          <button className={speed === 3 ? "on" : ""} onClick={() => setSpeed(3)}>▶▶</button>
        </div>
        <button className="open-button" onClick={() => setSpeed(speed ? 0 : 1)} disabled={minute >= 23 * 60}>
          <span>{speed ? "暂停营业" : minute >= 23 * 60 ? "今日已打烊" : "开始营业"}</span><small>{timeLabel(minute)} — 23:00</small>
        </button>
      </footer>

      {summary && (
        <div className="modal-backdrop">
          <section className="ledger">
            <div className="ledger-top"><small>DAILY REPORT</small><h2>第 {day} 日营业账簿</h2><p>今天的店铺表现已经汇总</p></div>
            <div className="ledger-grid">
              <span>接待客人<b>{summary.guests} 人</b></span>
              <span>餐厅评价<b>{summary.rating.toFixed(1)} ★</b></span>
              <span>营业收入<b>¥{summary.revenue.toLocaleString()}</b></span>
              <span>工资·租金·食材<b>−¥{summary.costs.toLocaleString()}</b></span>
            </div>
            <div className={`profit ${summary.profit < 0 ? "loss" : ""}`}><small>今日纯利润</small><b>{summary.profit >= 0 ? "+" : "−"} ¥{Math.abs(summary.profit).toLocaleString()}</b></div>
            <p className="ledger-note">{summary.guests < 15 ? "客流还不够。试试增加桌位，并维持合理价格。" : summary.rating < 3 ? "客人等得有点久，增聘员工或增加料理台吧。" : "口碑正在传开，明天会有更多客人慕名而来。"}</p>
            <button onClick={nextDay}>进入第 {day + 1} 日</button>
          </section>
        </div>
      )}
    </main>
  );
}
