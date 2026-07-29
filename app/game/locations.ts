import type { LocationConfig, LocationId, TasteTag } from "./types";

export const LOCATIONS: Record<LocationId, LocationConfig> = {
  kiba: {
    id: "kiba",
    name: "木场",
    rent: 900,
    footfall: 1,
    tasteWeights: { western: 1, japanese: 1.1, cafe: 1.2, value: 1.3, formal: 0.5 },
    budgetMul: 1,
    relocateCash: 0,
    relocateStars: 0,
    sizeLabel: "10坪",
  },
  takadanobaba: {
    id: "takadanobaba",
    name: "高田马场",
    rent: 2200,
    footfall: 1.55,
    tasteWeights: { western: 1.1, japanese: 0.9, cafe: 1.4, value: 1.8, formal: 0.4 },
    budgetMul: 0.82,
    relocateCash: 80000,
    relocateStars: 4,
    sizeLabel: "14坪",
  },
  kanda: {
    id: "kanda",
    name: "神田",
    rent: 3800,
    footfall: 1.35,
    tasteWeights: { western: 1.2, japanese: 1.15, cafe: 0.9, value: 0.7, formal: 1.6 },
    budgetMul: 1.45,
    relocateCash: 160000,
    relocateStars: 5,
    sizeLabel: "18坪",
  },
};

export const LOCATION_ORDER: LocationId[] = ["kiba", "takadanobaba", "kanda"];

export function getLocation(id: LocationId): LocationConfig {
  return LOCATIONS[id] ?? LOCATIONS.kiba;
}

export function pickTaste(weights: Record<TasteTag, number>): TasteTag {
  const entries = Object.entries(weights) as [TasteTag, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [tag, w] of entries) {
    r -= w;
    if (r <= 0) return tag;
  }
  return "value";
}
