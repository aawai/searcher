import { Suspense } from "react";
import type { ActiveDesktopSceneId } from "./scene-registry.ts";
import { SCENE_REGISTRY } from "./scene-registry.ts";
import { SceneErrorBoundary } from "./SceneErrorBoundary.tsx";
import { useDocumentVisible } from "./use-scene-environment.ts";
import { useWallpaperEnvironment } from "../../components/wallpaper/WallpaperSurface.tsx";
import "./desktop-scenes.css";

export interface DesktopSceneHostProps {
    scene: ActiveDesktopSceneId;
}

/**
 * 首页底部的装饰层宿主：固定定位、不参与布局、不接收指针事件。
 * 仅在首页且选择了非 `none` 场景时挂载，因此关闭时没有观察器、
 * 计时器，也不会加载场景 chunk。动画运行条件在此单点协调。
 */
export function DesktopSceneHost({ scene }: DesktopSceneHostProps) {
    const { theme, reducedMotion } = useWallpaperEnvironment();
    const documentVisible = useDocumentVisible();
    const running = documentVisible && !reducedMotion;
    const { Component } = SCENE_REGISTRY[scene];

    return (
        <div
            className="scene-host"
            aria-hidden="true"
            data-testid="desktop-scene-host"
            data-scene={scene}
            data-scene-theme={theme}
            data-motion={reducedMotion ? "reduced" : "full"}
            data-paused={running ? undefined : "true"}
        >
            <SceneErrorBoundary key={scene}>
                <Suspense fallback={null}>
                    <Component running={running} />
                </Suspense>
            </SceneErrorBoundary>
        </div>
    );
}
