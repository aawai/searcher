const EDGE_TOLERANCE = 1;

function markScrollEdges(element: HTMLElement): void {
    const horizontal = element.tagName === "PRE";
    const max = horizontal
        ? element.scrollWidth - element.clientWidth
        : element.scrollHeight - element.clientHeight;
    const position = horizontal ? element.scrollLeft : element.scrollTop;
    element.toggleAttribute("data-fade-start", position > EDGE_TOLERANCE);
    element.toggleAttribute("data-fade-end", position < max - EDGE_TOLERANCE);
}

/**
 * Ref callback for a Home paper body. Marks the body and each code block in it
 * with `data-fade-start` / `data-fade-end` while content is hidden beyond that
 * edge; `notes.css` fades those edges. Other note surfaces keep native scrollbars.
 */
export function observeScrollFade(
    root: HTMLElement | null,
): (() => void) | void {
    if (!root?.closest(".floating-notes")) return;
    const targets = () => [
        root,
        ...root.querySelectorAll<HTMLElement>("pre"),
    ];
    const resize = new ResizeObserver(() => targets().forEach(markScrollEdges));
    const observeTargets = () => {
        resize.disconnect();
        for (const target of root.querySelectorAll("pre, pre > code")) {
            resize.observe(target);
        }
        resize.observe(root);
        targets().forEach(markScrollEdges);
    };
    // Markdown renders lazily and re-renders on edits.
    const mutations = new MutationObserver(observeTargets);
    mutations.observe(root, { childList: true, subtree: true });
    const onScroll = (event: Event) => {
        if (event.target instanceof HTMLElement) markScrollEdges(event.target);
    };
    // `scroll` does not bubble; capture reaches code blocks inside the body.
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    observeTargets();
    return () => {
        resize.disconnect();
        mutations.disconnect();
        root.removeEventListener("scroll", onScroll, { capture: true });
    };
}
