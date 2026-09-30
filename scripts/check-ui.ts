#!/usr/bin/env -S deno run -A

import { parseArgs } from "@std/cli/parse-args";
import { resolve } from "@std/path/resolve";
import { scanDirectory } from "./ui-guard/scanner.ts";
import {
    buildBaseline,
    compareWithBaseline,
    loadBaseline,
    saveBaseline,
} from "./ui-guard/baseline.ts";
import type { CheckSummary } from "./ui-guard/types.ts";

const HELP_TEXT = `
Searcher UI Guard - Static visual presentation & boundary guard

Usage:
  deno task check:ui [options]
  deno run -A scripts/check-ui.ts [options]

Options:
  --update, -u            Shrink-only update of baseline (locks in resolved technical debt)
  --initialize, -i        Explicit bootstrap of baseline allowlist from current codebase
  --baseline, -b <path>   Path to baseline JSON file (default: scripts/ui-guard/baseline.json)
  --target, -t <path>     Target directory to scan (default: web/src)
  --base-dir <path>       Base directory for relative paths (default: repo root)
  --json                  Output summary as JSON
  --help, -h              Show this help text
`;

export async function runCheck(args: string[]): Promise<number> {
    const flags = parseArgs(args, {
        boolean: ["update", "initialize", "json", "help"],
        string: ["baseline", "target", "base-dir"],
        alias: {
            u: "update",
            i: "initialize",
            h: "help",
            b: "baseline",
            t: "target",
        },
    });

    if (flags.help) {
        console.log(HELP_TEXT);
        return 0;
    }

    const cwd = Deno.cwd();
    const baselinePath = resolve(
        flags.baseline ?? "scripts/ui-guard/baseline.json",
    );
    const targetPath = resolve(flags.target ?? "web/src");
    const baseDir = resolve(flags["base-dir"] ?? cwd);

    // 1. Scan target directory
    const { violations, totalFiles } = await scanDirectory(targetPath, baseDir);

    // 2. Handle --initialize mode (explicit initial bootstrap)
    if (flags.initialize) {
        const newBaseline = buildBaseline(violations);
        await saveBaseline(baselinePath, newBaseline);
        if (flags.json) {
            console.log(JSON.stringify({
                initialized: true,
                totalViolations: violations.length,
                baselinePath,
            }));
        } else {
            console.log(
                "------------------------------------------------------------",
            );
            console.log("[INFO] UI Guard: Baseline initialized successfully!");
            console.log(`Baseline file:    ${baselinePath}`);
            console.log(`Total files:      ${totalFiles}`);
            console.log(`Total allowances: ${violations.length}`);
            console.log(
                "------------------------------------------------------------",
            );
        }
        return 0;
    }

    // 3. Load baseline for comparison
    const baseline = await loadBaseline(baselinePath);

    if (!baseline) {
        if (violations.length === 0) {
            if (!flags.json) {
                console.log(
                    `[PASS] UI Guard: No baseline file found, and 0 violations detected across ${totalFiles} files.`,
                );
            }
            return 0;
        }

        console.error(
            `[ERROR] UI Guard: No baseline file found at ${baselinePath}`,
        );
        console.error(
            `Detected ${violations.length} violations across ${totalFiles} files.`,
        );
        console.error(
            "To initialize baseline allowlist, run with explicit bootstrap option:",
        );
        console.error("  deno run -A scripts/check-ui.ts --initialize");
        return 1;
    }

    // 4. Compare current state with baseline
    const summary: CheckSummary = compareWithBaseline(
        violations,
        baseline,
        totalFiles,
    );

    // 5. Handle --update mode (STRICTLY SHRINK-ONLY)
    if (flags.update) {
        // Must reject any new violations or increased counts
        if (
            summary.newViolations.length > 0 ||
            summary.increasedViolations.length > 0
        ) {
            console.error(
                "------------------------------------------------------------",
            );
            console.error(
                "[ERROR] Cannot update baseline: new violations or increased counts detected.",
            );
            console.error(
                "Baseline update is strictly shrink-only to lock in resolved debt.",
            );
            console.error(
                "New visual drift must be resolved, not absorbed into baseline.",
            );
            console.error(
                "------------------------------------------------------------",
            );
            if (summary.newViolations.length > 0) {
                console.error(
                    `New violations (${summary.newViolations.length}):`,
                );
                for (const v of summary.newViolations) {
                    console.error(
                        `  [VIOLATION] ${v.file}:${v.line}:${v.column} [${v.rule}] ${v.value}`,
                    );
                }
            }
            if (summary.increasedViolations.length > 0) {
                console.error(
                    `Increased violation counts (${summary.increasedViolations.length}):`,
                );
                for (const inc of summary.increasedViolations) {
                    console.error(
                        `  [INCREASED] ${inc.file}: [${inc.entry.rule}] ${inc.entry.snippet} (+${inc.excess})`,
                    );
                }
            }
            return 1;
        }

        if (summary.staleAllowances.length === 0) {
            if (!flags.json) {
                console.log(
                    "[INFO] Baseline is already up-to-date. No stale allowances to shrink.",
                );
            }
            return 0;
        }

        // Shrink baseline
        const newBaseline = buildBaseline(violations);
        await saveBaseline(baselinePath, newBaseline);
        const diff = baseline.totalViolations - newBaseline.totalViolations;

        if (flags.json) {
            console.log(JSON.stringify({
                shrunk: true,
                previousAllowances: baseline.totalViolations,
                newAllowances: newBaseline.totalViolations,
                reduced: diff,
            }));
        } else {
            console.log(
                "------------------------------------------------------------",
            );
            console.log(
                "[SHRINK] Baseline updated successfully (shrink-only):",
            );
            console.log(`Previous allowances: ${baseline.totalViolations}`);
            console.log(`New allowances:      ${newBaseline.totalViolations}`);
            console.log(`Reduced debt:        -${diff}`);
            console.log(
                "------------------------------------------------------------",
            );
        }
        return 0;
    }

    if (flags.json) {
        console.log(JSON.stringify(summary, null, 2));
        return summary.passed ? 0 : 1;
    }

    // 6. Render human-readable terminal report
    console.log("============================================================");
    console.log("Searcher UI Guard - Visual Contract Verification");
    console.log("============================================================");
    console.log(`Scanned files:       ${summary.totalScannedFiles}`);
    console.log(`Total violations:    ${summary.totalViolations}`);
    console.log(`Matched allowances:  ${summary.matchedAllowances}`);
    console.log(`New violations:      ${summary.newViolations.length}`);
    console.log(`Increased count:     ${summary.increasedViolations.length}`);
    console.log(`Stale allowances:    ${summary.staleAllowances.length}`);
    console.log("------------------------------------------------------------");

    if (summary.newViolations.length > 0) {
        console.error(
            "\n[VIOLATION] NEW VIOLATIONS DETECTED (Strictly forbidden in Phase 9):",
        );
        for (const v of summary.newViolations) {
            console.error(`  ${v.file}:${v.line}:${v.column}`);
            console.error(`    [${v.rule}] ${v.value}`);
        }
    }

    if (summary.increasedViolations.length > 0) {
        console.error("\n[INCREASED] INCREASED VIOLATION COUNTS DETECTED:");
        for (const inc of summary.increasedViolations) {
            console.error(
                `  ${inc.file}: [${inc.entry.rule}] ${inc.entry.snippet}`,
            );
            console.error(
                `    Allowed count: ${inc.entry.count}, Actual count: ${inc.actualCount} (+${inc.excess})`,
            );
        }
    }

    if (summary.staleAllowances.length > 0) {
        console.error(
            "\n[STALE] STALE ALLOWANCES DETECTED (Violations were fixed! Baseline must shrink):",
        );
        for (const st of summary.staleAllowances) {
            console.error(
                `  ${st.file}: [${st.entry.rule}] ${st.entry.snippet}`,
            );
            console.error(
                `    Expected: ${st.entry.count}, Actual: ${st.actualCount} (Fixed: ${st.deficit})`,
            );
        }
        console.error("\nTo lock in cleanups and update the baseline, run:");
        console.error("  deno task check:ui --update");
    }

    if (summary.passed) {
        console.log(
            "\n[PASS] All UI visual presentations match the baseline contract. 0 new drift.",
        );
        console.log(
            "============================================================\n",
        );
        return 0;
    } else {
        console.error(
            "\n[ERROR] UI Guard check failed. Please fix violations or update baseline if intentional.",
        );
        console.error(
            "============================================================\n",
        );
        return 1;
    }
}

if (import.meta.main) {
    const exitCode = await runCheck(Deno.args);
    Deno.exit(exitCode);
}
