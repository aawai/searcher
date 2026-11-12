import { Buffer } from "node:buffer";
import { assert } from "@std/assert";
import type { BrowserContext, Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import {
    createHomeNote,
    registerHomeNoteUser,
    seedHomeApps,
} from "./helpers/home-notes.ts";
import { startProductionApp } from "./helpers/production-app.ts";

/**
 * A6 (VISUAL_LANGUAGE.md · 底线): with the default readability mask
 * (`balanced`) and the default glass tier, home text set straight on the
 * wallpaper meets WCAG 1.4.3 on any wallpaper. Synthetic extreme wallpapers
 * stand in for "any". Each glyph is found by painting the text in two key
 * colours; its background is the ring of pixels within SAMPLE_RADIUS of the
 * glyph outline (wallpaper, mask and halo, no glyph coverage), judged at the
 * least favourable 5% of them. Icons on the wallpaper are held to 1.4.11.
 */

const WALLPAPERS = {
    white: { kind: "solid", color: "#ffffff" },
    black: { kind: "solid", color: "#000000" },
    gray: { kind: "solid", color: "#808080" },
    texture: { kind: "checker" },
    red: { kind: "solid", color: "#ff0000" },
    green: { kind: "solid", color: "#00ff00" },
    blue: { kind: "solid", color: "#0000ff" },
} as const;
type WallpaperName = keyof typeof WALLPAPERS;

const matrix = Deno.env.get("WALLPAPER_READABILITY_MATRIX") ?? "full";
if (matrix !== "full" && matrix !== "fast") {
    throw new Error("WALLPAPER_READABILITY_MATRIX must be full or fast");
}
const wallpaperNames: WallpaperName[] = matrix === "fast"
    ? ["white", "black", "texture"]
    : Object.keys(WALLPAPERS) as WallpaperName[];

const WIDTHS = [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
] as const;
/**
 * Light and dark follow the system scheme (theme preference `system`); the
 * two high contrast themes are chosen explicitly and keep the same A6 floor.
 */
const THEMES = [
    { id: "light", preference: "system", scheme: "light", contrast: false },
    { id: "dark", preference: "system", scheme: "dark", contrast: false },
    {
        id: "high-contrast-light",
        preference: "high-contrast-light",
        scheme: "light",
        contrast: true,
    },
    {
        id: "high-contrast-dark",
        preference: "high-contrast-dark",
        scheme: "dark",
        contrast: true,
    },
] as const;
type Theme = (typeof THEMES)[number];
const THEME_RADIO_NAMES: Record<Theme["preference"], string> = {
    system: "跟随系统",
    "high-contrast-light": "高对比浅色",
    "high-contrast-dark": "高对比深色",
};

/**
 * Sampled ring, in CSS px beyond each glyph's outline (≥ 50% coverage):
 * the adjacent pixels that 1.4.3 treats as the text's background.
 */
const SAMPLE_RADIUS = 2;
/** The least favourable share of the sampled pixels that still must pass. */
const WORST_SHARE = 0.05;
const TEXT_MIN = 4.5;
const LARGE_TEXT_MIN = 3;
/** Icon glyphs are graphics: WCAG 1.4.11. */
const ICON_MIN = 3;

const WALLPAPER_ORIGIN = "https://wallpaper.a6.test";

interface Target {
    label: string;
    kind: "text" | "icon";
    large: boolean;
    /** Resolved sRGB + alpha of the glyph colour. */
    color: [number, number, number, number];
    rects: { x: number; y: number; width: number; height: number }[];
}

interface Measurement {
    label: string;
    kind: "text" | "icon";
    floor: number;
    worst: number;
    min: number;
    samples: number;
}

async function wallpaperPngs(page: Page): Promise<Map<WallpaperName, Buffer>> {
    const encoded = await page.evaluate((specs) => {
        const out: Record<string, string> = {};
        for (const [name, spec] of Object.entries(specs)) {
            const canvas = document.createElement("canvas");
            canvas.width = 1600;
            canvas.height = 1000;
            const ctx = canvas.getContext("2d")!;
            if (spec.kind === "solid") {
                ctx.fillStyle = spec.color;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            } else {
                // 4px black / white checker: high-frequency texture that
                // survives `background-size: cover` scaling.
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = "#000000";
                for (let y = 0; y < canvas.height; y += 4) {
                    for (let x = (y / 4) % 2 * 4; x < canvas.width; x += 8) {
                        ctx.fillRect(x, y, 4, 4);
                    }
                }
            }
            out[name] = canvas.toDataURL("image/png").split(",")[1];
        }
        return out;
    }, WALLPAPERS);
    return new Map(
        Object.entries(encoded).map(([name, base64]) => [
            name as WallpaperName,
            Buffer.from(base64, "base64"),
        ]),
    );
}

async function routeWallpapers(
    context: BrowserContext,
    pngs: Map<WallpaperName, Buffer>,
) {
    await context.route(`${WALLPAPER_ORIGIN}/**`, (route) => {
        const name = new URL(route.request().url()).pathname.slice(1)
            .replace(/\.png$/, "") as WallpaperName;
        const body = pngs.get(name);
        return body
            ? route.fulfill({ status: 200, contentType: "image/png", body })
            : route.fulfill({ status: 404 });
    });
}

const wallpaperUrl = (name: WallpaperName) => `${WALLPAPER_ORIGIN}/${name}.png`;

/** Waits until the wallpaper image has loaded and the home has settled. */
async function settle(page: Page, name: WallpaperName, theme: Theme) {
    await page.waitForFunction(
        ({ url, scheme, contrast }) => {
            const image = document.querySelector(
                '[data-testid="home-wallpaper-surface-image"]',
            );
            const root = document.documentElement;
            return root.dataset.theme === scheme &&
                (root.dataset.contrast === "more") === contrast &&
                image !== null &&
                getComputedStyle(image).backgroundImage.includes(url) &&
                performance.getEntriesByName(url).some((entry) =>
                    (entry as PerformanceResourceTiming).responseEnd > 0
                );
        },
        {
            url: wallpaperUrl(name),
            scheme: theme.scheme,
            contrast: theme.contrast,
        },
    );
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.allSettled(
            document.getAnimations().filter((animation) =>
                Number.isFinite(animation.effect?.getComputedTiming().endTime)
            ).map((animation) => animation.finished),
        );
        const { promise, resolve } = Promise.withResolvers<void>();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        await promise;
    });
}

/** Text and icon glyphs the home paints straight on the wallpaper. */
function collectTargets(page: Page, selector?: string): Promise<Target[]> {
    return page.evaluate((selector) => {
        const probe = document.createElement("canvas").getContext("2d", {
            willReadFrequently: true,
        })!;
        const rgba = (css: string): [number, number, number, number] => {
            probe.clearRect(0, 0, 1, 1);
            probe.fillStyle = css;
            probe.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
            return [r, g, b, a / 255];
        };
        const shown = (element: Element) => {
            for (
                let node: Element | null = element;
                node;
                node = node.parentElement
            ) {
                const style = getComputedStyle(node);
                if (
                    style.visibility === "hidden" || style.display === "none" ||
                    Number(style.opacity) < 0.99
                ) return false;
            }
            return true;
        };
        const labelOf = (element: Element) => {
            const cls = [...element.classList].find((c) => c.includes("__")) ??
                element.classList[0] ?? element.tagName.toLowerCase();
            const text = element.textContent?.trim().slice(0, 12) ?? "";
            return `${cls}「${text}」`;
        };
        const boxes = (rects: Iterable<DOMRect>) =>
            [...rects].filter((r) => r.width > 0 && r.height > 0).map((r) => ({
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
            }));
        // Elements on their own surface are not on the wallpaper: the
        // identity thumb, the sync-failure Material and the app icon tiles
        // (their fallback letter). The wordmark's full stop is the brand
        // accent of the logotype (1.4.3 exempts logotypes).
        const excluded =
            ".user-avatar-badge, .sync-failed-badge, .webapp-glyph, .wordmark-dot";
        const scopes = selector ? [selector] : [
            ".app-shell[data-home] > .topbar",
            '.home-masthead[data-mode="side"]',
            '.home-masthead[data-mode="narrow"][data-collapsed="true"]',
            '.launcher-plate[data-plate="hidden"]',
        ];
        const targets: Target[] = [];
        for (const scope of document.querySelectorAll(scopes.join(","))) {
            for (const element of [scope, ...scope.querySelectorAll("*")]) {
                if (element.closest(excluded) || !shown(element)) continue;
                if (element instanceof SVGSVGElement) {
                    targets.push({
                        label: `icon ${labelOf(element.parentElement!)}`,
                        kind: "icon",
                        large: false,
                        color: rgba(getComputedStyle(element).color),
                        rects: boxes([element.getBoundingClientRect()]),
                    });
                    continue;
                }
                if (element instanceof SVGElement) continue;
                const rects: DOMRect[] = [];
                for (const node of element.childNodes) {
                    if (
                        node.nodeType !== Node.TEXT_NODE ||
                        !node.textContent?.trim()
                    ) continue;
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    rects.push(...range.getClientRects());
                }
                if (rects.length === 0) continue;
                const style = getComputedStyle(element);
                const size = Number.parseFloat(style.fontSize);
                const weight = Number(style.fontWeight);
                targets.push({
                    label: labelOf(element),
                    kind: "text",
                    large: size >= 24 || (size >= 18.66 && weight >= 700),
                    color: rgba(style.color),
                    rects: boxes(rects),
                });
            }
        }
        return targets;
    }, selector);
}

const KEY_STYLE = `
html[data-a6-measure] *, html[data-a6-measure] *::before,
html[data-a6-measure] *::after { transition: none !important; }
html[data-a6-key] :is(.topbar, .home-masthead, .launcher-plate),
html[data-a6-key] :is(.topbar, .home-masthead, .launcher-plate) * {
    -webkit-text-fill-color: var(--a6-key) !important;
}
html[data-a6-key] :is(.topbar, .home-masthead, .launcher-plate) svg {
    color: var(--a6-key) !important;
}
html[data-a6-key] :is(.user-menu-identity > span:last-child, .launcher-popup-count, .suggestion-group-label) {
    -webkit-text-fill-color: var(--a6-key) !important;
}`;

async function shot(page: Page, key: string | null): Promise<string> {
    await page.evaluate((key) => {
        const root = document.documentElement;
        if (key) {
            root.dataset.a6Key = "";
            root.style.setProperty("--a6-key", key);
        } else {
            delete root.dataset.a6Key;
            root.style.removeProperty("--a6-key");
        }
        const { promise, resolve } = Promise.withResolvers<void>();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        return promise;
    }, key);
    const bytes = await page.screenshot({
        type: "png",
        animations: "disabled",
        caret: "hide",
    });
    return bytes.toString("base64");
}

async function measure(page: Page, selector?: string): Promise<Measurement[]> {
    await page.evaluate((css) => {
        if (!document.getElementById("a6-style")) {
            const style = document.createElement("style");
            style.id = "a6-style";
            style.textContent = css;
            document.head.append(style);
        }
        document.documentElement.dataset.a6Measure = "";
    }, KEY_STYLE);
    // Layout and fonts can still settle after the wallpaper loads; measure
    // only once two consecutive frames match, and fail if anything moved
    // while the keyed frames were taken.
    let plain = await shot(page, null);
    const deadline = Date.now() + 5000;
    for (;;) {
        const next = await shot(page, null);
        if (next === plain) break;
        assert(Date.now() < deadline, "the home did not settle within 5s");
        plain = next;
    }
    const targets = await collectTargets(page, selector);
    const red = await shot(page, "#ff0000");
    const blue = await shot(page, "#0000ff");
    // Re-rasterised glyph edges may differ by a few levels after keying; the
    // sampled background around them must not.
    const after = await shot(page, null);
    const { results, moved } = await page.evaluate(
        async ({ plain, red, blue, after, targets, radius, share, mins }) => {
            const decode = async (base64: string) => {
                const bytes = Uint8Array.fromBase64(base64);
                const image = await createImageBitmap(
                    new Blob([bytes], { type: "image/png" }),
                );
                const canvas = new OffscreenCanvas(image.width, image.height);
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(image, 0, 0);
                return ctx.getImageData(0, 0, image.width, image.height);
            };
            const [base, a, b, last] = await Promise.all(
                [plain, red, blue, after].map(decode),
            );
            const { width, height } = base;
            const scale = width / innerWidth;
            // The key colours differ by 255 on two channels, so the per-pixel
            // difference is the glyph's coverage. Coverage ≥ 50% is the glyph
            // outline the ring is measured from; any coverage at all is
            // excluded from the ring, which then holds only wallpaper, mask
            // and halo.
            const coverage = new Uint8Array(width * height);
            for (let p = 0; p < coverage.length; p++) {
                const i = p * 4;
                coverage[p] = Math.max(
                    Math.abs(a.data[i] - b.data[i]),
                    Math.abs(a.data[i + 1] - b.data[i + 1]),
                    Math.abs(a.data[i + 2] - b.data[i + 2]),
                );
            }
            const CORE = 128;
            const TOUCHED = 8;
            const channel = (v: number) => {
                const c = v / 255;
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            };
            const luminance = (r: number, g: number, b: number) =>
                0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
            const reach = radius * scale;
            const r = Math.ceil(reach);
            const disk: [number, number][] = [];
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy <= reach * reach) disk.push([dx, dy]);
                }
            }
            const results = [];
            let moved = 0;
            for (const target of targets) {
                const own: number[] = [];
                for (const rect of target.rects) {
                    const left = Math.max(0, Math.floor((rect.x - 1) * scale));
                    const top = Math.max(0, Math.floor((rect.y - 1) * scale));
                    const right = Math.min(
                        width,
                        Math.ceil((rect.x + rect.width + 1) * scale),
                    );
                    const bottom = Math.min(
                        height,
                        Math.ceil((rect.y + rect.height + 1) * scale),
                    );
                    for (let y = top; y < bottom; y++) {
                        for (let x = left; x < right; x++) {
                            if (coverage[y * width + x] >= CORE) {
                                own.push(y * width + x);
                            }
                        }
                    }
                }
                if (own.length < 8) continue;
                const ring = new Set<number>();
                for (const p of own) {
                    const px = p % width, py = Math.floor(p / width);
                    for (const [dx, dy] of disk) {
                        const x = px + dx, y = py + dy;
                        if (x < 0 || y < 0 || x >= width || y >= height) {
                            continue;
                        }
                        const q = y * width + x;
                        if (coverage[q] <= TOUCHED) ring.add(q);
                    }
                }
                const [fr, fg, fb, fa] = target.color;
                const ratios: number[] = [];
                for (const q of ring) {
                    const i = q * 4;
                    const br = base.data[i],
                        bg = base.data[i + 1],
                        bb = base.data[i + 2];
                    if (
                        Math.max(
                            Math.abs(br - last.data[i]),
                            Math.abs(bg - last.data[i + 1]),
                            Math.abs(bb - last.data[i + 2]),
                        ) > 2
                    ) moved++;
                    const lf = luminance(
                        fr * fa + br * (1 - fa),
                        fg * fa + bg * (1 - fa),
                        fb * fa + bb * (1 - fa),
                    );
                    const lb = luminance(br, bg, bb);
                    ratios.push(
                        (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05),
                    );
                }
                ratios.sort((x, y) => x - y);
                results.push({
                    label: target.label,
                    kind: target.kind,
                    floor: target.kind === "icon"
                        ? mins.icon
                        : target.large
                        ? mins.large
                        : mins.text,
                    worst: ratios[Math.floor(ratios.length * share)],
                    min: ratios[0],
                    samples: ratios.length,
                });
            }
            return { results, moved };
        },
        {
            plain,
            red,
            blue,
            after,
            targets,
            radius: SAMPLE_RADIUS,
            share: WORST_SHARE,
            mins: { text: TEXT_MIN, large: LARGE_TEXT_MIN, icon: ICON_MIN },
        },
    );
    assert(
        moved === 0,
        `${moved} sampled background pixels changed while the home was measured`,
    );
    return results;
}

async function setUserAppearance(
    page: Page,
    name: WallpaperName,
    theme: Theme,
) {
    await page.evaluate(async ({ url, theme }) => {
        const response = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                theme,
                backgroundImage: url,
                wallpaperPresentations: {
                    [url]: {
                        composition: { focalX: 0.5, focalY: 0.5 },
                        readability: "balanced",
                    },
                },
            }),
        });
        if (!response.ok) throw new Error(await response.text());
    }, { url: wallpaperUrl(name), theme: theme.preference });
}

/**
 * Guests keep the appearance on this device: set it in their settings page.
 * The wallpaper is applied only when it changes; the theme on every call.
 */
function guestAppearance(page: Page, origin: string) {
    let current: WallpaperName | null = null;
    return async (name: WallpaperName, theme: Theme) => {
        await page.goto(origin + "/settings/appearance");
        if (current !== name) {
            await page.getByTestId("wallpaper-input").fill(wallpaperUrl(name));
            await page.getByTestId("wallpaper-apply-btn").click();
            await page.getByTestId("wallpaper-toast").waitFor();
            current = name;
        }
        await page.getByRole("radio", {
            name: THEME_RADIO_NAMES[theme.preference],
            exact: true,
        }).check();
        await page.waitForFunction(
            (contrast) =>
                (document.documentElement.dataset.contrast === "more") ===
                    contrast,
            theme.contrast,
        );
    };
}

/** Roles each state must measure, so a missing target never passes silently. */
function requiredRoles(who: "user" | "guest", width: number): string[] {
    return [
        "wordmark-small",
        "icon ",
        ...(who === "user" ? ["webapp-name"] : ["「登录」"]),
        ...(width < 768 ? ["home-masthead__day"] : []),
        ...(width >= 768 ? ["home-masthead__weekday"] : []),
        ...(who === "user" && width >= 768
            ? [
                "home-masthead__section-title",
                "home-masthead__entry-no",
                "home-masthead__all-notes",
            ]
            : []),
    ];
}

Deno.test("A6: home text on the wallpaper meets 1.4.3 on extreme wallpapers at the default readability mask and glass tier", async (t) => {
    console.log(
        `Wallpaper readability matrix: ${matrix} (${
            wallpaperNames.join(", ")
        })`,
    );
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const failures: string[] = [];
    async function run(
        who: "user" | "guest",
        page: Page,
        setAppearance: (name: WallpaperName, theme: Theme) => Promise<void>,
    ) {
        for (const name of wallpaperNames) {
            for (const theme of THEMES) {
                await page.emulateMedia({ colorScheme: theme.scheme });
                await setAppearance(name, theme);
                for (const viewport of WIDTHS) {
                    await page.setViewportSize(viewport);
                    await page.goto(new URL("/", page.url()).href);
                    await settle(page, name, theme);
                    const results = await measure(page);
                    const state =
                        `${who} ${name} ${viewport.width} ${theme.id}`;
                    for (const role of requiredRoles(who, viewport.width)) {
                        assert(
                            results.some((result) =>
                                result.label.includes(role)
                            ),
                            `${state}: ${role} was not measured`,
                        );
                    }
                    for (const result of results) {
                        if (result.worst >= result.floor) continue;
                        failures.push(
                            `${state} ${result.label}: ${
                                result.worst.toFixed(2)
                            }:1 (min ${
                                result.min.toFixed(2)
                            }, n=${result.samples}, floor ${result.floor})`,
                        );
                    }
                }
            }
        }
    }

    await t.step(
        "signed in: top bar, masthead and apps without the plate",
        async () => {
            const context = await browser.newContext({
                serviceWorkers: "block",
            });
            cleanup.defer(() => context.close());
            const page = await context.newPage();
            await routeWallpapers(context, await wallpaperPngs(page));
            await registerHomeNoteUser(page, app.origin, "a6_reader");
            await createHomeNote(page, {
                title: "置顶笔记",
                body: "- [ ] 一项待办\n\n正文摘要。",
            });
            await seedHomeApps(page, 6);
            await page.evaluate(async () => {
                const response = await fetch("/api/preferences", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ showHomeAppPlate: false }),
                });
                if (!response.ok) throw new Error(await response.text());
            });
            await run(
                "user",
                page,
                (name, theme) => setUserAppearance(page, name, theme),
            );
        },
    );

    await t.step(
        "guest: top bar with the sign-in link and the date masthead",
        async () => {
            const context = await browser.newContext({
                serviceWorkers: "block",
            });
            cleanup.defer(() => context.close());
            const page = await context.newPage();
            await page.goto(app.origin + "/");
            await routeWallpapers(context, await wallpaperPngs(page));
            await run(
                "guest",
                page,
                guestAppearance(page, app.origin),
            );
        },
    );

    assert(failures.length === 0, `below 1.4.3:\n${failures.join("\n")}`);
});

Deno.test("floating muted text meets 4.5:1 on extreme wallpapers", async () => {
    console.log(
        `Wallpaper readability matrix: ${matrix} (${
            wallpaperNames.join(", ")
        })`,
    );
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        serviceWorkers: "block",
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();
    await routeWallpapers(context, await wallpaperPngs(page));
    await context.route(
        /\/api\/search\/suggestions\?/,
        (route) =>
            route.fulfill({
                contentType: "application/json",
                body: JSON.stringify({ status: true, data: [] }),
            }),
    );
    await registerHomeNoteUser(page, app.origin, "floating_reader");
    await seedHomeApps(page, 1);
    const created = await page.request.post(app.origin + "/api/webapp-groups", {
        headers: { Origin: app.origin },
        data: { name: "测试文件夹", sortOrder: 0, isHomeFixed: true },
    });
    assert(created.ok(), await created.text());

    const selectors = {
        menu: ".user-menu-identity > span:last-child",
        folder: ".launcher-popup-count",
        suggestion: '.suggestion-group-label[id$="-group-apps"]',
    } as const;
    const minima = new Map<string, { ratio: number; state: string }>();
    const failures: string[] = [];
    for (const tier of ["off", "soft", "regular", "clear"] as const) {
        const response = await page.request.patch(
            app.origin + "/api/preferences",
            {
                headers: { Origin: app.origin },
                data: { glassIntensity: tier },
            },
        );
        assert(response.ok(), await response.text());
        for (const name of wallpaperNames) {
            for (const theme of THEMES) {
                // High-contrast Floating is opaque in every tier; the token
                // contract checks this independently of the wallpaper color.
                if (theme.contrast && name !== "white") continue;
                await page.emulateMedia({ colorScheme: theme.scheme });
                await setUserAppearance(page, name, theme);
                await page.goto(app.origin + "/");
                await settle(page, name, theme);
                await page.waitForFunction(
                    (tier) => document.documentElement.dataset.glass === tier,
                    tier,
                );
                const state = `${tier} ${name} ${theme.id}`;
                const record = async (element: keyof typeof selectors) => {
                    const selector = selectors[element];
                    await page.locator(selector).waitFor({ state: "visible" });
                    const results = await measure(page, selector);
                    assert(
                        results.length > 0,
                        `${state} ${selector}: not measured`,
                    );
                    for (const result of results) {
                        const previous = minima.get(element);
                        if (!previous || result.worst < previous.ratio) {
                            minima.set(element, { ratio: result.worst, state });
                        }
                        if (result.worst < TEXT_MIN) {
                            failures.push(
                                `${state} ${selector}: ${
                                    result.worst.toFixed(2)
                                }:1 (min ${
                                    result.min.toFixed(2)
                                }, n=${result.samples})`,
                            );
                        }
                    }
                };

                await page.locator(".user-avatar-trigger").click();
                await record("menu");
                await page.keyboard.press("Escape");
                await page.getByRole("button", {
                    name: "打开文件夹 测试文件夹",
                }).click();
                await record("folder");
                await page.keyboard.press("Escape");
                await page.getByRole("combobox").fill("应用 0");
                await page.getByRole("option", { name: /应用 0/ }).waitFor();
                await record("suggestion");
            }
        }
    }
    console.log("Floating muted text: minimum 5th-percentile contrast");
    for (const [element, selector] of Object.entries(selectors)) {
        const minimum = minima.get(element)!;
        console.log(
            `${selector}\t${minimum.ratio.toFixed(2)}:1\t${minimum.state}`,
        );
    }
    assert(failures.length === 0, `below 4.5:1:\n${failures.join("\n")}`);
});
