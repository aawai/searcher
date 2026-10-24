import { assertEquals, assertThrows } from "@std/assert";
import { parseRunOptions, type RunOptions } from "./options.ts";
import { type Suite, suiteFiles } from "./suites.ts";

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

const documentPartitionNames = [
    "documents-core",
    "pagination-short",
    "pagination-manual",
    "pagination-consecutive",
    "pagination-mixed",
] as const;

Deno.test("document partition selectors preserve execution defaults and allow explicit parallelism", () => {
    for (const suite of documentPartitionNames) {
        assertEquals(parseRunOptions([suite]), run(suite, false, false));
        assertEquals(
            parseRunOptions([suite, "--parallel"]),
            run(suite, true, false),
        );
    }
});

Deno.test("document partitions cover documents exactly once and full retains every file once", () => {
    const partitions = documentPartitionNames.map(suiteFiles);
    for (const pagination of partitions.slice(1)) {
        assertEquals(pagination.length, 1);
    }
    const files = partitions.flat();
    assertEquals(files.length, new Set(files).size);
    assertEquals(files.toSorted(), suiteFiles("documents").toSorted());
    const full = suiteFiles("full");
    assertEquals(full.length, new Set(full).size);
    assertEquals(files.every((file) => full.includes(file)), true);
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

Deno.test("affected accepts base/list and existing execution options", () => {
    assertEquals(parseRunOptions(["affected"]), {
        kind: "run",
        suite: "affected",
        parallel: false,
        failFast: true,
        timeoutMs: null,
        base: "origin/main",
        list: false,
    });
    assertEquals(
        parseRunOptions([
            "affected",
            "--",
            "--base",
            "HEAD~2",
            "--list",
            "--parallel",
            "--no-fail-fast",
            "--timeout",
            "5000",
        ]),
        {
            kind: "run",
            suite: "affected",
            parallel: true,
            failFast: false,
            timeoutMs: 5000,
            base: "HEAD~2",
            list: true,
        },
    );
    const options = parseRunOptions(["affected", "--base=HEAD", "--serial"]);
    assertEquals(options.kind === "run" && options.base, "HEAD");
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
            ["full", "--base", "HEAD"],
            ["documents", "--list"],
            ["affected", "--base"],
            ["affected", "--base="],
            ["affected", "--base", "--list"],
            ["affected", "--base=-bad"],
            ["affected", "--base", "HEAD", "--base", "main"],
            ["affected", "--list=false"],
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
