import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

const HOME_NOTE_SELECTOR = [
    ".floating-notes .note-position",
    ".notes-flow-grid .note-flow-item",
    ".floating-notes--flow .note-position",
    ".controlled-note-slot",
].join(", ");

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
    const durableScreenshotDir = await createEvidenceDirectory(
        "home-notes-order",
    );

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
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
        ignoreDefaultArgs: ["--hide-scrollbars"],
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
                await page.locator(
                    ".desktop-window[data-window-id='notes'], .workspace-panel",
                ).isVisible(),
                false,
            );
            assertEquals(page.url(), origin + "/");

            // The title is the explicit edit entry; the drag handle stays independent.
            const cardBodyA = board.locator(
                `.controlled-note-slot[data-note-id="${noteA.id}"] .note-title`,
            );
            await cardBodyA.click();
            const panel = page.locator(
                ".desktop-window[data-window-id='notes'], .desktop-window[data-window-kind='note'], .workspace-panel",
            );
            await panel.waitFor({ state: "visible" });

            // Close workspace panel or note window back to home
            const backOrClose = panel.locator(
                'button[aria-label="关闭便签"], button[aria-label="收起工作区"], button[aria-label="关闭工作区"]',
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
                '.desktop-dock button[aria-label="便签工作区"], button[data-workspace="notes"], .workspace-dock button[aria-label="便签工作区"]',
            );
            await dockNotesBtn.waitFor({ state: "visible" });
            await dockNotesBtn.click();

            const panel = page.locator(
                ".desktop-window[data-window-id='notes'], .workspace-panel",
            );
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
            const closeBtn = panel.locator(
                'button[aria-label="收起工作区"], button[aria-label="关闭工作区"]',
            );
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
                '.desktop-dock button[aria-label="便签工作区"], button[data-workspace="notes"], .workspace-dock button[aria-label="便签工作区"]',
            );
            await dockNotesBtn.waitFor({ state: "visible" });
            await dockNotesBtn.click();
            const panel = page.locator(
                ".desktop-window[data-window-id='notes'], .workspace-panel",
            );
            await panel.waitFor({ state: "visible" });

            await page.waitForFunction(() => {
                return document.querySelectorAll(
                    ".notes-workspace-list .note-card",
                ).length >= 2;
            });

            // In "其他便签" section, regular notes have interactive sorting handles
            const otherSection = panel.getByRole("region", {
                name: "其他便签",
            });
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
            const alphaBox = await r1Handle.boundingBox();
            const betaBox = await betaHandle.boundingBox();
            if (!alphaBox || !betaBox) {
                throw new Error("Sorting handles unavailable");
            }
            await page.keyboard.press(
                Math.abs(alphaBox.y - betaBox.y) < 2 ? "ArrowLeft" : "ArrowUp",
            );
            await page.waitForTimeout(150);
            await page.keyboard.press("Space");
            await page.waitForFunction(() => {
                const section = Array.from(
                    document.querySelectorAll("section.workspace-section"),
                ).find((s) =>
                    s.querySelector("h3")?.textContent?.includes("其他便签")
                );
                const titles = Array.from(
                    section?.querySelectorAll(".note-title") ?? [],
                ).map((node) => node.textContent);
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
            const closeBtn = panel.locator(
                'button[aria-label="收起工作区"], button[aria-label="关闭工作区"]',
            );
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

    await t.step(
        "Home #155: code scrolling stays inside Zen and Widgets notes",
        async () => {
            await clearAllNotes();
            const command = "ssh -L 51121:127.0.0.1:51121 " +
                "user@long-host.example ".repeat(18) + "END";
            await createNote({
                title: "Long SSH command",
                body:
                    `Inline \`ssh\` stays inline.\n\n\`\`\`sh\n${command}\n\`\`\``,
                isHomeFixed: true,
                sortOrder: 0,
                layout: { expanded: true },
            });
            await createNote({
                title: "Short multiline code",
                body: "```sh\nprintf short\nprintf second\n```",
                isHomeFixed: true,
                sortOrder: 1,
                layout: { expanded: true },
            });
            for (const width of [390, 768, 1440]) {
                await page.setViewportSize({
                    width,
                    height: width === 390 ? 844 : width === 768 ? 1024 : 900,
                });
                for (const theme of ["light", "dark"]) {
                    const presentations = [];
                    for (const style of ["zen", "widgets"]) {
                        // #191 mobile Zen consumes text summaries, not a code scroller.
                        if (width < 768 && style === "zen") continue;
                        await page.evaluate(async (preferences) => {
                            const response = await fetch("/api/preferences", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(preferences),
                            });
                            if (!response.ok) {
                                throw new Error(await response.text());
                            }
                        }, { style, theme });
                        await visit("/");
                        const long = page.locator(".note-card", {
                            has: page.getByRole("button", {
                                name: "Long SSH command",
                                exact: true,
                            }),
                        }).locator("pre");
                        const short = page.locator(".note-card", {
                            has: page.getByRole("button", {
                                name: "Short multiline code",
                                exact: true,
                            }),
                        }).locator("pre");
                        await long.waitFor({ state: "visible" });
                        await short.waitFor({ state: "visible" });
                        await page.evaluate(async () => {
                            await document.fonts.ready;
                            await Promise.all(
                                document.getAnimations().filter((animation) =>
                                    animation.effect?.getComputedTiming()
                                        .iterations !== Infinity
                                ).map((animation) =>
                                    animation.finished.catch(() => {})
                                ),
                            );
                        });
                        await page.mouse.move(0, 0);
                        const presentation = await long.evaluate((pre) => {
                            const css = getComputedStyle(pre);
                            const code = getComputedStyle(
                                pre.querySelector("code")!,
                            );
                            return {
                                scoped: pre.closest(
                                    ".floating-notes--canvas, .controlled-notes-board",
                                ) !== null,
                                scrollbarWidth:
                                    CSS.supports("scrollbar-width", "thin")
                                        ? css.scrollbarWidth
                                        : null,
                                scrollbarColor: CSS.supports(
                                        "scrollbar-color",
                                        "transparent transparent",
                                    )
                                    ? css.scrollbarColor
                                    : null,
                                radius: css.borderRadius,
                                display: code.display,
                                padding: code.padding,
                                background: code.backgroundColor,
                            };
                        });
                        presentations.push(presentation);
                        if (presentation.scoped) {
                            assertEquals(
                                presentation.display,
                                "block",
                            );
                        }
                        assertEquals(await long.textContent(), command + "\n");
                        const scrolling = await long.evaluate((element) => {
                            const pre = element as HTMLElement;
                            const outer = pre.closest(".note-preview")!;
                            const card = pre.closest(".note-card")!;
                            const before = {
                                outer: outer.scrollLeft,
                                card: card.scrollLeft,
                                page: scrollX,
                            };
                            pre.scrollLeft = pre.scrollWidth;
                            const css = getComputedStyle(pre);
                            const code = pre.querySelector("code")!
                                .getBoundingClientRect();
                            const bounds = pre.getBoundingClientRect();
                            return {
                                overflow: pre.scrollWidth > pre.clientWidth + 1,
                                scrollLeft: pre.scrollLeft,
                                endReachable: code.right <= bounds.right + 1,
                                whiteSpace: css.whiteSpace,
                                before,
                                after: {
                                    outer: outer.scrollLeft,
                                    card: card.scrollLeft,
                                    page: scrollX,
                                },
                                pageOverflow:
                                    document.documentElement.scrollWidth >
                                        document.documentElement.clientWidth +
                                            1,
                            };
                        });
                        assertEquals(scrolling.overflow, true);
                        assertEquals(scrolling.scrollLeft > 0, true);
                        assertEquals(scrolling.endReachable, true);
                        assertEquals(scrolling.before, scrolling.after);
                        assertEquals(scrolling.pageOverflow, false);
                        assertEquals(
                            await short.evaluate((pre) =>
                                pre.scrollWidth <= pre.clientWidth + 1
                            ),
                            true,
                        );
                        assertEquals(
                            await page.locator(".note-preview p code").evaluate(
                                (code) => getComputedStyle(code).display,
                            ),
                            "inline",
                        );
                        await long.evaluate((pre) => {
                            pre.scrollLeft = 0;
                        });
                        await long.focus();
                        await page.keyboard.press("Tab");
                        await page.keyboard.press("Shift+Tab");
                        assertEquals(
                            await long.evaluate((pre) =>
                                document.activeElement === pre
                            ),
                            true,
                        );
                        await page.keyboard.press("ArrowRight");
                        await page.waitForFunction(() =>
                            (document.activeElement as HTMLElement)
                                ?.scrollLeft > 0
                        );
                        if (width === 1440 && theme === "light") {
                            await long.hover();
                            const scrollbar = await long.evaluate(
                                async (pre) => {
                                    await Promise.all(
                                        pre.closest(".note-card")!
                                            .getAnimations().map((animation) =>
                                                animation.finished
                                            ),
                                    );
                                    pre.scrollLeft = 0;
                                    const rect = pre.getBoundingClientRect();
                                    const card = pre.closest(".note-card")!
                                        .getBoundingClientRect();
                                    return {
                                        x: rect.x,
                                        y: rect.bottom -
                                            (rect.height - pre.clientHeight) /
                                                2,
                                        width: pre.clientWidth,
                                        card: { x: card.x, y: card.y },
                                    };
                                },
                            );
                            await page.mouse.move(
                                scrollbar.x + 25,
                                scrollbar.y,
                            );
                            await page.mouse.down();
                            await page.mouse.move(
                                scrollbar.x + scrollbar.width * 0.7,
                                scrollbar.y,
                                { steps: 15 },
                            );
                            await page.screenshot({
                                path:
                                    `${durableScreenshotDir}/code-${style}-active.png`,
                            });
                            await page.mouse.up();
                            await page.waitForFunction(
                                (pre) => pre!.scrollLeft > 100,
                                await long.elementHandle(),
                                { timeout: 3000 },
                            );
                            const after = await long.evaluate((pre) => {
                                const card = pre.closest(".note-card")!
                                    .getBoundingClientRect();
                                return {
                                    card: { x: card.x, y: card.y },
                                    outer: pre.closest(".note-preview")!
                                        .scrollLeft,
                                };
                            });
                            assertEquals(after.card, scrollbar.card);
                            assertEquals(after.outer, 0);
                        }
                        await page.screenshot({
                            path:
                                `${durableScreenshotDir}/code-${style}-${width}-${theme}.png`,
                        });
                    }
                    if (
                        presentations.length === 2 &&
                        presentations.every((presentation) =>
                            presentation.scoped
                        )
                    ) {
                        assertEquals(
                            presentations[0],
                            presentations[1],
                            `Shared code presentation at ${width}px ${theme}`,
                        );
                    }
                }
            }
        },
    );
});
Deno.test("Zen default floating notes do not block Search submit (#180)", async () => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({
        prefix: "searcher_home_notes_180_",
    });
    cleanup.defer(() => Deno.remove(files, { recursive: true }));
    const evidenceDir = await createEvidenceDirectory("home-notes-order-180");

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

    const targetRequests: Array<{ pathname: string; query: string | null }> =
        [];
    const searchTarget = Deno.serve(
        { hostname: "127.0.0.1", port: 0, onListen() {} },
        (request) => {
            const url = new URL(request.url);
            if (url.pathname !== "/search-target") {
                return new Response(null, { status: 204 });
            }
            targetRequests.push({
                pathname: url.pathname,
                query: url.searchParams.get("q"),
            });
            return new Response(
                "<!doctype html><title>Issue #180 search target</title>" +
                    '<main id="controlled-search-target">' +
                    "Issue #180 controlled local search target</main>",
                { headers: { "Content-Type": "text/html; charset=utf-8" } },
            );
        },
    );
    cleanup.defer(() => searchTarget.shutdown());
    const targetOrigin = `http://127.0.0.1:${searchTarget.addr.port}`;
    const interceptedSearches: Array<
        { pathname: string; query: string | null }
    > = [];

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
        ignoreDefaultArgs: ["--hide-scrollbars"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        colorScheme: "light",
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const username = "issue180_zen_search";
    const password = "Issue-180-search-password!";

    const registration = await page.goto(`${origin}/register`);
    assertEquals(registration?.status(), 200);
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Issue 180 Search");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`${origin}/`);

    const preferencesStatus = await page.evaluate(async () => {
        const response = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                style: "zen",
                defaultEngine: "google",
                searchTarget: "same",
            }),
        });
        return response.status;
    });
    assertEquals(preferencesStatus, 200);

    const createdNotes = await page.evaluate(async () => {
        const longBody = Array.from(
            { length: 48 },
            (_, index) =>
                `Issue #180 expanded fixed note line ${index + 1}. ` +
                "This long text keeps the default floating note tall. ",
        ).join("\n");
        for (
            const [index, title] of [
                [0, "Issue #180 fixed note one"],
                [1, "Issue #180 fixed note two"],
            ] as const
        ) {
            const response = await fetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title,
                    body: longBody,
                    isHomeFixed: true,
                    sortOrder: index,
                    layout: {
                        deviceClass: "desktop",
                        x: null,
                        y: null,
                        width: null,
                        zIndex: index + 1,
                        expanded: true,
                    },
                }),
            });
            if (!response.ok) {
                throw new Error(
                    `POST /api/notes failed: ${response.status} ${await response
                        .text()}`,
                );
            }
        }
        const response = await fetch("/api/notes");
        if (!response.ok) {
            throw new Error(`GET /api/notes failed: ${response.status}`);
        }
        const json = await response.json();
        return json.data as Array<{
            title: string;
            isHomeFixed: boolean;
            layout: {
                x: number | null;
                y: number | null;
                expanded: boolean;
            } | null;
        }>;
    });
    const fixedNotes = createdNotes.filter((note) => note.isHomeFixed);
    assertEquals(fixedNotes.length, 2);
    assertEquals(
        fixedNotes.map((note) => note.title).sort(),
        [
            "Issue #180 fixed note one",
            "Issue #180 fixed note two",
        ].sort(),
    );
    assertEquals(
        fixedNotes.every((note) =>
            note.layout !== null &&
            note.layout.x === null &&
            note.layout.y === null &&
            note.layout.expanded === true
        ),
        true,
    );

    const searchInput = page.locator("#search-query");
    const submit = page.locator(".search-form .search-submit");
    await page.route("https://www.google.com/search*", async (route) => {
        const url = new URL(route.request().url());
        interceptedSearches.push({
            pathname: url.pathname,
            query: url.searchParams.get("q"),
        });
        await route.fulfill({
            status: 302,
            headers: {
                location: `${targetOrigin}/search-target${url.search}`,
            },
        });
    });

    async function waitForHomeWithNotes() {
        await page.locator("main.home-zen").waitFor({ state: "visible" });
        await page.locator(".search-form-wrap").waitFor({ state: "visible" });
        await page.evaluate(async () => {
            await document.fonts.ready;
        });
        await page.waitForFunction(() => {
            const canvas = document.querySelector(
                ".floating-notes--canvas",
            );
            if (!canvas) return true;
            const ready = canvas.getAttribute("data-placement-ready");
            return ready === null ||
                ready === "true" &&
                    canvas.getAttribute("aria-busy") !== "true";
        });
        await page.waitForFunction(
            ({ selector, expectedTitles }) => {
                const noteElements = Array.from(
                    document.querySelectorAll(selector),
                );
                return expectedTitles.every((title) =>
                    noteElements.some((note) => {
                        const rect = note.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 &&
                            note.querySelector(".note-title")
                                    ?.textContent?.trim() === title;
                    })
                );
            },
            {
                selector: HOME_NOTE_SELECTOR,
                expectedTitles: [
                    "Issue #180 fixed note one",
                    "Issue #180 fixed note two",
                ],
            },
        );
        await page.evaluate(() =>
            new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve())
                )
            )
        );
    }

    const expectedSearches: Array<{
        pathname: string;
        query: string | null;
    }> = [];
    const expectedTargets: Array<{ pathname: string; query: string }> = [];
    const clickViewports = [
        { width: 1440, height: 900 },
        { width: 1024, height: 768 },
    ];
    for (const [index, viewport] of clickViewports.entries()) {
        await page.setViewportSize(viewport);
        const homeResponse = index === 0
            ? await page.goto(`${origin}/`)
            : await page.reload();
        assertEquals(homeResponse?.status(), 200, "Home before Search submit");
        await waitForHomeWithNotes();

        const searchQuery =
            `issue 180 real submit click ${viewport.width}x${viewport.height}`;
        await searchInput.fill(searchQuery);
        await submit.waitFor({ state: "visible" });
        const geometry = await page.evaluate((noteSelector) => {
            const box = (element: Element | null) => {
                if (!element) return null;
                const rect = element.getBoundingClientRect();
                return {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                };
            };
            const search = document.querySelector(".search-form-wrap");
            const button = document.querySelector(
                ".search-form .search-submit",
            );
            const buttonRect = button?.getBoundingClientRect();
            const hit = buttonRect
                ? document.elementFromPoint(
                    buttonRect.x + buttonRect.width / 2,
                    buttonRect.y + buttonRect.height / 2,
                )
                : null;
            return {
                viewport: { width: innerWidth, height: innerHeight },
                search: box(search),
                submit: box(button),
                submitCenterHit: hit instanceof HTMLElement
                    ? {
                        tagName: hit.tagName,
                        className: hit.className,
                        isHomeNote: hit.closest(
                            ".note-position, .note-flow-item",
                        ) !== null,
                        html: hit.outerHTML.slice(0, 500),
                    }
                    : null,
                notes: Array.from(
                    document.querySelectorAll(noteSelector),
                ).map((note) => ({
                    id: note.getAttribute("data-note-id"),
                    title: note.querySelector(".note-title")?.textContent
                        ?.trim() ?? "",
                    rect: box(note),
                    html: note.outerHTML.slice(0, 500),
                })),
            };
        }, HOME_NOTE_SELECTOR);
        const viewportLabel = `${viewport.width}x${viewport.height}`;
        const evidencePath =
            `${evidenceDir}/issue-180-zen-search-click-${viewportLabel}.json`;
        const screenshotPath =
            `${evidenceDir}/issue-180-zen-search-before-submit-${viewportLabel}.png`;
        const baseEvidence = {
            issue: 180,
            viewport,
            query: searchQuery,
            apiLayout: fixedNotes.map((note) => ({
                title: note.title,
                x: note.layout?.x,
                y: note.layout?.y,
                expanded: note.layout?.expanded,
            })),
            geometry,
            screenshotPath,
        };
        const writeEvidence = async (extra: {
            clickError?: string;
            failedScreenshotPath?: string;
            controlledTargetUrl?: string;
        } = {}) => {
            await Deno.writeTextFile(
                evidencePath,
                JSON.stringify({ ...baseEvidence, ...extra }, null, 2),
            );
        };
        await writeEvidence();
        await page.screenshot({ path: screenshotPath, fullPage: true });

        expectedSearches.push({ pathname: "/search", query: searchQuery });
        expectedTargets.push({
            pathname: "/search-target",
            query: searchQuery,
        });
        try {
            await submit.click({ timeout: 2500 });
        } catch (error) {
            const clickError = error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
            const failedScreenshotPath =
                `${evidenceDir}/issue-180-zen-search-click-failed-${viewportLabel}.png`;
            await page.screenshot({
                path: failedScreenshotPath,
                fullPage: true,
            });
            await writeEvidence({ clickError, failedScreenshotPath });
            throw error;
        }

        await page.waitForURL((url) =>
            url.origin === targetOrigin && url.pathname === "/search-target"
        );
        await page.locator("#controlled-search-target").waitFor({
            state: "visible",
        });
        assertEquals(interceptedSearches, expectedSearches);
        assertEquals(
            targetRequests.filter((request) =>
                request.pathname === "/search-target"
            ),
            expectedTargets,
        );
        await writeEvidence({ controlledTargetUrl: page.url() });
        const returnResponse = await page.goto(`${origin}/`);
        assertEquals(
            returnResponse?.status(),
            200,
            "Return to Home and reload fixed notes",
        );
        await waitForHomeWithNotes();
    }
});

Deno.test("Home floating-note placement and responsive matrix", async () => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({
        prefix: "searcher_home_notes_180_matrix_",
    });
    cleanup.defer(() => Deno.remove(files, { recursive: true }));
    const evidenceDir = await createEvidenceDirectory(
        "home-notes-order-180-matrix",
    );

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
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
        ignoreDefaultArgs: ["--hide-scrollbars"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        colorScheme: "light",
        viewport: { width: 1440, height: 900 },
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();
    const username = "issue180_notes_matrix";
    const password = "Issue-180-matrix-password!";
    const titles = [
        "Issue #180 default note one",
        "Issue #180 default note two",
        "Issue #180 saved note",
    ];

    type NoteState = {
        id: string;
        title: string;
        isHomeFixed: boolean;
        layout: {
            x: number | null;
            y: number | null;
            expanded: boolean;
        } | null;
    };
    type HomeMetrics = {
        width: number;
        height: number;
        documentWidth: number;
        bodyWidth: number;
        search: { x: number; y: number; width: number; height: number } | null;
        submitHit: boolean;
        submitDisabled: boolean;
        flow: boolean;
        notes: Array<{
            title: string;
            x: number;
            y: number;
            width: number;
            height: number;
        }>;
    };

    async function readNotes(): Promise<NoteState[]> {
        return await page.evaluate(async () => {
            const response = await fetch("/api/notes");
            if (!response.ok) {
                throw new Error(`GET /api/notes failed: ${response.status}`);
            }
            const json = await response.json();
            return json.data as NoteState[];
        });
    }

    function layoutSnapshot(notes: NoteState[]) {
        return notes
            .filter((note) => note.isHomeFixed)
            .map((note) => ({
                title: note.title,
                x: note.layout?.x ?? null,
                y: note.layout?.y ?? null,
                expanded: note.layout?.expanded ?? null,
            }))
            .sort((a, b) => a.title.localeCompare(b.title));
    }

    async function waitForHomeLayout(style: "zen" | "widgets") {
        await page.evaluate(async () => {
            await document.fonts.ready;
        });
        await page.evaluate(() =>
            new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve())
                )
            )
        );
        const viewport = page.viewportSize();
        if (style === "zen" && viewport && viewport.width < 768) {
            await page.locator(".zen-inline-note").waitFor({
                state: "visible",
            });
            return;
        }
        if (style === "zen" && viewport && viewport.width > 960) {
            await page.waitForFunction(() => {
                const canvas = document.querySelector(
                    ".floating-notes--canvas",
                );
                if (!canvas) return true;
                const ready = canvas.getAttribute("data-placement-ready");
                return ready === null ||
                    ready === "true" &&
                        canvas.getAttribute("aria-busy") !== "true";
            });
        }
        await page.waitForFunction(
            ({ selector, expectedTitles }) => {
                const noteElements = Array.from(
                    document.querySelectorAll(selector),
                );
                return expectedTitles.every((title) =>
                    noteElements.some((note) => {
                        const rect = note.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 &&
                            note.querySelector(".note-title")
                                    ?.textContent?.trim() === title;
                    })
                );
            },
            { selector: HOME_NOTE_SELECTOR, expectedTitles: titles },
        );
    }

    async function setHome(
        style: "zen" | "widgets",
        theme: "light" | "dark",
    ) {
        await page.emulateMedia({ colorScheme: theme });
        const status = await page.evaluate(async ({ style, theme }) => {
            const response = await fetch("/api/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ style, theme }),
            });
            return response.status;
        }, { style, theme });
        assertEquals(status, 200);
        await page.reload();
        await page.locator(`main.home-${style}`).waitFor({
            state: "visible",
        });
        await page.waitForFunction(
            (expectedTheme) =>
                document.documentElement.getAttribute("data-theme") ===
                    expectedTheme &&
                document.querySelector(".search-form-wrap") !== null,
            theme,
        );
        await waitForHomeLayout(style);
    }

    async function measureHome(): Promise<HomeMetrics> {
        return await page.evaluate(() => {
            const rect = (element: Element | null) => {
                if (!element) return null;
                const box = element.getBoundingClientRect();
                return {
                    x: box.x,
                    y: box.y,
                    width: box.width,
                    height: box.height,
                };
            };
            const search = document.querySelector(".search-form-wrap");
            const submit = document.querySelector<HTMLButtonElement>(
                ".search-form .search-submit",
            );
            const submitRect = submit?.getBoundingClientRect();
            const hit = submitRect
                ? document.elementFromPoint(
                    submitRect.x + submitRect.width / 2,
                    submitRect.y + submitRect.height / 2,
                )
                : null;
            const noteSelector =
                ".floating-notes .note-position, .notes-flow-grid .note-flow-item, " +
                ".floating-notes--flow .note-position, .controlled-note-slot";
            return {
                width: innerWidth,
                height: innerHeight,
                documentWidth: document.documentElement.scrollWidth,
                bodyWidth: document.body.scrollWidth,
                search: rect(search),
                submitHit: Boolean(
                    submit && hit &&
                        (hit === submit || submit.contains(hit)),
                ),
                submitDisabled: submit?.disabled ?? true,
                flow: document.querySelector(
                    ".notes-flow-grid, .floating-notes--flow",
                ) !== null,
                notes: Array.from(
                    document.querySelectorAll(noteSelector),
                ).map((note) => ({
                    title: note.querySelector(".note-title")?.textContent
                        ?.trim() ?? "",
                    ...rect(note)!,
                })),
            };
        });
    }

    async function assertSearchUsable(label: string) {
        await page.locator("#search-query").fill("Issue 180 matrix search");
        await page.waitForFunction(() => {
            const submit = document.querySelector<HTMLButtonElement>(
                ".search-form .search-submit",
            );
            return submit !== null && !submit.disabled;
        });
        const metrics = await measureHome();
        assertEquals(
            metrics.documentWidth <= metrics.width,
            true,
            `${label}: document must not overflow horizontally`,
        );
        assertEquals(
            metrics.bodyWidth <= metrics.width,
            true,
            `${label}: body must not overflow horizontally`,
        );
        assertEquals(
            metrics.search !== null &&
                metrics.search.x >= -1 &&
                metrics.search.x + metrics.search.width <=
                    metrics.width + 1,
            true,
            `${label}: Search must remain inside the viewport`,
        );
        assertEquals(
            metrics.submitDisabled,
            false,
            `${label}: Search submit must be enabled`,
        );
        assertEquals(
            metrics.submitHit,
            true,
            `${label}: Search submit center must hit the real button`,
        );
        await page.locator("#search-query").fill("");
    }

    function assertNoDefaultNoteOverlap(
        metrics: HomeMetrics,
        label: string,
    ) {
        assertEquals(metrics.notes.length, titles.length, `${label}: notes`);
        if (!metrics.search) {
            throw new Error(`${label}: Search geometry is unavailable`);
        }
        const search = metrics.search;
        for (const title of titles.slice(0, 2)) {
            const note = metrics.notes.find((item) => item.title === title);
            assertEquals(note !== undefined, true, `${label}: ${title}`);
            if (!metrics.flow) {
                const withinViewport = note!.x >= 0 &&
                    note!.y >= 0 &&
                    note!.x + note!.width <= metrics.width + 1 &&
                    note!.y + note!.height <= metrics.height + 1;
                assertEquals(
                    withinViewport,
                    true,
                    `${label}: default note must fit the viewport: ${title}`,
                );
            }
            const overlapsSearch = note!.x <
                    search.x + search.width &&
                note!.x + note!.width > search.x &&
                note!.y < search.y + search.height &&
                note!.y + note!.height > search.y;
            assertEquals(
                overlapsSearch,
                false,
                `${label}: default note must not overlap Search: ${title}`,
            );
        }
    }

    const registration = await page.goto(`${origin}/register`);
    assertEquals(registration?.status(), 200);
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Issue 180 Matrix");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`${origin}/`);

    const createdNotes = await page.evaluate(async (noteTitles) => {
        const body = Array.from(
            { length: 40 },
            (_, index) =>
                `Issue #180 matrix note line ${index + 1}. ` +
                "Expanded content for placement and responsive checks. ",
        ).join("\n");
        const layouts = [
            {
                deviceClass: "desktop",
                x: null,
                y: null,
                width: null,
                zIndex: 1,
                expanded: true,
            },
            {
                deviceClass: "desktop",
                x: null,
                y: null,
                width: null,
                zIndex: 2,
                expanded: true,
            },
            {
                deviceClass: "desktop",
                x: 700,
                y: 420,
                width: null,
                zIndex: 3,
                expanded: true,
            },
        ];
        const notes: NoteState[] = [];
        for (const [index, title] of noteTitles.entries()) {
            const response = await fetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title,
                    body,
                    isHomeFixed: true,
                    sortOrder: index,
                    layout: layouts[index],
                }),
            });
            if (!response.ok) {
                throw new Error(
                    `POST /api/notes failed: ${response.status} ${await response
                        .text()}`,
                );
            }
            notes.push((await response.json()).data as NoteState);
        }
        return notes;
    }, titles);
    const initialSnapshot = [
        {
            title: titles[0],
            x: null,
            y: null,
            expanded: true,
        },
        {
            title: titles[1],
            x: null,
            y: null,
            expanded: true,
        },
        {
            title: titles[2],
            x: 700,
            y: 420,
            expanded: true,
        },
    ].sort((a, b) => a.title.localeCompare(b.title));
    assertEquals(layoutSnapshot(await readNotes()), initialSnapshot);

    // First-screen geometry at both desktop widths, in both themes. Resizing
    // within a theme exercises the live viewport measurement path.
    for (const theme of ["light", "dark"] as const) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await setHome("zen", theme);
        let firstScreen = await measureHome();
        assertNoDefaultNoteOverlap(firstScreen, `1440/${theme}`);
        await page.screenshot({
            path: `${evidenceDir}/first-screen-zen-1440-${theme}.png`,
            fullPage: false,
        });
        await assertSearchUsable(`1440/${theme}`);

        await page.setViewportSize({ width: 1024, height: 768 });
        await waitForHomeLayout("zen");
        firstScreen = await measureHome();
        assertNoDefaultNoteOverlap(firstScreen, `1024/${theme}`);
        await page.screenshot({
            path: `${evidenceDir}/first-screen-zen-1024-${theme}.png`,
            fullPage: false,
        });
        await assertSearchUsable(`1024/${theme}`);
        assertEquals(layoutSnapshot(await readNotes()), initialSnapshot);
    }

    // Mobile previews are covered by #191; tablet retains flowing cards.
    // The short 961px case forces fallback when the viewport is too low.
    await setHome("zen", "dark");
    for (
        const viewport of [
            { width: 768, height: 1024 },
            { width: 960, height: 640 },
        ]
    ) {
        await page.setViewportSize(viewport);
        await waitForHomeLayout("zen");
        const metrics = await measureHome();
        assertEquals(
            metrics.flow,
            true,
            `${viewport.width}px Zen fixed notes must retain in-flow layout`,
        );
        assertNoDefaultNoteOverlap(metrics, `${viewport.width}px Zen`);
        await assertSearchUsable(`${viewport.width}px Zen`);
    }
    await page.setViewportSize({ width: 961, height: 390 });
    await waitForHomeLayout("zen");
    const shortScreen = await measureHome();
    assertEquals(
        shortScreen.flow,
        true,
        "961x390 must reflow notes when no floating position fits",
    );
    assertNoDefaultNoteOverlap(
        shortScreen,
        "961x390 Zen short-screen fallback",
    );
    await assertSearchUsable("961x390 Zen short-screen fallback");
    assertEquals(layoutSnapshot(await readNotes()), initialSnapshot);
    await page.mouse.move(8, 380);
    await page.mouse.wheel(0, 500);
    await page.waitForFunction(() => scrollY > 0, undefined, { timeout: 5000 });
    await page.evaluate(() =>
        new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );
    assertEquals(
        await page.evaluate(() => scrollY > 0),
        true,
        "Scrolling to overflow notes must not remove the flow and reset the page",
    );
    assertEquals(
        (await measureHome()).notes.filter((note) => note.title !== titles[2])
            .length,
        2,
    );
    await page.screenshot({
        path: `${evidenceDir}/short-screen-overflow-scrolled.png`,
        fullPage: false,
    });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForFunction(() => scrollY === 0);

    // Real viewport screenshots cover both Home styles at the specified
    // widths/themes; actionability is checked by the actual submit hit target.
    for (
        const viewport of [
            { width: 390, height: 844 },
            { width: 768, height: 1024 },
            { width: 1440, height: 900 },
        ]
    ) {
        for (const theme of ["light", "dark"] as const) {
            for (const style of ["zen", "widgets"] as const) {
                await page.setViewportSize(viewport);
                await setHome(style, theme);
                await assertSearchUsable(
                    `${viewport.width}/${theme}/${style}`,
                );
                await page.screenshot({
                    path:
                        `${evidenceDir}/matrix-${viewport.width}-${theme}-${style}.png`,
                    fullPage: false,
                });
            }
        }
    }
    assertEquals(layoutSnapshot(await readNotes()), initialSnapshot);

    // One representative desktop drag + collapse path proves persisted
    // geometry is written by user action and retained by the mode toggle.
    await page.setViewportSize({ width: 1440, height: 900 });
    await setHome("zen", "light");
    const draggedTitle = titles[0];
    const draggedSeed = createdNotes.find((note) =>
        note.title === draggedTitle
    )!;
    function floatingNote(title: string) {
        return page.locator(".floating-notes .note-position").filter({
            hasText: title,
        });
    }
    const notePosition = floatingNote(draggedTitle);
    await notePosition.waitFor({ state: "visible" });
    // Layering and folding are not manual placement: coordinates stay null.
    await Promise.all([
        page.waitForResponse((response) =>
            new URL(response.url()).pathname ===
                `/api/notes/${draggedSeed.id}/layout` &&
            response.request().method() === "PUT" && response.ok(), {
            timeout: 5000,
        }).catch((error) => {
            throw new Error("Default note layering did not persist", {
                cause: error,
            });
        }),
        notePosition.locator(".note-preview").click({
            position: { x: 10, y: 10 },
        }),
    ]);
    for (const label of ["折叠", "展开"]) {
        await waitForHomeLayout("zen");
        await notePosition.hover();
        await page.waitForFunction((title) => {
            const note = Array.from(
                document.querySelectorAll(".note-position"),
            ).find((element) =>
                element.querySelector(".note-title")?.textContent === title
            );
            const actions = note?.querySelector(".note-card-actions");
            return actions && getComputedStyle(actions).opacity === "1" &&
                getComputedStyle(actions).pointerEvents !== "none";
        }, draggedTitle);
        await Promise.all([
            page.waitForResponse(
                (response) =>
                    new URL(response.url()).pathname ===
                        `/api/notes/${draggedSeed.id}/layout` &&
                    response.request().method() === "PUT" && response.ok(),
                { timeout: 5000 },
            ).catch((error) => {
                throw new Error(`Default note ${label} did not persist`, {
                    cause: error,
                });
            }),
            notePosition.getByRole("button", { name: label, exact: true })
                .click(),
        ]);
        const defaultNote = (await readNotes()).find((note) =>
            note.id === draggedSeed.id
        )!;
        assertEquals(
            { x: defaultNote.layout?.x, y: defaultNote.layout?.y },
            { x: null, y: null },
            `${label} must not convert automatic placement into saved coordinates`,
        );
    }
    const dragHandle = notePosition.locator(".note-drag-handle");
    const handleBox = await dragHandle.boundingBox();
    if (!handleBox) throw new Error("Issue #180 drag handle is unavailable");
    const positionBefore = await notePosition.evaluate((element) => {
        const style = (element as HTMLElement).style;
        return {
            x: Number.parseFloat(style.left),
            y: Number.parseFloat(style.top),
        };
    });
    const dragSave = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname ===
                `/api/notes/${draggedSeed.id}/layout` &&
            response.request().method() === "PUT" &&
            response.ok(),
        { timeout: 5000 },
    );
    await page.mouse.move(
        handleBox.x + handleBox.width / 2,
        handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
        handleBox.x + handleBox.width / 2 + 90,
        handleBox.y + handleBox.height / 2 + 50,
        { steps: 10 },
    );
    await page.mouse.up();
    await dragSave;
    await page.waitForFunction(
        async ({ id, title }) => {
            const response = await fetch("/api/notes");
            if (!response.ok) return false;
            const json = await response.json();
            const note = (json.data as NoteState[]).find((item) =>
                item.id === id
            );
            const position = Array.from(
                document.querySelectorAll(".floating-notes .note-position"),
            ).find((item) =>
                item.querySelector(".note-title")?.textContent?.trim() === title
            ) as HTMLElement | undefined;
            if (!note || !position) return false;
            return note.layout?.x === Number.parseFloat(position.style.left) &&
                note.layout?.y === Number.parseFloat(position.style.top);
        },
        { id: draggedSeed.id, title: draggedTitle },
        { timeout: 5000 },
    );
    const afterDrag = (await readNotes()).find((note) =>
        note.id === draggedSeed.id
    )!;
    const afterDragPosition = await notePosition.evaluate((element) => {
        const style = (element as HTMLElement).style;
        return {
            x: Number.parseFloat(style.left),
            y: Number.parseFloat(style.top),
        };
    });
    assertEquals(
        afterDrag.layout !== null &&
            afterDrag.layout.x === afterDragPosition.x &&
            afterDrag.layout.y === afterDragPosition.y &&
            (afterDragPosition.x !== positionBefore.x ||
                afterDragPosition.y !== positionBefore.y),
        true,
        "Dragging a default note must save its new desktop coordinates",
    );

    await page.reload();
    await page.locator("main.home-zen").waitFor({ state: "visible" });
    await page.evaluate(async () => {
        await document.fonts.ready;
    });
    await notePosition.waitFor({ state: "visible" });
    const reloadedPosition = await floatingNote(draggedTitle).evaluate(
        (element) => {
            const style = (element as HTMLElement).style;
            return {
                x: Number.parseFloat(style.left),
                y: Number.parseFloat(style.top),
            };
        },
    );
    assertEquals(reloadedPosition, afterDragPosition);

    const foldButton = floatingNote(draggedTitle).locator(
        'button.note-action-btn[aria-label="折叠"]',
    );
    const foldSave = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname ===
                `/api/notes/${draggedSeed.id}/layout` &&
            response.request().method() === "PUT" &&
            response.ok(),
        { timeout: 5000 },
    );
    await foldButton.click();
    await foldSave;
    await floatingNote(draggedTitle).locator(".note-card--compact").waitFor({
        state: "visible",
    });
    const afterFoldNotes = await readNotes();
    const afterFold = afterFoldNotes.find((note) =>
        note.id === draggedSeed.id
    )!;
    const preexistingSavedNote = afterFoldNotes.find((note) =>
        note.title === titles[2]
    )!;
    assertEquals(
        {
            x: preexistingSavedNote.layout?.x,
            y: preexistingSavedNote.layout?.y,
        },
        { x: 700, y: 420 },
    );
    assertEquals(
        {
            x: afterFold.layout?.x,
            y: afterFold.layout?.y,
            expanded: afterFold.layout?.expanded,
        },
        {
            x: afterDrag.layout?.x,
            y: afterDrag.layout?.y,
            expanded: false,
        },
    );

    // The second account starts with no notes and can save an identically
    // titled note without changing the first account's saved coordinates.
    const secondContext = await browser.newContext({
        viewport: { width: 1440, height: 900 },
    });
    cleanup.defer(() => secondContext.close());
    const secondPage = await secondContext.newPage();
    const secondRegistration = await secondPage.goto(`${origin}/register`);
    assertEquals(secondRegistration?.status(), 200);
    await secondPage.locator("#auth-username").fill("issue180_second_account");
    await secondPage.locator("#auth-display-name").fill("Issue 180 Second");
    await secondPage.locator("#auth-password").fill(
        "Issue-180-second-password!",
    );
    await secondPage.locator('form button[type="submit"]').click();
    await secondPage.waitForURL(`${origin}/`);
    const secondUserNotes = await secondPage.evaluate(async () => {
        const response = await fetch("/api/notes");
        if (!response.ok) {
            throw new Error(`GET /api/notes failed: ${response.status}`);
        }
        return (await response.json()).data as NoteState[];
    });
    assertEquals(secondUserNotes, []);
    const secondUserNote = await secondPage.evaluate(async (title) => {
        const response = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title,
                body: "Separate account layout.",
                isHomeFixed: true,
                layout: {
                    deviceClass: "desktop",
                    x: 55,
                    y: 60,
                    width: null,
                    zIndex: 1,
                    expanded: true,
                },
            }),
        });
        if (!response.ok) {
            throw new Error(
                `POST /api/notes failed: ${response.status} ${await response
                    .text()}`,
            );
        }
        return (await response.json()).data as NoteState;
    }, draggedTitle);
    assertEquals(secondUserNote.title, draggedTitle);
    assertEquals(secondUserNote.layout?.x, 55);
    assertEquals(secondUserNote.layout?.y, 60);
    const firstUserAfterOtherAccount = (await readNotes()).find((note) =>
        note.id === draggedSeed.id
    )!;
    assertEquals(
        {
            id: firstUserAfterOtherAccount.id,
            x: firstUserAfterOtherAccount.layout?.x,
            y: firstUserAfterOtherAccount.layout?.y,
            expanded: firstUserAfterOtherAccount.layout?.expanded,
        },
        {
            id: draggedSeed.id,
            x: afterDrag.layout?.x,
            y: afterDrag.layout?.y,
            expanded: false,
        },
    );
    const savedNoteAfterOtherAccount = (await readNotes()).find((note) =>
        note.title === titles[2]
    )!;
    assertEquals(
        {
            x: savedNoteAfterOtherAccount.layout?.x,
            y: savedNoteAfterOtherAccount.layout?.y,
        },
        { x: 700, y: 420 },
    );
});
