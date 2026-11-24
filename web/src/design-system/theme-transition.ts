import { flushSync } from "react-dom";

export const THEME_IRIS_CLASS = "theme-iris-transition";
export const THEME_SYNC_EVENT = "searcher:theme-sync";
const IRIS_DURATION_MS = 360;
const IRIS_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export interface ThemeViewTransition {
    ready: Promise<unknown>;
    finished: Promise<unknown>;
}

export interface ThemeTransitionEnv {
    root: HTMLElement;
    reducedMotion: boolean;
    viewportWidth: number;
    viewportHeight: number;
    startViewTransition:
        | ((update: () => void) => ThemeViewTransition)
        | undefined;
    animateRoot: (
        keyframes: Keyframe[],
        options: KeyframeAnimationOptions,
    ) => void;
    dispatchSync: () => void;
    flush: (fn: () => void) => void;
}

let activeTransitionToken = 0;

function defaultBrowserEnv(): ThemeTransitionEnv | null {
    if (typeof document === "undefined") return null;
    return {
        root: document.documentElement,
        reducedMotion: typeof globalThis.matchMedia === "function"
            ? globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
            : false,
        viewportWidth: globalThis.innerWidth || 0,
        viewportHeight: globalThis.innerHeight || 0,
        startViewTransition: typeof document.startViewTransition === "function"
            ? (update) => document.startViewTransition(update)
            : undefined,
        animateRoot: (keyframes, options) => {
            document.documentElement.animate(keyframes, options);
        },
        dispatchSync: () => {
            globalThis.dispatchEvent(new Event(THEME_SYNC_EVENT));
        },
        flush: flushSync,
    };
}

function resolveOriginPoint(
    origin: HTMLElement | null,
    viewportWidth: number,
    viewportHeight: number,
): { x: number; y: number } {
    if (origin && typeof origin.getBoundingClientRect === "function") {
        const rect = origin.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
            return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            };
        }
    }
    return { x: viewportWidth / 2, y: viewportHeight / 2 };
}

/**
 * Transitions between themes with a radial circular reveal originating from the
 * clicked toggle or tile, flushing DOM + canvas repaints synchronously before
 * the browser captures the new snapshot. Gracefully degrades to instant switch
 * when View Transitions are unsupported or under reduced motion.
 */
export async function runThemeIrisTransition(
    origin: HTMLElement | null,
    applyTheme: () => void,
    env: ThemeTransitionEnv | null = defaultBrowserEnv(),
): Promise<"iris" | "instant"> {
    if (!env || env.reducedMotion || !env.startViewTransition) {
        applyTheme();
        env?.dispatchSync();
        return "instant";
    }

    const token = ++activeTransitionToken;
    const { x, y } = resolveOriginPoint(
        origin,
        env.viewportWidth,
        env.viewportHeight,
    );
    const endRadius = Math.hypot(
        Math.max(x, env.viewportWidth - x),
        Math.max(y, env.viewportHeight - y),
    );

    env.root.classList.add(THEME_IRIS_CLASS);
    let transition: ThemeViewTransition;
    try {
        transition = env.startViewTransition(() => {
            env.flush(applyTheme);
            env.dispatchSync();
        });
    } catch {
        if (activeTransitionToken === token) {
            env.root.classList.remove(THEME_IRIS_CLASS);
        }
        applyTheme();
        env.dispatchSync();
        return "instant";
    }

    try {
        await transition.ready;
        if (activeTransitionToken === token) {
            env.animateRoot(
                [
                    { clipPath: `circle(0px at ${x}px ${y}px)` },
                    { clipPath: `circle(${endRadius}px at ${x}px ${y}px)` },
                ],
                {
                    duration: IRIS_DURATION_MS,
                    easing: IRIS_EASING,
                    pseudoElement: "::view-transition-new(root)",
                },
            );
        }
        await transition.finished;
        return "iris";
    } catch {
        // Rapid consecutive toggles abort the superseded ViewTransition cleanly.
        return "instant";
    } finally {
        if (activeTransitionToken === token) {
            env.root.classList.remove(THEME_IRIS_CLASS);
        }
    }
}
