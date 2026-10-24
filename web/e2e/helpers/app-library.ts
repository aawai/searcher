import type { Locator, Page } from "playwright";

/**
 * 更多（N） opens the library app view (it is no longer a popup). Returns the
 * apps view surface so callers can assert the full library.
 */
export async function openMoreApps(
    page: Page,
    trigger: Locator,
): Promise<Locator> {
    await trigger.click();
    const view = page.locator('[data-library-view="apps"][data-library-apps]');
    await view.waitFor();
    await view.locator(".launcher-grid--library").waitFor();
    return view;
}
