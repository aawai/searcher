import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

const NOTES = '[data-window-id="notes"]';

/** The editor card's geometry and transition state while the drawer is open or closed. */
interface PaneState {
    transform: string;
    gapStart: number;
    gapTop: number;
    gapBottom: number;
    fitsLayout: boolean;
    radius: string;
    paneDuration: string;
    inert: boolean;
    drawerTransition: string;
    drawerDuration: string;
    drawerVisibility: string;
}

Deno.test("笔记抽屉：编辑区收窄为留有固定间隙、不越出内容区的卡片，减少动态效果下保留错位只去掉过渡，焦点与 inert 不变", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
    });
    try {
        await loginAndVisit(page, app.origin, "/?view=notes", user);
        const frame = page.locator(NOTES);
        const layout = frame.locator(".documents-layout");
        const pane = frame.locator(".documents-editor-pane");
        const sidebar = frame.locator(".documents-sidebar");
        const toggle = frame.getByRole("button", {
            name: "笔记侧栏",
            exact: true,
        });
        const state = () =>
            pane.evaluate((element): PaneState => {
                const style = getComputedStyle(element);
                const host = element.parentElement!;
                const drawer = host.querySelector(".documents-sidebar")!;
                const card = element.getBoundingClientRect();
                const box = host.getBoundingClientRect();
                const nav = drawer.querySelector("nav")!
                    .getBoundingClientRect();
                return {
                    transform: style.transform,
                    // Gaps between the card and the navigation / the layout's edges.
                    gapStart: card.left - nav.right,
                    gapTop: card.top - box.top,
                    gapBottom: box.bottom - card.bottom,
                    // Unscaled card that narrows to the room beside the drawer
                    // and ends at the layout's edge instead of being clipped.
                    fitsLayout: Math.abs(card.right - box.right) < 1 &&
                        Math.abs(card.width - (box.right - nav.right - 16)) <
                            1,
                    radius: style.borderTopLeftRadius,
                    paneDuration: style.transitionDuration,
                    inert: (element as HTMLElement).inert,
                    drawerTransition:
                        getComputedStyle(drawer).transitionProperty,
                    drawerDuration: getComputedStyle(drawer).transitionDuration,
                    drawerVisibility: getComputedStyle(drawer).visibility,
                };
            });
        const settle = () =>
            page.waitForFunction(() =>
                document.getAnimations().every((a) =>
                    a.playState === "finished" || a.playState === "idle"
                )
            );
        const assertAside = (open: PaneState) => {
            assertEquals(Math.round(open.gapStart), 16);
            assertEquals(Math.round(open.gapTop), 12);
            assertEquals(Math.round(open.gapBottom), 12);
            assert(open.fitsLayout);
            assertNotEquals(open.radius, "0px");
            assert(open.inert);
            assertEquals(open.drawerVisibility, "visible");
        };

        // No selection: the drawer is open and the editor is an inert card set aside.
        await layout.locator(":scope[data-drawer='open']").waitFor();
        await settle();
        assertAside(await state());

        // Clicking the card closes the drawer; focus returns to the toggle.
        await frame.getByRole("button", { name: "关闭笔记侧栏" }).click();
        await layout.locator(":scope[data-drawer='closed']").waitFor();
        await settle();
        const closed = await state();
        assertEquals(closed.transform, "none");
        assertEquals(Math.round(closed.gapTop), 0);
        assertEquals(closed.inert, false);
        assertEquals(closed.drawerVisibility, "hidden");
        assert(await toggle.evaluate((el) => el === document.activeElement));

        // Reduced motion: the card still sits aside with the same gaps; only its
        // interpolation is gone, and the drawer keeps its same-duration fade.
        await page.emulateMedia({ reducedMotion: "reduce" });
        await toggle.click();
        await layout.locator(":scope[data-drawer='open']").waitFor();
        await settle();
        const reduced = await state();
        assertAside(reduced);
        assertEquals(reduced.paneDuration, "0s");
        assertEquals(reduced.drawerTransition.includes("opacity"), true);
        assertEquals(reduced.drawerDuration.startsWith("0.2s"), true);
        assert(
            await sidebar.evaluate((el) => el.contains(document.activeElement)),
        );
        await page.keyboard.press("Escape");
        await layout.locator(":scope[data-drawer='closed']").waitFor();
        assert(await toggle.evaluate((el) => el === document.activeElement));
    } finally {
        await browser.close();
        await app.close();
    }
});
