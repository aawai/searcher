import { assertEquals } from "@std/assert";
import type { UiViolation } from "./types.ts";
import { scanDirectory } from "./scanner.ts";
import { FIXTURE_REGISTRY } from "./test-registry.ts";

Deno.test("scanner - scans directory with TSX and CSS files, ignoring tests", async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "ui-guard-test-" });

    try {
        await Deno.mkdir(`${tempDir}/components`, { recursive: true });

        // 1. TSX with violation
        await Deno.writeTextFile(
            `${tempDir}/components/BadCard.tsx`,
            `export function BadCard() { return <div style={{ fontSize: 14 }}>Card</div>; }`,
        );

        // 2. CSS with violation
        await Deno.writeTextFile(
            `${tempDir}/components/bad.css`,
            `.bad { box-shadow: 0 4px 6px black; }`,
        );

        // 3. Test file (should be ignored)
        await Deno.writeTextFile(
            `${tempDir}/components/BadCard.test.tsx`,
            `export function TestMock() { return <div style={{ fontSize: 99 }}>Mock</div>; }`,
        );

        await Deno.writeTextFile(
            `${tempDir}/components/query.ts`,
            `export const query = "(max-width: 900px)";`,
        );
        const { violations, totalFiles } = await scanDirectory(
            tempDir,
            FIXTURE_REGISTRY,
        );

        assertEquals(totalFiles, 3); // Production TS queries are checked; tests excluded.
        assertEquals(violations.length, 3);
        assertEquals(
            violations.some((v) => v.rule === "scattered-media-query"),
            true,
        );

        const fontViolation = violations.find((v: UiViolation) =>
            v.rule === "raw-font-size"
        );
        const shadowViolation = violations.find((v: UiViolation) =>
            v.rule === "raw-box-shadow"
        );

        assertEquals(fontViolation !== undefined, true);
        assertEquals(shadowViolation !== undefined, true);
    } finally {
        await Deno.remove(tempDir, { recursive: true });
    }
});
