import { assertEquals, assertStringIncludes } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

// Independent Playwright E2E test suite for Issue #62:
// Home ControlledNotes fixed-note manual sorting via dnd-kit pointer + keyboard
// Run with: NODE_ENV=test deno test -A web/e2e/home-notes-order.test.ts
Deno.test("production home notes manual order E2E (#62)", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({
        prefix: "searcher_home_notes_e2e_",
    });
    cleanup.defer(() => Deno.remove(files, { recursive: true }));
    const screenshotDir = `${files}/screenshots`;
    await Deno.mkdir(screenshotDir, { recursive: true });
    const durableScreenshotDir = "./data/screenshots/home-notes-order";
    await Deno.mkdir(durableScreenshotDir, { recursive: true }).catch(() => {});

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
    const username = "home_notes_tester";
    const password = "Notes-password-62!";

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor({ state: "visible" });
    }

    async function signIn(target: Page = page) {
        await target.locator("#auth-username").fill(username);
        await target.locator("#auth-password").fill(password);
        await target.locator('form button[type="submit"]').click();
    }

    async function clearAllNotes() {
        await page.evaluate(async () => {
            const res = await fetch("/api/notes");
            if (!res.ok) return;
            const data = await res.json();
            for (const item of data.data) {
                await fetch(`/api/notes/${encodeURIComponent(item.id)}`, {
                    method: "DELETE",
                });
            }
        });
    }

    async function createNote(payload: {
        title: string;
        body: string;
        color?: string;
        isPinned?: boolean;
        isHomeFixed?: boolean;
        sortOrder?: number;
        layout?: { expanded?: boolean };
    }) {
        return await page.evaluate(async (data) => {
            const res = await fetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error(await res.text());
            return (await res.json()).data as {
                id: string;
                title: string;
                body: string;
                color: string;
                isPinned: boolean;
                isHomeFixed: boolean;
                sortOrder: number;
                version: number;
            };
        }, payload);
    }

    async function getBoardSlotNoteIds(): Promise<string[]> {
        return await page.evaluate(() => {
            const slots = Array.from(
                document.querySelectorAll(
                    ".controlled-notes-board .controlled-note-slot[data-note-id]",
                ),
            );
            return slots.map((el) => el.getAttribute("data-note-id") || "");
        });
    }

    async function waitForBoardSlotIds(expectedIds: string[]) {
        await page.waitForFunction((ids) => {
            const slots = Array.from(
                document.querySelectorAll(
                    ".controlled-notes-board .controlled-note-slot[data-note-id]",
                ),
            );
            const actualIds = slots.map((s) => s.getAttribute("data-note-id"));
            if (actualIds.length !== ids.length) return false;
            return ids.every((id, idx) => actualIds[idx] === id);
        }, expectedIds);
    }

    async function waitForSavedFixedOrder(expectedIds: string[]) {
        await page.waitForFunction(async (ids) => {
            const res = await fetch("/api/notes");
            if (!res.ok) return false;
            const data = await res.json();
            const fixed = (data.data as Array<
                { id: string; isHomeFixed?: boolean; sortOrder?: number }
            >)
                .filter((n) => n.isHomeFixed === true)
                .sort((a, b) =>
                    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                    a.id.localeCompare(b.id)
                );
            if (fixed.length < ids.length) return false;
            return ids.every((id, idx) => fixed[idx]?.id === id);
        }, expectedIds);
    }

    // Register user
    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Home Notes Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor({ state: "visible" });

    // Set widgets style as baseline
    await visit("/settings/appearance");
    await page.getByText("空间轻桌面", { exact: true }).click();
    await page.locator('.layout-mode-card[aria-checked="true"]', {
        hasText: "空间轻桌面",
    }).waitFor();
    await page.evaluate(async () => {
        const response = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ theme: "system" }),
        });
        if (!response.ok) throw new Error(await response.text());
    });
    await visit("/");

    // -------------------------------------------------------------------------
    // Step 1: Handle rendering and handle click does not trigger note opening
    // -------------------------------------------------------------------------
    await t.step(
        "Notes #62: Handle rendering and handle click does not open editor",
        async () => {
            await clearAllNotes();
            const noteA = await createNote({
                title: "Handle Note A",
                body: "Body of Handle Note A",
                isHomeFixed: true,
                sortOrder: 0,
            });
            const noteB = await createNote({
                title: "Handle Note B",
                body: "Body of Handle Note B",
                isHomeFixed: true,
                sortOrder: 1,
            });

            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            const board = page.locator(".controlled-notes-board");
            await board.waitFor({ state: "visible" });

            const slots = board.locator(".controlled-note-slot[data-note-id]");
            assertEquals(await slots.count(), 2);

            // Both fixed notes render sorting handles
            const handleA = board.locator(
                `.controlled-note-slot[data-note-id="${noteA.id}"] button[aria-label^="排序便签："]`,
            );
            const handleB = board.locator(
                `.controlled-note-slot[data-note-id="${noteB.id}"] button[aria-label^="排序便签："]`,
            );
            await handleA.waitFor({ state: "visible" });
            await handleB.waitFor({ state: "visible" });

            // Verify aria-label format
            const labelA = await handleA.getAttribute("aria-label");
            assertStringIncludes(labelA ?? "", "排序便签：Handle Note A");

            // Click handle -> editor/workspace panel MUST NOT open
            await handleA.click();
            await page.waitForTimeout(150);
            assertEquals(
                await page.locator(".workspace-panel").isVisible(),
                false,
            );
            assertEquals(page.url(), origin + "/");

            // In contrast, clicking the note card body DOES open editor
            const cardBodyA = board.locator(
                `.controlled-note-slot[data-note-id="${noteA.id}"] .note-card`,
            );
            await cardBodyA.click();
            const panel = page.locator(".workspace-panel");
            await panel.waitFor({ state: "visible" });

            // Close workspace panel back to home
            const backOrClose = panel.locator(
                '.workspace-header button[aria-label="关闭工作区"]',
            );
            if (await backOrClose.isVisible()) {
                await backOrClose.click();
            } else {
                await page.keyboard.press("Escape");
            }
        },
    );

    // -------------------------------------------------------------------------
    // Step 2: Pointer reorder A/B/C (C->A), immediate DOM, reload & relogin persistence,
    //         normal notes relative order and flags/content/color/layout unchanged
    // -------------------------------------------------------------------------
    await t.step(
        "Notes #62: Pointer drag C->A immediate DOM, reload and relogin persistence, normal notes preserved",
        async () => {
            await clearAllNotes();

            // Seed 3 fixed notes A, B, C with specific metadata
            const noteA = await createNote({
                title: "Fixed Note Alpha",
                body: "Body Alpha unique content",
                color: "amber",
                isPinned: false,
                isHomeFixed: true,
                sortOrder: 0,
                layout: { expanded: true },
            });
            const noteB = await createNote({
                title: "Fixed Note Beta",
                body: "Body Beta unique content",
                color: "sage",
                isPinned: true,
                isHomeFixed: true,
                sortOrder: 1,
                layout: { expanded: false },
            });
            const noteC = await createNote({
                title: "Fixed Note Gamma",
                body: "Body Gamma unique content",
                color: "rose",
                isPinned: false,
                isHomeFixed: true,
                sortOrder: 2,
                layout: { expanded: true },
            });

            // Seed 2 normal (non-fixed) notes
            const noteR1 = await createNote({
                title: "Regular Note One",
                body: "Body Regular One",
                color: "paper",
                isPinned: false,
                isHomeFixed: false,
                sortOrder: 10,
            });
            const noteR2 = await createNote({
                title: "Regular Note Two",
                body: "Body Regular Two",
                color: "sky",
                isPinned: false,
                isHomeFixed: false,
                sortOrder: 20,
            });

            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            const board = page.locator(".controlled-notes-board");
            await board.waitFor({ state: "visible" });

            // Initial DOM slot order: A, B, C
            assertEquals(await getBoardSlotNoteIds(), [
                noteA.id,
                noteB.id,
                noteC.id,
            ]);

            // Drag C to A using pointer events
            const handleC = board.locator(
                `.controlled-note-slot[data-note-id="${noteC.id}"] button[aria-label^="排序便签："]`,
            );
            const handleA = board.locator(
                `.controlled-note-slot[data-note-id="${noteA.id}"] button[aria-label^="排序便签："]`,
            );
            await handleC.waitFor({ state: "visible" });
            await handleA.waitFor({ state: "visible" });

            const boxC = await handleC.boundingBox();
            const boxA = await handleA.boundingBox();
            assertEquals(boxC !== null, true);
            assertEquals(boxA !== null, true);

            const startX = boxC!.x + boxC!.width / 2;
            const startY = boxC!.y + boxC!.height / 2;
            const targetX = boxA!.x + boxA!.width / 2;
            const targetY = boxA!.y + boxA!.height / 2;

            await page.mouse.move(startX, startY);
            await page.mouse.down();
            // Exceed PointerSensor activationConstraint: { distance: 5 }
            await page.mouse.move(startX + 8, startY + 8, { steps: 5 });
            // Move to target A
            await page.mouse.move(targetX, targetY, { steps: 20 });
            await page.waitForTimeout(100);
            await page.mouse.up();

            // 1. Immediate DOM verification: [C, A, B]
            await waitForBoardSlotIds([noteC.id, noteA.id, noteB.id]);
            assertEquals(await getBoardSlotNoteIds(), [
                noteC.id,
                noteA.id,
                noteB.id,
            ]);

            // Wait for backend persistence before reload
            await waitForSavedFixedOrder([noteC.id, noteA.id, noteB.id]);

            // 2. Reload persistence: [C, A, B]
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            await waitForBoardSlotIds([noteC.id, noteA.id, noteB.id]);
            assertEquals(await getBoardSlotNoteIds(), [
                noteC.id,
                noteA.id,
                noteB.id,
            ]);

            // 3. Relogin persistence: [C, A, B]
            await context.clearCookies();
            await visit("/login");
            await signIn();
            await page.waitForURL(origin + "/");
            await page.locator("main").waitFor({ state: "visible" });
            await waitForBoardSlotIds([noteC.id, noteA.id, noteB.id]);
            assertEquals(await getBoardSlotNoteIds(), [
                noteC.id,
                noteA.id,
                noteB.id,
            ]);

            // 4. API and metadata integrity verification
            const allNotes = await page.evaluate(async () => {
                const res = await fetch("/api/notes");
                return (await res.json()).data as Array<{
                    id: string;
                    title: string;
                    body: string;
                    color: string;
                    isPinned: boolean;
                    isHomeFixed: boolean;
                    sortOrder: number;
                    layout?: { expanded?: boolean };
                }>;
            });

            const savedA = allNotes.find((n) => n.id === noteA.id)!;
            const savedB = allNotes.find((n) => n.id === noteB.id)!;
            const savedC = allNotes.find((n) => n.id === noteC.id)!;
            const savedR1 = allNotes.find((n) => n.id === noteR1.id)!;
            const savedR2 = allNotes.find((n) => n.id === noteR2.id)!;

            // Fixed notes new sort order: C < A < B
            assertEquals(savedC.sortOrder < savedA.sortOrder, true);
            assertEquals(savedA.sortOrder < savedB.sortOrder, true);

            // Normal notes relative order is strictly preserved: R1 < R2
            assertEquals(savedR1.sortOrder < savedR2.sortOrder, true);

            // Note metadata unchanged
            assertEquals(savedA.color, "amber");
            assertEquals(savedA.isPinned, false);
            assertEquals(savedA.isHomeFixed, true);
            assertEquals(savedA.body, "Body Alpha unique content");
            assertEquals(savedA.layout?.expanded, true);

            assertEquals(savedB.color, "sage");
            assertEquals(savedB.isPinned, true);
            assertEquals(savedB.isHomeFixed, true);
            assertEquals(savedB.body, "Body Beta unique content");
            assertEquals(savedB.layout?.expanded, false);

            assertEquals(savedC.color, "rose");
            assertEquals(savedC.isPinned, false);
            assertEquals(savedC.isHomeFixed, true);
            assertEquals(savedC.body, "Body Gamma unique content");
            assertEquals(savedC.layout?.expanded, true);

            assertEquals(savedR1.color, "paper");
            assertEquals(savedR1.isPinned, false);
            assertEquals(savedR1.isHomeFixed, false);

            assertEquals(savedR2.color, "sky");
            assertEquals(savedR2.isPinned, false);
            assertEquals(savedR2.isHomeFixed, false);
        },
    );

    // -------------------------------------------------------------------------
    // Step 3: Keyboard equivalent reordering and persistence
    // -------------------------------------------------------------------------
    await t.step(
        "Notes #62: Keyboard equivalent reordering and reload persistence",
        async () => {
            // Current board order is [C, A, B]. Move B to first position using keyboard.
            const currentIds = await getBoardSlotNoteIds();
            const noteBId = currentIds[2]; // noteB is at index 2
            const noteCId = currentIds[0];
            const noteAId = currentIds[1];

            const board = page.locator(".controlled-notes-board");
            const handleB = board.locator(
                `.controlled-note-slot[data-note-id="${noteBId}"] button[aria-label^="排序便签："]`,
            );
            await handleB.waitFor({ state: "visible" });
            await handleB.focus();
            await page.waitForTimeout(100);

            // Lift with Space
            await page.keyboard.press("Space");
            await page.waitForTimeout(150);

            // Move up twice (index 2 -> index 1 -> index 0)
            await page.keyboard.press("ArrowUp");
            await page.waitForTimeout(150);
            await page.keyboard.press("ArrowUp");
            await page.waitForTimeout(150);

            // Drop with Space
            await page.keyboard.press("Space");
            await page.waitForTimeout(150);

            // Immediate DOM check: [B, C, A]
            await waitForBoardSlotIds([noteBId, noteCId, noteAId]);
            assertEquals(await getBoardSlotNoteIds(), [
                noteBId,
                noteCId,
                noteAId,
            ]);

            // Wait for backend persistence
            await waitForSavedFixedOrder([noteBId, noteCId, noteAId]);

            // Reload persistence
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            await waitForBoardSlotIds([noteBId, noteCId, noteAId]);
            assertEquals(await getBoardSlotNoteIds(), [
                noteBId,
                noteCId,
                noteAId,
            ]);
        },
    );

    // -------------------------------------------------------------------------
    // Step 4: Max 5 slots displayed, hidden sixth+ retained in stable order
    // -------------------------------------------------------------------------
    await t.step(
        "Notes #62: Max 5 slots displayed, hidden sixth+ note preserved in background",
        async () => {
            await clearAllNotes();

            // Create 6 fixed notes F1..F6
            const fixedNotes: Array<{ id: string }> = [];
            for (let i = 1; i <= 6; i++) {
                fixedNotes.push(
                    await createNote({
                        title: `Fixed Note F${i}`,
                        body: `Content of Fixed Note F${i}`,
                        isHomeFixed: true,
                        sortOrder: i - 1,
                    }),
                );
            }
            // Create 1 regular note
            const regular = await createNote({
                title: "Regular Tail Note",
                body: "Content of regular tail note",
                isHomeFixed: false,
                sortOrder: 20,
            });

            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            const board = page.locator(".controlled-notes-board");
            await board.waitFor({ state: "visible" });

            // Exactly 5 slots rendered
            const slotCount = await board.locator(
                ".controlled-note-slot[data-note-id]",
            ).count();
            assertEquals(slotCount, 5);

            // Slots are F1..F5; F6 is not rendered
            const renderedIds = await getBoardSlotNoteIds();
            assertEquals(
                renderedIds,
                fixedNotes.slice(0, 5).map((n) => n.id),
            );
            assertEquals(renderedIds.includes(fixedNotes[5].id), false);

            // Reorder visible notes: drag F3 (index 2) to F1 (index 0)
            const handleF3 = board.locator(
                `.controlled-note-slot[data-note-id="${
                    fixedNotes[2].id
                }"] button[aria-label^="排序便签："]`,
            );
            const handleF1 = board.locator(
                `.controlled-note-slot[data-note-id="${
                    fixedNotes[0].id
                }"] button[aria-label^="排序便签："]`,
            );

            const boxF3 = await handleF3.boundingBox();
            const boxF1 = await handleF1.boundingBox();
            assertEquals(boxF3 !== null && boxF1 !== null, true);

            const startX = boxF3!.x + boxF3!.width / 2;
            const startY = boxF3!.y + boxF3!.height / 2;
            const targetX = boxF1!.x + boxF1!.width / 2;
            const targetY = boxF1!.y + boxF1!.height / 2;

            await page.mouse.move(startX, startY);
            await page.mouse.down();
            await page.mouse.move(startX + 8, startY + 8, { steps: 5 });
            await page.mouse.move(targetX, targetY, { steps: 20 });
            await page.waitForTimeout(100);
            await page.mouse.up();

            // Wait for reorder to reflect in DOM
            await page.waitForFunction(
                ([f3, f1]) => {
                    const slots = Array.from(
                        document.querySelectorAll(
                            ".controlled-notes-board .controlled-note-slot[data-note-id]",
                        ),
                    );
                    return slots[0]?.getAttribute("data-note-id") === f3 &&
                        slots[1]?.getAttribute("data-note-id") === f1;
                },
                [fixedNotes[2].id, fixedNotes[0].id],
            );

            // Wait for backend persistence
            await waitForSavedFixedOrder([
                fixedNotes[2].id,
                fixedNotes[0].id,
                fixedNotes[1].id,
                fixedNotes[3].id,
                fixedNotes[4].id,
            ]);

            // Verify API data: F6 is intact and retains relative order
            const allNotes = await page.evaluate(async () => {
                const res = await fetch("/api/notes");
                return (await res.json()).data as Array<{
                    id: string;
                    isHomeFixed: boolean;
                    sortOrder: number;
                }>;
            });
            const dbF6 = allNotes.find((n) => n.id === fixedNotes[5].id);
            const dbRegular = allNotes.find((n) => n.id === regular.id);
            assertEquals(dbF6 !== undefined, true);
            assertEquals(dbF6?.isHomeFixed, true);
            assertEquals(dbRegular !== undefined, true);
            assertEquals(
                (dbF6?.sortOrder ?? 0) < (dbRegular?.sortOrder ?? 0),
                true,
            );
        },
    );

    // -------------------------------------------------------------------------
    // Step 5: Fix / unfix notes toggles board presence and sorting capability
    // -------------------------------------------------------------------------
    await t.step(
        "Notes #62: Fix and unfix notes toggles board presence and sorting capability",
        async () => {
            await clearAllNotes();
            const note1 = await createNote({
                title: "Toggle Note 1",
                body: "Body 1",
                isHomeFixed: true,
                sortOrder: 0,
            });
            const note2 = await createNote({
                title: "Toggle Note 2",
                body: "Body 2",
                isHomeFixed: true,
                sortOrder: 1,
            });

            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            const board = page.locator(".controlled-notes-board");
            await board.waitFor({ state: "visible" });
            await waitForBoardSlotIds([note1.id, note2.id]);

            // Unfix note1 from home via dropdown menu ("移出首页")
            const slot1 = board.locator(
                `.controlled-note-slot[data-note-id="${note1.id}"]`,
            );
            await slot1.locator('button[aria-label="更多操作"]').click();
            await page.locator('[data-slot="dropdown-menu-item"]', {
                hasText: "移出首页",
            }).click();

            // Wait until only 1 slot remains (note2)
            await waitForBoardSlotIds([note2.id]);

            // When only 1 fixed note exists, sorting handle is disabled / not rendered
            const remainingHandle = board.locator(
                'button[aria-label^="排序便签："]',
            );
            assertEquals(await remainingHandle.count(), 0);

            // Unfix note2 from home ("移出首页")
            const slot2 = board.locator(
                `.controlled-note-slot[data-note-id="${note2.id}"]`,
            );
            await slot2.locator('button[aria-label="更多操作"]').click();
            await page.locator('[data-slot="dropdown-menu-item"]', {
                hasText: "移出首页",
            }).click();

            // Board completely unmounts when 0 fixed notes
            await page.waitForFunction(() => {
                return document.querySelectorAll(".controlled-notes-board")
                    .length === 0;
            });
            assertEquals(await board.count(), 0);

            // Re-fix note1 and note2 via Workspace
            const dockNotesBtn = page.locator(
                '.workspace-dock button[aria-label="便签工作区"]',
            );
            await dockNotesBtn.waitFor({ state: "visible" });
            await dockNotesBtn.click();

            const panel = page.locator(".workspace-panel");
            await panel.waitFor({ state: "visible" });
            await page.waitForFunction(() => {
                return document.querySelectorAll(
                    ".notes-workspace-list .note-card",
                ).length >= 2;
            });

            // Fix note1: find note card by title text
            const item1 = panel.locator(".notes-workspace-list .note-card", {
                hasText: "Toggle Note 1",
            });
            await item1.waitFor({ state: "visible" });
            await item1.locator('button[aria-label="更多操作"]').click({
                force: true,
            });
            await page.locator('[data-slot="dropdown-menu-item"]', {
                hasText: "固定到首页",
            }).click();
            await page.waitForTimeout(200);

            // Fix note2: find note card by title text
            const item2 = panel.locator(".notes-workspace-list .note-card", {
                hasText: "Toggle Note 2",
            });
            await item2.waitFor({ state: "visible" });
            await item2.locator('button[aria-label="更多操作"]').click({
                force: true,
            });
            await page.locator('[data-slot="dropdown-menu-item"]', {
                hasText: "固定到首页",
            }).click();
            await page.waitForTimeout(200);

            // Close workspace
            const closeBtn = panel.locator('button[aria-label="关闭工作区"]');
            if (await closeBtn.isVisible()) {
                await closeBtn.click();
            } else {
                await page.keyboard.press("Escape");
            }
            await board.waitFor({ state: "visible" });

            // Both notes reappear on board with sorting handles enabled
            await waitForBoardSlotIds([note1.id, note2.id]);
            assertEquals(
                await board.locator('button[aria-label^="排序便签："]').count(),
                2,
            );
        },
    );

    // -------------------------------------------------------------------------
    // Step 6: Workspace other notes sorting and search unsortable contract
    // -------------------------------------------------------------------------
    await t.step(
        "Notes #62: Workspace other notes sorting and search unsortable contract",
        async () => {
            await clearAllNotes();

            // 1 fixed note + 2 regular notes
            await createNote({
                title: "Workspace Fixed Note",
                body: "Body of fixed note",
                isHomeFixed: true,
                sortOrder: 0,
            });
            await createNote({
                title: "Searchable UniqueAlpha",
                body: "Content for alpha search",
                isHomeFixed: false,
                sortOrder: 1,
            });
            await createNote({
                title: "Searchable UniqueBeta",
                body: "Content for beta search",
                isHomeFixed: false,
                sortOrder: 2,
            });

            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });

            const dockNotesBtn = page.locator(
                '.workspace-dock button[aria-label="便签工作区"]',
            );
            await dockNotesBtn.click();
            const panel = page.locator(".workspace-panel");
            await panel.waitFor({ state: "visible" });

            await page.waitForFunction(() => {
                return document.querySelectorAll(
                    ".notes-workspace-list .note-card",
                ).length >= 2;
            });

            // In "其他便签" section, regular notes have interactive sorting handles
            const otherSection = panel.locator(
                'section[aria-labelledby="notes-other-heading"]',
            );
            const r1Card = otherSection.locator(".note-card", {
                hasText: "Searchable UniqueAlpha",
            });
            const r1Handle = r1Card.locator('button[aria-label^="排序 "]');
            await r1Handle.waitFor({ state: "visible" });
            assertEquals(
                await r1Handle.getAttribute("aria-disabled") !== "true",
                true,
            );

            // Search query entered: items become unsortable
            const searchInput = panel.locator("input[data-workspace-search]");
            await searchInput.fill("Searchable");
            await page.waitForTimeout(100);

            // Handles in search view are disabled and labeled "不可排序 "
            await page.waitForFunction(() => {
                const cards = document.querySelectorAll(
                    ".notes-workspace-list .note-card",
                );
                return cards.length >= 2;
            });

            const searchHandles = panel.locator(
                '.notes-workspace-list button[aria-label^="不可排序 "]',
            );
            await searchHandles.first().waitFor({ state: "visible" });
            assertEquals(
                await searchHandles.first().getAttribute("aria-disabled"),
                "true",
            );

            // Clear search: sorting capability restores
            await searchInput.fill("");
            await r1Handle.waitFor({ state: "visible" });
            assertEquals(
                await r1Handle.getAttribute("aria-disabled") !== "true",
                true,
            );

            // Existing Workspace sorting must still persist the new relative order.
            const betaHandle = otherSection.locator(".note-card", {
                hasText: "Searchable UniqueBeta",
            }).locator('button[aria-label^="排序 "]');
            await betaHandle.focus();
            await page.keyboard.press("Space");
            await page.waitForFunction(() =>
                document.querySelector(
                    'button[aria-label="排序 Searchable UniqueBeta"]',
                )?.getAttribute("aria-pressed") === "true"
            );
            await page.waitForTimeout(150);
            await page.keyboard.press("ArrowUp");
            await page.waitForTimeout(150);
            await page.keyboard.press("Space");
            await page.waitForFunction(() => {
                const titles = Array.from(document.querySelectorAll(
                    'section[aria-labelledby="notes-other-heading"] .note-title',
                )).map((node) => node.textContent);
                return titles.join("|") ===
                    "Searchable UniqueBeta|Searchable UniqueAlpha";
            });
            assertEquals(
                await otherSection.locator(".note-title").allTextContents(),
                [
                    "Searchable UniqueBeta",
                    "Searchable UniqueAlpha",
                ],
            );
            const persistedOrder = await page.evaluate(async () => {
                const { data } = await (await fetch("/api/notes")).json();
                return data.filter((note: { isHomeFixed: boolean }) =>
                    !note.isHomeFixed
                )
                    .sort((
                        a: { sortOrder: number },
                        b: { sortOrder: number },
                    ) => a.sortOrder - b.sortOrder)
                    .map((note: { title: string }) => note.title);
            });
            assertEquals(persistedOrder, [
                "Searchable UniqueBeta",
                "Searchable UniqueAlpha",
            ]);

            // Close workspace
            const closeBtn = panel.locator('button[aria-label="关闭工作区"]');
            if (await closeBtn.isVisible()) {
                await closeBtn.click();
            } else {
                await page.keyboard.press("Escape");
            }
        },
    );

    // -------------------------------------------------------------------------
    // Step 7: Visual overflow at 375/390/768/1024/1440 light/dark and Issue #40 layout
    // -------------------------------------------------------------------------
    await t.step(
        "Notes #62: Visual overflow at 375/390/768/1024/1440 light/dark and #40 layout contract",
        async () => {
            await clearAllNotes();
            for (let i = 1; i <= 3; i++) {
                await createNote({
                    title: `Responsive Note ${i}`,
                    body: `Body text for responsive check ${i}`,
                    isHomeFixed: true,
                    sortOrder: i - 1,
                });
            }

            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            const board = page.locator(".controlled-notes-board");
            await board.waitFor({ state: "visible" });

            const viewports = [
                { width: 375, height: 667 },
                { width: 390, height: 844 },
                { width: 768, height: 1024 },
                { width: 1024, height: 768 },
                { width: 1440, height: 900 },
            ];
            const schemes: Array<"light" | "dark"> = ["light", "dark"];

            for (const vp of viewports) {
                for (const scheme of schemes) {
                    await page.setViewportSize(vp);
                    await page.emulateMedia({ colorScheme: scheme });

                    // Wait for layout and transition to settle
                    if (vp.width <= 767) {
                        await page.waitForFunction(() => {
                            const b = document.querySelector(
                                ".controlled-notes-board",
                            );
                            const s0 = document.querySelector(
                                '.controlled-note-slot[data-slot-index="0"]',
                            );
                            if (!b || !s0) return false;
                            const csBoard = globalThis.getComputedStyle(b);
                            const cs0 = globalThis.getComputedStyle(s0);
                            return csBoard.display === "flex" &&
                                csBoard.flexDirection === "column" &&
                                cs0.alignSelf === "stretch" &&
                                cs0.transform === "none";
                        });
                    } else if (vp.width === 1440) {
                        await page.waitForFunction(() => {
                            const b = document.querySelector(
                                ".controlled-notes-board",
                            );
                            const s0 = document.querySelector(
                                '.controlled-note-slot[data-slot-index="0"]',
                            );
                            if (!b || !s0) return false;
                            const csBoard = globalThis.getComputedStyle(b);
                            const cs0 = globalThis.getComputedStyle(s0);
                            return csBoard.display === "grid" &&
                                cs0.transform !== "none";
                        });
                    } else {
                        await page.waitForTimeout(100);
                    }

                    // 1. Verify no horizontal document overflow
                    const overflow = await page.evaluate(() => {
                        const doc = document.documentElement;
                        return {
                            scrollWidth: doc.scrollWidth,
                            clientWidth: doc.clientWidth,
                            hasOverflow: doc.scrollWidth > doc.clientWidth + 1,
                        };
                    });
                    assertEquals(
                        overflow.hasOverflow,
                        false,
                        `Overflow detected at ${vp.width}px ${scheme}`,
                    );

                    // 2. #40 Layout verification
                    if (vp.width === 1440) {
                        const desktopLayout = await page.evaluate(() => {
                            const b = document.querySelector(
                                ".controlled-notes-board",
                            );
                            const s0 = document.querySelector(
                                '.controlled-note-slot[data-slot-index="0"]',
                            );
                            const s1 = document.querySelector(
                                '.controlled-note-slot[data-slot-index="1"]',
                            );
                            const s2 = document.querySelector(
                                '.controlled-note-slot[data-slot-index="2"]',
                            );
                            if (!b || !s0 || !s1 || !s2) return null;
                            const csBoard = globalThis.getComputedStyle(b);
                            const cs0 = globalThis.getComputedStyle(s0);
                            const cs1 = globalThis.getComputedStyle(s1);
                            const cs2 = globalThis.getComputedStyle(s2);
                            return {
                                display: csBoard.display,
                                z0: cs0.zIndex,
                                z1: cs1.zIndex,
                                z2: cs2.zIndex,
                                t0: cs0.transform,
                                t1: cs1.transform,
                            };
                        });
                        assertEquals(desktopLayout !== null, true);
                        assertEquals(desktopLayout?.display, "grid");
                        assertEquals(desktopLayout?.z0, "1");
                        assertEquals(desktopLayout?.z1, "2");
                        assertEquals(desktopLayout?.z2, "3");
                        assertEquals(desktopLayout?.t0 !== "none", true);
                        assertEquals(desktopLayout?.t1 !== "none", true);
                        assertEquals(
                            desktopLayout?.t0 !== desktopLayout?.t1,
                            true,
                        );
                    } else if (vp.width <= 767) {
                        // Narrow fallback check (<= 767px)
                        const narrowLayout = await page.evaluate(() => {
                            const b = document.querySelector(
                                ".controlled-notes-board",
                            );
                            const s0 = document.querySelector(
                                '.controlled-note-slot[data-slot-index="0"]',
                            );
                            if (!b || !s0) return null;
                            const csBoard = globalThis.getComputedStyle(b);
                            const cs0 = globalThis.getComputedStyle(s0);
                            return {
                                display: csBoard.display,
                                flexDirection: csBoard.flexDirection,
                                alignSelf: cs0.alignSelf,
                                transform: cs0.transform,
                            };
                        });
                        assertEquals(narrowLayout !== null, true);
                        assertEquals(narrowLayout?.display, "flex");
                        assertEquals(narrowLayout?.flexDirection, "column");
                        assertEquals(narrowLayout?.alignSelf, "stretch");
                        assertEquals(narrowLayout?.transform, "none");
                    }

                    // 3. Capture screenshot evidence
                    await page.screenshot({
                        path:
                            `${screenshotDir}/home-notes-${vp.width}-${scheme}.png`,
                    });
                    await page.screenshot({
                        path:
                            `${durableScreenshotDir}/home-notes-${vp.width}-${scheme}.png`,
                    }).catch(() => {});
                }
            }

            // Restore baseline
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.emulateMedia({ colorScheme: "light" });
        },
    );
});
