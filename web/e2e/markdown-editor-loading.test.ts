import { assert, assertEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

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

Deno.test("production browser network isolation: editor runtime lazy boundary contracts", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const tempDir = await Deno.makeTempDir({ prefix: "searcher_editor_iso_" });
    cleanup.defer(() => Deno.remove(tempDir, { recursive: true }));

    const store = openDatabase(":memory:");
    cleanup.defer(() => store.close());
    await migrateDatabase(store);

    const manifestPath = "web/dist/manifest.json";
    assert(
        await Deno.stat(manifestPath).then(() => true).catch(() => false),
        "web/dist/manifest.json must exist. Run build before running e2e isolation tests.",
    );
    const manifest: Manifest = JSON.parse(
        await Deno.readTextFile(manifestPath),
    );

    // Resolve initial static JS graph
    const entryChunk = Object.values(manifest).find((c) => c.isEntry);
    assert(entryChunk, "Manifest must contain an application entry chunk.");

    const initialKeys = new Set<string>();
    const queue = [Object.keys(manifest).find((k) => manifest[k].isEntry)!];
    while (queue.length > 0) {
        const k = queue.shift()!;
        if (initialKeys.has(k)) continue;
        initialKeys.add(k);
        const c = manifest[k];
        if (c?.imports) {
            for (const imp of c.imports) {
                if (!initialKeys.has(imp)) queue.push(imp);
            }
        }
    }

    const initialFiles = new Set<string>();
    for (const k of initialKeys) {
        const c = manifest[k];
        if (c?.file && c.file.endsWith(".js")) {
            initialFiles.add(c.file);
        }
    }

    // Locate editor and markdown chunks in manifest (asserted upfront)
    const editorVendorChunk = Object.values(manifest).find((c) =>
        c.name === "editor-vendor" || c.file.includes("editor-vendor")
    )?.file;
    assert(editorVendorChunk, "Manifest must contain editor-vendor chunk.");

    const runtimeChunk = Object.entries(manifest).find(([k, c]) =>
        k.endsWith("spikes/markdown-editor/runtime.ts") ||
        c.src?.endsWith("spikes/markdown-editor/runtime.ts")
    )?.[1]?.file;
    assert(runtimeChunk, "Manifest must contain runtime chunk.");

    const spikeHarnessChunk = Object.entries(manifest).find(([k, c]) =>
        k.includes("MarkdownEditorSpike") ||
        (c.src && c.src.includes("MarkdownEditorSpike"))
    )?.[1]?.file;
    assert(spikeHarnessChunk, "Manifest must contain spike harness chunk.");

    const markdownVendorChunk = Object.values(manifest).find((c) =>
        c.name === "markdown-vendor" || c.file.includes("markdown-vendor")
    )?.file;
    assert(markdownVendorChunk, "Manifest must contain markdown-vendor chunk.");

    // Upfront Manifest Invariant 1: editor-vendor and runtime must NOT be in initial static closure
    assert(
        !initialFiles.has(editorVendorChunk),
        `Invariant violation: editor-vendor chunk (${editorVendorChunk}) leaked into initial static closure!`,
    );
    assert(
        !initialFiles.has(runtimeChunk),
        `Invariant violation: runtime chunk (${runtimeChunk}) leaked into initial static closure!`,
    );

    // Upfront Manifest Invariant 2: markdown-vendor must NOT statically import editor-vendor
    const markdownVendorEntry = Object.entries(manifest).find(([k, c]) =>
        k.includes("markdown-vendor") || c.name === "markdown-vendor"
    );
    assert(markdownVendorEntry, "markdown-vendor manifest entry required.");
    const mvImports = markdownVendorEntry[1].imports ?? [];
    assert(
        !mvImports.some((imp) => manifest[imp]?.file === editorVendorChunk),
        "Invariant violation: markdown-vendor statically imports editor-vendor!",
    );

    const server = Deno.serve(
        { hostname: "127.0.0.1", port: 0, onListen() {} },
        (request) => app.fetch(request),
    );
    cleanup.defer(() => server.shutdown());

    const origin = `http://127.0.0.1:${server.addr.port}`;
    const auth = new AuthService({ store, origin });
    const app = createApp({
        store,
        auth,
        origin,
        settings: new SystemSettingsStore(":memory:"),
        wallpaper: new WallpaperService(`${tempDir}/wallpapers`),
        icons: new WebAppIconService(`${tempDir}/icons`),
    });

    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    async function createIsolatedPage(): Promise<{
        page: Page;
        close: () => Promise<void>;
    }> {
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();
        const client = await context.newCDPSession(page);
        await client.send("Network.setCacheDisabled", { cacheDisabled: true });
        return {
            page,
            close: async () => {
                await client.detach();
                await context.close();
            },
        };
    }

    // Scenario 1: Anonymous Home initial load
    await t.step(
        "Scenario 1: Anonymous Home visit never requests editor-vendor or runtime",
        async () => {
            const { page, close } = await createIsolatedPage();
            try {
                const requestedJs: string[] = [];
                page.on("request", (req) => {
                    const url = req.url();
                    if (
                        url.startsWith(origin + "/assets/") &&
                        url.endsWith(".js")
                    ) {
                        requestedJs.push(url.replace(origin + "/", ""));
                    }
                });

                const res = await page.goto(origin + "/");
                assertEquals(res?.status(), 200);
                await page.locator("main").waitFor({ state: "visible" });

                assert(
                    !requestedJs.includes(editorVendorChunk),
                    `Anonymous Home unexpectedly requested editor-vendor: ${editorVendorChunk}`,
                );
                assert(
                    !requestedJs.includes(runtimeChunk),
                    `Anonymous Home unexpectedly requested editor runtime: ${runtimeChunk}`,
                );
            } finally {
                await close();
            }
        },
    );

    // Scenario 2: Authenticated Home, Apps workspace, Notes root & baseline NoteEditor
    await t.step(
        "Scenario 2: Authenticated Home, Apps workspace, Notes root and baseline NoteEditor never request editor runtime",
        async () => {
            const { page, close } = await createIsolatedPage();
            try {
                const requestedJs: string[] = [];
                // Install request interceptor before ANY navigation
                page.on("request", (req) => {
                    const url = req.url();
                    if (
                        url.startsWith(origin + "/assets/") &&
                        url.endsWith(".js")
                    ) {
                        requestedJs.push(url.replace(origin + "/", ""));
                    }
                });

                // 1. Authenticate via registration flow
                await page.goto(origin + "/register");
                await page.locator("#auth-username").fill("editor_iso_tester");
                await page.locator("#auth-display-name").fill(
                    "Editor Isolation Tester",
                );
                await page.locator("#auth-password").fill(
                    "IsoPass-2026-Secure!",
                );
                await page.locator('form button[type="submit"]').click();
                await page.waitForURL(origin + "/");
                await page.locator("main").waitFor({ state: "visible" });

                // 2. Open Apps workspace and assert panel visible
                const appsBtn = page.locator('button[data-workspace="apps"]')
                    .first();
                await appsBtn.waitFor({ state: "visible" });
                await appsBtn.click();
                const workspacePanel = page.locator(".workspace-panel").first();
                await workspacePanel.waitFor({ state: "visible" });

                // 3. Switch to Notes workspace via panel switcher
                const notesSwitcher = page.locator(
                    '.workspace-panel button[data-workspace="notes"]',
                ).first();
                await notesSwitcher.waitFor({ state: "visible" });
                await notesSwitcher.click();
                await page.waitForTimeout(300);

                // 4. Open baseline NoteEditor and assert textarea and toolbar visible
                const newNoteBtn = page.locator(
                    '.workspace-panel button:has-text("新建便签")',
                ).first();
                await newNoteBtn.waitFor({ state: "visible" });
                await newNoteBtn.click();
                const noteTextarea = page.locator(
                    'textarea[id^="note-editor-"], textarea[placeholder="写下你的想法…"], .note-editor-textarea, textarea',
                ).first();
                await noteTextarea.waitFor({ state: "visible" });
                await noteTextarea.fill(
                    "测试便签内容，用于验证基础 NoteEditor 渲染与隔离。",
                );

                // Assert NoteMarkdownToolbar is present
                const noteToolbar = page.locator(
                    '.note-markdown-toolbar, [role="toolbar"]',
                ).first();
                await noteToolbar.waitFor({ state: "visible" });

                // 5. Strict invariant: Across Auth, Home, Apps, Notes root, and NoteEditor,
                // neither editor-vendor nor runtime was EVER requested!
                assert(
                    !requestedJs.includes(editorVendorChunk),
                    `Eager user journey unexpectedly requested editor-vendor: ${editorVendorChunk}`,
                );
                assert(
                    !requestedJs.includes(runtimeChunk),
                    `Eager user journey unexpectedly requested editor runtime: ${runtimeChunk}`,
                );
            } finally {
                await close();
            }
        },
    );

    // Scenario 3: Lightweight /design-lab/markdown-editor before clicking "打开编辑器"
    await t.step(
        "Scenario 3: /design-lab/markdown-editor route shell loads without editor runtime",
        async () => {
            const { page, close } = await createIsolatedPage();
            try {
                const requestedJs: string[] = [];
                page.on("request", (req) => {
                    const url = req.url();
                    if (
                        url.startsWith(origin + "/assets/") &&
                        url.endsWith(".js")
                    ) {
                        requestedJs.push(url.replace(origin + "/", ""));
                    }
                });

                const res = await page.goto(
                    origin + "/design-lab/markdown-editor",
                );
                assertEquals(res?.status(), 200);
                await page.getByRole("button", {
                    name: "打开编辑器",
                    exact: true,
                }).waitFor({ state: "visible" });

                // Harness route shell is loaded
                assert(
                    requestedJs.includes(spikeHarnessChunk),
                    `Expected spike harness chunk (${spikeHarnessChunk}) to be loaded for route.`,
                );

                // BUT editor-vendor and runtime MUST NOT be requested before clicking
                assert(
                    !requestedJs.includes(editorVendorChunk),
                    `Pre-open spike shell unexpectedly requested editor-vendor: ${editorVendorChunk}`,
                );
                assert(
                    !requestedJs.includes(runtimeChunk),
                    `Pre-open spike shell unexpectedly requested runtime: ${runtimeChunk}`,
                );
            } finally {
                await close();
            }
        },
    );

    // Scenario 4: Clicking "打开编辑器" dynamically loads runtime and editor-vendor
    await t.step(
        "Scenario 4: Clicking '打开编辑器' on demand requests runtime and editor-vendor",
        async () => {
            const { page, close } = await createIsolatedPage();
            try {
                await page.goto(origin + "/design-lab/markdown-editor");
                const openBtn = page.getByRole("button", {
                    name: "打开编辑器",
                    exact: true,
                });
                await openBtn.waitFor({ state: "visible" });

                const clickJsRequests: string[] = [];
                page.on("request", (req) => {
                    const url = req.url();
                    if (
                        url.startsWith(origin + "/assets/") &&
                        url.endsWith(".js")
                    ) {
                        clickJsRequests.push(url.replace(origin + "/", ""));
                    }
                });

                // Click to open editor
                await openBtn.click();

                // Wait for editor surface to mount and status to show ready
                const surface = page.locator('[aria-label="实例 A正文"]');
                await surface.waitFor({ state: "visible" });
                await page.locator('p[role="status"]').filter({
                    hasText: "编辑器就绪",
                }).waitFor({ state: "visible" });

                // Both runtime and editor-vendor MUST be requested upon user action
                assert(
                    clickJsRequests.includes(editorVendorChunk),
                    `Clicking '打开编辑器' failed to load editor-vendor chunk: ${editorVendorChunk}`,
                );
                assert(
                    clickJsRequests.includes(runtimeChunk),
                    `Clicking '打开编辑器' failed to load runtime chunk: ${runtimeChunk}`,
                );
            } finally {
                await close();
            }
        },
    );
});
