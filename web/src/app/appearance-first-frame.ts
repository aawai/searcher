import {
    type AccentPreference,
    type GlassIntensity,
    normalizeAccent,
    normalizeGlassIntensity,
    normalizeTabIcon,
    normalizeTheme,
    type SearchShape,
    type TabIcon,
    type ThemeId,
} from "@shared/contracts.ts";
import { applyResolvedTheme, resolveTheme } from "../design-system/theme.ts";
import { syncThemeColor } from "../pwa/theme-color.ts";
import { appearanceStorageKey } from "./appearance-sync.ts";

/**
 * 首帧外观：页面绘制前就要呈现在 `<html>` 与标签图标上的外观字段。
 *
 * 完整外观缓存在 IndexedDB（异步，且可含数 MB 的本地壁纸），而登录身份要等
 * `/api/auth/me` 返回才能确定，两者都赶不上首帧。因此每个 owner 另在
 * localStorage 同步保存这几个小字段，并记录最近一次确定的 owner；`<head>`
 * 内联脚本（`first-frame-boot.ts`）与 `AppState` 的初始状态都从这里读取。
 * 快照按 owner 隔离，只是 IndexedDB 缓存与云端偏好的派生副本，不参与同步。
 */
export type FirstFrameAppearance = {
    theme: ThemeId;
    accent: AccentPreference;
    shape: SearchShape;
    glassIntensity: GlassIntensity;
    tabIcon: TabIcon;
};

const OWNER_KEY = "first-frame:owner";

function snapshotKey(userId: string | null): string {
    return "first-frame:" + appearanceStorageKey(userId);
}

export function normalizeFirstFrame(
    saved: Record<string, unknown>,
): FirstFrameAppearance {
    return {
        theme: normalizeTheme(saved.theme),
        accent: normalizeAccent(saved.accent),
        shape: saved.shape === "pill" ? "pill" : "rounded",
        glassIntensity: normalizeGlassIntensity(saved.glassIntensity),
        tabIcon: normalizeTabIcon(saved.tabIcon),
    };
}

/** 隐私模式或禁用存储时访问 `localStorage` 本身会抛错；此时首帧使用默认外观。 */
export function firstFrameStorage(): Storage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

function readJson(storage: Storage | null, key: string): unknown {
    if (!storage) return undefined;
    try {
        const raw = storage.getItem(key);
        return raw === null ? undefined : JSON.parse(raw);
    } catch {
        return undefined;
    }
}

function writeJson(storage: Storage | null, key: string, value: unknown) {
    if (!storage) return;
    try {
        storage.setItem(key, JSON.stringify(value));
    } catch {
        // 配额或禁用：下次载入回落为默认首帧，完整缓存不受影响。
    }
}

/** 指定 owner 的首帧外观；没有或损坏的快照按默认值补齐。 */
export function readFirstFrame(
    storage: Storage | null,
    userId: string | null,
): FirstFrameAppearance {
    const saved = readJson(storage, snapshotKey(userId));
    return normalizeFirstFrame(
        saved && typeof saved === "object" && !Array.isArray(saved)
            ? saved as Record<string, unknown>
            : {},
    );
}

/** 只写首帧字段；壁纸等其余外观留在 IndexedDB。 */
export function writeFirstFrame(
    storage: Storage | null,
    userId: string | null,
    appearance: FirstFrameAppearance,
): void {
    writeJson(
        storage,
        snapshotKey(userId),
        {
            theme: appearance.theme,
            accent: appearance.accent,
            shape: appearance.shape,
            glassIntensity: appearance.glassIntensity,
            tabIcon: appearance.tabIcon,
        } satisfies FirstFrameAppearance,
    );
}

/** 最近一次由登录、退出或会话检查确定的 owner；未知时为匿名。 */
export function readFirstFrameOwner(storage: Storage | null): string | null {
    const owner = readJson(storage, OWNER_KEY);
    return typeof owner === "string" && owner ? owner : null;
}

export function writeFirstFrameOwner(
    storage: Storage | null,
    userId: string | null,
): void {
    writeJson(storage, OWNER_KEY, userId);
}

export function applyTheme(
    root: HTMLElement,
    theme: ThemeId,
    prefersDark: boolean,
): void {
    applyResolvedTheme(root, resolveTheme(theme, prefersDark));
    syncThemeColor(root);
}

export function applyStyleAttributes(
    root: HTMLElement,
    appearance: Pick<
        FirstFrameAppearance,
        "accent" | "shape" | "glassIntensity"
    >,
): void {
    root.dataset.accent = appearance.accent;
    root.dataset.shape = appearance.shape;
    root.dataset.glass = appearance.glassIntensity;
}

export function applyTabIcon(doc: Document, tabIcon: TabIcon): void {
    const link = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) link.href = `/icons/favicon-${tabIcon}.svg`;
}

/** 首次绘制前按最近 owner 的快照呈现外观。 */
export function applyStoredFirstFrame(doc: Document): void {
    const storage = firstFrameStorage();
    const appearance = readFirstFrame(storage, readFirstFrameOwner(storage));
    const root = doc.documentElement;
    applyTheme(
        root,
        appearance.theme,
        matchMedia("(prefers-color-scheme: dark)").matches,
    );
    applyStyleAttributes(root, appearance);
    applyTabIcon(doc, appearance.tabIcon);
}
