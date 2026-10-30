/** How long a scrollbar stays visible after its area stops scrolling. */
export const SCROLL_IDLE_MS = 800;

/**
 * Marks whatever is scrolling with `data-scrolling` so global.css can reveal its
 * scrollbar, and clears the mark `SCROLL_IDLE_MS` after the last scroll event.
 * `scroll` does not bubble, so one capturing listener on the document covers
 * every scroll container. Nodes inside a contenteditable are skipped: editors
 * own their DOM and observe attribute mutations beneath it.
 */
export function installScrollActivity(doc: Document = document): () => void {
    const timers = new Map<Element, number>();
    const onScroll = (event: Event) => {
        const target = event.target;
        const element = target instanceof Element
            ? target
            : target === doc
            ? doc.documentElement
            : null;
        if (!element || element.parentElement?.closest("[contenteditable]")) {
            return;
        }
        if (!element.hasAttribute("data-scrolling")) {
            element.setAttribute("data-scrolling", "");
        }
        clearTimeout(timers.get(element));
        timers.set(
            element,
            setTimeout(() => {
                timers.delete(element);
                element.removeAttribute("data-scrolling");
            }, SCROLL_IDLE_MS),
        );
    };
    doc.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
        doc.removeEventListener("scroll", onScroll, { capture: true });
        timers.forEach((timer, element) => {
            clearTimeout(timer);
            element.removeAttribute("data-scrolling");
        });
        timers.clear();
    };
}
