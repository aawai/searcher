import { checkSuites, selectAffected, suiteFiles } from "./suites.ts";
import { parseRunOptions } from "./options.ts";
import { collectAffectedPaths } from "./affected.ts";

// Deliberately delegates scheduling, checking and reporting to Deno test.
const options = parseRunOptions(Deno.args, Deno.env.get("E2E_TIMEOUT_MS"));
await checkSuites();
if (options.kind === "check") {
    console.log(`E2E manifest covers ${suiteFiles("full").length} files.`);
    Deno.exit(0);
}
const { suite, parallel, failFast, timeoutMs } = options;
const changes = suite === "affected"
    ? await collectAffectedPaths(options.base)
    : null;
const selection = changes ? selectAffected(changes.paths) : null;
const files = selection
    ? selection.files
    : suiteFiles(suite as Exclude<typeof suite, "affected">);
if (selection && changes) {
    console.log(
        `Affected base: ${
            JSON.stringify(changes.base)
        } (merge-base ${changes.mergeBase})`,
    );
    console.log(`Affected reason: ${selection.reason}`);
    console.log(`Affected suites: ${selection.suites.join(", ") || "none"}`);
    console.log(`Affected paths: ${JSON.stringify(selection.paths)}`);
    console.log(`Affected files: ${JSON.stringify(files)}`);
}
const jobs = Deno.env.get("DENO_JOBS") ?? "2";
const reportDir = Deno.env.get("E2E_REPORT_DIR") ??
    `artifacts/e2e/${suite}-${Date.now()}-${crypto.randomUUID()}`;
await Deno.mkdir(reportDir, { recursive: true });
const junit = `${reportDir}/junit.xml`;
// Never mistake a previous successful report for this invocation's result.
await Deno.remove(junit).catch((error: unknown) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
});
const started = performance.now();
const timings: Record<string, number | string | boolean | string[] | null> = {
    suite,
    parallel,
    failFast,
    jobs: parallel ? jobs : "serial",
    // A triage timeout makes the run a diagnosis, never a merge gate.
    timeoutMs,
    files,
    ...(selection && changes
        ? {
            affectedPaths: selection.paths,
            base: changes.base,
            mergeBase: changes.mergeBase,
            selectedSuites: selection.suites,
            selectionReason: selection.reason,
            list: options.list ?? false,
        }
        : {}),
};

async function run(phase: string, args: string[]): Promise<number> {
    const start = performance.now();
    const child = new Deno.Command(Deno.execPath(), {
        args,
        env: phase === "test"
            ? {
                NODE_ENV: "test",
                E2E_REPORT_DIR: reportDir,
                DENO_JOBS: jobs,
                ...(timeoutMs === null
                    ? {}
                    : { E2E_TIMEOUT_MS: String(timeoutMs) }),
            }
            : {},
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    }).spawn();
    const forward = (signal: "SIGINT" | "SIGTERM") => () => {
        try {
            child.kill(signal);
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) throw error;
        }
    };
    const interrupt = forward("SIGINT");
    const terminate = forward("SIGTERM");
    Deno.addSignalListener("SIGINT", interrupt);
    Deno.addSignalListener("SIGTERM", terminate);
    try {
        const status = await child.status;
        timings[`${phase}ExitCode`] = status.code;
        return status.code;
    } finally {
        Deno.removeSignalListener("SIGINT", interrupt);
        Deno.removeSignalListener("SIGTERM", terminate);
        timings[`${phase}Seconds`] = (performance.now() - start) / 1000;
    }
}

const skip = selection !== null && (options.list || files.length === 0);
if (!skip && timeoutMs !== null) {
    console.warn(
        `Triage run: implicit Playwright timeout ${timeoutMs}ms; not a merge gate.`,
    );
}
let code = 1;
try {
    if (skip) {
        timings.skipped = true;
        console.log(
            options.list
                ? "Affected selection only (--list): no build or browser; tests not run."
                : "No affected changes: skipping build and browser; tests not run.",
        );
        code = 0;
    } else {
        code = await run("build", ["task", "build"]);
        if (code === 0) {
            code = await run("test", [
                "test",
                "-A",
                ...(parallel ? ["--parallel"] : []),
                ...(failFast ? ["--fail-fast"] : []),
                `--junit-path=${junit}`,
                ...files,
            ]);
            // A successful run without its promised report is an acceptance failure.
            if (code === 0 && !(await Deno.stat(junit)).isFile) code = 1;
        }
    }
} finally {
    timings.wallSeconds = (performance.now() - started) / 1000;
    await Deno.writeTextFile(
        `${reportDir}/timings.json`,
        JSON.stringify(timings, null, 2),
    );
    console.log(`E2E reports: ${reportDir}`);
}
Deno.exit(code);
