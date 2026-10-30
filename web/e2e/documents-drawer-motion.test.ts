import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

const NOTES = '[data-window-id="notes"]';

Deno.test("笔记抽屉：编辑区缩成卡片位移，减少动态效果下无位移缩放且焦点与 inert 不变", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
        await loginAndVisit(page, app.origin, "/?view=notes", user);
        const frame = page.locator(NOTES);
        const layout = frame.locator(".documents-layout");
        const pane = frame.locator(".documents-editor-pane");
        const sidebar = frame.locator(".documents-sidebar");
        const toggle = frame.getByRole("button", { name: "笔记侧栏", exact: true });
        const state = () =>
            pane.evaluate((element) => {
                const style = getComputedStyle(element);
                const drawer = element.parentElement!.querySelector(".documents-sidebar")!;
                return {
                    transform: style.transform,
                    radius: style.borderTopLeftRadius,
                    inert: (element as HTMLElement).inert,
                    drawerTransition: getComputedStyle(drawer).transitionProperty,
                    drawerDuration: getComputedStyle(drawer).transitionDuration,
                    drawerVisibility: getComputedStyle(drawer).visibility,
                };
            });
        const settle = () =>
            page.waitForFunction(() => document.getAnimations().every((a) => a.playState === "finished" || a.playState === "idle"));

        // No selection: the drawer is open and the editor is an inert card.
        await layout.locator(":scope[data-drawer='open']").waitFor();
        await settle();
        const open = await state();
        assertNotEquals(open.transform, "none");
        assertNotEquals(open.radius, "0px");
        assert(open.inert);
        assertEquals(open.drawerVisibility, "visible");

        // Clicking the card closes the drawer; focus returns to the toggle.
        await frame.getByRole("button", { name: "关闭笔记侧栏" }).click();
        await layout.locator(":scope[data-drawer='closed']").waitFor();
        await settle();
        const closed = await state();
        assertEquals(closed.transform, "none");
        assertEquals(closed.inert, false);
        assertEquals(closed.drawerVisibility, "hidden");
        assert(await toggle.evaluate((el) => el === document.activeElement));

        // Reduced motion: opacity only, same duration, no translate or scale.
        await page.emulateMedia({ reducedMotion: "reduce" });
        await toggle.click();
        await layout.locator(":scope[data-drawer='open']").waitFor();
        await settle();
        const reduced = await state();
        assertEquals(reduced.transform, "none");
        assertEquals(reduced.radius, "0px");
        assert(reduced.inert);
        assertEquals(reduced.drawerTransition.includes("opacity"), true);
        assertEquals(reduced.drawerDuration.startsWith("0.2s"), true);
        assert(await sidebar.evaluate((el) => el.contains(document.activeElement)));
        await page.keyboard.press("Escape");
        await layout.locator(":scope[data-drawer='closed']").waitFor();
        assert(await toggle.evaluate((el) => el === document.activeElement));
    } finally {
        await browser.close();
        await app.close();
    }
});
