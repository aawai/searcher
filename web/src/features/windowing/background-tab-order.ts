import { type RefObject, useEffect, useRef } from "react";

/**
 * Marks a layer behind the active window: the desktop or a background
 * window. Tab passes over it, so keyboard focus never lands on content an
 * overlapping window may hide entirely (WCAG 2.4.11). Pointer presses still
 * reach it and bring it forward.
 */
export function backgroundLayer(inBackground: boolean) {
    return { "data-background-layer": inBackground || undefined };
}

const TAB_STOP =
    'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]:not([contenteditable="false"])';

/**
 * The Tab stop the browser would reach next if `layer` were not in the Tab
 * order. Other background layers and inert regions are skipped as well.
 */
function tabStopOutside(
    layer: HTMLElement,
    backward: boolean,
): HTMLElement | null {
    const stops = Array.from(
        document.querySelectorAll<HTMLElement>(TAB_STOP),
    ).filter((element) =>
        element.tabIndex >= 0 && !element.matches(":disabled") &&
        element.getClientRects().length > 0 &&
        !element.closest("[inert], [data-background-layer]")
    );
    const after = (element: HTMLElement) =>
        Boolean(
            layer.compareDocumentPosition(element) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        );
    return backward
        ? stops.reverse().find((element) => !after(element)) ?? null
        : stops.find(after) ?? null;
}

/**
 * Keeps `layer` out of the Tab order while `inBackground`, without rewriting
 * its DOM: content such as the note editor owns its subtree and redraws on
 * attribute changes, which would answer every rewrite with new nodes. The
 * layer stays pointer-interactive, so `inert` cannot be used. The caller
 * spreads `backgroundLayer(inBackground)` onto the layer. `onFocus` sees
 * every focus that stays inside the layer.
 */
export function useBackgroundTabSkip(
    layer: RefObject<HTMLElement | null>,
    inBackground: boolean,
    onFocus?: (target: HTMLElement) => void,
) {
    const tabbing = useRef<{ backward: boolean } | null>(null);
    const backgroundRef = useRef(inBackground);
    backgroundRef.current = inBackground;
    const onFocusRef = useRef(onFocus);
    onFocusRef.current = onFocus;
    useEffect(() => {
        if (!inBackground) return;
        let frameId = 0;
        const keydown = (event: KeyboardEvent) => {
            if (event.key !== "Tab") return;
            tabbing.current = { backward: event.shiftKey };
            cancelAnimationFrame(frameId);
            // The focus move is this key's default action, done before the
            // next frame; focus arriving later does not come from Tab.
            frameId = requestAnimationFrame(() => tabbing.current = null);
        };
        document.addEventListener("keydown", keydown, true);
        return () => {
            document.removeEventListener("keydown", keydown, true);
            cancelAnimationFrame(frameId);
            tabbing.current = null;
        };
    }, [inBackground]);
    // Native listener: window content is portaled into the frame from
    // elsewhere in the React tree, so React focus events never reach here.
    useEffect(() => {
        const node = layer.current;
        if (!node) return;
        const focusin = (event: FocusEvent) => {
            const pending = tabbing.current;
            if (backgroundRef.current && pending) {
                const next = tabStopOutside(node, pending.backward);
                if (next) next.focus();
                else if (event.target instanceof HTMLElement) {
                    event.target.blur();
                }
                return;
            }
            if (event.target instanceof HTMLElement) {
                onFocusRef.current?.(event.target);
            }
        };
        node.addEventListener("focusin", focusin, true);
        return () => node.removeEventListener("focusin", focusin, true);
    }, [layer]);
}
