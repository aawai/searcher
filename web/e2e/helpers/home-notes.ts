import { assert, assertEquals } from "@std/assert";
import type {
    Browser,
    BrowserContext,
    Locator,
    Page,
    Response,
} from "playwright";
import { chromium } from "./browser.ts";
import {
    type ProductionAppInstance,
    startProductionApp,
} from "./production-app.ts";

export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface CreateNoteInput {
    title: string;
    body: string;
    color?: "paper" | "amber" | "rose" | "sage" | "sky";
    isHomeFixed?: boolean;
    homeSortOrder?: number;
    size?: "s" | "w";
    col?: number | null;
    row?: number | null;
}

/** Registers a fresh account and leaves the page on the home surface. */
export async function registerHomeNoteUser(
    page: Page,
    origin: string,
    username: string,
): Promise<void> {
    await page.goto(origin + "/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill(username);
    await page.locator("#auth-password").fill("Home-notes-285!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").first().waitFor();
}

async function api<T>(
    page: Page,
    path: string,
    init?: { method?: string; data?: unknown },
): Promise<T> {
    return await page.evaluate(
        async ({ path, init }) => {
            const response = await fetch(path, {
                method: init?.method ?? "GET",
                headers: init?.data === undefined
                    ? undefined
                    : { "Content-Type": "application/json" },
                body: init?.data === undefined
                    ? undefined
                    : JSON.stringify(init.data),
            });
            if (!response.ok) {
                throw new Error(
                    `${path} ${response.status}: ${await response.text()}`,
                );
            }
            return await response.json();
        },
        { path, init },
    ) as T;
}

/** Creates a note through the API; the caller owns reloads. */
export async function createHomeNote(
    page: Page,
    input: CreateNoteInput,
): Promise<{ id: string; version: number }> {
    const envelope = await api<{ data: { id: string; version: number } }>(
        page,
        "/api/documents",
        {
            method: "POST",
            data: {
                title: input.title,
                body: input.body,
                color: input.color ?? "paper",
                isHomeFixed: input.isHomeFixed ?? true,
                homeSortOrder: input.homeSortOrder ?? 0,
            },
        },
    );
    if (input.size || input.col !== undefined || input.row !== undefined) {
        await patchHomeNoteLayout(page, envelope.data.id, {
            size: input.size ?? "s",
            col: input.col ?? null,
            row: input.row ?? null,
        });
    }
    return envelope.data;
}

export async function patchHomeNoteLayout(
    page: Page,
    id: string,
    layout: { col: number | null; row: number | null; size?: "s" | "w" },
): Promise<unknown> {
    const envelope = await api<{ data: unknown }>(
        page,
        `/api/documents/${encodeURIComponent(id)}/layout`,
        { method: "PATCH", data: layout },
    );
    return envelope.data;
}

export function homeNote(page: Page, title: string): Locator {
    return page.locator(".home-note, .home-note-flow-item").filter({
        hasText: title,
    }).first();
}

export function noteCard(page: Page, title: string): Locator {
    return homeNote(page, title).locator(".home-note-card");
}

export async function waitForNoteCards(
    page: Page,
    count: number,
): Promise<void> {
    await page.waitForFunction(
        (expected) =>
            document.querySelectorAll(".home-note-card").length === expected,
        count,
    );
}

export async function reloadHome(page: Page): Promise<void> {
    await page.reload();
    await page.locator("main").first().waitFor();
}

export function boxOf(page: Page, selector: string): Promise<Box | null> {
    return page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
        };
    }, selector);
}

export function intersects(a: Box, b: Box): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y;
}

export interface HomeNoteMetrics {
    search: Box;
    plate: Box | null;
    topbar: Box | null;
    cards: Array<Box & { title: string; size: string }>;
    flow: string | null;
    more: { text: string | null; mode: "pill" | null };
    grid: Box | null;
}

/** Measures the rendered home notes in viewport coordinates. */
export async function measureHomeNotes(
    page: Page,
): Promise<HomeNoteMetrics> {
    return await page.evaluate(() => {
        const measure = (element: Element | null) => {
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
            };
        };
        const search = document.querySelector(".search-form-wrap");
        if (!search) throw new Error("search box missing");
        return {
            search: measure(search)!,
            plate: measure(document.querySelector(".launcher-plate")),
            topbar: measure(document.querySelector(".topbar")),
            cards: [...document.querySelectorAll(
                ".home-note, .home-note-flow-item",
            )].map((note) => ({
                title: note.querySelector(".home-note-title")?.textContent
                    ?.trim() ?? "",
                size: note.getAttribute("data-size") ?? "",
                ...measure(note)!,
            })),
            flow: document.querySelector(".home-notes--flow")?.getAttribute(
                "data-mode",
            ) ?? null,
            more: {
                text: document.querySelector(".home-note-more")?.textContent
                    ?.trim() ?? null,
                mode: document.querySelector(".home-note-more--pill")
                    ? "pill" as const
                    : null,
            },
            grid: measure(document.querySelector(".home-notes--grid")),
        };
    });
}

/** Asserts notes do not overlap the search box, the plate or each other. */
export function assertNoIntersections(metrics: HomeNoteMetrics): void {
    for (const card of metrics.cards) {
        assert(
            !intersects(card, metrics.search),
            `${card.title} overlaps the search box`,
        );
        if (metrics.plate) {
            assert(
                !intersects(card, metrics.plate),
                `${card.title} overlaps the app plate`,
            );
        }
        if (metrics.topbar) {
            assert(
                card.y >= metrics.topbar.y + metrics.topbar.height,
                `${card.title} sits above the top bar`,
            );
        }
    }
    for (let i = 0; i < metrics.cards.length; i++) {
        for (let j = i + 1; j < metrics.cards.length; j++) {
            assert(
                !intersects(metrics.cards[i], metrics.cards[j]),
                `${metrics.cards[i].title} overlaps ${metrics.cards[j].title}`,
            );
        }
    }
}

/** Recentres the drag handle and drags it with the mouse. */
export async function dragWithMouse(
    page: Page,
    handle: Locator,
    dx: number,
    dy: number,
): Promise<void> {
    const box = await handle.boundingBox();
    assert(box, "drag handle has no box");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const steps = 8;
    for (let step = 1; step <= steps; step++) {
        await page.mouse.move(
            x + (dx * step) / steps,
            y + (dy * step) / steps,
        );
        await page.waitForTimeout(16);
    }
    await page.mouse.up();
}

/** Drags with real touch events through CDP (context must set hasTouch). */
export async function dragWithTouch(
    page: Page,
    handle: Locator,
    dx: number,
    dy: number,
): Promise<void> {
    const box = await handle.boundingBox();
    assert(box, "drag handle has no box");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
    });
    const steps = 8;
    for (let step = 1; step <= steps; step++) {
        await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{
                x: x + (dx * step) / steps,
                y: y + (dy * step) / steps,
            }],
        });
        await page.waitForTimeout(16);
    }
    await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
    });
    await session.detach();
}

export function layoutPatch(page: Page): Promise<Response> {
    return page.waitForResponse(
        (response) =>
            response.request().method() === "PATCH" &&
            /\/api\/documents\/[^/]+\/layout$/.test(response.url()) &&
            response.ok(),
    );
}

export function countLayoutPatches(page: Page): {
    count: () => number;
    reset: () => void;
} {
    let count = 0;
    page.on("request", (request) => {
        if (
            request.method() === "PATCH" &&
            /\/api\/documents\/[^/]+\/layout$/.test(request.url())
        ) count++;
    });
    return { count: () => count, reset: () => (count = 0) };
}

export async function expectLayout(
    page: Page,
    id: string,
    expected: { col: number | null; row: number | null; size?: string },
): Promise<void> {
    const envelope = await page.evaluate(async (id) => {
        const response = await fetch(
            `/api/documents/${encodeURIComponent(id)}/layout`,
        );
        if (!response.ok) throw new Error(await response.text());
        return await response.json();
    }, id) as {
        data: { col: number | null; row: number | null; size: string };
    };
    assertEquals(envelope.data.col, expected.col);
    assertEquals(envelope.data.row, expected.row);
    if (expected.size) assertEquals(envelope.data.size, expected.size);
}

export interface HomeNotesFixture {
    app: ProductionAppInstance;
    browser: Browser;
    context: BrowserContext;
    page: Page;
    close: () => Promise<void>;
}

/** Starts a production app with one signed-in account at the requested viewport. */
export async function openHomeNotesFixture(
    options: {
        viewport: { width: number; height: number };
        colorScheme?: "light" | "dark";
        hasTouch?: boolean;
    },
): Promise<HomeNotesFixture> {
    const app = await startProductionApp();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
        ignoreDefaultArgs: ["--hide-scrollbars"],
    });
    const context = await browser.newContext({
        viewport: options.viewport,
        colorScheme: options.colorScheme ?? "light",
        hasTouch: options.hasTouch ?? false,
    });
    const page = await context.newPage();
    await registerHomeNoteUser(
        page,
        app.origin,
        `notes_${crypto.randomUUID().slice(0, 8)}`,
    );
    return {
        app,
        browser,
        context,
        page,
        async close() {
            await context.close();
            await browser.close();
            await app.close();
        },
    };
}
