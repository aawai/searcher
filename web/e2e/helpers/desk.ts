import type { Locator, Page } from "playwright";

/** The control that opens the notes detail from 静 (docs/workspace.md#桌面静--用--览). */
export function notesOpener(page: Page): Locator {
    return page.locator('.zen-edge-btn[data-workspace="documents"]');
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

/** Opens the notes library detail from 静, entering 览 with it. */
export async function openNotes(page: Page): Promise<Locator> {
    await notesOpener(page).click();
    const detail = deskDetail(page);
    await detail.getByRole("heading", { name: "笔记", exact: true })
        .waitFor();
    return detail;
}
