import { assert } from "@std/assert";
import type {
    Browser,
    BrowserContext,
    Locator,
    Page,
    Request,
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
    /** `null`/omitted creates an untitled note whose display title is its body. */
    title?: string | null;
    body: string;
    isHomeFixed?: boolean;
    homeSortOrder?: number;
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
                title: input.title ?? null,
                body: input.body,
                isHomeFixed: input.isHomeFixed ?? true,
                homeSortOrder: input.homeSortOrder ?? 0,
            },
        },
    );
    return envelope.data;
}

export function homeNote(page: Page, title: string): Locator {
    return page.locator(".home-masthead__entry").filter({
        hasText: title,
    }).first();
}

export async function waitForNoteCards(
    page: Page,
    count: number,
): Promise<void> {
    await page.waitForFunction(
        (expected) =>
            document.querySelectorAll(".home-masthead__entry").length ===
                expected,
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

/** Blank entry area away from the trailing ⋯ menu button. */
function dragStartPoint(box: Box): { x: number; y: number } {
    return { x: box.x + 24, y: box.y + box.height / 2 };
}

/** Grabs a masthead entry and drags vertically with the mouse. */
export async function dragWithMouse(
    page: Page,
    entry: Locator,
    dx: number,
    dy: number,
): Promise<void> {
    const box = await entry.boundingBox();
    assert(box, "drag entry has no box");
    const { x, y } = dragStartPoint(box);
    const length = Math.hypot(dx, dy) || 1;
    const nudge = 8;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(
        x + (dx / length) * nudge,
        y + (dy / length) * nudge,
    );
    const steps = 10;
    for (let step = 1; step <= steps; step++) {
        await page.mouse.move(
            x + (dx * step) / steps,
            y + (dy * step) / steps,
        );
        await page.waitForTimeout(16);
    }
    await page.mouse.up();
}

/**
 * Long-presses a masthead entry (the touch sensor needs 250ms) and drags with
 * real touch events through CDP (context must set hasTouch).
 */
export async function dragWithTouch(
    page: Page,
    entry: Locator,
    dx: number,
    dy: number,
): Promise<void> {
    const box = await entry.boundingBox();
    assert(box, "drag entry has no box");
    const { x, y } = dragStartPoint(box);
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
    });
    await page.waitForTimeout(320);
    const steps = 10;
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

function isHomeOrderWrite(request: Request): boolean {
    return request.method() === "PATCH" &&
        /\/api\/documents\/home-order$/.test(request.url());
}

export function homeOrderPatch(page: Page): Promise<Response> {
    return page.waitForResponse(
        (response) => isHomeOrderWrite(response.request()) && response.ok(),
    );
}

export function captureHomeOrderWrites(page: Page): {
    writes: () => ReadonlyArray<{ ids: string[] }>;
    reset: () => void;
} {
    let writes: Array<{ ids: string[] }> = [];
    page.on("request", (request) => {
        if (!isHomeOrderWrite(request)) return;
        const raw = request.postData();
        if (!raw) return;
        try {
            const parsed: unknown = JSON.parse(raw);
            if (
                typeof parsed === "object" && parsed !== null &&
                "ids" in parsed && Array.isArray(parsed.ids) &&
                parsed.ids.every((id) => typeof id === "string")
            ) {
                writes.push({ ids: parsed.ids });
            }
        } catch { /* ignore invalid payload */ }
    });
    return {
        writes: () => writes,
        reset: () => {
            writes = [];
        },
    };
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

/** Seeds root apps and enables showHomeApps so the home plate renders. */
export async function seedHomeApps(
    page: Page,
    count = 18,
): Promise<void> {
    await page.evaluate(async (total) => {
        const prefs = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ showHomeApps: true }),
        });
        if (!prefs.ok) throw new Error(await prefs.text());
        for (let index = 0; index < total; index++) {
            const response = await fetch("/api/webapps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: `应用 ${index}`,
                    url: `https://app-${index}.example/`,
                    isHomeFixed: true,
                }),
            });
            if (!response.ok) throw new Error(await response.text());
        }
    }, count);
}
