import { assert, assertEquals } from "@std/assert";
import type { Locator, Page } from "playwright";

export function workspaceDock(page: Page): Locator {
    return page.getByRole("navigation", { name: "工作区任务栏", exact: true });
}

/** A window entry's name carries its open state, so address it by identity. */
export function workspaceNotesTrigger(page: Page): Locator {
    return workspaceDock(page).locator('[data-dock-id="notes"]');
}

export function workspaceAppsTrigger(page: Page): Locator {
    return workspaceDock(page).locator('[data-dock-id="apps"]');
}

/**
 * The apps or notes window while it is open, minimized or not (the marker is
 * absent once closed): title bar controls, the view's actions, and the body.
 * Both views match when both are open; scope by view then.
 */
export function libraryPanel(page: Page): Locator {
    return page.locator("[data-library]");
}

/** The window frame whether or not it is open. */
export function libraryWindow(
    page: Page,
    view: "notes" | "apps" = "notes",
): Locator {
    return page.locator(`[data-window-id="${view}"]`);
}

export function libraryView(
    page: Page,
    view: "notes" | "apps",
): Locator {
    return page.locator(`[data-library-view="${view}"]`);
}

export async function openNotes(page: Page): Promise<Locator> {
    await workspaceNotesTrigger(page).click();
    await libraryView(page, "notes").waitFor();
    return libraryPanel(page);
}

export async function openApps(page: Page): Promise<Locator> {
    await workspaceAppsTrigger(page).click();
    await libraryView(page, "apps").waitFor();
    return libraryPanel(page);
}

export async function openNotesByKeyboard(page: Page): Promise<Locator> {
    const trigger = workspaceNotesTrigger(page);
    await trigger.focus();
    await page.keyboard.press("Enter");
    await libraryView(page, "notes").waitFor();
    return libraryPanel(page);
}

/** Desktop library never replaces, reflows, dims or disables the home. */
export async function assertInteractiveHome(page: Page): Promise<void> {
    const search = page.locator("#search-query");
    const appearance = await search.evaluate((element) => {
        let opacity = 1;
        let transformed = false;
        for (
            let node: Element | null = element;
            node;
            node = node.parentElement
        ) {
            const style = getComputedStyle(node);
            opacity *= Number(style.opacity);
            if (style.transform !== "none") {
                const matrix = new DOMMatrixReadOnly(style.transform);
                transformed ||= matrix.a !== 1 || matrix.d !== 1;
            }
        }
        return {
            inert: Boolean(element.closest("[inert]")),
            opacity,
            transformed,
        };
    });
    assertEquals(appearance, { inert: false, opacity: 1, transformed: false });
    await search.fill("首页仍可交互");
    assertEquals(await search.inputValue(), "首页仍可交互");
    assert(await libraryPanel(page).isVisible());
    await search.fill("");
}

/** Closing destroys the window and its content, like leaving the old panel. */
export async function closeLibrary(page: Page): Promise<void> {
    await libraryPanel(page).locator('[data-window-dismiss][aria-label^="关闭"]').click();
    await libraryPanel(page).waitFor({ state: "detached" });
}
