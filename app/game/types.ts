export const W = 12;
export const H = 8;
export const SAVE_KEY = "corner-bistro-save";
export const SAVE_VERSION = 2;

export type Tool = "select" | "table2" | "table4" | "kitchen" | "cashier" | "plant" | "erase";
export type Panel = "build" | "menu" | "staff" | "ambiance" | "manual";
export type FurnitureType = Exclude<Tool, "select" | "erase">;
export type Vec2 = { x: number; y: number };

export type CellItem = {
  id: number;
  type: FurnitureType;
  x: number;
  y: number;
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
  x: number;
  y: number;
  path: Vec2[];
  regularId?: string;
  memory?: number;
  taskQueued?: boolean;
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
};

export type TaskKind = "seat" | "takeOrder" | "deliverOrder" | "cook" | "serve" | "checkout";

export type Task = {
  id: number;
  kind: TaskKind;
  guestId: number;
  priority: number;
  assigneeId?: number;
  progress: number;
};

export type Atmosphere = {
  temperature: number;
  music: boolean;
  uniform: "casual" | "apron" | "formal";
  cleanliness: number;
  ads: boolean;
};

export type LocationId = "kiba" | "takadanobaba" | "kanda";

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
};

export type Regular = {
  id: string;
  name: string;
  taste: TasteTag;
  memory: number;
  visits: number;
};

export type Dish = {
  name: string;
  icon: string;
  price: number;
  cost: number;
  quality: number;
  stock: number;
  demand: number;
  tags: TasteTag[];
};

export type DaySummary = {
  revenue: number;
  guests: number;
  rating: number;
  costs: number;
  profit: number;
  stars: number;
};

export type GameState = {
  cash: number;
  items: CellItem[];
  dishes: Dish[];
  guests: Guest[];
  staff: Staff[];
  tasks: Task[];
  minute: number;
  day: number;
  speed: number;
  served: number;
  revenue: number;
  rating: number;
  stars: number;
  totalProfit: number;
  totalServed: number;
  locationId: LocationId;
  atmosphere: Atmosphere;
  regulars: Regular[];
  toast: string;
  nextId: number;
  ratingHistory: number[];
  baseWage: number;
};

export type SaveState = {
  v: number;
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
  regulars: Regular[];
  staff: Staff[];
  baseWage: number;
  ratingHistory: number[];
  /** legacy */
  waiters?: number;
  chefs?: number;
  wage?: number;
};
