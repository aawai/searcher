import type { Locator, Page } from "playwright";

/** Opens the home library's overflow, without hiding trigger or layout assertions. */
export async function openMoreApps(
    page: Page,
    trigger: Locator,
): Promise<Locator> {
    await trigger.click();
    const popup = page.locator(".launcher-popup");
    await popup.locator(".launcher-popup-title", {
        hasText: /^更多应用$/,
    }).waitFor({ state: "visible" });
    return popup;
}
