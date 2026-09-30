import type {
    BaselineEntry,
    BaselineFile,
    CheckSummary,
    UiViolation,
} from "./types.ts";

/**
 * Builds a deterministic baseline representation from a set of violations.
 */
export function buildBaseline(violations: UiViolation[]): BaselineFile {
    const byFile = new Map<
        string,
        Map<string, { entry: BaselineEntry; count: number }>
    >();

    for (const v of violations) {
        const normFile = v.file.replaceAll("\\", "/");
        let fileMap = byFile.get(normFile);
        if (!fileMap) {
            fileMap = new Map();
            byFile.set(normFile, fileMap);
        }

        const existing = fileMap.get(v.fingerprint);
        if (existing) {
            existing.count++;
        } else {
            fileMap.set(v.fingerprint, {
                entry: {
                    rule: v.rule,
                    property: v.property,
                    snippet: v.value,
                    fingerprint: v.fingerprint,
                    count: 1,
                },
                count: 1,
            });
        }
    }

    const allowances: Record<string, BaselineEntry[]> = {};
    const sortedFiles = Array.from(byFile.keys()).sort();

    for (const file of sortedFiles) {
        const fileMap = byFile.get(file)!;
        const entries: BaselineEntry[] = [];
        for (const item of fileMap.values()) {
            entries.push({
                ...item.entry,
                count: item.count,
            });
        }
        // Deterministic sort
        entries.sort((a, b) => {
            if (a.rule !== b.rule) return a.rule.localeCompare(b.rule);
            if (a.property !== b.property) {
                return a.property.localeCompare(b.property);
            }
            return a.fingerprint.localeCompare(b.fingerprint);
        });
        allowances[file] = entries;
    }

    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        totalViolations: violations.length,
        allowances,
    };
}

/**
 * Compares current violations with the baseline.
 * Fails on new violations, increased violation counts, and stale allowances.
 */
export function compareWithBaseline(
    violations: UiViolation[],
    baseline: BaselineFile,
    totalScannedFiles: number,
): CheckSummary {
    const actualByFile = new Map<
        string,
        Map<string, { count: number; violations: UiViolation[] }>
    >();

    for (const v of violations) {
        const normFile = v.file.replaceAll("\\", "/");
        let fileMap = actualByFile.get(normFile);
        if (!fileMap) {
            fileMap = new Map();
            actualByFile.set(normFile, fileMap);
        }

        const group = fileMap.get(v.fingerprint);
        if (group) {
            group.count++;
            group.violations.push(v);
        } else {
            fileMap.set(v.fingerprint, {
                count: 1,
                violations: [v],
            });
        }
    }

    const newViolations: UiViolation[] = [];
    const increasedViolations: CheckSummary["increasedViolations"] = [];
    const staleAllowances: CheckSummary["staleAllowances"] = [];
    let matchedAllowances = 0;

    // 1. Check all current violations against baseline allowances
    for (const [file, fileMap] of actualByFile.entries()) {
        const baselineEntries = baseline.allowances[file];
        const allowanceMap = new Map<string, BaselineEntry>();
        if (baselineEntries) {
            for (const entry of baselineEntries) {
                allowanceMap.set(entry.fingerprint, entry);
            }
        }

        for (const [fingerprint, actual] of fileMap.entries()) {
            const allowed = allowanceMap.get(fingerprint);
            if (!allowed) {
                // Entirely new violation
                newViolations.push(...actual.violations);
            } else if (actual.count > allowed.count) {
                // Violation count increased in the same file
                matchedAllowances += allowed.count;
                const excess = actual.count - allowed.count;
                increasedViolations.push({
                    file,
                    entry: allowed,
                    actualCount: actual.count,
                    excess,
                });
                // Add the excess occurrences to newViolations as well
                newViolations.push(...actual.violations.slice(allowed.count));
            } else {
                matchedAllowances += actual.count;
            }
        }
    }

    // 2. Check for stale allowances (allowance count > actual count)
    for (const [file, entries] of Object.entries(baseline.allowances)) {
        const fileActual = actualByFile.get(file);
        for (const entry of entries) {
            const actual = fileActual?.get(entry.fingerprint);
            const actualCount = actual?.count ?? 0;
            if (actualCount < entry.count) {
                staleAllowances.push({
                    file,
                    entry,
                    actualCount,
                    deficit: entry.count - actualCount,
                });
            }
        }
    }

    const passed = newViolations.length === 0 &&
        increasedViolations.length === 0 &&
        staleAllowances.length === 0;

    return {
        passed,
        totalScannedFiles,
        totalViolations: violations.length,
        matchedAllowances,
        newViolations,
        increasedViolations,
        staleAllowances,
    };
}

/**
 * Loads baseline from JSON file. Returns null if file does not exist.
 */
export async function loadBaseline(
    filePath: string,
): Promise<BaselineFile | null> {
    try {
        const text = await Deno.readTextFile(filePath);
        const parsed = JSON.parse(text);
        if (
            parsed && parsed.version === 1 &&
            typeof parsed.allowances === "object"
        ) {
            return parsed as BaselineFile;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Saves baseline to JSON file formatted with 2 spaces.
 */
export async function saveBaseline(
    filePath: string,
    baseline: BaselineFile,
): Promise<void> {
    const text = JSON.stringify(baseline, null, 2) + "\n";
    await Deno.writeTextFile(filePath, text);
}
