import type { GuestStage } from "../types";

export type TableFood = "none" | "menu" | "waiting" | "plated" | "eating";

export function tableFoodFor(stage: GuestStage | undefined): TableFood {
  if (!stage) return "none";
  if (stage === "order") return "menu";
  if (stage === "waitingCook") return "waiting";
  if (stage === "waitingServe") return "plated";
  if (stage === "eat") return "eating";
  return "none";
}
