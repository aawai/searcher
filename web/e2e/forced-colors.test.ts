import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { eq } from "drizzle-orm";
import type { Page } from "playwright";
import { users } from "../../src/db/schema.ts";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

// A7 (#370 B5): under `forced-colors: active` the system repaints backgrounds
// Canvas (keeping their alpha), recolours borders and drops box-shadows. Every
// control state and floating edge must survive that through system colours.

interface Paint {
    background: string;
    outline: string;
    border: string;
}

/** Computed paint of the first match (or its pseudo-element). */
function paint(page: Page, selector: string, pseudo?: string) {
    return page.locator(selector).first().evaluate(
        (element, pseudo): Paint => {
            const style = getComputedStyle(element, pseudo);
            return {
                background: style.backgroundColor,
                outline: style.outlineStyle === "none"
                    ? "none"
                    : `${style.outlineWidth} ${style.outlineColor}`,
                border: `${style.borderTopWidth} ${style.borderTopColor}`,
            };
        },
        pseudo,
    );
}

/** The system Canvas colour as computed in this scheme. */
function canvas(page: Page) {
    return page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.background = "Canvas";
        document.body.append(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
    });
}

const opaque = (color: string) => !/rgba\(.*,\s*0?\.\d+\)$/.test(color);

Deno.test("A7 强制颜色模式下控件状态、浮层边界与玻璃表面可辨 #370", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
        for (const colorScheme of ["light", "dark"] as const) {
            const context = await browser.newContext({
                viewport: { width: 1280, height: 900 },
                colorScheme,
                forcedColors: "active",
            });
            const page = await context.newPage();
            const label = (what: string) => `${colorScheme}: ${what}`;
            await loginAndVisit(page, app.origin, "/", user);
            const base = await canvas(page);

            // Glass turns solid, and floating surfaces keep an edge.
            for (const selector of [".search-frame", ".dock-bar"]) {
                const surface = await paint(page, selector);
                assert(opaque(surface.background), label(selector));
                assertNotEquals(surface.outline, "none", label(selector));
            }
            await page.locator('[data-dock-id="home"]').click({
                button: "right",
            });
            assertNotEquals(
                (await paint(page, ".menu-popup")).outline,
                "none",
                label("menu edge"),
            );
            await page.keyboard.press("Escape");
            await page.locator(".accent-picker-trigger").click();
            const popover = '[data-slot="popover-content"].accent-picker';
            assertNotEquals(
                (await paint(page, popover)).outline,
                "none",
                label("popover edge"),
            );
            // Swatch colours are content: they stay distinct, the chosen one ringed.
            const swatches = await page.locator(
                `${popover} .accent-swatch-color`,
            ).evaluateAll((dots) =>
                new Set(
                    dots.map((dot) => getComputedStyle(dot).backgroundColor),
                )
                    .size
            );
            assert(swatches >= 8, label(`${swatches} swatch colours`));
            assertNotEquals(
                (await paint(
                    page,
                    `${popover} .radio-item[data-checked] > :last-child`,
                )).outline,
                "none",
                label("chosen swatch"),
            );
            await page.keyboard.press("Escape");

            await page.goto(`${app.origin}/settings/appearance`);
            const settings = '[data-window-id="settings"]';
            await page.locator(`${settings} .settings-row`).first().waitFor();
            // The Dock marks the active entry with a bar in a system colour.
            assertNotEquals(
                (await paint(
                    page,
                    '.dock-item[data-active="true"]',
                    "::after",
                )).background,
                base,
                label("Dock bar"),
            );
            const differ = async (
                what: string,
                on: string,
                off: string,
                pseudo?: string,
            ) => assertNotEquals(
                (await paint(page, on, pseudo)).background,
                (await paint(page, off, pseudo)).background,
                label(what),
            );
            await differ(
                "settings navigation",
                `${settings} .settings-nav-item[aria-current="page"]`,
                `${settings} .settings-nav-item:not([aria-current])`,
            );
            const segment =
                `${settings} [data-variant="segmented"] .radio-item`;
            await differ(
                "segmented",
                `${segment}[data-checked]`,
                `${segment}:not([data-checked])`,
            );
            await differ(
                "switch thumb",
                `${settings} .switch[data-checked] .switch-thumb`,
                `${settings} .switch:not([data-checked]) .switch-thumb`,
            );
            assertNotEquals(
                (await paint(
                    page,
                    `${settings} .switch:not([data-checked]) .switch-thumb`,
                )).background,
                base,
                label("unchecked thumb"),
            );

            // The readability slider appears once a wallpaper is set.
            await page.getByTestId("wallpaper-input").fill(
                `https://example.com/${colorScheme}.jpg`,
            );
            await page.getByTestId("wallpaper-apply-btn").click();
            const slider = page.getByTestId("wallpaper-readability-slider");
            await slider.waitFor();
            const track = await paint(page, `${settings} .slider-track`);
            const thumb = await paint(page, `${settings} .slider-thumb`);
            assertNotEquals(track.background, base, label("slider track"));
            assertNotEquals(thumb.border.split(" ")[0], "0px", label("thumb"));

            await page.goto(`${app.origin}/settings/ai`);
            const radio =
                `${settings} .radio-item[data-checked] .radio-indicator`;
            await page.locator(radio).waitFor();
            assertNotEquals(
                (await paint(page, radio)).background,
                base,
                label("radio dot"),
            );

            await page.goto(`${app.origin}/trash`);
            const tab = '[data-window-id="trash"] [data-slot="tabs-trigger"]';
            await page.locator(`${tab}[data-active]`).waitFor();
            await differ(
                "trash tab",
                `${tab}[data-active]`,
                `${tab}:not([data-active])`,
            );
            await context.close();
        }
    } finally {
        await browser.close();
        await app.close();
    }
});

// 1.4.1: the current navigation item is told apart by weight, not only by fill.
Deno.test("设置与管理导航当前项有颜色以外的字重线索 #370", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
        const page = await browser.newPage({
            viewport: { width: 1280, height: 900 },
        });
        await loginAndVisit(page, app.origin, "/settings/appearance", user);
        const weights = (selector: string) =>
            page.locator(selector).evaluateAll((items) =>
                items.map((item) => [
                    item.getAttribute("aria-current"),
                    getComputedStyle(item).fontWeight,
                ])
            );
        await page.locator(".settings-nav-item").first().waitFor();
        const settings = await weights(".settings-nav-item");
        const current = settings.filter(([state]) => state === "page");
        assertEquals(current.length, 1, JSON.stringify(settings));
        for (const [state, weight] of settings) {
            if (state !== "page") {
                assertNotEquals(
                    weight,
                    current[0][1],
                    JSON.stringify(settings),
                );
            }
        }
        await app.store.run(async (db) => {
            await db.update(users).set({ role: "admin" }).where(
                eq(users.id, user.userId),
            );
        });
        await page.goto(`${app.origin}/admin/users`);
        await page.locator(".local-navigation a").first().waitFor();
        const admin = await weights(".local-navigation a");
        const adminCurrent = admin.filter(([state]) => state === "page");
        assertEquals(adminCurrent.length, 1, JSON.stringify(admin));
        for (const [state, weight] of admin) {
            if (state !== "page") {
                assertNotEquals(
                    weight,
                    adminCurrent[0][1],
                    JSON.stringify(admin),
                );
            }
        }
    } finally {
        await browser.close();
        await app.close();
    }
});
