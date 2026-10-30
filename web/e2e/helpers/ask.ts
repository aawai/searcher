import type { Locator, Page } from "playwright";

/** Loads a fresh Ask route; callers assert the conversation or composer they need. */
export async function visitAsk(page: Page, origin: string): Promise<Locator> {
    await page.goto(`${origin}/ask`);
    const workspace = page.locator(".ask-workspace-layout");
    await workspace.waitFor({ state: "visible" });
    return workspace;
}

/** Maximizes the AI window so wide-screen lane geometry is measured against the whole work area. */
export async function maximizeAskWindow(page: Page): Promise<void> {
    await page.getByRole("button", { name: "最大化AI 问答" }).click();
    await page.getByRole("button", { name: "还原AI 问答" }).waitFor();
}
