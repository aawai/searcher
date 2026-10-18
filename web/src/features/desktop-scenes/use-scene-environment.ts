import { useEffect, useState } from "react";

/** 文档是否可见。标签隐藏时场景必须暂停，恢复后继续而不重置。 */
export function useDocumentVisible(): boolean {
    const [visible, setVisible] = useState(() =>
        typeof document === "undefined" ||
        document.visibilityState !== "hidden"
    );
    useEffect(() => {
        const sync = () => setVisible(document.visibilityState !== "hidden");
        document.addEventListener("visibilitychange", sync);
        sync();
        return () => document.removeEventListener("visibilitychange", sync);
    }, []);
    return visible;
}

/** 订阅一个 media query；不支持 matchMedia 的环境视为不匹配。 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() =>
        typeof globalThis.matchMedia === "function"
            ? globalThis.matchMedia(query).matches
            : false
    );
    useEffect(() => {
        if (typeof globalThis.matchMedia !== "function") return;
        const media = globalThis.matchMedia(query);
        const sync = () => setMatches(media.matches);
        media.addEventListener("change", sync);
        sync();
        return () => media.removeEventListener("change", sync);
    }, [query]);
    return matches;
}
