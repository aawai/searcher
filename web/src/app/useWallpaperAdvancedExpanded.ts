import { useCallback, useEffect, useRef, useState } from "react";
import { getLocal, setLocal } from "../lib/local.ts";

/**
 * 设置页“壁纸高级选项”展开状态：按设备记忆（IndexedDB），不写服务端，
 * 不随账号切换。默认折叠；读取完成前用户已主动切换时，以用户操作为准。
 */
export const WALLPAPER_ADVANCED_EXPANDED_KEY =
    "settings:wallpaper-advanced-expanded";

export function useWallpaperAdvancedExpanded(): [
    boolean,
    (expanded: boolean) => void,
] {
    const [expanded, setExpanded] = useState(false);
    const touchedRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        getLocal<unknown>(WALLPAPER_ADVANCED_EXPANDED_KEY)
            .then((saved) => {
                if (cancelled || touchedRef.current) return;
                setExpanded(saved === true);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const update = useCallback((next: boolean) => {
        touchedRef.current = true;
        setExpanded(next);
        void setLocal(WALLPAPER_ADVANCED_EXPANDED_KEY, next).catch(() => {});
    }, []);

    return [expanded, update];
}
