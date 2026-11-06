import type { Page } from "playwright";

const highlighted = (page: Page) =>
    page.evaluate(() =>
        document.querySelector('[role="menuitem"][data-highlighted]')
            ?.textContent ?? null
    );

/**
 * Moves the highlight of an open menu to `name` with ArrowDown only, so a
 * following Enter chooses it the way a keyboard user would.
 */
export async function highlightMenuItem(
    page: Page,
    name: string,
    maxSteps = 16,
): Promise<void> {
    await page.getByRole("menuitem", { name, exact: true }).waitFor();
    for (let step = 0; step < maxSteps; step++) {
        const before = await highlighted(page);
        if (before === name) return;
        await page.keyboard.press("ArrowDown");
        await page.waitForFunction(
            (before) =>
                (document.querySelector('[role="menuitem"][data-highlighted]')
                    ?.textContent ?? null) !== before,
            before,
        );
    }
    throw new Error(`menu item "${name}" not reached by ArrowDown`);
}
