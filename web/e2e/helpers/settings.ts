import type { Locator, Page } from "playwright";

/** Enters preferences from the signed-in user menu, preserving normal history. */
export async function openSettings(page: Page): Promise<Locator> {
    await page.getByRole("button", { name: /^用户菜单/ }).click();
    await page.getByRole("menuitem", { name: "偏好设置", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/settings");
    const navigation = page.getByRole("navigation", { name: "设置分类" });
    await navigation.waitFor({ state: "visible" });
    return navigation;
}
