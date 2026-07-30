export const W = 12;
export const H = 8;
export const SAVE_KEY = "sapphire-restaurant-save";
/** 旧品牌存档 key，读取时迁移一次 */
export const LEGACY_SAVE_KEY = "corner-bistro-save";
export const SAVE_VERSION = 5;
export const DEFAULT_RESTAURANT_NAME = "蓝宝石餐厅";
export const SECRET_DISH_NAME = "蓝宝石秘传锅";

export type Tool =
  | "select"
  | "table1"
  | "table2"
  | "table4"
  | "table6"
  | "kitchen"
  | "cashier"
  | "toilet"
  | "plant"
  | "erase";
export type Panel = "build" | "menu" | "staff" | "ambiance" | "settings" | "manual";
export type FurnitureType = Exclude<Tool, "select" | "erase">;
export type Vec2 = { x: number; y: number };

export type DrinkPair = "beer" | "red" | "white" | "none";
export type FloorStyle = "wood" | "tile" | "carpet";
export type WallStyle = "cream" | "brick" | "panel";
export type EntranceStyle = "classic" | "glass" | "lattice";
export type Difficulty = "easy" | "normal" | "hard";

/** 对齐一代「一般设定」：营业时段、定休、音量、难度、显示 */
export type GameSettings = {
  bgmVolume: number;
  sfxVolume: number;
  showBubbles: boolean;
  difficulty: Difficulty;
  /** 开门分钟，如 10*60 */
  openMinute: number;
  /** 打烊分钟，如 22*60+30 */
  closeMinute: number;
  /** -1=无定休；0=日 … 6=六 */
  closedWeekday: number;
};

export type CellItem = {
  id: number;
  type: FurnitureType;
  x: number;
  y: number;
  /** 购买顺序，影响带位优先（越小越先被带） */
  buyOrder: number;
};

export type TasteTag = "western" | "japanese" | "cafe" | "value" | "formal";

export type GuestStage =
  | "queue"
  | "seating"
  | "order"
  | "waitingCook"
  | "waitingServe"
  | "eat"
  | "pay"
  | "leaving";

export type Guest = {
  id: number;
  size: number;
  mood: number;
  patience: number;
  taste: TasteTag;
  budget: number;
  stage: GuestStage;
  progress: number;
  tableId?: number;
  dish?: string;
  drink?: string;
  x: number;
  y: number;
  path: Vec2[];
  regularId?: string;
  memory?: number;
  taskQueued?: boolean;
  wantsLuxury: boolean;
};

export type StaffRole = "waiter" | "chef";

export type Staff = {
  id: number;
  name: string;
  role: StaffRole;
  exp: number;
  wage: number;
  mood: number;
  onLeave: boolean;
  lowMoodDays: number;
  x: number;
  y: number;
  path: Vec2[];
  taskId?: number;
  idleTarget?: Vec2;
  /** 负责清扫：分钟间隔，0=不扫 */
  cleanInterval: number;
  lastCleanMinute: number;
  /** 机动力 */
  speedStat: number;
  /** 洞察力/接待 */
  receptionStat: number;
  /** 魅力 */
  charm: number;
  /** 习得率 */
  learnRate: number;
  /** 忍耐力 */
  endurance: number;
  /** 调理技术（厨师） */
  cookSkill: number;
};

export type TaskKind = "seat" | "takeOrder" | "deliverOrder" | "cook" | "serve" | "checkout" | "clean";

export type Task = {
  id: number;
  kind: TaskKind;
  guestId: number;
  priority: number;
  assigneeId?: number;
  progress: number;
};

export type MusicStyle = "off" | "dream" | "classic" | "rock" | "folk" | "enka" | "tropical";

export type Atmosphere = {
  temperature: number;
  music: MusicStyle;
  uniform: "casual" | "apron" | "formal";
  cleanliness: number;
  ads: boolean;
  luxury: number;
  trend: number;
  /** 外装/内装分层（对齐 FLOOR / WALL / ENTRANCE） */
  floorStyle: FloorStyle;
  wallStyle: WallStyle;
  entranceStyle: EntranceStyle;
};

export type Security = {
  camera: boolean;
  infrared: boolean;
  fire: boolean;
  alarm: boolean;
};

export type LocationId =
  | "kiba"
  | "takadanobaba"
  | "akihabara"
  | "shinbashi"
  | "kanda"
  | "ginza"
  | "odaiba"
  | "aoyama"
  | "asakusa"
  | "ebisu"
  | "kichijoji"
  | "shibuya"
  | "otemachi"
  | "roppongi"
  | "ikebukuro"
  | "shinjuku";

export type LocationConfig = {
  id: LocationId;
  name: string;
  rent: number;
  footfall: number;
  tasteWeights: Record<TasteTag, number>;
  budgetMul: number;
  relocateCash: number;
  relocateStars: number;
  sizeLabel: string;
  blurb: string;
  /** 0–1 客人期望高级感 */
  luxuryNeed: number;
  /** 0–1 流行敏感 */
  trendNeed: number;
  /** 清洁敏感 */
  cleanNeed: number;
  /** 周几客流惩罚：0=日 … 6=六；新宿周二等 */
  weekdayMul?: Partial<Record<number, number>>;
};

export type Regular = {
  id: string;
  name: string;
  taste: TasteTag;
  memory: number;
  visits: number;
};

export type DishKind = "food" | "drink" | "alcohol";

export type Dish = {
  name: string;
  icon: string;
  price: number;
  cost: number;
  quality: number;
  stock: number;
  demand: number;
  tags: TasteTag[];
  kind: DishKind;
  /** 1–5 份量 */
  portion: number;
  /** 1–5 浓淡 */
  intensity: number;
  /** 1–5 油度 */
  oiliness: number;
  /** 推荐酒水搭配 */
  pairDrink: DrinkPair;
  /** 调理时间系数，越小越快 */
  cookTime: number;
  onMenu: boolean;
};

export type DaySummary = {
  revenue: number;
  guests: number;
  queueWalkouts: number;
  serviceWalkouts: number;
  maxQueue: number;
  rating: number;
  costs: number;
  profit: number;
  goalGuestTarget: number;
  goalProfitTarget: number;
  goalBonus: number;
  stars: number;
  isMonthEnd: boolean;
  monthBonus: number;
  yearAward: boolean;
  eventNotes: string[];
};

export type GameState = {
  restaurantName: string;
  cash: number;
  items: CellItem[];
  dishes: Dish[];
  guests: Guest[];
  staff: Staff[];
  tasks: Task[];
  minute: number;
  day: number;
  /** 美食历月份内日：1–30，day 累计 */
  speed: number;
  served: number;
  revenue: number;
  /** 今日实际售出食材成本，随出餐累积 */
  dayIngredientCost: number;
  rating: number;
  stars: number;
  totalProfit: number;
  totalServed: number;
  locationId: LocationId;
  atmosphere: Atmosphere;
  security: Security;
  settings: GameSettings;
  regulars: Regular[];
  toast: string;
  nextId: number;
  ratingHistory: number[];
  baseWage: number;
  nextBuyOrder: number;
  yearAwarded: boolean;
  cookbookUnlocked: boolean;
  lastEventDay: number;
  monthGuestPeak: number;
  /** 今日在门口等不及离开的客人数 */
  queueWalkouts: number;
  /** 今日入座后因服务过慢离开的客人数 */
  serviceWalkouts: number;
  /** 今日同时排队的最高组数 */
  maxQueue: number;
};

export type PersistedStaff = Omit<Staff, "path" | "taskId">;

export type SaveState = {
  v: number;
  restaurantName?: string;
  cash: number;
  items: CellItem[];
  dishes: Dish[];
  day: number;
  rating: number;
  stars: number;
  totalProfit: number;
  totalServed: number;
  locationId: LocationId;
  atmosphere: Atmosphere;
  security?: Security;
  settings?: GameSettings;
  regulars: Regular[];
  staff: PersistedStaff[];
  baseWage: number;
  ratingHistory: number[];
  nextBuyOrder?: number;
  yearAwarded?: boolean;
  cookbookUnlocked?: boolean;
  waiters?: number;
  chefs?: number;
  wage?: number;
};
