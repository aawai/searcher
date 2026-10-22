import { walk } from "@std/fs/walk";

// File paths live here once. Workspace order retains the pre-#167 serial order.
export const suites = {
    workspace: [
        "workspace",
        "workspace-shell",
        "workspace-chrome-inset",
        "launcher",
        "apps-density",
        "home-launcher-density",
        "apps-session",
        "apps-interactions",
        "apps-races",
        "apps-ordering",
        "apps-ai-session",
        "notes-workspace",
        "notes-live-preview",
        "notes-live-editing",
        "notes-shared-events",
        "notes-focus",
        "notes-ux",
        "notes-history",
        "notes-drafts",
        "notes-menu",
        "notes-color",
        "home-notes-order",
        "zen-inline-notes",
        "workspace-contract",
        "workspace-matrix",
        "accent-contrast",
    ],
    routing: ["navigation", "auth", "guest-ai-auth"],
    documents: [
        "documents",
        "document-vertical-layout",
        "document-zen-pagination-stability",
        "document-host-boundaries",
        "document-presentation-contracts",
    ],
    wallpaper: ["wallpaper"],
    bundle: ["bundle-loading", "route-style-stability"],
    "home-notes": [
        "home-notes-order",
        "home-notes-persistence",
        "zen-inline-notes",
    ],
    supplemental: [
        "ui-ownership",
        "settings-shortcuts",
        "shortcuts-notes-ask",
        "shortcuts-search",
        "ask-accessibility-retry",
        "ui-feedback",
        "editable-pagination-spike",
        "markdown-editor-loading",
        "markdown-editor-spike",
    ],
} as const;

export type Suite = keyof typeof suites | "full" | "apps" | "notes" | "layout";

export function suiteFiles(suite: Suite): string[] {
    let names: readonly string[];
    if (suite === "full") {
        names = [...new Set(Object.values(suites).flat())];
    } else if (suite === "apps") {
        names = suites.workspace.filter((name) =>
            /^(apps-|launcher$|home-launcher-)/.test(name)
        );
    } else if (suite === "notes") {
        names = suites.workspace.filter((name) =>
            /^(notes-|home-notes-)/.test(name)
        );
    } else if (suite === "layout") {
        names = suites.workspace.filter((name) =>
            /^(workspace|home-launcher-)/.test(name)
        );
    } else {
        names = suites[suite];
    }
    return names.map((name) => `web/e2e/${name}.test.ts`);
}

export async function checkSuites(): Promise<void> {
    const declared = new Set(suiteFiles("full"));
    const actual = new Set<string>();
    for await (const entry of walk("web/e2e", { includeDirs: false })) {
        if (entry.isFile && entry.name.endsWith(".test.ts")) {
            actual.add(entry.path);
        }
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
}
