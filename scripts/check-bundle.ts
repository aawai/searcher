import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

interface ManifestChunk {
    file: string;
    name?: string;
    src?: string;
    isEntry?: boolean;
    isDynamicEntry?: boolean;
    imports?: string[];
    dynamicImports?: string[];
    css?: string[];
    assets?: string[];
}

type Manifest = Record<string, ManifestChunk>;

interface BundleBudget {
    baselineSha: string;
    baselineInitialRawBytes: number;
    baselineInitialGzipBytes: number;
    maxInitialRawBytes: number;
    maxInitialGzipBytes: number;
    maxEntryChunkRawBytes?: number;
    maxEntryChunkGzipBytes?: number;
    minGzipReductionRatio: number;
}

interface FileMetric {
    path: string;
    rawBytes: number;
    gzipBytes: number;
}

function formatKiB(bytes: number): string {
    return (bytes / 1024).toFixed(2) + " KiB";
}

function formatPercent(ratio: number): string {
    return (ratio * 100).toFixed(2) + "%";
}

function loadManifest(
    root: string,
): { manifestPath: string; manifest: Manifest } {
    const candidates = [
        resolve(root, "web/dist/manifest.json"),
        resolve(root, "web/dist/.vite/manifest.json"),
    ];

    for (const path of candidates) {
        if (existsSync(path)) {
            const raw = readFileSync(path, "utf-8");
            return {
                manifestPath: path,
                manifest: JSON.parse(raw) as Manifest,
            };
        }
    }

    throw new Error(
        `Vite manifest not found at ${
            candidates.join(" or ")
        }. Did you run 'deno task build'?`,
    );
}

function loadBudget(root: string): BundleBudget {
    const budgetPath = resolve(root, "scripts/bundle-budget.json");
    if (!existsSync(budgetPath)) {
        throw new Error(`Bundle budget config not found at ${budgetPath}`);
    }
    const raw = readFileSync(budgetPath, "utf-8");
    return JSON.parse(raw) as BundleBudget;
}

function getFileMetric(distDir: string, relativeFile: string): FileMetric {
    const fullPath = resolve(distDir, relativeFile);
    if (!existsSync(fullPath)) {
        throw new Error(`Built asset file not found: ${fullPath}`);
    }
    const content = readFileSync(fullPath);
    const rawBytes = content.byteLength;
    const gzipBytes = gzipSync(content, { level: 9 }).byteLength;
    return { path: relativeFile, rawBytes, gzipBytes };
}

export function checkBundle(rootDir = Deno.cwd()): {
    success: boolean;
    errors: string[];
} {
    const errors: string[] = [];
    const { manifestPath, manifest } = loadManifest(rootDir);
    const budget = loadBudget(rootDir);
    const distDir = resolve(rootDir, "web/dist");

    console.log("============================================================");
    console.log(" Searcher Bundle Audit & Budget Gate");
    console.log("============================================================");
    console.log(`Manifest: ${manifestPath}`);
    console.log(`Baseline SHA: ${budget.baselineSha}`);

    // 1. Locate Application Entry
    const entries = Object.entries(manifest).filter(([_, chunk]) =>
        chunk.isEntry
    );
    if (entries.length === 0) {
        errors.push("No entry chunk with 'isEntry: true' found in manifest.");
        return { success: false, errors };
    }
    if (entries.length > 1) {
        errors.push(
            `Multiple application entries found: ${
                entries.map(([k]) => k).join(", ")
            }. Expected 1.`,
        );
        return { success: false, errors };
    }

    const [entryKey, entryChunk] = entries[0];
    console.log(`\nApplication Entry: ${entryKey} -> ${entryChunk.file}`);

    // 2. Build Canonical Initial Static Graph (Transitive imports closure, excluding dynamicImports)
    const initialGraphKeys = new Set<string>();
    const queue: string[] = [entryKey];

    while (queue.length > 0) {
        const key = queue.shift()!;
        if (initialGraphKeys.has(key)) continue;
        initialGraphKeys.add(key);

        const chunk = manifest[key];
        if (chunk?.imports) {
            for (const imp of chunk.imports) {
                if (!initialGraphKeys.has(imp)) {
                    queue.push(imp);
                }
            }
        }
    }

    const initialJsFiles = new Set<string>();
    for (const key of initialGraphKeys) {
        const chunk = manifest[key];
        if (chunk?.file && chunk.file.endsWith(".js")) {
            initialJsFiles.add(chunk.file);
        }
    }

    const initialMetrics: FileMetric[] = Array.from(initialJsFiles).map((
        file,
    ) => getFileMetric(distDir, file));

    const initialRawTotal = initialMetrics.reduce(
        (sum, m) => sum + m.rawBytes,
        0,
    );
    const initialGzipTotal = initialMetrics.reduce(
        (sum, m) => sum + m.gzipBytes,
        0,
    );
    const initialRequestCount = initialMetrics.length;

    console.log("\n--- Initial Static JS Graph ---");
    for (const m of initialMetrics) {
        console.log(
            `  ${m.path.padEnd(45)} ${m.rawBytes.toString().padStart(8)} B (${
                formatKiB(m.rawBytes).padStart(10)
            }) │ gzip: ${m.gzipBytes.toString().padStart(7)} B (${
                formatKiB(m.gzipBytes).padStart(9)
            })`,
        );
    }
    console.log(
        `Total Initial JS: ${initialRawTotal} B (${
            formatKiB(initialRawTotal)
        }) raw │ ${initialGzipTotal} B (${
            formatKiB(initialGzipTotal)
        }) gzip │ ${initialRequestCount} requests`,
    );

    // 3. Validate Forbidden Initial Dependencies
    const forbiddenPatterns = [
        "src/app/AskPage",
        "src/features/ask/",
        "src/app/SettingsPage",
        "src/app/AdminPage",
        "src/design-lab/DesignLab",
        "src/app/AuthPage",
        "src/app/AccountPage",
        "src/app/TrashPage",
        "src/app/NotFoundPage",
        "src/dev/WallpaperMotionInspector",
        "WallpaperMotionInspector",
        "assistant-vendor",
        "markdown-vendor",
    ];

    for (const key of initialGraphKeys) {
        const chunk = manifest[key];
        const src = chunk?.src ?? "";
        const name = chunk?.name ?? "";
        const file = chunk?.file ?? "";

        for (const pattern of forbiddenPatterns) {
            if (
                key.includes(pattern) ||
                src.includes(pattern) ||
                name.includes(pattern) ||
                file.includes(pattern)
            ) {
                errors.push(
                    `Forbidden initial dependency found in initial static graph: key='${key}', name='${name}', file='${file}' matches forbidden pattern '${pattern}'.`,
                );
            }
        }
    }
    // Deep inspection: Scan entry chunk itself for forbidden inlined runtime symbols
    const entryMetric = getFileMetric(distDir, entryChunk.file);
    if (
        budget.maxEntryChunkRawBytes &&
        entryMetric.rawBytes > budget.maxEntryChunkRawBytes
    ) {
        errors.push(
            `Entry chunk raw size (${entryMetric.rawBytes} B) exceeds maxEntryChunkRawBytes limit (${budget.maxEntryChunkRawBytes} B). Potential inline leak.`,
        );
    }
    if (
        budget.maxEntryChunkGzipBytes &&
        entryMetric.gzipBytes > budget.maxEntryChunkGzipBytes
    ) {
        errors.push(
            `Entry chunk gzip size (${entryMetric.gzipBytes} B) exceeds maxEntryChunkGzipBytes limit (${budget.maxEntryChunkGzipBytes} B).`,
        );
    }

    const entryCode = readFileSync(resolve(distDir, entryChunk.file), "utf-8");
    const forbiddenTokens = [
        "micromark",
        "mdast-util",
        "react-markdown",
        "rehype-sanitize",
        "@assistant-ui/react",
        "assistant-stream",
        "assistant-cloud",
        "wallpaper-motion-inspector",
    ];
    for (const token of forbiddenTokens) {
        if (entryCode.includes(token)) {
            errors.push(
                `Forbidden runtime token '${token}' detected inside entry chunk '${entryChunk.file}'. Code was inlined into entry!`,
            );
        }
    }
    // 4. Trace Dynamic Route Graphs
    console.log("\n--- Dynamic Route Entries ---");
    const dynamicEntries = Object.entries(manifest).filter(([_, chunk]) =>
        chunk.isDynamicEntry || entryChunk.dynamicImports?.includes(_)
    );

    const initialFilesSet = new Set(initialMetrics.map((m) => m.path));

    for (const [routeKey, routeChunk] of dynamicEntries) {
        const routeGraphKeys = new Set<string>();
        const rQueue = [routeKey];

        while (rQueue.length > 0) {
            const k = rQueue.shift()!;
            if (routeGraphKeys.has(k)) continue;
            routeGraphKeys.add(k);

            const c = manifest[k];
            if (c?.imports) {
                for (const imp of c.imports) {
                    if (!routeGraphKeys.has(imp)) {
                        rQueue.push(imp);
                    }
                }
            }
        }

        const routeFiles = new Set<string>();
        for (const k of routeGraphKeys) {
            const c = manifest[k];
            if (c?.file && c.file.endsWith(".js")) {
                routeFiles.add(c.file);
            }
        }

        // Route-only files (excluding files already in initial entry closure)
        const routeOnlyFiles = Array.from(routeFiles).filter(
            (f) => !initialFilesSet.has(f),
        );
        const routeMetrics = routeOnlyFiles.map((f) =>
            getFileMetric(distDir, f)
        );
        const routeRaw = routeMetrics.reduce((sum, m) => sum + m.rawBytes, 0);
        const routeGzip = routeMetrics.reduce((sum, m) => sum + m.gzipBytes, 0);

        console.log(`\nRoute: ${routeKey}`);
        console.log(`  File: ${routeChunk.file}`);
        console.log(
            `  Route-only JS: ${routeRaw} B (${
                formatKiB(routeRaw)
            }) raw │ ${routeGzip} B (${
                formatKiB(routeGzip)
            }) gzip │ ${routeMetrics.length} requests`,
        );
        for (const rm of routeMetrics) {
            console.log(
                `    + ${rm.path.padEnd(43)} ${
                    rm.rawBytes.toString().padStart(7)
                } B │ gzip: ${rm.gzipBytes.toString().padStart(6)} B`,
            );
        }
    }

    // 5. Largest JS Chunks
    console.log("\n--- Largest JS Chunks in Build ---");
    const allJsFiles = new Set<string>();
    for (const chunk of Object.values(manifest)) {
        if (chunk.file && chunk.file.endsWith(".js")) {
            allJsFiles.add(chunk.file);
        }
    }
    const allMetrics = Array.from(allJsFiles).map((f) =>
        getFileMetric(distDir, f)
    );
    allMetrics.sort((a, b) => b.rawBytes - a.rawBytes);

    for (const m of allMetrics.slice(0, 8)) {
        console.log(
            `  ${m.path.padEnd(45)} ${m.rawBytes.toString().padStart(8)} B (${
                formatKiB(m.rawBytes).padStart(10)
            }) │ gzip: ${m.gzipBytes.toString().padStart(7)} B (${
                formatKiB(m.gzipBytes).padStart(9)
            })`,
        );
    }

    // 6. Budget Evaluation
    console.log(
        "\n============================================================",
    );
    console.log(" Budget Verification vs Frozen Baseline");
    console.log("============================================================");

    const rawDiff = budget.baselineInitialRawBytes - initialRawTotal;
    const rawReduction = rawDiff / budget.baselineInitialRawBytes;

    const gzipDiff = budget.baselineInitialGzipBytes - initialGzipTotal;
    const gzipReduction = gzipDiff / budget.baselineInitialGzipBytes;

    console.log(
        `Baseline Raw Bytes:  ${budget.baselineInitialRawBytes} B (${
            formatKiB(budget.baselineInitialRawBytes)
        })`,
    );
    console.log(
        `Current Initial Raw: ${initialRawTotal} B (${
            formatKiB(initialRawTotal)
        }) │ Reduction: ${formatPercent(rawReduction)}`,
    );
    console.log(
        `Baseline Gzip Bytes: ${budget.baselineInitialGzipBytes} B (${
            formatKiB(budget.baselineInitialGzipBytes)
        })`,
    );
    console.log(
        `Current Initial Gzip:${initialGzipTotal} B (${
            formatKiB(initialGzipTotal)
        }) │ Reduction: ${formatPercent(gzipReduction)}`,
    );

    // Gate 1: maxInitialRawBytes
    const rawPass = initialRawTotal <= budget.maxInitialRawBytes;
    console.log(
        `\n[Gate 1] Initial Raw <= ${budget.maxInitialRawBytes} B (${
            formatKiB(budget.maxInitialRawBytes)
        }): ` +
            (rawPass
                ? `PASS (${formatKiB(initialRawTotal)})`
                : `FAIL (${formatKiB(initialRawTotal)})`),
    );
    if (!rawPass) {
        errors.push(
            `Initial raw bytes (${initialRawTotal}) exceeded budget limit (${budget.maxInitialRawBytes}).`,
        );
    }

    // Gate 2: maxInitialGzipBytes
    const gzipPass = initialGzipTotal <= budget.maxInitialGzipBytes;
    console.log(
        `[Gate 2] Initial Gzip <= ${budget.maxInitialGzipBytes} B (${
            formatKiB(budget.maxInitialGzipBytes)
        }): ` +
            (gzipPass
                ? `PASS (${formatKiB(initialGzipTotal)})`
                : `FAIL (${formatKiB(initialGzipTotal)})`),
    );
    if (!gzipPass) {
        errors.push(
            `Initial gzip bytes (${initialGzipTotal}) exceeded budget limit (${budget.maxInitialGzipBytes}).`,
        );
    }

    // Gate 3: minGzipReductionRatio
    const reductionPass = gzipReduction >= budget.minGzipReductionRatio;
    console.log(
        `[Gate 3] Initial Gzip Reduction >= ${
            formatPercent(budget.minGzipReductionRatio)
        }: ` +
            (reductionPass
                ? `PASS (${formatPercent(gzipReduction)} reduction)`
                : `FAIL (${formatPercent(gzipReduction)} reduction)`),
    );
    if (!reductionPass) {
        errors.push(
            `Initial gzip reduction ratio (${
                formatPercent(gzipReduction)
            }) below required threshold (${
                formatPercent(budget.minGzipReductionRatio)
            }).`,
        );
    }

    // Gate 4: Forbidden dependencies
    const forbiddenPass = errors.length === 0;
    console.log(
        `[Gate 4] Forbidden Dependencies Check: ` +
            (forbiddenPass ? "PASS (clean static entry)" : "FAIL"),
    );

    console.log("============================================================");
    if (errors.length > 0) {
        console.error("\n❌ BUNDLE AUDIT FAILED:");
        for (const err of errors) {
            console.error(`  - ${err}`);
        }
        return { success: false, errors };
    }

    console.log(
        "✅ BUNDLE AUDIT PASSED: All budget and invariant gates satisfied!",
    );
    console.log(
        "============================================================\n",
    );
    return { success: true, errors: [] };
}

if (import.meta.main) {
    const result = checkBundle();
    if (!result.success) {
        Deno.exit(1);
    }
}
