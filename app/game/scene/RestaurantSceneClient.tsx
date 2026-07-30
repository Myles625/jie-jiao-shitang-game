"use client";

import dynamic from "next/dynamic";
import type { SceneProps } from "./RestaurantScene";

const RestaurantScene = dynamic(() => import("./RestaurantScene"), {
  ssr: false,
  loading: () => (
    <div className="r3f-stage iso-world r3f-loading">
      <p>正在装载蓝宝石餐厅场景…</p>
    </div>
  ),
});

export default function RestaurantSceneClient(props: SceneProps) {
  return <RestaurantScene {...props} />;
}
