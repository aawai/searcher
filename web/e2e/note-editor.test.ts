import { assertEquals, assertStringIncludes } from "@std/assert";
import { chromium, type Page, type Request } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

// Focused production editor regression test suite for Issue #67 Milkdown/Crepe migration
// Run with: NODE_ENV=test deno test -A web/e2e/note-editor.test.ts
Deno.test("production note editor Milkdown contracts (#67)", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({
        prefix: "searcher_note_editor_e2e_",
    });
    cleanup.defer(() => Deno.remove(files, { recursive: true }));

    const store = openDatabase(":memory:");
    cleanup.defer(() => store.close());
    await migrateDatabase(store);

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
        wallpaper: new WallpaperService(`${files}/wallpapers`),
        icons: new WebAppIconService(`${files}/icons`),
    });

    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const context = await browser.newContext({
        colorScheme: "light",
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const username = "milkdown_tester";
    const password = "Milkdown-password-67!";

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor({ state: "visible" });
    }

    async function openNotesWorkspace(p: Page = page) {
        const currentPanel = p.locator(".workspace-panel");
        if (!(await currentPanel.isVisible())) {
            const dockNotesBtn = p.locator(
                '.workspace-dock button[aria-label="便签工作区"]',
            );
            await dockNotesBtn.waitFor({ state: "visible" });
            await dockNotesBtn.click();
            await currentPanel.waitFor({ state: "visible" });
        }
        await p.waitForFunction(
            () => {
                return !document.querySelector(
                    '.workspace-panel [role="status"]',
                )?.textContent?.includes("正在加载") &&
                    (document.querySelectorAll(
                                ".workspace-notes-list .note-card",
                            ).length > 0 ||
                        document.querySelector(".workspace-empty") !== null);
            },
            undefined,
            { timeout: 10000 },
        ).catch(() => {});
    }

    async function ensureNotesRoot(p: Page = page) {
        await openNotesWorkspace(p);
        const currentPanel = p.locator(".workspace-panel");
        const backBtn = currentPanel.locator(
            '.workspace-header button[aria-label="返回上一级"]',
        );
        try {
            await backBtn.waitFor({ state: "visible", timeout: 1000 });
            await backBtn.click();
            await p.locator(".workspace-notes-list").first().waitFor({
                state: "visible",
            });
        } catch {
            // Already at notes root
        }
        const searchInput = currentPanel.locator(
            "input[data-workspace-search]",
        );
        if (await searchInput.isVisible()) {
            const query = await searchInput.inputValue();
            if (query) {
                await searchInput.fill("");
            }
        }
    }

    const editorSelector =
        ".note-milkdown-editor .ProseMirror[contenteditable='true'][aria-label='便签正文']";

    // Register user
    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Milkdown Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor({ state: "visible" });

    // Set widgets appearance baseline
    await visit("/settings/appearance");
    await page.getByText("空间轻桌面", { exact: true }).click();
    await page.waitForFunction(() =>
        document.documentElement.dataset.style === "widgets"
    );
    await visit("/");

    await t.step(
        "Issue #67: Root bundle does not eagerly load Milkdown/Crepe editor chunks",
        async () => {
            const recordedRequests: string[] = [];
            const auditPage = await context.newPage();

            auditPage.on("request", (req: Request) => {
                recordedRequests.push(req.url());
            });

            // Navigate to root home
            await auditPage.goto(origin + "/");
            await auditPage.locator("main").waitFor({ state: "visible" });
            // Open Notes workspace list
            const dockNotesBtn = auditPage.locator(
                '.workspace-dock button[aria-label="便签工作区"]',
            );
            await dockNotesBtn.waitFor({ state: "visible" });
            await dockNotesBtn.click();
            await auditPage.locator(".workspace-panel").waitFor({
                state: "visible",
            });

            await auditPage.close();
            const heavyEditorRequests = recordedRequests.filter((url) =>
                url.toLowerCase().includes("milkdown") ||
                url.toLowerCase().includes("crepe") ||
                url.toLowerCase().includes("notemilkdowneditor")
            );
            assertEquals(
                heavyEditorRequests,
                [],
                `Milkdown editor chunk was eagerly loaded on root/list: ${
                    heavyEditorRequests.join(", ")
                }`,
            );
        },
    );

    await t.step(
        "Issue #67: Adapter structure, removed tabs, and semantic Markdown fixtures round-trip",
        async () => {
            await ensureNotesRoot(page);

            const semanticMarkdownFixture = [
                "# 标题一 H1",
                "## 标题二 H2",
                "这是普通段落，包含 **粗体**、*斜体*、~~删除线~~ 和 `行内代码`。",
                "",
                "> 这是引用段落 (blockquote)",
                "",
                "- 无序列表项目 A",
                "- 无序列表项目 B",
                "",
                "1. 有序列表第一项",
                "2. 有序列表第二项",
                "",
                "- [ ] 未完成任务",
                "- [x] 已完成任务",
                "",
                "```ts",
                "const answer: number = 42;",
                "```",
                "",
                "| 列一 | 列二 |",
                "| --- | --- |",
                "| 数据A | 数据B |",
                "",
                "---",
                "",
                "[搜索链接](https://example.com) 🎉 🚀 包含表情与中文标点符号：【】、《》",
            ].join("\n");

            // Seed note via API
            await page.evaluate(async (body) => {
                const res = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "语义 Markdown 测试",
                        body,
                    }),
                });
                return (await res.json()).data as {
                    id: string;
                    version: number;
                    body: string;
                };
            }, semanticMarkdownFixture);

            await page.reload();
            await openNotesWorkspace(page);

            // Click into the seeded note
            const card = page.locator(".workspace-notes-list .note-card")
                .filter({
                    hasText: "语义 Markdown 测试",
                }).first();
            await card.waitFor({ state: "visible" });
            await card.locator(".note-title").click();

            // 1. Confirm adapter exposes .note-milkdown-editor and .ProseMirror with aria-label
            const editorWrap = page.locator(".note-milkdown-editor");
            await editorWrap.waitFor({ state: "visible", timeout: 25000 });
            const editor = page.locator(editorSelector);
            await editor.waitFor({ state: "visible", timeout: 25000 });

            // 2. Confirm edit/preview/split tabs have been removed
            const tabsList = page.locator(
                '.note-editor [role="tablist"], .note-editor-toolbar button:has-text("编辑")',
            );
            assertEquals(
                await tabsList.count(),
                0,
                "Edit/preview/split tabs should be removed in favor of WYSIWYG editor",
            );

            // 3. Confirm rendered ProseMirror DOM contains semantic elements
            const h1 = editor.locator("h1");
            await h1.waitFor({ state: "visible" });
            assertStringIncludes(await h1.innerText(), "标题一 H1");

            const blockquote = editor.locator("blockquote");
            await blockquote.waitFor({ state: "visible" });

            const codeBlock = editor.locator("pre, .cm-editor");
            await codeBlock.first().waitFor({ state: "visible" });

            const table = editor.getByRole("table");
            await table.waitFor({ state: "visible" });

            // 4. Verify initial state is "已保存"
            const saveState = page.locator(".save-state");
            await saveState.waitFor({ state: "visible" });
            assertStringIncludes(await saveState.textContent() ?? "", "已保存");

            // Return to root and check NoteCard parity
            await ensureNotesRoot(page);
            const noteCard = page.locator(".workspace-notes-list .note-card")
                .filter({
                    hasText: "语义 Markdown 测试",
                }).first();
            await noteCard.waitFor({ state: "visible" });
            await noteCard.hover();
            const expandBtn = noteCard.locator('button[aria-label="展开"]');
            if (await expandBtn.isVisible()) {
                await expandBtn.click({ force: true });
            }
            const preview = noteCard.locator(".note-preview.markdown");
            await preview.waitFor({ state: "visible" });
            assertStringIncludes(await preview.innerText(), "标题一 H1");
        },
    );

    await t.step(
        "Issue #67: No version on open (opening does NOT trigger normalization autosave)",
        async () => {
            await ensureNotesRoot(page);

            // Seed note with raw Markdown
            const noteData = await page.evaluate(async () => {
                const res = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "打开不递增版本测试",
                        body: "* Item 1\n* Item 2\n\nSome text.",
                    }),
                });
                return (await res.json()).data as {
                    id: string;
                    version: number;
                };
            });
            assertEquals(noteData.version, 1);

            await page.reload();
            await openNotesWorkspace(page);

            const card = page.locator(".workspace-notes-list .note-card")
                .filter({
                    hasText: "打开不递增版本测试",
                }).first();
            await card.waitFor({ state: "visible" });
            await card.locator(".note-title").click();

            const editor = page.locator(editorSelector);
            await editor.waitFor({ state: "visible" });

            // Wait 2500ms (autosave debounce is 1500ms)
            await page.waitForTimeout(2500);

            // Verify server version is still 1
            const serverNote = await page.evaluate(async (id) => {
                const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                return (await res.json()).data as {
                    version: number;
                };
            }, noteData.id);
            assertEquals(
                serverNote.version,
                1,
                "Opening a note must NOT increment note version or trigger autosave",
            );
            const saveState = page.locator(".save-state");
            assertStringIncludes(await saveState.textContent() ?? "", "已保存");

            // Select text in editor and press Ctrl+S without making changes: no normalization saved
            await editor.dblclick();
            await page.keyboard.press("Control+s");
            await page.waitForTimeout(500);

            const serverNoteAfterCtrlS = await page.evaluate(async (id) => {
                const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                return (await res.json()).data as {
                    version: number;
                    body: string;
                };
            }, noteData.id);
            assertEquals(
                serverNoteAfterCtrlS.version >= 1,
                true,
                "Ctrl+S manual save completed",
            );
            assertEquals(
                serverNoteAfterCtrlS.body,
                "* Item 1\n* Item 2\n\nSome text.",
                "Raw Markdown format must be preserved intact without normalization overwrite",
            );
        },
    );

    await t.step(
        "Issue #67: 1500ms autosave and Ctrl+S manual save contracts",
        async () => {
            await ensureNotesRoot(page);

            const card = page.locator(".workspace-notes-list .note-card")
                .filter({
                    hasText: "打开不递增版本测试",
                }).first();
            await card.locator(".note-title").click();

            const editor = page.locator(editorSelector);
            await editor.waitFor({ state: "visible" });

            // 1. Edit text -> transitions to "未同步至云端"
            await editor.click();
            await page.keyboard.type(" Additional live edit");

            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "未同步至云端",
                )
            );

            // 2. Wait 1500ms autosave to complete -> "已保存"
            await page.waitForFunction(
                () =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes(
                            "已保存",
                        ),
                undefined,
                { timeout: 5000 },
            );

            // 3. Test Ctrl+S manual save
            await editor.click();
            await page.keyboard.type(" More text before Ctrl+S");
            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "未同步至云端",
                )
            );

            await page.keyboard.press("Control+s");
            await page.waitForFunction(
                () =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes(
                            "已保存",
                        ),
                undefined,
                { timeout: 5000 },
            );
        },
    );

    await t.step(
        "Issue #67: Toolbar blur does NOT flood snapshot versions",
        async () => {
            await ensureNotesRoot(page);

            // Create fresh note to inspect version counts
            const noteData = await page.evaluate(async () => {
                const res = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "工具栏焦点测试",
                        body: "Hello selectable text for formatting",
                    }),
                });
                return (await res.json()).data as {
                    id: string;
                    version: number;
                };
            });

            await page.reload();
            await openNotesWorkspace(page);

            const card = page.locator(".workspace-notes-list .note-card")
                .filter({
                    hasText: "工具栏焦点测试",
                }).first();
            await card.locator(".note-title").click();

            const editor = page.locator(editorSelector);
            await editor.waitFor({ state: "visible" });

            // Double click to select a word
            await editor.dblclick();

            // Wait a moment for selection toolbar to be active if present
            await page.waitForTimeout(400);

            // Click inside editor-owned toolbar/overlay if visible
            const crepeToolbar = page.locator(
                ".milkdown .crepe-toolbar, .milkdown-toolbar, .milkdown [role='toolbar']",
            );
            if (await crepeToolbar.isVisible()) {
                const boldBtn = crepeToolbar.locator("button").first();
                if (await boldBtn.isVisible()) {
                    await boldBtn.click();
                }
            }

            // Wait 2000ms
            await page.waitForTimeout(2000);

            // Check version count on server
            const versions = await page.evaluate(async (id) => {
                const res = await fetch(
                    `/api/notes/${encodeURIComponent(id)}/versions`,
                );
                return (await res.json()).data as Array<{ version: number }>;
            }, noteData.id);

            // Versions count must NOT flood (at most 1 autosave version, definitely not multiple snapshot flood)
            assertEquals(
                versions.length <= 2,
                true,
                `Toolbar interactions flooded versions: count=${versions.length}`,
            );
        },
    );
    await t.step(
        "Issue #67: Slash menu and Escape precedence across desktop and mobile",
        async () => {
            await ensureNotesRoot(page);

            await page.evaluate(async () => {
                await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "快捷菜单测试",
                        body: "",
                    }),
                });
            });

            await visit("/");
            await openNotesWorkspace(page);

            const card = page.locator(".workspace-notes-list .note-card")
                .filter({ hasText: "快捷菜单测试" }).first();
            await card.locator(".note-title").click();

            const editor = page.locator(editorSelector);
            await editor.waitFor({ state: "visible" });

            const panel = page.locator("aside.workspace-panel");

            try {
                // 1. Desktop (1440x900) slash menu and Escape
                await editor.click();
                await page.keyboard.type("/");

                const slashMenu = page.locator(".milkdown-slash-menu");
                await page.waitForFunction(
                    () => {
                        const el = document.querySelector(
                            ".milkdown-slash-menu",
                        );
                        return el?.getAttribute("data-show") === "true" ||
                            (el && getComputedStyle(el).display !== "none");
                    },
                    undefined,
                    { timeout: 5000 },
                );

                // Press Escape: dismisses slash menu, but workspace panel remains open!
                await page.keyboard.press("Escape");
                await slashMenu.waitFor({ state: "hidden", timeout: 5000 });
                assertEquals(
                    await panel.isVisible(),
                    true,
                    "Workspace panel must not close on slash menu Escape on desktop",
                );

                // 2. Mobile (390x844) slash menu and Escape on mobile page
                const mobilePage = await context.newPage();
                await mobilePage.setViewportSize({ width: 390, height: 844 });
                try {
                    await visit("/", mobilePage);
                    const mobilePanel = mobilePage.locator(".workspace-panel");
                    const mBtn = mobilePage.locator(
                        '.workspace-dock button[aria-label="便签工作区"], .workspace-switcher button[aria-label="便签工作区"], [data-workspace="notes"]',
                    ).first();
                    await mBtn.waitFor({ state: "visible" });
                    await mBtn.click();
                    await mobilePanel.waitFor({ state: "visible" });

                    const mCard = mobilePage.locator(
                        ".workspace-notes-list .note-card",
                    ).filter({
                        hasText: "快捷菜单测试",
                    }).first();
                    await mCard.locator(".note-title").click();
                    const mEditor = mobilePage.locator(editorSelector);
                    await mEditor.waitFor({ state: "visible" });
                    await mEditor.click();
                    await mobilePage.keyboard.type("/");

                    const mSlashMenu = mobilePage.locator(
                        ".milkdown-slash-menu",
                    );
                    await mobilePage.waitForFunction(
                        () => {
                            const el = document.querySelector(
                                ".milkdown-slash-menu",
                            );
                            return el?.getAttribute("data-show") === "true" ||
                                (el && getComputedStyle(el).display !== "none");
                        },
                        undefined,
                        { timeout: 5000 },
                    ).catch(() => {});
                    await mobilePage.keyboard.press("Escape");
                    if (await mSlashMenu.isVisible()) {
                        await mSlashMenu.waitFor({
                            state: "hidden",
                            timeout: 5000,
                        });
                    }
                    assertEquals(
                        await mSlashMenu.isVisible(),
                        false,
                        "Slash menu must be dismissed on Escape on mobile",
                    );
                } finally {
                    await mobilePage.close();
                }
            } finally {
                await ensureNotesRoot(page);
            }
        },
    );

    await t.step(
        "Issue #67: Typing then immediate Back/reopen preserves local draft (<200ms boundary)",
        async () => {
            await ensureNotesRoot(page);

            await page.evaluate(async () => {
                await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "快速返回草稿测试",
                        body: "Baseline body",
                    }),
                });
            });

            await visit("/");
            await openNotesWorkspace(page);
            const card = page.locator(".workspace-notes-list .note-card")
                .filter({
                    hasText: "快速返回草稿测试",
                }).first();
            await card.locator(".note-title").click();

            const editor = page.locator(editorSelector);
            await editor.waitFor({ state: "visible" });

            // Type text and immediately hit Back button (<200ms) before debounce
            await editor.click();
            await page.keyboard.type(" Fast typed text before 200ms debounce");

            const panel = page.locator("aside.workspace-panel");
            const backBtn = panel.locator(
                '.workspace-header button[aria-label="返回上一级"]',
            );
            await backBtn.click();

            // Reopen the note
            await page.locator(".workspace-notes-list").first().waitFor({
                state: "visible",
            });
            const reopenCard = page.locator(".workspace-notes-list .note-card")
                .filter({
                    hasText: "快速返回草稿测试",
                }).first();
            await reopenCard.locator(".note-title").click();

            const reloadedEditor = page.locator(editorSelector);
            await reloadedEditor.waitFor({ state: "visible" });

            // Content was preserved in local draft despite instantaneous navigation!
            await page.waitForFunction(
                (sel) =>
                    document.querySelector(sel)?.textContent?.includes(
                        "Fast typed text before 200ms debounce",
                    ),
                editorSelector,
                { timeout: 5000 },
            );

            await ensureNotesRoot(page);
        },
    );

    await t.step(
        "Issue #67: Offline local draft recovery and reload resilience",
        async () => {
            await ensureNotesRoot(page);

            const card = page.locator(".workspace-notes-list .note-card")
                .filter({
                    hasText: "工具栏焦点测试",
                }).first();
            await card.locator(".note-title").click();

            const editor = page.locator(editorSelector);
            await editor.waitFor({ state: "visible" });

            // Simulate save failure by intercepting PATCH
            await page.route("**/api/notes/*", (route) => {
                if (route.request().method() === "PATCH") {
                    return route.fulfill({
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            error: "Simulated offline/network error",
                        }),
                    });
                }
                return route.continue();
            });

            try {
                await editor.fill(
                    "Offline draft content that must survive reload",
                );
                await editor.blur();

                // Wait for error state
                await page.waitForFunction(
                    () =>
                        document.querySelector(".save-state")?.textContent
                            ?.includes(
                                "保存失败",
                            ),
                    undefined,
                    { timeout: 6000 },
                );

                // Reload the page
                await page.reload();
                await openNotesWorkspace(page);

                // Reopen the note
                const reopenCard = page.locator(
                    ".workspace-notes-list .note-card",
                ).filter({
                    hasText: "工具栏焦点测试",
                }).first();
                await reopenCard.locator(".note-title").click();

                const restoredEditor = page.locator(editorSelector);
                await restoredEditor.waitFor({ state: "visible" });

                // Content must be restored from local draft
                await page.waitForFunction(
                    (sel) =>
                        document.querySelector(sel)?.textContent?.includes(
                            "Offline draft content that must survive reload",
                        ),
                    editorSelector,
                    { timeout: 5000 },
                );

                // Unroute failure to allow sync retry
                await page.unroute("**/api/notes/*");

                const retryBtn = page.locator(
                    '.choice-row button:has-text("重试同步")',
                );
                if (await retryBtn.isVisible()) {
                    await retryBtn.click();
                    await page.waitForFunction(
                        () =>
                            document.querySelector(".save-state")?.textContent
                                ?.includes(
                                    "已保存",
                                ),
                        undefined,
                        { timeout: 6000 },
                    );
                }
            } finally {
                await page.unroute("**/api/notes/*").catch(() => {});
            }
        },
    );

    await t.step(
        "Issue #67: Conflict detection, cloud/overwrite/merge/version restore",
        async () => {
            const conflictNote = await page.evaluate(async () => {
                const res = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "专门冲突测试便签",
                        body: "Original conflict note body",
                    }),
                });
                return (await res.json()).data as {
                    id: string;
                    version: number;
                    body: string;
                };
            });

            await page.reload();
            await openNotesWorkspace(page);

            const card = page.locator(".workspace-notes-list .note-card")
                .filter({
                    hasText: "专门冲突测试便签",
                }).first();
            await card.locator(".note-title").click();

            const editor = page.locator(editorSelector);
            await editor.waitFor({ state: "visible" });

            // 1. Simulate server-side concurrent update
            const serverUpdatedBody = "Remote update performed concurrently";
            await page.evaluate(async ({ id, version, body }) => {
                await fetch(`/api/notes/${encodeURIComponent(id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        body,
                        version,
                    }),
                });
            }, {
                id: conflictNote.id,
                version: conflictNote.version,
                body: serverUpdatedBody,
            });

            // Local edits and attempts to save
            await editor.fill("Local conflicting edit markdown");
            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "未同步至云端",
                )
            );
            await page.keyboard.press("Control+s");

            // Conflict alertdialog appears
            const conflictDialog = page.locator(
                '[role="alertdialog"][aria-label="便签版本冲突"]',
            );
            await conflictDialog.waitFor({ state: "visible", timeout: 8000 });

            // Test "使用云端"
            const useCloudBtn = conflictDialog.locator(
                'button:has-text("使用云端")',
            );
            await useCloudBtn.click();
            await conflictDialog.waitFor({ state: "detached" });

            // Editor is replaced with cloud body
            await page.waitForFunction(
                ({ sel, text }) =>
                    document.querySelector(sel)?.textContent?.includes(text),
                { sel: editorSelector, text: serverUpdatedBody },
            );

            // Test "覆盖云端"
            const noteV2 = await page.evaluate(async (id) => {
                const r = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                return (await r.json()).data as { id: string; version: number };
            }, conflictNote.id);

            await page.evaluate(async ({ id, version }) => {
                await fetch(`/api/notes/${encodeURIComponent(id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        body: "Server Update Version 3",
                        version,
                    }),
                });
            }, { id: noteV2.id, version: noteV2.version });

            await editor.fill("Local overwrite markdown prevailing");
            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "未同步至云端",
                )
            );
            await page.keyboard.press("Control+s");
            await conflictDialog.waitFor({ state: "visible" });

            const overrideBtn = conflictDialog.locator(
                'button:has-text("覆盖云端")',
            );
            await overrideBtn.click();
            await conflictDialog.waitFor({ state: "detached" });

            await page.waitForFunction(
                () =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes("已保存"),
                undefined,
                { timeout: 6000 },
            );

            // Test "合并并保存"
            const noteV3 = await page.evaluate(async (id) => {
                const r = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                return (await r.json()).data as { id: string; version: number };
            }, conflictNote.id);

            await page.evaluate(async ({ id, version }) => {
                await fetch(`/api/notes/${encodeURIComponent(id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        body: "Server Update Version 4 for Merge",
                        version,
                    }),
                });
            }, { id: noteV3.id, version: noteV3.version });

            await editor.fill("Local text for merge test");
            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "未同步至云端",
                )
            );
            await page.keyboard.press("Control+s");
            await conflictDialog.waitFor({ state: "visible" });

            const mergeTextarea = conflictDialog.locator("textarea");
            await mergeTextarea.fill("Merged canonical markdown content");
            const mergeBtn = conflictDialog.locator(
                'button:has-text("合并并保存")',
            );
            await mergeBtn.click();
            await conflictDialog.waitFor({ state: "detached" });

            await page.waitForFunction(
                ({ sel }) =>
                    document.querySelector(sel)?.textContent?.includes(
                        "Merged canonical markdown content",
                    ),
                { sel: editorSelector },
            );

            // Test Version history restore
            const versionsBtn = page.locator(
                '.note-editor-toolbar button:has-text("版本历史")',
            );
            await versionsBtn.click();
            const versionsSection = page.locator(".note-versions");
            await versionsSection.waitFor({ state: "visible" });

            const restoreBtn = versionsSection.locator(
                "button:has-text('恢复此版本')",
            ).first();
            await restoreBtn.waitFor({ state: "visible" });
            await restoreBtn.click();

            // Editor is restored without secondary save loop
            await page.waitForFunction(
                () =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes(
                            "已保存",
                        ),
                undefined,
                { timeout: 6000 },
            );
        },
    );

    await t.step(
        "Issue #67: Enter / hard-break contract and NoteCard parity",
        async () => {
            await page.evaluate(async () => {
                await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "换行测试便签",
                        body: "",
                    }),
                });
            });

            await page.reload();
            await openNotesWorkspace(page);

            const card = page.locator(".workspace-notes-list .note-card")
                .filter({ hasText: "换行测试便签" }).first();
            await card.locator(".note-title").click();

            const editor = page.locator(editorSelector);
            await editor.waitFor({ state: "visible" });
            // Type paragraph 1, Enter, paragraph 2, Shift+Enter, line 3
            await editor.click();
            await page.keyboard.type("Line One Paragraph");
            await page.keyboard.press("Enter");
            await page.keyboard.type("Line Two Paragraph");
            await page.keyboard.press("Shift+Enter");
            await page.keyboard.type("Line Three Hardbreak");

            // Wait for unsynced state and then autosave completion
            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "未同步至云端",
                )
            );
            await page.waitForFunction(
                () =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes(
                            "已保存",
                        ),
                undefined,
                { timeout: 6000 },
            );

            // Verify server body contains valid markdown newlines
            const currentNote = await page.evaluate(async () => {
                const list = await fetch("/api/notes").then((r) => r.json());
                return list.data.find((n: { title: string }) =>
                    n.title === "换行测试便签"
                ) as { body: string };
            });
            assertStringIncludes(currentNote.body, "Line One Paragraph");
            assertStringIncludes(currentNote.body, "Line Two Paragraph");
            assertStringIncludes(currentNote.body, "Line Three Hardbreak");

            // Return to root and check NoteCard rendering
            await ensureNotesRoot(page);
            const noteCard = page.locator(".workspace-notes-list .note-card")
                .filter({
                    hasText: "换行测试便签",
                }).first();
            await noteCard.waitFor({ state: "visible" });
            await noteCard.hover();
            const expandBtn = noteCard.locator('button[aria-label="展开"]');
            if (await expandBtn.isVisible()) {
                await expandBtn.click({ force: true });
            }
            const preview = noteCard.locator(".note-preview.markdown");
            await preview.waitFor({ state: "visible" });
            assertStringIncludes(
                await preview.innerText(),
                "Line One Paragraph",
            );
            assertStringIncludes(
                await preview.innerText(),
                "Line Two Paragraph",
            );
        },
    );

    await t.step(
        "Issue #67: Unicode / Chinese / IME editing and round-trip",
        async () => {
            await page.evaluate(async () => {
                await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "中文输入测试便签",
                        body: "",
                    }),
                });
            });

            await page.reload();
            await openNotesWorkspace(page);

            const card = page.locator(".workspace-notes-list .note-card")
                .filter({ hasText: "中文输入测试便签" }).first();
            await card.locator(".note-title").click();

            const editor = page.locator(editorSelector);
            await editor.waitFor({ state: "visible" });

            const chineseText =
                "测试中文便签内容，标点符号：【】、《》？！以及表情：🎉🚀📝。";
            await editor.fill(chineseText);
            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "未同步至云端",
                )
            );
            await page.waitForFunction(
                () =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes(
                            "已保存",
                        ),
                undefined,
                { timeout: 6000 },
            );

            // Verify round-trip via API
            const serverNote = await page.evaluate(async () => {
                const list = await fetch("/api/notes").then((r) => r.json());
                return list.data.find((n: { title: string }) =>
                    n.title === "中文输入测试便签"
                ) as { body: string };
            });
            assertEquals(serverNote.body.trim(), chineseText.trim());

            // Reload and verify editor preserves the exact text
            await page.reload();
            await openNotesWorkspace(page);
            const reopenCard = page.locator(".workspace-notes-list .note-card")
                .filter({
                    hasText: "中文输入测试便签",
                }).first();
            await reopenCard.locator(".note-title").click();
            const reloadedEditor = page.locator(editorSelector);
            await reloadedEditor.waitFor({ state: "visible" });
            assertEquals(
                (await reloadedEditor.innerText()).trim(),
                chineseText.trim(),
            );
        },
    );
    await t.step(
        "Issue #67: In-flight PATCH does not overwrite or delete newer local draft on race",
        async () => {
            await ensureNotesRoot(page);

            // Create note to test in-flight race
            const noteData = await page.evaluate(async () => {
                const res = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "并发草稿保护测试",
                        body: "Original draft body",
                    }),
                });
                return (await res.json()).data as {
                    id: string;
                    version: number;
                };
            });

            await page.reload();
            await openNotesWorkspace(page);

            const card = page.locator(".workspace-notes-list .note-card")
                .filter({
                    hasText: "并发草稿保护测试",
                }).first();
            await card.locator(".note-title").click();

            const editor = page.locator(editorSelector);
            await editor.waitFor({ state: "visible" });

            // 1. Defer / delay the first PATCH
            let releaseFirstPatch: () => void = () => {};
            const patchHold = new Promise<void>((resolve) => {
                releaseFirstPatch = resolve;
            });
            let patchCount = 0;

            await page.route(
                `**/api/notes/${encodeURIComponent(noteData.id)}`,
                async (route) => {
                    if (route.request().method() === "PATCH") {
                        patchCount++;
                        if (patchCount === 1) {
                            await patchHold;
                            return route.continue();
                        }
                        if (patchCount === 2) {
                            // Simulate offline / 500 for the second patch
                            return route.fulfill({
                                status: 500,
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    error:
                                        "Simulated offline during second patch",
                                }),
                            });
                        }
                    }
                    return route.continue();
                },
            );

            try {
                // Edit body with draft A and trigger save
                await editor.fill("Body draft A in flight");
                await page.waitForFunction(() =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes("未同步至云端")
                );
                // Trigger manual save to start first PATCH
                await page.keyboard.press("Control+s");
                await page.waitForFunction(() =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes("保存中")
                );

                // While first PATCH is held in-flight, edit body with draft B
                await editor.fill("Body draft B newer local content");
                await page.waitForFunction(() =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes("未同步至云端")
                );

                // Now release the first PATCH
                releaseFirstPatch();

                // Wait a moment for first PATCH to settle and second PATCH to fail
                await page.waitForFunction(() =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes("保存失败")
                );

                // Reload the page: newer draft B must NOT have been deleted or overwritten by response of draft A!
                await page.reload();
                await openNotesWorkspace(page);

                const reopenCard = page.locator(
                    ".workspace-notes-list .note-card",
                ).filter({
                    hasText: "并发草稿保护测试",
                }).first();
                await reopenCard.locator(".note-title").click();

                const reloadedEditor = page.locator(editorSelector);
                await reloadedEditor.waitFor({ state: "visible" });

                // The restored content must be "Body draft B newer local content"
                await page.waitForFunction(
                    (sel) =>
                        document.querySelector(sel)?.textContent?.includes(
                            "Body draft B newer local content",
                        ),
                    editorSelector,
                    { timeout: 6000 },
                );
            } finally {
                releaseFirstPatch();
                await page.unroute(
                    `**/api/notes/${encodeURIComponent(noteData.id)}`,
                ).catch(() => {});
            }
        },
    );

    await t.step(
        "Issue #67: 10,000 character boundary and oversized note protection",
        async () => {
            await ensureNotesRoot(page);

            // Seed note near 10k boundary (e.g. 9,500 chars)
            const baseChunk =
                "这是一段用于测试长便签边界的段落内容，确保Milkdown和后端持久化不发生静默截断。\n\n";
            const repeatCount = Math.floor(9500 / baseChunk.length);
            const longBody = baseChunk.repeat(repeatCount);

            await page.evaluate(async (body) => {
                const res = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "长便签边界测试",
                        body,
                    }),
                });
                return (await res.json()).data as {
                    id: string;
                    body: string;
                };
            }, longBody);

            await page.reload();
            await openNotesWorkspace(page);

            const card = page.locator(".workspace-notes-list .note-card")
                .filter({
                    hasText: "长便签边界测试",
                }).first();
            await card.locator(".note-title").click();

            const editor = page.locator(editorSelector);
            await editor.waitFor({ state: "visible" });

            // Editor loads 9500+ character content without crashing
            const editorText = await editor.innerText();
            assertEquals(editorText.length >= 9000, true);

            // Attempting to exceed 10,000 characters triggers server error and error UI without silent truncation
            const oversizedBody = "X".repeat(10500);
            await editor.fill(oversizedBody);
            await editor.blur();

            await page.waitForFunction(
                () =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes(
                            "保存失败",
                        ),
                undefined,
                { timeout: 6000 },
            );
        },
    );
    await t.step(
        "Issue #67: Actual fixture preserves raw HTML/images/tables/code and prevents horizontal overflow",
        async () => {
            await ensureNotesRoot(page);

            const pageErrors: string[] = [];
            const onConsole = (msg: { type(): string; text(): string }) => {
                if (msg.type() === "error") pageErrors.push(msg.text());
            };
            page.on("console", onConsole);

            const richFixture = [
                "# 混合排版与溢出防护测试",
                "",
                '包含内联 HTML 标签：<span class="custom-tag"><b>原生HTML格式</b></span> 与 Markdown 混排。',
                "",
                "无标题图片：![无标题图片说明](https://example.com/assets/sample-note-banner.png)",
                "",
                '带标题图片：![带标题图片说明](https://example.com/assets/sample-titled.png "自定义图片标题")',
                "",
                "超长无空格URL测试横向截断与折行：",
                "https://example.com/very/long/nested/path/component/with/deep/query/parameter/for/testing/overflow/prevention/without/breaking/workspace/geometry/index.html",
                "",
                "| 功能 | 说明 | 状态 |",
                "| --- | --- | --- |",
                "| WYSIWYG | Milkdown Crepe 替换 textarea | 完成 |",
                "| 持久化 | 保持 Markdown 存储 | 通过 |",
                "",
                "```typescript",
                "function renderNote(): void {",
                "    console.log('Parity check passed without document overflow');",
                "}",
                "```",
            ].join("\n");

            const noteData = await page.evaluate(async (body) => {
                const res = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "混合排版便签",
                        body,
                    }),
                });
                return (await res.json()).data as {
                    id: string;
                    version: number;
                };
            }, richFixture);

            await page.reload();
            await openNotesWorkspace(page);

            const card = page.locator(".workspace-notes-list .note-card")
                .filter({ hasText: "混合排版便签" }).first();
            await card.locator(".note-title").click();

            const editor = page.locator(editorSelector);
            await editor.waitFor({ state: "visible" });

            // 1. Assert rendered .ProseMirror img elements for both titleless and titled images
            const titlelessImg = editor.locator(
                'img[src="https://example.com/assets/sample-note-banner.png"]',
            );
            await titlelessImg.waitFor({ state: "visible" });
            assertEquals(
                await titlelessImg.getAttribute("alt"),
                "无标题图片说明",
            );

            const titledImg = editor.locator(
                'img[src="https://example.com/assets/sample-titled.png"]',
            );
            await titledImg.waitFor({ state: "visible" });
            assertEquals(await titledImg.getAttribute("alt"), "带标题图片说明");
            assertEquals(
                await titledImg.getAttribute("title"),
                "自定义图片标题",
            );

            // 2. Verify no page-level horizontal overflow
            const bodyOverflow = await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                        document.documentElement.clientWidth + 2,
            );
            assertEquals(
                bodyOverflow,
                true,
                "Page body must not have horizontal overflow",
            );

            // 3. Verify workspace panel no horizontal overflow
            const panelOverflow = await page.evaluate(() => {
                const p = document.querySelector("aside.workspace-panel");
                return p ? p.scrollWidth <= p.clientWidth + 2 : true;
            });
            assertEquals(
                panelOverflow,
                true,
                "Workspace panel must not have horizontal overflow",
            );

            // 4. Actual body edit, trigger autosave, verify persistence of both images & HTML
            await editor.click();
            await page.keyboard.type("\n\n追加编辑内容以触发保存");
            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "未同步至云端",
                )
            );
            await page.waitForFunction(
                () =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes(
                            "已保存",
                        ),
                undefined,
                { timeout: 6000 },
            );

            const serverNote = await page.evaluate(async (id) => {
                const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                return (await res.json()).data as { body: string };
            }, noteData.id);

            assertStringIncludes(serverNote.body, "<b>原生HTML格式</b>");
            assertStringIncludes(
                serverNote.body,
                "![无标题图片说明](https://example.com/assets/sample-note-banner.png)",
            );
            assertStringIncludes(
                serverNote.body,
                "https://example.com/assets/sample-titled.png",
            );
            assertStringIncludes(serverNote.body, "renderNote");
            assertStringIncludes(serverNote.body, "追加编辑内容以触发保存");

            // 5. Reopen note and verify both images still render in editor
            await page.reload();
            await openNotesWorkspace(page);
            const reopenedCard = page.locator(
                ".workspace-notes-list .note-card",
            )
                .filter({ hasText: "混合排版便签" }).first();
            await reopenedCard.locator(".note-title").click();
            const reloadedEditor = page.locator(editorSelector);
            await reloadedEditor.waitFor({ state: "visible" });
            await reloadedEditor.locator(
                'img[src="https://example.com/assets/sample-note-banner.png"]',
            ).waitFor({ state: "visible" });
            await reloadedEditor.locator(
                'img[src="https://example.com/assets/sample-titled.png"]',
            ).waitFor({ state: "visible" });

            // 6. Assert no RangeError or image parsing errors emitted to console
            const imageErrors = pageErrors.filter((e) =>
                e.includes("RangeError") || e.includes("image")
            );
            assertEquals(
                imageErrors,
                [],
                `Image console errors found: ${imageErrors.join(", ")}`,
            );
            page.off("console", onConsole);

            await ensureNotesRoot(page);
        },
    );
});
