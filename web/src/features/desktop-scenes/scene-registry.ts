import { type ComponentType, lazy, type LazyExoticComponent } from "react";
import type { DesktopSceneId } from "@shared/desktop-scenes.ts";
import type { SceneProps } from "./scene-types.ts";

export type ActiveDesktopSceneId = Exclude<DesktopSceneId, "none">;

export interface SceneDefinition {
    id: ActiveDesktopSceneId;
    label: string;
    description: string;
    /** 惰性加载：只有场景被选中并渲染时才会请求对应 chunk。 */
    Component: LazyExoticComponent<ComponentType<SceneProps>>;
}

/**
 * 新增场景只需：在 `DESKTOP_SCENE_IDS` 加入 ID，在此注册（编译器会要求
 * 补全），并在 `scene-previews.tsx` 提供静态缩略图。宿主与层级无需改动。
 */
export const SCENE_REGISTRY: Record<ActiveDesktopSceneId, SceneDefinition> = {
    "amusement-park": {
        id: "amusement-park",
        label: "动态游乐场",
        description:
            "过山车、摩天轮与旋转木马组成的微缩游乐场，叠加在壁纸之上。",
        Component: lazy(() =>
            import("./scenes/amusement-park/AmusementParkScene.tsx")
        ),
    },
};
