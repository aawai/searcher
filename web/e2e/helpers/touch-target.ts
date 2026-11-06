import type { Locator } from "playwright";

/**
 * The size of an element's hit area: its box grown by the shared touch-target
 * `::after` (primitives.css), which extends past the box on a touch screen
 * while the visible size stays unchanged.
 */
export function hitSize(locator: Locator) {
    return locator.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const after = getComputedStyle(element, "::after");
        const grow = (inset: string) =>
            after.position === "absolute"
                ? Math.max(0, -(parseFloat(inset) || 0))
                : 0;
        return {
            width: box.width + grow(after.left) + grow(after.right),
            height: box.height + grow(after.top) + grow(after.bottom),
        };
    });
}
