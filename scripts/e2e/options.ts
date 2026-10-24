import { parseArgs } from "@std/cli/parse-args";
import { type Suite, suites } from "./suites.ts";

export const USAGE =
    "Usage: deno run -A scripts/e2e/run.ts <suite|check> [--serial|--parallel] [--no-fail-fast] [--timeout <ms>]";

export type RunOptions =
    | { kind: "check" }
    | {
        kind: "run";
        suite: Suite;
        parallel: boolean;
        failFast: boolean;
        /** Implicit Playwright timeout for local triage; null keeps 30s. */
        timeoutMs: number | null;
    };

function isSuite(name: string): name is Suite {
    return Object.hasOwn(suites, name) ||
        ["full", "apps", "layout"].includes(name);
}

/**
 * Defaults keep the merge gates: Workspace runs in parallel, full runs
 * serially and stops at the first failure. Flags only widen local triage.
 */
export function parseRunOptions(
    args: readonly string[],
    /** `E2E_TIMEOUT_MS` from the environment; `--timeout` overrides it. */
    envTimeout?: string,
): RunOptions {
    const fail = (reason: string): never => {
        throw new Error(`${reason}\n${USAGE}`);
    };
    // Deno tasks accept both `task full --parallel` and the familiar
    // `task full -- --parallel` spelling.
    const normalized = [...args];
    if (normalized[1] === "--") normalized.splice(1, 1);
    const flags = new Set<string>();
    for (let index = 1; index < normalized.length; index++) {
        const arg = normalized[index];
        const flag = arg.split("=")[0];
        if (
            ![
                "--serial",
                "--parallel",
                "--fail-fast",
                "--no-fail-fast",
                "--timeout",
            ].includes(flag)
        ) {
            fail(`Unknown option: ${arg}`);
        }
        if (flags.has(flag)) fail(`Repeated option: ${flag}`);
        flags.add(flag);
        if (flag !== "--timeout" && arg.includes("=")) {
            fail(`Unexpected value: ${arg}`);
        }
        if (arg === "--timeout") index++;
    }
    if (flags.has("--fail-fast") && flags.has("--no-fail-fast")) {
        fail("--fail-fast and --no-fail-fast are exclusive");
    }
    const parsed = parseArgs(normalized, {
        boolean: ["serial", "parallel", "fail-fast"],
        string: ["timeout"],
        negatable: ["fail-fast"],
        default: { "fail-fast": true },
    });
    const [name, ...extra] = parsed._.map(String);
    if (!name) fail("Missing suite");
    if (extra.length) fail(`Unexpected argument: ${extra.join(", ")}`);
    const failFastFlag = flags.has("--fail-fast") ||
        flags.has("--no-fail-fast");
    if (name === "check") {
        if (args.length > 1) fail("check takes no options");
        return { kind: "check" };
    }
    if (!isSuite(name)) fail(`Unknown suite: ${name}`);
    const suite = name as Suite;
    if (parsed.serial && parsed.parallel) {
        fail("--serial and --parallel are exclusive");
    }
    if (failFastFlag && suite !== "full") {
        fail("--fail-fast and --no-fail-fast only apply to full");
    }
    let timeoutMs: number | null = null;
    const timeout = parsed.timeout ?? envTimeout;
    if (timeout !== undefined) {
        timeoutMs = Number(timeout);
        if (!/^[1-9]\d*$/.test(timeout) || !Number.isSafeInteger(timeoutMs)) {
            fail(`--timeout must be a positive integer of ms: ${timeout}`);
        }
    }
    return {
        kind: "run",
        suite,
        parallel: parsed.parallel ||
            (!parsed.serial && suite === "workspace"),
        failFast: suite === "full" && parsed["fail-fast"],
        timeoutMs,
    };
}
