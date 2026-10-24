import { assertEquals, assertThrows } from "@std/assert";
import { parseRunOptions, type RunOptions } from "./options.ts";
import type { Suite } from "./suites.ts";

const run = (
    suite: Suite,
    parallel: boolean,
    failFast: boolean,
    timeoutMs: number | null = null,
): RunOptions => ({ kind: "run", suite, parallel, failFast, timeoutMs });

Deno.test("defaults keep the merge gates: workspace parallel, full serial fail-fast", () => {
    assertEquals(parseRunOptions(["workspace"]), run("workspace", true, false));
    assertEquals(parseRunOptions(["full"]), run("full", false, true));
    assertEquals(
        parseRunOptions(["documents"]),
        run("documents", false, false),
    );
    assertEquals(parseRunOptions(["check"]), { kind: "check" });
});

Deno.test("full can run in parallel and report every failure", () => {
    assertEquals(
        parseRunOptions(["full", "--parallel", "--no-fail-fast"]),
        run("full", true, false),
    );
    assertEquals(
        parseRunOptions(["workspace", "--serial"]),
        run("workspace", false, false),
    );
    assertEquals(
        parseRunOptions(["full", "--", "--parallel", "--no-fail-fast"]),
        run("full", true, false),
    );
});

Deno.test("triage timeout comes from --timeout, else E2E_TIMEOUT_MS", () => {
    assertEquals(
        parseRunOptions(["full", "--timeout", "5000"]),
        run("full", false, true, 5000),
    );
    assertEquals(
        parseRunOptions(["full", "--timeout=3000"], "9000"),
        run("full", false, true, 3000),
    );
    assertEquals(
        parseRunOptions(["documents"], "4000"),
        run("documents", false, false, 4000),
    );
});

Deno.test("conflicting, unknown or malformed options are rejected", () => {
    for (
        const args of [
            [],
            ["nope"],
            ["full", "--serial", "--parallel"],
            ["workspace", "--no-fail-fast"],
            ["full", "--retry"],
            ["full", "extra"],
            ["full", "--timeout", "0"],
            ["full", "--timeout", "1.5"],
            ["full", "--timeout"],
            ["full", "--fail-fast", "--no-fail-fast"],
            ["full", "--timeout", "5000", "--timeout", "6000"],
            ["full", "--timeout", "Infinity"],
            ["full", "--timeout", "9007199254740992"],
            ["full", "--parallel=false"],
            ["check", "--parallel"],
        ]
    ) {
        assertThrows(
            () => parseRunOptions(args),
            Error,
            undefined,
            args.join(" "),
        );
    }
    assertThrows(() => parseRunOptions(["full"], "abc"));
});
