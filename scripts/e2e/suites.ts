import { walk } from "@std/fs/walk";

const paginationSuites = {
    "pagination-mixed": ["document-zen-pagination-mixed"],
} as const;

// File paths live here once. Deno `--parallel` starts files in argument order,
// so every suite lists files longest-first (per-file JUnit time, jobs=4,
// 2026-11-03): long files start early instead of extending the tail. Order
// only schedules; it never changes coverage, and files share no state.
export const suites = {
    workspace: [
        "dock",
        "library-windows",
        "apps-session",
        "home-app-library",
        "workspace-shell",
        "desktop-windows",
        "launcher",
        "library",
        "ai-window",
        "apps-pinning",
        "workspace",
        "library-apps",
        "apps-interactions",
        "apps-ai-session",
        "apps-races",
        "apps-ordering",
        "focus-recovery",
    ],
    routing: ["navigation", "auth", "share", "guest-ai-auth"],
    documents: [
        "document-vertical-layout",
        "documents-library",
        "documents-drafts",
        "document-host-boundaries",
        "document-presentation-contracts",
        ...Object.values(paginationSuites).flat(),
        "documents",
        "documents-tree",
        "documents-tree-dnd",
        "documents-window-prefs",
        "documents-focus",
        "documents-history",
        "documents-live-editing",
        "documents-events",
        "documents-live-preview",
        "documents-ux",
    ],
    wallpaper: ["wallpaper", "wallpaper-accent"],
    bundle: [
        "pwa",
        "bundle-loading",
    ],
    "home-masthead": [
        "home-masthead-tasks",
        "home-masthead-order",
        "home-masthead-document",
    ],
    supplemental: [
        "inline-ai-answer",
        "ui-feedback",
        "omnibox-unified",
        "shortcuts-documents-ask",
        "ask-accessibility-retry",
        "settings-shortcuts",
        "shortcuts-search",
        "markdown-editor-loading",
    ],
} as const;

const paginationFiles = new Set<string>(Object.values(paginationSuites).flat());

const documentsShardA = new Set<string>([
    "document-vertical-layout",
    "documents-window-prefs",
    "documents-tree",
    "document-host-boundaries",
    "documents-focus",
    "documents-ux",
]);

// Execution partitions, not new affected business domains.
export const documentPartitions = {
    "documents-a": suites.documents.filter((name) =>
        !paginationFiles.has(name) && documentsShardA.has(name)
    ),
    "documents-b": suites.documents.filter((name) =>
        !paginationFiles.has(name) && !documentsShardA.has(name)
    ),
    ...paginationSuites,
} as const;

// Workspace CI shards, balanced by per-file JUnit time (~233s summed per shard;
// 124s wall for B at jobs=2 locally). B is listed; A is the remainder.
const workspaceShardB = new Set<string>([
    "apps-session",
    "workspace-shell",
    "desktop-windows",
    "ai-window",
    "apps-pinning",
    "apps-interactions",
    "apps-ai-session",
]);

export const workspacePartitions = {
    "workspace-a": suites.workspace.filter((name) =>
        !workspaceShardB.has(name)
    ),
    "workspace-b": suites.workspace.filter((name) => workspaceShardB.has(name)),
} as const;

const partitions: Record<string, readonly string[]> = {
    ...documentPartitions,
    ...workspacePartitions,
};

export type Suite =
    | keyof typeof suites
    | keyof typeof documentPartitions
    | keyof typeof workspacePartitions
    | "full"
    | "apps"
    | "layout";

export function isPartition(name: string): boolean {
    return Object.hasOwn(partitions, name);
}

export function suiteFiles(suite: Suite): string[] {
    let names: readonly string[];
    if (suite === "full") {
        names = [...new Set(Object.values(suites).flat())];
    } else if (suite === "apps") {
        names = suites.workspace.filter((name) =>
            /^(apps-|launcher$|home-launcher-)/.test(name)
        );
    } else if (suite === "layout") {
        names = suites.workspace.filter((name) =>
            /^(workspace|home-launcher-)/.test(name)
        );
    } else if (isPartition(suite)) {
        names = partitions[suite];
    } else {
        names = suites[suite as keyof typeof suites];
    }
    return names.map((name) => `web/e2e/${name}.test.ts`);
}

type DeclaredSuite = keyof typeof suites;

// Prefixes are repository-relative directories (trailing slash is significant).
// Shared code/configuration deliberately has no narrow mapping: it selects full.
export const affectedMappings: readonly {
    prefix: string;
    suites: readonly DeclaredSuite[];
}[] = [
    {
        prefix: "web/src/features/library/",
        suites: [
            "workspace",
            "routing",
            "documents",
            "bundle",
            "home-masthead",
            "supplemental",
        ],
    },
    {
        prefix: "web/src/features/workspace/",
        suites: ["workspace", "documents", "bundle", "supplemental"],
    },
    {
        prefix: "web/src/features/app-library/",
        suites: ["workspace", "routing", "bundle", "supplemental"],
    },
    {
        prefix: "web/src/features/documents/",
        suites: [
            "workspace",
            "documents",
            "home-masthead",
            "supplemental",
            "bundle",
        ],
    },
    {
        prefix: "web/src/features/markdown-editor/",
        suites: [
            "workspace",
            "documents",
            "home-masthead",
            "supplemental",
            "bundle",
        ],
    },
    {
        prefix: "web/src/features/home-calm/",
        suites: ["workspace", "home-masthead", "bundle"],
    },
    {
        prefix: "web/src/features/home-masthead/",
        suites: [
            "workspace",
            "documents",
            "home-masthead",
            "supplemental",
            "bundle",
        ],
    },
    {
        prefix: "web/src/features/home-layouts/",
        suites: [
            "workspace",
            "documents",
            "home-masthead",
            "supplemental",
            "bundle",
        ],
    },
    {
        prefix: "web/src/features/omnibox/",
        suites: ["workspace", "routing", "supplemental", "bundle"],
    },
    {
        prefix: "web/src/features/ask/",
        suites: ["workspace", "routing", "supplemental", "bundle"],
    },
    {
        prefix: "web/src/features/inline-ai/",
        suites: ["workspace", "routing", "supplemental", "bundle"],
    },
    {
        prefix: "web/src/features/shortcuts/",
        suites: ["workspace", "documents", "supplemental"],
    },
    {
        prefix: "web/src/features/share/",
        suites: ["routing", "documents", "home-masthead"],
    },
    {
        prefix: "web/src/components/wallpaper/",
        suites: ["wallpaper", "workspace"],
    },
];

export interface AffectedSelection {
    paths: string[];
    suites: Suite[];
    files: string[];
    reason: string;
}

/** Documentation locations do not feed the production build or browser E2E. */
function isE2eIndependentDocument(path: string): boolean {
    return path === "CHANGELOG.md" || path === "README.md" ||
        path === "AGENTS.md" ||
        path === "scripts/e2e/README.md" ||
        path === "scripts/e2e/BENCHMARKS.md" ||
        (path.startsWith("docs/") && path.endsWith(".md"));
}

/** Pure, conservative selection; one unknown path overrides all narrow matches. */
export function selectAffected(paths: readonly string[]): AffectedSelection {
    const changed = [...new Set(paths)].sort();
    if (!changed.length) {
        return { paths: [], suites: [], files: [], reason: "No changed paths" };
    }
    if (changed.every(isE2eIndependentDocument)) {
        return {
            paths: changed,
            suites: [],
            files: [],
            reason: "Only E2E-independent documentation changed",
        };
    }
    const selected = new Set<DeclaredSuite>();
    const unmapped: string[] = [];
    for (const path of changed) {
        if (isE2eIndependentDocument(path)) continue;
        const owners = (Object.keys(suites) as DeclaredSuite[]).filter((
            suite,
        ) => suiteFiles(suite).includes(path));
        const mapped = affectedMappings.filter(({ prefix }) =>
            path.startsWith(prefix)
        );
        if (!owners.length && !mapped.length) {
            unmapped.push(path);
            continue;
        }
        for (const suite of owners) selected.add(suite);
        for (const mapping of mapped) {
            for (const suite of mapping.suites) selected.add(suite);
        }
    }
    if (unmapped.length) {
        return {
            paths: changed,
            suites: ["full"],
            files: suiteFiles("full"),
            reason: `Unmapped/shared paths require full: ${
                JSON.stringify(unmapped)
            }`,
        };
    }
    const ordered = (Object.keys(suites) as DeclaredSuite[]).filter((suite) =>
        selected.has(suite)
    );
    return {
        paths: changed,
        suites: ordered,
        files: [...new Set(ordered.flatMap(suiteFiles))],
        reason: "Mapped changed paths and direct E2E owners",
    };
}

const FULL_EXECUTION_SHARDS: readonly Suite[] = [
    "workspace-a",
    "workspace-b",
    "documents-a",
    "documents-b",
    "pagination-mixed",
    "routing",
    "supplemental",
    "wallpaper",
    "home-masthead",
    "bundle",
];

/** Expands selected affected suites into balanced CI execution shards. */
export function expandExecutionShards(selected: readonly Suite[]): Suite[] {
    if (!selected.length) return [];
    if (selected.includes("full")) return [...FULL_EXECUTION_SHARDS];
    const shards: Suite[] = [];
    const seen = new Set<Suite>();
    const push = (suite: Suite) => {
        if (!seen.has(suite)) {
            seen.add(suite);
            shards.push(suite);
        }
    };
    for (const suite of selected) {
        if (suite === "workspace") {
            push("workspace-a");
            push("workspace-b");
        } else if (suite === "documents") {
            push("documents-a");
            push("documents-b");
            push("pagination-mixed");
        } else {
            push(suite);
        }
    }
    return shards;
}

function checkAffectedMappings(): void {
    const prefixes = new Set<string>();
    const reachable = new Set<string>();
    for (const mapping of affectedMappings) {
        if (
            !mapping.prefix || !mapping.prefix.endsWith("/") ||
            prefixes.has(mapping.prefix)
        ) {
            throw new Error(
                `Invalid or duplicate affected prefix: ${mapping.prefix}`,
            );
        }
        prefixes.add(mapping.prefix);
        if (!mapping.suites.length) {
            throw new Error(`Empty affected mapping: ${mapping.prefix}`);
        }
        for (const suite of mapping.suites) {
            if (!Object.hasOwn(suites, suite)) {
                throw new Error(`Unknown affected suite: ${suite}`);
            }
            reachable.add(suite);
        }
    }
    for (const suite of Object.keys(suites)) {
        if (!reachable.has(suite)) {
            throw new Error(`Unreachable affected suite: ${suite}`);
        }
    }
}

/** The single Chromium entry; it applies `run.ts --timeout`. */
const BROWSER_ENTRY = "web/e2e/helpers/browser.ts";
const DIRECT_CHROMIUM =
    /import\s*\{[^}]*\bchromium\b[^}]*\}\s*from\s*["']playwright["']/;

export async function checkSuites(): Promise<void> {
    checkAffectedMappings();
    const declared = new Set(suiteFiles("full"));
    const actual = new Set<string>();
    const directChromium: string[] = [];
    for await (const entry of walk("web/e2e", { includeDirs: false })) {
        if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
        if (entry.name.endsWith(".test.ts")) actual.add(entry.path);
        if (entry.path === BROWSER_ENTRY) continue;
        const source = await Deno.readTextFile(entry.path);
        if (DIRECT_CHROMIUM.test(source)) directChromium.push(entry.path);
    }
    const missing = [...actual].filter((file) => !declared.has(file));
    const stale = [...declared].filter((file) => !actual.has(file));
    for (const [name, files] of Object.entries(suites)) {
        if (files.length !== new Set(files).size) {
            throw new Error(`Duplicate E2E files in ${name}`);
        }
    }
    if (missing.length || stale.length) {
        throw new Error(
            `E2E manifest mismatch. Unlisted: ${
                missing.join(", ") || "none"
            }; missing on disk: ${
                stale.join(", ") || "none"
            }. Update scripts/e2e/suites.ts.`,
        );
    }
    if (directChromium.length) {
        throw new Error(
            `Import chromium from ${BROWSER_ENTRY}, not "playwright", so run.ts --timeout applies: ${
                directChromium.join(", ")
            }`,
        );
    }
}
