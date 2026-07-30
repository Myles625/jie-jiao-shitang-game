"use client";

import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import RestaurantScene, { type SceneProps } from "./RestaurantScene";

class SceneErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; retryKey: number }
> {
  state = { failed: false, retryKey: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("餐厅 3D 场景渲染失败", error, info);
  }

  retry = () => {
    this.setState((state) => ({ failed: false, retryKey: state.retryKey + 1 }));
  };

  render() {
    if (this.state.failed) {
      return (
        <div className="r3f-stage iso-world r3f-loading r3f-error" role="alert">
          <p>餐厅场景没有正确启动</p>
          <button type="button" onClick={this.retry}>重新载入场景</button>
        </div>
      );
    }
    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;
  }
}

export default function RestaurantSceneClient(props: SceneProps) {
  return (
    <SceneErrorBoundary>
      <RestaurantScene {...props} />
    </SceneErrorBoundary>
  );
}
