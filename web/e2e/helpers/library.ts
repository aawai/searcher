import { assert, assertEquals } from "@std/assert";
import type { Locator, Page } from "playwright";

export function libraryMenuTrigger(page: Page): Locator {
    return page.locator(".user-avatar-trigger");
}

/** Shared surface: nonmodal right panel at >=768px, bottom Sheet below. */
export function libraryPanel(page: Page): Locator {
    return page.locator("[data-library]");
}

export function libraryView(
    page: Page,
    view: "root" | "notes" | "apps" | "conversations",
): Locator {
    return page.locator(`[data-library-view="${view}"]`);
}

export function libraryRoot(page: Page): Locator {
    return libraryView(page, "root");
}

export function libraryEntry(
    page: Page,
    view: "notes" | "apps" | "conversations",
): Locator {
    const names = { notes: "笔记", apps: "应用", conversations: "AI 对话" };
    return libraryRoot(page).getByRole("button", {
        name: names[view],
        exact: true,
    });
}

export async function openLibrary(page: Page): Promise<Locator> {
    await libraryMenuTrigger(page).click();
    await page.getByRole("menuitem", { name: "资料库", exact: true }).click();
    await libraryRoot(page).waitFor();
    return libraryPanel(page);
}

export async function openNotes(page: Page): Promise<Locator> {
    await libraryMenuTrigger(page).click();
    await page.getByRole("menuitem", { name: "笔记", exact: true }).click();
    await libraryView(page, "notes").waitFor();
    return libraryPanel(page);
}

export async function openNotesByKeyboard(page: Page): Promise<Locator> {
    await libraryMenuTrigger(page).focus();
    await page.keyboard.press("Enter");
    const item = page.getByRole("menuitem", { name: "笔记", exact: true });
    await item.waitFor();
    await item.focus();
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
    await search.press("Escape");
}

export async function closeLibrary(page: Page): Promise<void> {
    await libraryPanel(page).getByRole("button", {
        name: "关闭资料库",
        exact: true,
    }).click();
    await libraryPanel(page).waitFor({ state: "detached" });
}
