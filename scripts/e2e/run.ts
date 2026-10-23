import { checkSuites, Suite, suiteFiles, suites } from "./suites.ts";

// Deliberately delegates scheduling, checking and reporting to Deno test.
// There is no no-build mode: every public execution starts with a fresh build.
await checkSuites();
const [name, mode] = Deno.args;
if (name === "check" && !mode) {
    console.log(`E2E manifest covers ${suiteFiles("full").length} files.`);
    Deno.exit(0);
}
if (
    !name ||
    !(Object.hasOwn(suites, name) ||
        ["full", "apps", "layout"].includes(name)) ||
    (mode !== undefined && mode !== "--serial" && mode !== "--parallel") ||
    Deno.args.length > 2
) {
    throw new Error(
        "Usage: deno run -A scripts/e2e/run.ts <suite|check> [--serial|--parallel]",
    );
}
const suite = name as Suite;
// Only Workspace defaults to parallel; full retains the conservative serial mode.
const parallel = mode === "--parallel" ||
    (mode === undefined && suite === "workspace");
const failFast = suite === "full";
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
const timings: Record<string, number | string | boolean | string[]> = {
    suite,
    parallel,
    failFast,
    jobs: parallel ? jobs : "serial",
    files: suiteFiles(suite),
};

async function run(phase: string, args: string[]): Promise<number> {
    const start = performance.now();
    const child = new Deno.Command(Deno.execPath(), {
        args,
        env: phase === "test"
            ? { NODE_ENV: "test", E2E_REPORT_DIR: reportDir, DENO_JOBS: jobs }
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

let code = 1;
try {
    code = await run("build", ["task", "build"]);
    if (code === 0) {
        code = await run("test", [
            "test",
            "-A",
            ...(parallel ? ["--parallel"] : []),
            ...(failFast ? ["--fail-fast"] : []),
            `--junit-path=${junit}`,
            ...suiteFiles(suite),
        ]);
        // A successful run without its promised report is an acceptance failure.
        if (code === 0 && !(await Deno.stat(junit)).isFile) code = 1;
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
