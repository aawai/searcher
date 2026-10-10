import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DesktopState } from "./desktop-state.ts";

export interface DocumentImmersion {
    immersiveDocumentId: string | null;
    dockShown: boolean;
    enter(windowId: string): void;
    exit(restoreFocus?: boolean): void;
    showDock(): void;
    onDockEnter(): void;
    onDockLeave(): void;
    onEdgeEnter(): void;
    onEdgeLeave(): void;
    onDockBlur(): void;
}

/** Presentation only: never dispatches geometry, focus, or persistence actions. */
export function useDocumentImmersion(
    state: DesktopState,
    userId: string,
    enabled: boolean,
): DocumentImmersion {
    const [session, setSession] = useState<{ userId: string; id: string } | null>(null);
    const [dockShown, setDockShown] = useState(false);
    const dockHovered = useRef(false);
    const edgeHovered = useRef(false);
    const composing = useRef(false);
    const deferredFocus = useRef<HTMLElement | null>(null);
    const focusFrame = useRef<number | null>(null);
    const dockHideFrame = useRef<number | null>(null);

    useEffect(() => {
        if (!enabled) return;
        const start = (event: CompositionEvent) => {
            if (event.target instanceof Element &&
                event.target.closest('[data-window-kind="document"]')) {
                composing.current = true;
            }
        };
        const end = () => {
            composing.current = false;
            const target = deferredFocus.current;
            deferredFocus.current = null;
            if (target?.isConnected) target.focus({ preventScroll: true });
        };
        document.addEventListener("compositionstart", start, true);
        document.addEventListener("compositionend", end, true);
        return () => {
            document.removeEventListener("compositionstart", start, true);
            document.removeEventListener("compositionend", end, true);
            composing.current = false;
            deferredFocus.current = null;
            if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
            if (dockHideFrame.current !== null) cancelAnimationFrame(dockHideFrame.current);
        };
    }, [enabled, userId]);
    const id = session?.userId === userId && enabled &&
            state.windows.some((win) => win.id === session.id &&
                win.kind === "document" && win.mode !== "minimized")
        ? session.id
        : null;

    useEffect(() => {
        if (!id) {
            setSession(null);
            setDockShown(false);
            dockHovered.current = false;
            edgeHovered.current = false;
        }
    }, [id]);

    const exit = useCallback((restoreFocus = true) => {
        if (!id) return;
        const win = document.getElementById(`desktop-window-${id}`);
        const scroll = win?.querySelector<HTMLElement>(".document-editor-scroll-area");
        const offset = scroll?.scrollTop;
        setSession(null);
        setDockShown(false);
        dockHovered.current = false;
        edgeHovered.current = false;
        if (restoreFocus) {
            focusFrame.current = requestAnimationFrame(() => {
                focusFrame.current = null;
                const target = win?.querySelector<HTMLElement>("[data-immersive-enter]") ?? null;
                if (composing.current) deferredFocus.current = target;
                else target?.focus({ preventScroll: true });
                if (scroll && offset !== undefined) scroll.scrollTop = offset;
            });
        }
    }, [id]);

    const enter = useCallback((windowId: string) => {
        if (!enabled || !state.windows.some((win) =>
            win.id === windowId && win.kind === "document" && win.mode !== "minimized"
        )) return;
        setSession({ userId, id: windowId });
        setDockShown(false);
    }, [enabled, state.windows, userId]);

    useLayoutEffect(() => {
        if (!id) return;
        const root = document.documentElement;
        root.dataset.documentImmersive = id;
        const canvas = document.querySelector<HTMLElement>(".desktop-canvas");
        const backgrounds = new Set<HTMLElement>(
            document.querySelectorAll<HTMLElement>(".topbar, .connection-banner"),
        );
        for (const sibling of canvas?.parentElement?.children ?? []) {
            if (sibling instanceof HTMLElement && sibling !== canvas &&
                !sibling.matches(".desktop-dock, [data-immersive-dock-trigger]")) {
                backgrounds.add(sibling);
            }
        }
        const previous = [...backgrounds].map((element) => ({ element, inert: element.inert }));
        for (const { element } of previous) {
            element.inert = true;
            element.setAttribute("data-immersive-background", "");
        }
        canvas?.setAttribute("data-document-immersive", "");
        const enterFocusFrame = requestAnimationFrame(() => {
            if (composing.current) return;
            document.getElementById(`desktop-window-${id}`)
                ?.querySelector<HTMLElement>("[data-immersive-exit]")?.focus({ preventScroll: true });
        });
        return () => {
            cancelAnimationFrame(enterFocusFrame);
            delete root.dataset.documentImmersive;
            canvas?.removeAttribute("data-document-immersive");
            for (const { element, inert } of previous) {
                element.inert = inert;
                element.removeAttribute("data-immersive-background");
            }
        };
    }, [id]);

    useEffect(() => {
        if (!id) return;
        const onEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
            const overlays = document.querySelectorAll<HTMLElement>(
                '[role="alertdialog"], [role="dialog"], [role="menu"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"], [data-slot="context-menu-content"]',
            );
            if ([...overlays].some((element) => element.getClientRects().length > 0 &&
                getComputedStyle(element).visibility !== "hidden")) return;
            event.preventDefault();
            exit();
        };
        document.addEventListener("keydown", onEscape);
        return () => document.removeEventListener("keydown", onEscape);
    }, [id, exit]);

    const hideDockWhenOutside = useCallback(() => {
        if (dockHideFrame.current !== null) cancelAnimationFrame(dockHideFrame.current);
        dockHideFrame.current = requestAnimationFrame(() => {
            dockHideFrame.current = null;
            if (!dockHovered.current && !edgeHovered.current &&
                !document.querySelector(".desktop-dock")?.contains(document.activeElement)) {
                setDockShown(false);
            }
        });
    }, []);

    return {
        immersiveDocumentId: id,
        dockShown: Boolean(id && dockShown),
        enter,
        exit,
        showDock: () => setDockShown(true),
        onDockEnter: () => { dockHovered.current = true; setDockShown(true); },
        onDockLeave: () => { dockHovered.current = false; hideDockWhenOutside(); },
        onEdgeEnter: () => { edgeHovered.current = true; setDockShown(true); },
        onEdgeLeave: () => { edgeHovered.current = false; hideDockWhenOutside(); },
        onDockBlur: hideDockWhenOutside,
    };
}
