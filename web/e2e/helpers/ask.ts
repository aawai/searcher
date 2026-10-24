import type { Locator, Page } from "playwright";

/** Loads a fresh Ask route; callers assert the conversation or composer they need. */
export async function visitAsk(page: Page, origin: string): Promise<Locator> {
    await page.goto(`${origin}/ask`);
    const workspace = page.locator(".ask-workspace-layout");
    await workspace.waitFor({ state: "visible" });
    return workspace;
}
