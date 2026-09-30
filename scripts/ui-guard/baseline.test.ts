import { assertEquals } from "@std/assert";
import type { UiViolation } from "./types.ts";
import { buildBaseline, compareWithBaseline } from "./baseline.ts";

function createViolation(
    file: string,
    rule: UiViolation["rule"],
    property: string,
    value: string,
    line = 1,
): UiViolation {
    return {
        file,
        rule,
        property,
        value,
        line,
        column: 1,
        fingerprint: `${rule}:${property}:${value}`,
    };
}

Deno.test("baseline - builds deterministic baseline with exact counts", () => {
    const violations: UiViolation[] = [
        createViolation(
            "web/src/app/AdminPage.tsx",
            "inline-visual-style",
            "background",
            "var(--surface)",
            10,
        ),
        createViolation(
            "web/src/app/AdminPage.tsx",
            "inline-visual-style",
            "background",
            "var(--surface)",
            25,
        ),
        createViolation(
            "web/src/app/AdminPage.tsx",
            "raw-font-size",
            "fontSize",
            "14px",
            30,
        ),
    ];

    const baseline = buildBaseline(violations);
    assertEquals(baseline.totalViolations, 3);
    const adminAllowances = baseline.allowances["web/src/app/AdminPage.tsx"];
    assertEquals(adminAllowances.length, 2);

    const bgAllowance = adminAllowances.find((a) =>
        a.property === "background"
    );
    assertEquals(bgAllowance?.count, 2);

    const fontAllowance = adminAllowances.find((a) =>
        a.property === "fontSize"
    );
    assertEquals(fontAllowance?.count, 1);
});

Deno.test("baseline - passes when current violations exactly match baseline", () => {
    const violations: UiViolation[] = [
        createViolation(
            "web/src/app/AdminPage.tsx",
            "inline-visual-style",
            "background",
            "var(--surface)",
            10,
        ),
        createViolation(
            "web/src/app/AdminPage.tsx",
            "raw-font-size",
            "fontSize",
            "14px",
            30,
        ),
    ];

    const baseline = buildBaseline(violations);
    const result = compareWithBaseline(violations, baseline, 1);

    assertEquals(result.passed, true);
    assertEquals(result.newViolations.length, 0);
    assertEquals(result.increasedViolations.length, 0);
    assertEquals(result.staleAllowances.length, 0);
    assertEquals(result.matchedAllowances, 2);
});

Deno.test("baseline - fails on new violations (in existing or new files)", () => {
    const baselineViolations: UiViolation[] = [
        createViolation(
            "web/src/app/AdminPage.tsx",
            "inline-visual-style",
            "background",
            "var(--surface)",
            10,
        ),
    ];
    const baseline = buildBaseline(baselineViolations);

    // Injected drift: a new violation in another file
    const currentViolations: UiViolation[] = [
        ...baselineViolations,
        createViolation(
            "web/src/app/SettingsPage.tsx",
            "raw-box-shadow",
            "boxShadow",
            "0 4px 6px black",
            12,
        ),
    ];

    const result = compareWithBaseline(currentViolations, baseline, 2);
    assertEquals(result.passed, false);
    assertEquals(result.newViolations.length, 1);
    assertEquals(result.newViolations[0].file, "web/src/app/SettingsPage.tsx");
    assertEquals(result.newViolations[0].rule, "raw-box-shadow");
});

Deno.test("baseline - fails on same-file increased violation count", () => {
    const baselineViolations: UiViolation[] = [
        createViolation(
            "web/src/app/AdminPage.tsx",
            "inline-visual-style",
            "background",
            "var(--surface)",
            10,
        ),
        createViolation(
            "web/src/app/AdminPage.tsx",
            "inline-visual-style",
            "background",
            "var(--surface)",
            20,
        ),
    ];
    const baseline = buildBaseline(baselineViolations);

    // Same file adds a 3rd occurrence of the same violation
    const currentViolations: UiViolation[] = [
        ...baselineViolations,
        createViolation(
            "web/src/app/AdminPage.tsx",
            "inline-visual-style",
            "background",
            "var(--surface)",
            45,
        ),
    ];

    const result = compareWithBaseline(currentViolations, baseline, 1);
    assertEquals(result.passed, false);
    assertEquals(result.increasedViolations.length, 1);
    assertEquals(
        result.increasedViolations[0].file,
        "web/src/app/AdminPage.tsx",
    );
    assertEquals(result.increasedViolations[0].actualCount, 3);
    assertEquals(result.increasedViolations[0].excess, 1);
});

Deno.test("baseline - fails on stale allowances when violations are cleaned up", () => {
    const baselineViolations: UiViolation[] = [
        createViolation(
            "web/src/app/AdminPage.tsx",
            "inline-visual-style",
            "background",
            "var(--surface)",
            10,
        ),
        createViolation(
            "web/src/app/AdminPage.tsx",
            "raw-font-size",
            "fontSize",
            "14px",
            20,
        ),
    ];
    const baseline = buildBaseline(baselineViolations);

    // Developer refactored font-size away, leaving only background
    const currentViolations: UiViolation[] = [
        createViolation(
            "web/src/app/AdminPage.tsx",
            "inline-visual-style",
            "background",
            "var(--surface)",
            10,
        ),
    ];

    const result = compareWithBaseline(currentViolations, baseline, 1);
    assertEquals(result.passed, false);
    assertEquals(result.staleAllowances.length, 1);
    assertEquals(result.staleAllowances[0].file, "web/src/app/AdminPage.tsx");
    assertEquals(result.staleAllowances[0].entry.rule, "raw-font-size");
    assertEquals(result.staleAllowances[0].actualCount, 0);
    assertEquals(result.staleAllowances[0].deficit, 1);
});
