import { assert, assertEquals } from "@std/assert";
import type { Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { hitSize } from "./helpers/touch-target.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

// Issue #369 T3 / T14: controls keep their visible size on every pointer; a
// touch screen gets a 44px hit area from the shared ::after rule instead, and
// neighbouring hit areas never cover each other. The title bar is compact
// (36 + hairline, 28px buttons) for a fine primary pointer.

/** Primary / available pointer and hover capabilities, as Blink settings. */
const POINTER_PROFILES = {
    mouse:
        "primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
    // A touch-screen laptop: the trackpad is primary, a touch screen exists.
    hybrid:
        "primaryHoverType=2,availableHoverTypes=3,primaryPointerType=4,availablePointerTypes=6",
    touch:
        "primaryHoverType=1,availableHoverTypes=1,primaryPointerType=2,availablePointerTypes=2",
} as const;
type Profile = keyof typeof POINTER_PROFILES;

/** Hosts of the shared hit-area rule (primitives.css) plus the title bar. */
const TARGETS = [
    ".button:not(.button--sm, .button--link, .button--content)",
    ".switch",
    '[data-slot="radio-group"][data-variant="segmented"] .radio-item',
    ".window-frame__button",
].join(", ");

interface Miss {
    label: string;
    point: string;
    hit: string;
}

/**
 * Probes every enabled target in `scope`: its centre and its edges 1px
 * inside, then the 44px square around its centre. Each probe must land on
 * the target itself; outside the visible box a window resize edge may keep
 * its last pixels, as it does today.
 */
function probeTargets(page: Page, scope: string, selector = TARGETS) {
    return page.evaluate(({ scope, selector }) => {
        const misses: Miss[] = [];
        const root = document.querySelector(scope)!;
        for (const el of root.querySelectorAll<HTMLElement>(selector)) {
            el.scrollIntoView({ block: "center", behavior: "instant" });
            const box = el.getBoundingClientRect();
            if (
                box.width === 0 || el.matches(":disabled, [data-disabled]") ||
                getComputedStyle(el).visibility === "hidden"
            ) continue;
            const label = el.getAttribute("aria-label") ??
                el.textContent?.trim() ?? el.className;
            const cx = box.left + box.width / 2;
            const cy = box.top + box.height / 2;
            const half = 44 / 2 - 1;
            const inside: [string, number, number][] = [
                ["centre", cx, cy],
                ["left", box.left + 1, cy],
                ["right", box.right - 1, cy],
                ["top", cx, box.top + 1],
                ["bottom", cx, box.bottom - 1],
            ];
            const square: [string, number, number][] = [];
            for (const dx of [-half, 0, half]) {
                for (const dy of [-half, 0, half]) {
                    if (dx || dy) {
                        square.push([`${dx},${dy}`, cx + dx, cy + dy]);
                    }
                }
            }
            for (const [point, x, y] of [...inside, ...square]) {
                const hit = document.elementFromPoint(x, y);
                if (hit && el.contains(hit)) continue;
                const visible = x >= box.left && x <= box.right &&
                    y >= box.top && y <= box.bottom;
                if (!visible && hit?.matches(".window-frame__resize")) continue;
                misses.push({
                    label,
                    point,
                    hit: hit ? `${hit.tagName}.${hit.className}` : "none",
                });
            }
        }
        return misses;
    }, { scope, selector });
}

function titleBarGeometry(page: Page, scope: string) {
    return page.evaluate((scope) => {
        const bar = document.querySelector(`${scope} .window-frame__titlebar`)!;
        const buttons = [
            ...bar.querySelectorAll<HTMLElement>(
                ".window-frame__button, .window-frame__toolbar .button--icon",
            ),
        ].map((button) => button.getBoundingClientRect());
        return {
            bar: bar.getBoundingClientRect().height,
            buttons: buttons.map((box) => [box.width, box.height]),
        };
    }, scope);
}

const EXPECTED: Record<Profile, { bar: number; button: number }> = {
    mouse: { bar: 37, button: 28 },
    hybrid: { bar: 37, button: 28 },
    touch: { bar: 44, button: 36 },
};

const SETTINGS = '[data-window-id="settings"]';
const NOTES = '[data-window-id="notes"]';

async function openSettings(page: Page, origin: string, tab: string) {
    await page.goto(`${origin}/settings/${tab}`);
    await page.locator(`${SETTINGS} .settings-row`).first().waitFor();
}

Deno.test("命中区与可见尺寸分离：标题栏按指针压缩，触屏命中区 ≥44 且互不覆盖 #369", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    try {
        for (const [profile, settings] of Object.entries(POINTER_PROFILES)) {
            const browser = await chromium.launch({
                args: ["--no-sandbox", `--blink-settings=${settings}`],
            });
            try {
                const page = await browser.newPage({
                    viewport: { width: 1440, height: 900 },
                });
                await loginAndVisit(page, app.origin, "/?view=notes", user);
                await page.locator(
                    `${NOTES} .window-frame__toolbar .button--icon`,
                )
                    .waitFor();
                const expected = EXPECTED[profile as Profile];
                const geometry = await titleBarGeometry(page, NOTES);
                const detail = `${profile}: ${JSON.stringify(geometry)}`;
                assertEquals(geometry.bar, expected.bar, detail);
                // Full screen, window menu, minimise, maximise and close.
                assertEquals(geometry.buttons.length, 5, detail);
                for (const size of geometry.buttons) {
                    assertEquals(
                        size,
                        [expected.button, expected.button],
                        detail,
                    );
                }
                if (profile === "mouse") continue;
                assertEquals(
                    await probeTargets(
                        page,
                        `${NOTES} .window-frame__titlebar`,
                    ),
                    [],
                    `${profile} title bar`,
                );
                // Settings rows hold segmented controls, switches and buttons;
                // at 390 the controls wrap below their labels.
                for (const width of [1440, 390]) {
                    await page.setViewportSize({ width, height: 900 });
                    for (const tab of ["appearance", "data"]) {
                        await openSettings(page, app.origin, tab);
                        assertEquals(
                            await probeTargets(page, SETTINGS),
                            [],
                            `${profile} ${width} ${tab}`,
                        );
                    }
                }
            } finally {
                await browser.close();
            }
        }
    } finally {
        await app.close();
    }
});

Deno.test("分组行节奏：行内分段控件为紧凑档，单值行统一 44 #369", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await loginAndVisit(page, app.origin, "/", user);
        for (const tab of ["appearance", "search", "ai", "data"]) {
            await openSettings(page, app.origin, tab);
            const rows = await page.locator(`${SETTINGS} .settings-row`)
                .evaluateAll((rows) =>
                    rows.filter((row) =>
                        !row.matches(".settings-row--vertical") &&
                        !row.querySelector(".settings-row-desc")
                    ).map((row) => ({
                        title: row.querySelector(".settings-row-title")
                            ?.textContent,
                        height: row.getBoundingClientRect().height,
                        segmented: [
                            ...row.querySelectorAll(
                                '[data-variant="segmented"] .radio-item',
                            ),
                        ].map((item) => item.getBoundingClientRect().height),
                    }))
                );
            assert(rows.length > 0, tab);
            for (const row of rows) {
                assertEquals(row.height, 44, `${tab}: ${JSON.stringify(row)}`);
                for (const height of row.segmented) {
                    assertEquals(height, 28, `${tab}: ${JSON.stringify(row)}`);
                }
            }
        }
    } finally {
        await browser.close();
        await app.close();
    }
});

// Stacked sidebar entries grow visibly to 44 under any coarse pointer: their
// hit areas would cover each other at the compact size, which only a fine
// pointer without a touch screen keeps (A2, Issue #394 1.4).
const SIDEBAR_ENTRIES = [
    '[data-slot="button"].documents-entry',
    ".documents-tree-row:not(.documents-tree-drag-overlay)",
].join(", ");

Deno.test("笔记侧栏条目：任何粗指针下可见放大到 44，命中区互不覆盖 #394", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    let seeded = false;
    try {
        for (const [profile, settings] of Object.entries(POINTER_PROFILES)) {
            const browser = await chromium.launch({
                args: ["--no-sandbox", `--blink-settings=${settings}`],
            });
            try {
                const page = await browser.newPage({
                    viewport: { width: 1440, height: 900 },
                });
                await loginAndVisit(page, app.origin, "/?view=notes", user);
                if (!seeded) {
                    for (const name of ["工作", "读书"]) {
                        const response = await page.request.post(
                            app.origin + "/api/document-notebooks",
                            {
                                headers: { Origin: app.origin },
                                data: { name, parentId: null },
                            },
                        );
                        assert(response.ok(), `notebook: ${response.status()}`);
                    }
                    seeded = true;
                    await page.reload();
                }
                const tree = page.locator(NOTES).getByRole("tree", {
                    name: "笔记本",
                    exact: true,
                });
                await tree.getByRole("treeitem", { name: "读书", exact: true })
                    .waitFor();
                // The stacked list; the lone footer entry keeps its compact
                // size on a fine primary pointer (library-windows covers it)
                // and is still probed for its hit area below.
                const heights = await page.locator(
                    `${NOTES} .documents-sidebar-scroll :is(${SIDEBAR_ENTRIES})`,
                ).evaluateAll((entries) =>
                    entries.map((entry) => ({
                        label: entry.getAttribute("aria-label") ??
                            entry.textContent?.trim(),
                        height: entry.getBoundingClientRect().height,
                    }))
                );
                // Recent, favourites, notebooks heading + two notebooks.
                assert(heights.length >= 5, JSON.stringify(heights));
                for (const entry of heights) {
                    const detail = `${profile}: ${JSON.stringify(entry)}`;
                    if (profile === "mouse") assert(entry.height < 44, detail);
                    else assertEquals(entry.height, 44, detail);
                }
                if (profile === "mouse") continue;
                assertEquals(
                    await probeTargets(
                        page,
                        `${NOTES} .documents-sidebar`,
                        SIDEBAR_ENTRIES,
                    ),
                    [],
                    `${profile} sidebar`,
                );
            } finally {
                await browser.close();
            }
        }
    } finally {
        await app.close();
    }
});

Deno.test("刊头继续项、AI 复选框命中区与窄屏账户输入契约 #405", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    let noteSeeded = false;
    try {
        for (const [profile, settings] of Object.entries(POINTER_PROFILES)) {
            const browser = await chromium.launch({
                args: ["--no-sandbox", `--blink-settings=${settings}`],
            });
            try {
                const page = await browser.newPage({
                    viewport: { width: 1440, height: 900 },
                });
                await loginAndVisit(page, app.origin, "/", user);
                if (!noteSeeded) {
                    const created = await page.request.post(
                        `${app.origin}/api/documents`,
                        {
                            headers: { Origin: app.origin },
                            data: {
                                title: "周报笔记",
                                body: "记录本周进度与待办。",
                            },
                        },
                    );
                    assert(created.ok(), `seed doc: ${created.status()}`);
                    noteSeeded = true;
                    await page.reload();
                } else {
                    await page.goto(app.origin + "/");
                }
                await page.waitForFunction(() =>
                    document.querySelector(".home-masthead")?.getAttribute(
                        "data-mode",
                    ) === "side"
                );
                const continueItem = page.locator(
                    ".home-masthead__continue-item",
                );
                await continueItem.waitFor({ state: "visible" });
                const desktopHit = await hitSize(continueItem);
                const minDesktop = profile === "mouse" ? 24 : 44;
                assert(
                    desktopHit.height >= minDesktop,
                    `${profile} 1440 continue-item height: ${desktopHit.height}`,
                );
                if (profile !== "mouse") {
                    assertEquals(
                        await probeTargets(
                            page,
                            ".home-masthead",
                            ".home-masthead__continue-item",
                        ),
                        [],
                        `${profile} 1440 continue-item`,
                    );
                }

                await page.setViewportSize({ width: 390, height: 844 });
                await page.waitForFunction(() =>
                    document.querySelector(".home-masthead")?.getAttribute(
                        "data-mode",
                    ) === "narrow"
                );
                const peek = page.locator(".home-masthead__peek");
                if (await peek.isVisible()) {
                    await peek.click();
                }
                await page.waitForFunction(() =>
                    document.querySelector(".home-masthead__sheet")
                        ?.getAttribute("data-open") === "true"
                );
                await continueItem.waitFor({ state: "visible" });
                await continueItem.evaluate((el) =>
                    Promise.all(
                        el.closest(".home-masthead")?.getAnimations({
                            subtree: true,
                        }).map((anim) => anim.finished) ?? [],
                    )
                );
                const mobileHit = await hitSize(continueItem);
                assert(
                    mobileHit.height >= minDesktop,
                    `${profile} 390 continue-item height: ${mobileHit.height}`,
                );
                if (profile !== "mouse") {
                    assertEquals(
                        await probeTargets(
                            page,
                            ".home-masthead",
                            ".home-masthead__continue-item",
                        ),
                        [],
                        `${profile} 390 continue-item`,
                    );
                }

                // AI settings checkboxes: >=24px on fine mouse, >=44px on touch/hybrid.
                await openSettings(page, app.origin, "ai");
                const checkbox = page.locator(
                    `${SETTINGS} [data-slot="checkbox"]`,
                ).first();
                await checkbox.waitFor({ state: "visible" });
                const checkboxHit = await hitSize(checkbox);
                assert(
                    checkboxHit.width >= minDesktop &&
                        checkboxHit.height >= minDesktop,
                    `${profile} checkbox hit: ${JSON.stringify(checkboxHit)}`,
                );
                if (profile !== "mouse") {
                    assertEquals(
                        await probeTargets(
                            page,
                            SETTINGS,
                            '[data-slot="checkbox"]',
                        ),
                        [],
                        `${profile} ai checkboxes`,
                    );
                }

                // Account email input at 390x844 fits admin@example.com without clipping.
                if (profile === "mouse") {
                    await page.goto(`${app.origin}/account`);
                    const emailInput = page.getByLabel("邮箱", { exact: true });
                    await emailInput.waitFor({ state: "visible" });
                    await emailInput.fill("admin@example.com");
                    const overflow = await emailInput.evaluate((node) => ({
                        scrollWidth: node.scrollWidth,
                        clientWidth: node.clientWidth,
                    }));
                    assert(
                        overflow.scrollWidth <= overflow.clientWidth,
                        `390 account email clipped: ${
                            JSON.stringify(overflow)
                        }`,
                    );
                }
            } finally {
                await browser.close();
            }
        }
    } finally {
        await app.close();
    }
});
