/** 动态桌面场景：叠加在壁纸之上的底部装饰层。`none` 表示关闭。 */
export const DESKTOP_SCENE_IDS = ["none", "amusement-park"] as const;
export type DesktopSceneId = typeof DESKTOP_SCENE_IDS[number];
export const DEFAULT_DESKTOP_SCENE: DesktopSceneId = "none";

/**
 * 缺失、损坏或来自更新版本的未知 ID 一律降级为 `none`，
 * 不影响同一份偏好中的其他外观字段。
 */
export function normalizeDesktopScene(raw: unknown): DesktopSceneId {
    return DESKTOP_SCENE_IDS.find((id) => id === raw) ?? DEFAULT_DESKTOP_SCENE;
}
