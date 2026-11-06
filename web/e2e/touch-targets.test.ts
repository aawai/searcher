import { assert, assertEquals } from "@std/assert";
import type { Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
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
function probeTargets(page: Page, scope: string) {
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
    }, { scope, selector: TARGETS });
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
