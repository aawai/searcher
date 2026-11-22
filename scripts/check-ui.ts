#!/usr/bin/env -S deno run -A

import { parseArgs } from "@std/cli/parse-args";
import { resolve } from "@std/path/resolve";
import { formatOwnershipReport, scanOwnership } from "./ui-guard/ownership.ts";

const HELP_TEXT = `
Searcher UI Guard - Lightweight UI Hygiene Check

Usage:
  deno task check:ui [options]
  deno run -A scripts/check-ui.ts [options]

Options:
  --target, -t <path>     Target directory to scan (default: web/src)
  --base-dir <path>       Base directory for relative paths (default: repo root)
  --json                  Output summary as JSON
  --help, -h              Show this help text
`;

export async function runCheck(args: string[]): Promise<number> {
    const flags = parseArgs(args, {
        boolean: ["json", "help"],
        string: ["target", "base-dir"],
        alias: {
            h: "help",
            t: "target",
        },
    });

    if (flags.help) {
        console.log(HELP_TEXT);
        return 0;
    }

    const cwd = Deno.cwd();
    const targetPath = resolve(flags.target ?? "web/src");
    const baseDir = resolve(flags["base-dir"] ?? cwd);

    const result = await scanOwnership(targetPath, baseDir);

    if (flags.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(formatOwnershipReport(result));
    }

    return result.passed ? 0 : 1;
}

if (import.meta.main) {
    const exitCode = await runCheck(Deno.args);
    Deno.exit(exitCode);
}
