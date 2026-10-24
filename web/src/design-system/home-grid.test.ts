import { assertEquals } from "@std/assert";
import { HOME_GRID } from "./home-grid.ts";

Deno.test("home grid CSS and placement metrics share the same source values", async () => {
    const css = await Deno.readTextFile(
        new URL("./tokens.css", import.meta.url),
    );
    for (const [tier, metrics] of Object.entries(HOME_GRID)) {
        if (typeof metrics === "number") continue;
        const suffix = tier.replace(
            /[A-Z]/g,
            (letter) => `-${letter.toLowerCase()}`,
        );
        for (const [metric, expected] of Object.entries(metrics)) {
            const value = css.match(
                new RegExp(`--home-grid-${suffix}-${metric}:\\s*(\\d+)px;`),
            );
            assertEquals(
                Number(value?.[1]),
                expected,
                `${tier} ${metric} CSS/TS drift`,
            );
        }
    }
    assertEquals(
        css.match(/--home-grid-axis:\s*([\d.]+)%;/)?.[1],
        String(HOME_GRID.axis * 100),
    );
});
