import { walk } from "@std/fs/walk";
import { relative } from "@std/path/relative";
import type { UiViolation } from "./types.ts";
import { scanTsxCode } from "./tsx-scanner.ts";
import { scanCssCode } from "./css-scanner.ts";
import type { VisualRegistry } from "./registry.ts";

export interface ScanResult {
    violations: UiViolation[];
    totalFiles: number;
    scannedFiles: string[];
}

function isTestFile(path: string): boolean {
    const p = path.replaceAll("\\", "/");
    return (
        p.endsWith(".test.tsx") ||
        p.endsWith(".test.ts") ||
        p.endsWith(".spec.tsx") ||
        p.endsWith(".spec.ts") ||
        p.includes("/__tests__/")
    );
}

/**
 * Scans a target directory for UI presentation violations in TSX and CSS files.
 */
export async function scanDirectory(
    dirPath: string,
    registry: VisualRegistry,
    baseDir = dirPath,
): Promise<ScanResult> {
    const violations: UiViolation[] = [];
    const scannedFiles: string[] = [];

    for await (
        const entry of walk(dirPath, {
            includeDirs: false,
            exts: [".ts", ".tsx", ".css"],
            skip: [
                /\/node_modules\//,
                /\/\.git\//,
                /\/dist\//,
                /\/\.vite\//,
            ],
        })
    ) {
        if (isTestFile(entry.path)) {
            continue;
        }

        const relPath = relative(baseDir, entry.path).replaceAll("\\", "/");
        scannedFiles.push(relPath);

        const content = await Deno.readTextFile(entry.path);

        if (entry.path.endsWith(".tsx") || entry.path.endsWith(".ts")) {
            const fileViolations = scanTsxCode(relPath, content, registry);
            violations.push(...fileViolations);
        } else if (entry.path.endsWith(".css")) {
            const fileViolations = scanCssCode(relPath, content, registry);
            violations.push(...fileViolations);
        }
    }

    return {
        violations,
        totalFiles: scannedFiles.length,
        scannedFiles,
    };
}
