import React, { type ReactNode } from "react";

interface SceneErrorBoundaryProps {
    children: ReactNode;
}

interface SceneErrorBoundaryState {
    failed: boolean;
}

/**
 * 场景 chunk 加载失败或渲染异常时只丢弃装饰层，搜索与设置保持可用。
 * 宿主以场景 ID 作为 key，因此切换场景或重新选择会重置失败状态。
 */
export class SceneErrorBoundary extends React.Component<
    SceneErrorBoundaryProps,
    SceneErrorBoundaryState
> {
    override state: SceneErrorBoundaryState = { failed: false };

    static getDerivedStateFromError(): SceneErrorBoundaryState {
        return { failed: true };
    }

    override componentDidCatch(error: Error) {
        console.error("Desktop scene failed to load:", error);
    }

    override render() {
        return this.state.failed ? null : this.props.children;
    }
}
