import { assertEquals } from "@std/assert";
import { type Browser, type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { eq } from "drizzle-orm";
import { aiConversations, aiMessages } from "../../src/db/ai-schema.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

const NOTES_WINDOW = '[data-window-id="notes"]';
const TIMEZONE = "Asia/Shanghai";
const clockText = (page: Page) =>
    page.getByTestId("home-calm-clock").textContent();
const box = async (page: Page, selector: string) => {
    const rect = await page.locator(selector).boundingBox();
    if (!rect) throw new Error(`${selector} has no box`);
    return rect;
};
const searchTop = async (page: Page) => (await box(page, "#search-query")).y;

async function openHome(page: Page, origin: string) {
    await page.goto(origin + "/");
    await page.locator("#search-query").waitFor({ state: "visible" });
}

/** The device-cached appearance value of `field` (IndexedDB), or null when absent. */
async function storedAppearance(field: string): Promise<boolean | null> {
    const request = <T>(target: IDBRequest<T>) => {
        const { promise, resolve, reject } = Promise.withResolvers<T>();
        target.onsuccess = () => resolve(target.result);
        target.onerror = () => reject(target.error);
        return promise;
    };
    const open = indexedDB.open("searcher-client", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("state");
    const db = await request(open);
    try {
        const state = () => db.transaction("state").objectStore("state");
        const keys = (await request(state().getAllKeys())).map(String)
            .filter((key) => key.startsWith("appearance:"));
        // A signed-in page reads its account cache, not the anonymous one.
        const key = keys.find((k) => k !== "appearance:anonymous") ?? keys[0];
        if (!key) return null;
        const saved: unknown = await request(state().get(key));
        if (!saved || typeof saved !== "object" || !(field in saved)) {
            return null;
        }
        const value = (saved as Record<string, unknown>)[field];
        return typeof value === "boolean" ? value : null;
    } finally {
        db.close();
    }
}

const switchIs = ([label, value]: readonly [string, string]) =>
    document.querySelector(`[role="switch"][aria-label="${label}"]`)
        ?.getAttribute("aria-checked") === value;

/**
 * The settings page first renders built-in defaults, then applies the device
 * cache, and writes a change back to it asynchronously. Wait for the cached
 * value before deciding to click, and for the write before navigating away;
 * otherwise a fast test skips a needed click or loses the change.
 */
async function setSwitch(
    page: Page,
    origin: string,
    name: string,
    field: string,
    checked: boolean,
) {
    await page.goto(origin + "/settings/appearance");
    const stored = await page.evaluate(storedAppearance, field);
    const control = page.getByRole("switch", { name, exact: true });
    await control.waitFor();
    if (stored !== null) {
        await page.waitForFunction(switchIs, [name, String(stored)] as const);
    }
    if ((await control.getAttribute("aria-checked") === "true") !== checked) {
        await control.click();
    }
    await page.waitForFunction(switchIs, [name, String(checked)] as const);
    const deadline = Date.now() + 30_000;
    while (await page.evaluate(storedAppearance, field) !== checked) {
        if (Date.now() > deadline) {
            throw new Error(`${field} was not written to the device cache`);
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

async function newPage(browser: Browser, time: string) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        timezoneId: TIMEZONE,
        colorScheme: "light",
        reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(time) });
    return { context, page };
}

Deno.test("home calm layer: date, optional time, 继续 and the time-of-day canvas #239", async (t) => {
    const app = await startProductionApp();
    const credentials = await app.seedAskFixtureUser({
        username: "calm_user",
        password: "Calm-layer-password-239!",
    });
    const browser = await chromium.launch({
        handleSIGTERM: false,
        args: ["--no-sandbox"],
    });
    try {
        await t.step(
            "guests see only the date; it rolls over at midnight",
            async () => {
                const { context, page } = await newPage(
                    browser,
                    "2026-10-24T23:59:30+08:00",
                );
                try {
                    await openHome(page, app.origin);
                    assertEquals(await clockText(page), "10月24日 星期六");
                    assertEquals(
                        await page.locator(".home-calm__time").count(),
                        0,
                    );
                    assertEquals(
                        await page.getByRole("navigation", { name: "继续" })
                            .count(),
                        0,
                    );
                    assertEquals(
                        await page.locator(".home-calm").evaluate((element) =>
                            element.getAnimations({ subtree: true }).length
                        ),
                        0,
                        "nothing in the calm layer animates",
                    );
                    const top = await searchTop(page);
                    await page.clock.runFor(31_000);
                    await page.waitForFunction(() =>
                        document.querySelector(
                            '[data-testid="home-calm-clock"]',
                        )
                            ?.textContent === "10月25日 星期日"
                    );
                    assertEquals(await searchTop(page), top);
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "the optional time ticks each minute without moving anything",
            async () => {
                const { context, page } = await newPage(
                    browser,
                    "2026-10-24T09:58:10+08:00",
                );
                try {
                    await openHome(page, app.origin);
                    const top = await searchTop(page);
                    await setSwitch(
                        page,
                        app.origin,
                        "显示时间",
                        "showHomeTime",
                        true,
                    );
                    await openHome(page, app.origin);
                    assertEquals(await searchTop(page), top, "time on");
                    const seen: string[] = [];
                    const geometry = new Set<string>();
                    // 09:58 → 10:13 crosses digits of every width.
                    for (let minute = 0; minute < 16; minute++) {
                        const text = await page.locator(".home-calm__time")
                            .textContent();
                        seen.push(text ?? "");
                        const rect = await box(page, ".home-calm__time");
                        geometry.add(`${rect.x}:${rect.width}:${rect.y}`);
                        await page.clock.runFor(60_000);
                        await page.waitForFunction(
                            (previous) =>
                                document.querySelector(".home-calm__time")
                                    ?.textContent !== previous,
                            text,
                        );
                    }
                    assertEquals(seen[0], "09:58");
                    assertEquals(seen.at(-1), "10:13");
                    assertEquals(geometry.size, 1, [...geometry].join(" "));
                    assertEquals(
                        await page.locator("time").getAttribute("datetime"),
                        "2026-10-24T10:14",
                    );

                    await setSwitch(
                        page,
                        app.origin,
                        "显示日期",
                        "showHomeDate",
                        false,
                    );
                    await setSwitch(
                        page,
                        app.origin,
                        "显示时间",
                        "showHomeTime",
                        false,
                    );
                    await openHome(page, app.origin);
                    // The home first renders defaults, then the device cache hides the line.
                    await page.getByTestId("home-calm-clock").waitFor({
                        state: "detached",
                    });
                    assertEquals(
                        await searchTop(page),
                        top,
                        "date and time off",
                    );
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "继续 leads to the latest note, open home to-dos and an unfinished conversation",
            async () => {
                const { context, page } = await newPage(
                    browser,
                    "2026-10-24T14:00:00+08:00",
                );
                try {
                    await loginAndVisit(page, app.origin, "/", credentials);
                    const create = (body: Record<string, unknown>) =>
                        page.evaluate(async (input) => {
                            const response = await fetch("/api/documents", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify(input),
                            });
                            if (!response.ok) {
                                throw new Error(await response.text());
                            }
                        }, body);
                    await create({
                        title: "今日待办",
                        body: "- [ ] 买菜\n- [x] 跑步\n- [ ] 回邮件",
                        isHomeFixed: true,
                    });
                    await create({ title: "周报草稿", body: "进度" });

                    // Hold the candidates to prove the line's arrival moves nothing.
                    let release = () => {};
                    const held = new Promise<void>((resolve) =>
                        release = resolve
                    );
                    await page.route("**/api/home/continue", async (route) => {
                        await held;
                        await route.continue();
                    });
                    await openHome(page, app.origin);
                    await page.getByTestId("home-calm-clock").waitFor();
                    const before = {
                        clock: await box(
                            page,
                            '[data-testid="home-calm-clock"]',
                        ),
                        search: await searchTop(page),
                    };
                    release();
                    const continueNav = page.getByRole("navigation", {
                        name: "继续",
                    });
                    await continueNav.waitFor();
                    await page.unroute("**/api/home/continue");
                    assertEquals(
                        await box(page, '[data-testid="home-calm-clock"]'),
                        before.clock,
                    );
                    assertEquals(await searchTop(page), before.search);
                    assertEquals(
                        await continueNav.locator("a, button")
                            .allTextContents(),
                        ["继续编辑 周报草稿", "首页 2 项待办"],
                    );

                    await continueNav.getByRole("button", {
                        name: "继续编辑 周报草稿",
                    }).click();
                    await page.locator(NOTES_WINDOW).waitFor();
                    await page.waitForFunction(() =>
                        (document.querySelector(".document-title-input") as
                            | HTMLInputElement
                            | null)?.value === "周报草稿"
                    );

                    await openHome(page, app.origin);
                    await continueNav.getByRole("button", {
                        name: "首页 2 项待办",
                    })
                        .click();
                    await page.locator(NOTES_WINDOW).waitFor();
                    await page.waitForFunction(() =>
                        (document.querySelector(".document-title-input") as
                            | HTMLInputElement
                            | null)?.value === "今日待办"
                    );

                    // An interrupted answer newer than the note takes the lead.
                    await app.store.run(async (db) => {
                        await db.update(aiMessages).set({
                            status: "interrupted",
                        })
                            .where(
                                eq(
                                    aiMessages.id,
                                    credentials.assistantMessageId,
                                ),
                            )
                            .run();
                        await db.update(aiConversations).set({
                            updatedAt: Date.now() + 60_000,
                        }).where(
                            eq(aiConversations.id, credentials.conversationId),
                        ).run();
                    });
                    await openHome(page, app.origin);
                    const conversation = continueNav.getByRole("link", {
                        name: /^继续对话 /,
                    });
                    await conversation.waitFor();
                    await conversation.click();
                    await page.waitForURL(
                        `${app.origin}/ask/${credentials.conversationId}`,
                    );

                    await openHome(page, app.origin);
                    await continueNav.waitFor();
                    const top = await searchTop(page);
                    await setSwitch(
                        page,
                        app.origin,
                        "显示“继续”",
                        "showHomeContinue",
                        false,
                    );
                    await openHome(page, app.origin);
                    await page.getByTestId("home-calm-clock").waitFor();
                    await continueNav.waitFor({ state: "detached" });
                    assertEquals(await continueNav.count(), 0);
                    assertEquals(await searchTop(page), top, "继续 off");
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "the default canvas tone follows the time of day at load",
            async () => {
                for (
                    const [time, part, light] of [
                        ["2026-10-24T08:00:00+08:00", "morning", "#EDC9B5"],
                        ["2026-10-24T14:00:00+08:00", "day", "#C3D6EA"],
                        ["2026-10-24T22:00:00+08:00", "night", "#D3C9E8"],
                    ] as const
                ) {
                    const { context, page } = await newPage(browser, time);
                    try {
                        await openHome(page, app.origin);
                        const surface = page.getByTestId(
                            "home-wallpaper-surface",
                        );
                        assertEquals(
                            await surface.getAttribute("data-daypart"),
                            part,
                        );
                        assertEquals(
                            await surface.evaluate((element) =>
                                getComputedStyle(element).getPropertyValue(
                                    "--canvas-mesh-secondary",
                                ).trim().toUpperCase()
                            ),
                            light,
                        );
                        // Crossing into the next part of the day never repaints the canvas.
                        await page.clock.runFor(4 * 60 * 60 * 1000);
                        assertEquals(
                            await surface.getAttribute("data-daypart"),
                            part,
                        );
                    } finally {
                        await context.close();
                    }
                }
            },
        );
    } finally {
        await browser.close();
        await app.close();
    }
});
