import type { Locator, Page } from "playwright";

/**
 * The avatar menu trigger. Its 桌面 and 笔记 items enter 览 (docs/workspace.md
 * #桌面静--用--览); focus returns here when 览 or the detail closes.
 */
export function deskMenuTrigger(page: Page): Locator {
    return page.locator(".user-avatar-trigger");
}

/** The object detail bar: right panel at >=768px, bottom Sheet below. */
export function deskDetail(page: Page): Locator {
    return page.locator(".workspace-panel");
}

/** 览 at >=768px; below 768px 览 is the Sheet itself. */
export function deskOverview(page: Page): Locator {
    return page.getByRole("region", { name: "桌面", exact: true });
}

/** A desk object by id: `notes`, `conversations`, `apps`, `folder:<id>`, `paper:<id>`. */
export function deskObject(page: Page, id: string): Locator {
    return page.locator(`[data-desk-object="${id}"]`);
}

/** The home layer's distance: `calm` (静 / 用) or `overview` (览). */
export function deskStage(page: Page): Promise<string | null> {
    return page.locator(".desk-home").getAttribute("data-desk-stage");
}

/** Chooses an avatar menu item by pointer. */
async function chooseMenuItem(page: Page, name: "桌面" | "笔记") {
    await deskMenuTrigger(page).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
}

/** Opens the notes library detail from 静, entering 览 with it. */
export async function openNotes(page: Page): Promise<Locator> {
    await chooseMenuItem(page, "笔记");
    const detail = deskDetail(page);
    await detail.getByRole("heading", { name: "笔记", exact: true })
        .waitFor();
    return detail;
}

/** Same as `openNotes`, by keyboard from the focused avatar menu trigger. */
export async function openNotesByKeyboard(page: Page): Promise<Locator> {
    await deskMenuTrigger(page).focus();
    await page.keyboard.press("Enter");
    const item = page.getByRole("menuitem", { name: "笔记", exact: true });
    await item.waitFor();
    await item.focus();
    await page.keyboard.press("Enter");
    const detail = deskDetail(page);
    await detail.getByRole("heading", { name: "笔记", exact: true })
        .waitFor();
    return detail;
}

/** Enters 览 from the avatar menu. */
export async function openDesk(page: Page): Promise<void> {
    await chooseMenuItem(page, "桌面");
    await page.waitForFunction(() =>
        document.querySelector(".desk-home")?.getAttribute(
            "data-desk-stage",
        ) === "overview"
    );
}
