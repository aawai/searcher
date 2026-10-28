import { assert, assertEquals } from "@std/assert";
import type { Locator, Page } from "playwright";

export function workspaceDock(page: Page): Locator {
    return page.getByRole("navigation", { name: "工作区任务栏", exact: true });
}

export function workspaceNotesTrigger(page: Page): Locator {
    return workspaceDock(page).getByRole("button", {
        name: "笔记",
        exact: true,
    });
}

export function workspaceAppsTrigger(page: Page): Locator {
    return workspaceDock(page).getByRole("button", {
        name: "应用",
        exact: true,
    });
}

/** Shared surface: nonmodal right panel at >=768px, bottom sheet below (nonmodal in all widths). */
export function libraryPanel(page: Page): Locator {
    return page.locator("[data-library]");
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

export async function closeLibrary(page: Page): Promise<void> {
    await libraryPanel(page).getByRole("button", {
        name: "返回首页",
        exact: true,
    }).click();
    await libraryPanel(page).waitFor({ state: "detached" });
}
