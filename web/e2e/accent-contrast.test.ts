import { assert } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { ACCENTS } from "../../src/shared/contracts.ts";
import { startProductionApp } from "./helpers/production-app.ts";

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
