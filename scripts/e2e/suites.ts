import { walk } from "@std/fs/walk";

const paginationSuites = {
    "pagination-short": ["document-zen-pagination-short"],
    "pagination-manual": ["document-zen-pagination-manual"],
    "pagination-consecutive": ["document-zen-pagination-consecutive"],
    "pagination-mixed": ["document-zen-pagination-mixed"],
} as const;

// File paths live here once. Workspace order retains the pre-#167 serial order.
export const suites = {
    workspace: [
        "workspace",
        "workspace-shell",
        "library",
        "library-apps",
        "workspace-chrome-inset",
        "launcher",
        "apps-density",
        "home-launcher-density",
        "home-app-library",
        "icon-presentation",
        "home-composition",
        "home-calm",
        "apps-session",
        "apps-interactions",
        "apps-races",
        "apps-ordering",
        "apps-ai-session",
        "workspace-contract",
        "workspace-matrix",
        "accent-contrast",
        "color-hierarchy",
    ],
    routing: ["navigation", "auth", "guest-ai-auth", "share"],
    documents: [
        "documents",
        "documents-library",
        "documents-events",
        "documents-live-preview",
        "documents-history",
        "documents-focus",
        "documents-live-editing",
        "documents-ux",
        "documents-drafts",
        "document-vertical-layout",
        ...Object.values(paginationSuites).flat(),
        "document-host-boundaries",
        "document-presentation-contracts",
    ],
    wallpaper: ["wallpaper", "wallpaper-accent"],
    bundle: [
        "bundle-loading",
        "route-style-stability",
        "omnibox-lab",
        "accent-lab",
        "pwa",
    ],
    "home-papers": [
        "home-papers-color",
        "home-papers-order",
        "home-papers-placement",
        "home-papers-persistence",
        "home-papers-tasks",
        "home-papers-inline",
        "home-papers-document",
    ],
    supplemental: [
        "ui-ownership",
        "settings-shortcuts",
        "shortcuts-documents-ask",
        "shortcuts-search",
        "omnibox-unified",
        "inline-ai-answer",
        "ask-accessibility-retry",
        "ui-feedback",
        "editable-pagination-spike",
        "markdown-editor-loading",
        "markdown-editor-spike",
    ],
} as const;

const paginationFiles = new Set<string>(Object.values(paginationSuites).flat());

// Execution partitions, not new affected business domains.
export const documentPartitions = {
    "documents-core": suites.documents.filter((name) =>
        !paginationFiles.has(name)
    ),
    ...paginationSuites,
} as const;

export type Suite =
    | keyof typeof suites
    | keyof typeof documentPartitions
    | "full"
    | "apps"
    | "layout";

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
            /^(workspace|home-launcher-|home-composition$)/.test(name)
        );
    } else if (Object.hasOwn(documentPartitions, suite)) {
        names = documentPartitions[suite as keyof typeof documentPartitions];
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
            "home-papers",
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
            "home-papers",
            "supplemental",
            "bundle",
        ],
    },
    {
        prefix: "web/src/features/markdown-editor/",
        suites: [
            "workspace",
            "documents",
            "home-papers",
            "supplemental",
            "bundle",
        ],
    },
    {
        prefix: "web/src/features/home-calm/",
        suites: ["workspace", "home-papers", "bundle"],
    },
    {
        prefix: "web/src/features/home-layouts/",
        suites: [
            "workspace",
            "documents",
            "home-papers",
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
        suites: ["routing", "documents", "home-papers"],
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

/** Pure, conservative selection; one unknown path overrides all narrow matches. */
export function selectAffected(paths: readonly string[]): AffectedSelection {
    const changed = [...new Set(paths)].sort();
    if (!changed.length) {
        return { paths: [], suites: [], files: [], reason: "No changed paths" };
    }
    const selected = new Set<DeclaredSuite>();
    for (const path of changed) {
        const owners = (Object.keys(suites) as DeclaredSuite[]).filter((
            suite,
        ) => suiteFiles(suite).includes(path));
        const mapped = affectedMappings.filter(({ prefix }) =>
            path.startsWith(prefix)
        );
        if (!owners.length && !mapped.length) {
            return {
                paths: changed,
                suites: ["full"],
                files: suiteFiles("full"),
                reason: `Unmapped/shared path requires full: ${
                    JSON.stringify(path)
                }`,
            };
        }
        for (const suite of owners) selected.add(suite);
        for (const mapping of mapped) {
            for (const suite of mapping.suites) selected.add(suite);
        }
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
