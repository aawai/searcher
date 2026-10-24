import { type RefObject, useLayoutEffect, useRef } from "react";
import {
    isEditableShortcutTarget,
    matchesShortcut,
    SHORTCUTS,
} from "../shortcuts/shortcut-catalog.ts";
import {
    IDLE_WHEEL_BURST,
    normaliseWheelDelta,
    pinchIntent,
    type WheelBurst,
    wheelIntent,
    type ZoomIntent,
} from "./desk-model.ts";

/** Overlays whose own keys and pinch never move the desk. */
const OVERLAYS =
    "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']";
/** Scrolling surfaces beside the desk: the detail bar and overlays. */
const OUTSIDE_DESK = `.workspace-panel, ${OVERLAYS}`;
/** The <768px 览 Sheet is a dialog, yet it is the desk itself. */
const DESK_SURFACE = "[data-desk-surface]";

function onOverlay(target: Element): boolean {
    return Boolean(target.closest(OVERLAYS)) && !target.closest(DESK_SURFACE);
}

/** The main search box: 用 may zoom out with the desk shortcut too. */
const MAIN_SEARCH_ID = "search-query";

/** Whether a wheel over `target` would scroll the page or a container. */
function wouldScroll(target: Element): boolean {
    for (
        let element: Element | null = target;
        element && element !== document.documentElement;
        element = element.parentElement
    ) {
        const { overflowY } = getComputedStyle(element);
        if (
            (overflowY === "auto" || overflowY === "scroll") &&
            element.scrollHeight > element.clientHeight
        ) return true;
    }
    const page = document.scrollingElement;
    return Boolean(page && page.scrollHeight > page.clientHeight + 1);
}

/**
 * Binds the desk's zoom gestures: wheel bursts, trackpad pinch (ctrl+wheel),
 * two-finger touch pinch and the desk shortcut. Listeners bind in the commit
 * so a gesture right after a stage change already sees the new stage.
 */
export function useDeskGestures({
    root,
    scroller,
    enabled,
    overview,
    onZoom,
    onToggle,
}: {
    /** The home page; gestures start inside it. */
    root: RefObject<HTMLElement | null>;
    /** 览's own scroll container: wheel up returns only from its top. */
    scroller: RefObject<HTMLElement | null>;
    enabled: boolean;
    overview: boolean;
    onZoom: (intent: ZoomIntent) => void;
    onToggle: () => void;
}) {
    const burst = useRef<WheelBurst>(IDLE_WHEEL_BURST);
    const handlers = useRef({ onZoom, onToggle });
    handlers.current = { onZoom, onToggle };

    useLayoutEffect(() => {
        const page = root.current;
        if (!enabled || !page) return;
        burst.current = IDLE_WHEEL_BURST;
        const onWheel = (event: WheelEvent) => {
            const target = event.target;
            if (
                !(target instanceof Element) || !page.contains(target) ||
                target.closest(OUTSIDE_DESK)
            ) return;
            const result = wheelIntent(
                overview,
                {
                    delta: normaliseWheelDelta(
                        event.deltaY,
                        event.deltaMode,
                        innerHeight,
                    ),
                    ctrlKey: event.ctrlKey,
                    at: event.timeStamp,
                },
                burst.current,
                {
                    scrollable: wouldScroll(target),
                    atTop: (scroller.current?.scrollTop ?? 0) <= 0,
                },
            );
            burst.current = result.burst;
            if (result.claim) event.preventDefault();
            if (result.intent) handlers.current.onZoom(result.intent);
        };
        let start = 0;
        const distance = (touches: TouchList) =>
            Math.hypot(
                touches[0].clientX - touches[1].clientX,
                touches[0].clientY - touches[1].clientY,
            );
        const onTouchStart = (event: TouchEvent) => {
            const target = event.target;
            start = event.touches.length === 2 && target instanceof Element &&
                    (page.contains(target) || target.closest(DESK_SURFACE)) &&
                    !onOverlay(target)
                ? distance(event.touches)
                : 0;
        };
        const onTouchMove = (event: TouchEvent) => {
            if (event.touches.length !== 2 || start === 0) return;
            const intent = pinchIntent(
                overview,
                start,
                distance(event.touches),
                visualViewport?.scale ?? 1,
            );
            if (!intent) return;
            event.preventDefault();
            start = 0;
            handlers.current.onZoom(intent);
        };
        const onKey = (event: KeyboardEvent) => {
            if (!matchesShortcut(event, SHORTCUTS.toggleDesk.binding)) return;
            const target = event.target;
            if (
                target instanceof Element && target.id !== MAIN_SEARCH_ID &&
                (isEditableShortcutTarget(target) || onOverlay(target))
            ) return;
            event.preventDefault();
            handlers.current.onToggle();
        };
        // Wheel and touch listen on the window so 览's layer and the page
        // canvas both count; `page.contains` keeps them to the home page.
        addEventListener("wheel", onWheel, { passive: false });
        addEventListener("touchstart", onTouchStart, { passive: true });
        addEventListener("touchmove", onTouchMove, { passive: false });
        addEventListener("keydown", onKey);
        return () => {
            removeEventListener("wheel", onWheel);
            removeEventListener("touchstart", onTouchStart);
            removeEventListener("touchmove", onTouchMove);
            removeEventListener("keydown", onKey);
        };
    }, [enabled, overview, root, scroller]);
}
