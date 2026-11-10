import { assert, assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { ACCENTS } from "../../src/shared/contracts.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { ensureSidebarOpen } from "./helpers/library.ts";

type RGB = readonly [number, number, number];

interface PaletteSnapshot {
    accent: RGB;
    accentForeground: RGB;
    accentHover: RGB;
    accentActive: RGB;
    accentSoft: RGB;
    ring: RGB;
    background: RGB;
    surface: RGB;
    surfaceSoft: RGB;
}

const themes = [
    { id: "light", label: "浅色" },
    { id: "dark", label: "深色" },
] as const;

const contrastChecks: readonly {
    readonly foreground: keyof PaletteSnapshot;
    readonly background: keyof PaletteSnapshot;
    readonly minimum: number;
    readonly description: string;
}[] = [
    {
        foreground: "accent",
        background: "surface",
        minimum: 4.5,
        description: "accent text on surface",
    },
    {
        foreground: "accentForeground",
        background: "accent",
        minimum: 4.5,
        description: "accent foreground on accent",
    },
    {
        foreground: "accentForeground",
        background: "accentHover",
        minimum: 4.5,
        description: "accent foreground on accent hover",
    },
    {
        foreground: "accentForeground",
        background: "accentActive",
        minimum: 4.5,
        description: "accent foreground on accent active",
    },
    {
        foreground: "accent",
        background: "accentSoft",
        minimum: 4.5,
        description: "selected accent text on accent-soft radio surface",
    },
    {
        foreground: "ring",
        background: "background",
        minimum: 3,
        description: "focus ring on background",
    },
    {
        foreground: "ring",
        background: "surface",
        minimum: 3,
        description: "focus ring on surface",
    },
    {
        foreground: "ring",
        background: "surfaceSoft",
        minimum: 3,
        description: "focus ring on soft surface",
    },
];

function relativeLuminance(rgb: RGB): number {
    const [red, green, blue] = rgb.map((channel) => {
        const srgb = channel / 255;
        return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: RGB, second: RGB): number {
    const firstLuminance = relativeLuminance(first);
    const secondLuminance = relativeLuminance(second);
    const lighter = Math.max(firstLuminance, secondLuminance);
    const darker = Math.min(firstLuminance, secondLuminance);
    return (lighter + 0.05) / (darker + 0.05);
}

Deno.test("accent palette meets WCAG contrast in light and dark themes", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        args: ["--no-sandbox"],
    });

    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await page.goto(`${app.origin}/settings/appearance`);
        await page.getByRole("heading", {
            level: 1,
            name: "外观",
            exact: true,
        }).waitFor({ state: "visible" });

        const failures: string[] = [];
        for (const theme of themes) {
            await page.getByRole("radio", { name: theme.label, exact: true })
                .click();
            await page.getByRole("radio", {
                name: theme.label,
                exact: true,
                checked: true,
            }).waitFor({ state: "visible" });

            for (const accent of ACCENTS) {
                await page.getByRole("radio", {
                    name: accent.label,
                    exact: true,
                }).click();
                await page.getByRole("radio", {
                    name: accent.label,
                    exact: true,
                    checked: true,
                }).waitFor({ state: "visible" });
                await page.waitForFunction(
                    ({ theme, accent }) =>
                        document.documentElement.dataset.theme === theme &&
                        document.documentElement.dataset.accent === accent,
                    { theme: theme.id, accent: accent.id },
                );

                const colors = await page.evaluate((): PaletteSnapshot => {
                    const canvas = document.createElement("canvas");
                    canvas.width = 1;
                    canvas.height = 1;
                    const context = canvas.getContext("2d");
                    if (!context) {
                        throw new Error(
                            "Canvas 2D color parsing is unavailable",
                        );
                    }

                    const sample = (token: string): RGB => {
                        const probe = document.createElement("span");
                        probe.style.backgroundColor = `var(${token})`;
                        document.body.append(probe);
                        const computedColor = getComputedStyle(probe)
                            .backgroundColor;
                        probe.remove();

                        context.clearRect(0, 0, 1, 1);
                        context.fillStyle = computedColor;
                        context.fillRect(0, 0, 1, 1);
                        const pixel = context.getImageData(0, 0, 1, 1).data;
                        if (pixel[3] !== 255) {
                            throw new Error(
                                `Non-opaque CSS color for ${token}`,
                            );
                        }
                        return [pixel[0], pixel[1], pixel[2]];
                    };

                    // Reading computed CSS through Canvas 2D resolves CSS color
                    // syntax such as light-dark() and color-mix() into sRGB.
                    return {
                        accent: sample("--accent"),
                        accentForeground: sample("--accent-foreground"),
                        accentHover: sample("--accent-hover"),
                        accentActive: sample("--accent-active"),
                        accentSoft: sample("--accent-soft"),
                        ring: sample("--ring"),
                        background: sample("--background"),
                        surface: sample("--surface"),
                        surfaceSoft: sample("--surface-soft"),
                    };
                });

                for (const check of contrastChecks) {
                    const ratio = contrastRatio(
                        colors[check.foreground],
                        colors[check.background],
                    );
                    if (ratio < check.minimum) {
                        failures.push(
                            `${theme.id}/${accent.id} ${check.description}: ` +
                                `${ratio.toFixed(3)}:1 < ${check.minimum}:1`,
                        );
                    }
                }
            }
        }

        assert(
            failures.length === 0,
            `Accent contrast failures:\n${failures.join("\n")}`,
        );
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("current items use readable accent-soft in notes, AI and settings", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await loginAndVisit(page, app.origin, "/", user);
        const response = await page.request.post(
            `${app.origin}/api/documents`,
            {
                headers: { Origin: app.origin },
                data: { title: "浅染测试笔记", body: "内容" },
            },
        );
        assert(response.ok());

        const check = async (row: string, text: string) => {
            await page.locator(row).first().waitFor({ state: "visible" });
            for (const theme of themes) {
                for (const accent of ACCENTS) {
                    const result = await page.locator(row).first().evaluate(
                        async (element, { theme, accent, text }) => {
                            document.documentElement.dataset.theme = theme;
                            document.documentElement.dataset.accent = accent;
                            const { promise, resolve } = Promise.withResolvers<
                                void
                            >();
                            requestAnimationFrame(() => resolve());
                            await promise;
                            await Promise.all(
                                element.getAnimations().map((animation) =>
                                    animation.finished
                                ),
                            );
                            const child = text
                                ? element.querySelector(text)
                                : element;
                            if (!child) {
                                throw new Error(
                                    `Missing selected text: ${text}`,
                                );
                            }
                            const probe = document.createElement("span");
                            probe.style.background = "var(--accent-soft)";
                            document.body.append(probe);
                            const background =
                                getComputedStyle(element).backgroundColor;
                            const expected =
                                getComputedStyle(probe).backgroundColor;
                            probe.remove();
                            const canvas = document.createElement("canvas");
                            const context = canvas.getContext("2d");
                            if (!context) throw new Error("Canvas unavailable");
                            const rgb = (color: string): RGB => {
                                context.clearRect(0, 0, 1, 1);
                                context.fillStyle = color;
                                context.fillRect(0, 0, 1, 1);
                                const pixel =
                                    context.getImageData(0, 0, 1, 1).data;
                                return [pixel[0], pixel[1], pixel[2]];
                            };
                            return {
                                background,
                                expected,
                                foreground: rgb(getComputedStyle(child).color),
                                fill: rgb(background),
                            };
                        },
                        { theme: theme.id, accent: accent.id, text },
                    );
                    assertEquals(
                        result.background,
                        result.expected,
                        `${row} ${theme.id}/${accent.id}`,
                    );
                    const ratio = contrastRatio(result.foreground, result.fill);
                    assert(
                        ratio >= 4.5,
                        `${row} ${theme.id}/${accent.id}: ${
                            ratio.toFixed(3)
                        }:1`,
                    );
                }
            }
        };

        await page.goto(`${app.origin}/?view=notes`);
        await ensureSidebarOpen(page);
        await page.getByRole("treeitem", { name: "浅染测试笔记", exact: true })
            .click();
        await check(
            ".documents-tree-row[data-selected]",
            ".documents-tree-label",
        );
        await page.getByRole("button", { name: "最近", exact: true }).click();
        await check(".documents-entry[aria-pressed='true']", "");
        await check(
            ".documents-summary-row:has([aria-current='page'])",
            ".documents-summary-open",
        );

        await page.goto(`${app.origin}/ask/${user.conversationId}`);
        await check(".ask-sidebar__item.is-active", ".ask-sidebar__item-title");
        await page.goto(`${app.origin}/settings/appearance`);
        await check(".settings-nav-item[aria-current='page']", "svg");
    } finally {
        await browser.close();
        await app.close();
    }
});
