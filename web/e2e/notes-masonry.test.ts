import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright";
import type { Browser, Locator, Page, Request } from "playwright";
import { startProductionApp } from "./helpers/production-app.ts";

const GAP = 16;
const MASONRY_ITEM = ".notes-workspace-masonry-item";
const OVERLAY = ".notes-workspace-masonry-overlay";
const DESKTOP_ROOT = '.desktop-window[data-window-id="notes"]';

interface NoteRecord {
    id: string;
    title: string;
    body: string;
    color: string;
    isPinned: boolean;
    isHomeFixed: boolean;
    sortOrder: number;
    version: number;
    updatedAt: number;
    layout?: Record<string, unknown> | null;
}

interface Fixture {
    page: Page;
    root: Locator;
    fixed: NoteRecord[];
    other: NoteRecord[];
}

interface NoteWrite {
    method: string;
    path: string;
    body: Record<string, unknown> | null;
}

async function api<T>(
    page: Page,
    path: string,
    method = "GET",
    data?: unknown,
): Promise<T> {
    const response = await page.request.fetch(path, {
        method,
        data,
        headers: { Origin: new URL(page.url()).origin },
    });
    assert(response.ok(), `${method} ${path}: ${await response.text()}`);
    return (await response.json()).data as T;
}

function canonicalOrder(notes: NoteRecord[]): string[] {
    return notes.slice().sort((a, b) =>
        Number(b.isPinned) - Number(a.isPinned) ||
        a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
    ).map((note) => note.id);
}

async function snapshot(page: Page): Promise<NoteRecord[]> {
    return (await api<NoteRecord[]>(page, "/api/notes"))
        .sort((a, b) => a.id.localeCompare(b.id));
}

function observeWrites(page: Page, cleanup: AsyncDisposableStack): NoteWrite[] {
    const writes: NoteWrite[] = [];
    const listener = (request: Request) => {
        const path = new URL(request.url()).pathname;
        if (request.method() === "GET" || !/^\/api\/notes(?:\/|$)/.test(path)) {
            return;
        }
        writes.push({
            method: request.method(),
            path,
            body: request.postData() ? request.postDataJSON() : null,
        });
    };
    page.on("request", listener);
    cleanup.defer(() => {
        page.off("request", listener);
    });
    return writes;
}

async function openNotes(page: Page): Promise<void> {
    await page.locator(
        '.desktop-dock button[data-workspace="notes"], .workspace-mobile-navigation button[data-workspace="notes"], .zen-edge-btn[data-workspace="notes"], .zen-edge-trigger button[data-workspace="notes"], button[aria-label="便签工作区"]',
    ).first().click();
    await page.locator(`${DESKTOP_ROOT}, .workspace-panel`).waitFor({
        state: "visible",
    });
}

async function closeNotes(fixture: Fixture): Promise<void> {
    await fixture.root.locator(
        '.desktop-window-chrome-btn--close, button[aria-label="收起工作区"]',
    ).click();
    await fixture.root.waitFor({ state: "hidden" });
}

async function createFixture(
    browser: Browser,
    origin: string,
    cleanup: AsyncDisposableStack,
    name: string,
    options: {
        style?: "widgets" | "zen";
        viewport?: { width: number; height: number };
        scheme?: "light" | "dark";
        open?: boolean;
    } = {},
): Promise<Fixture> {
    const context = await browser.newContext({
        baseURL: origin,
        viewport: options.viewport ?? { width: 1440, height: 1100 },
        colorScheme: options.scheme ?? "light",
        reducedMotion: "reduce",
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();
    const response = await page.goto("/register");
    assertEquals(response?.status(), 200);
    await page.locator("#auth-username").fill(`masonry_${name}`);
    await page.locator("#auth-display-name").fill("Masonry contract tester");
    await page.locator("#auth-password").fill("Masonry-contract-109!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await api(page, "/api/preferences", "PATCH", {
        style: options.style ?? "widgets",
        theme: "system",
    });

    const notes: NoteRecord[] = [];
    const specifications = [
        {
            label: "Pinned",
            paragraphs: 2,
            pinned: true,
            home: false,
            needle: true,
        },
        {
            label: "Home",
            paragraphs: 1,
            pinned: false,
            home: true,
            needle: false,
        },
        {
            label: "A",
            paragraphs: 18,
            pinned: false,
            home: false,
            needle: true,
        },
        {
            label: "B",
            paragraphs: 1,
            pinned: false,
            home: false,
            needle: false,
        },
        { label: "C", paragraphs: 0, pinned: false, home: false, needle: true },
        {
            label: "D",
            paragraphs: 0,
            pinned: false,
            home: false,
            needle: false,
        },
        {
            label: "E",
            paragraphs: 1,
            pinned: false,
            home: false,
            needle: false,
        },
        {
            label: "F",
            paragraphs: 0,
            pinned: false,
            home: false,
            needle: false,
        },
    ];
    for (const [index, spec] of specifications.entries()) {
        const body = [
            `# Masonry ${spec.label} detail`,
            `Content${spec.needle ? " needle" : ""}.`,
            ...Array.from(
                { length: spec.paragraphs },
                (_, paragraph) =>
                    spec.label === "B"
                        ? `Medium paragraph ${paragraph + 1}.`
                        : `Paragraph ${
                            paragraph + 1
                        }: measured Markdown content occupies its own line and changes this card's actual height.`,
            ),
        ].join("\n\n");
        notes.push(
            await api<NoteRecord>(page, "/api/notes", "POST", {
                title: `Masonry ${spec.label}`,
                body,
                color: index % 2 === 0 ? "paper" : "sage",
                isPinned: spec.pinned,
                isHomeFixed: spec.home,
                sortOrder: index,
                layout: {
                    deviceClass: "desktop",
                    x: 120,
                    y: 220,
                    width: 250,
                    expanded: false,
                },
            }),
        );
    }
    await page.goto("/");
    await page.locator("main").waitFor({ state: "visible" });
    if (options.open !== false) {
        await openNotes(page);
        await page.locator(".notes-workspace .note-list-summary").first()
            .waitFor({ state: "visible" });
    }
    return {
        page,
        root: page.locator(`${DESKTOP_ROOT}, .workspace-panel`),
        fixed: notes.slice(0, 2),
        other: notes.slice(2),
    };
}

function fixedList(fixture: Fixture): Locator {
    return fixture.root.getByRole("region", {
        name: "置顶与首页固定",
        exact: true,
    })
        .locator(".notes-workspace-list");
}

function otherList(fixture: Fixture): Locator {
    return fixture.root.getByRole("region", { name: /^(其他便签|全部便签)$/ })
        .locator(".notes-workspace-list");
}

function searchList(fixture: Fixture): Locator {
    return fixture.root.getByRole("region", { name: "搜索结果", exact: true })
        .locator(".notes-workspace-list");
}

function item(fixture: Fixture, id: string): Locator {
    return fixture.root.locator(`[data-note-id="${id}"]`);
}

function card(fixture: Fixture, id: string): Locator {
    return item(fixture, id).locator(".note-card");
}

async function box(locator: Locator) {
    const result = await locator.boundingBox();
    assert(result, "Expected a measurable element");
    return result;
}

// This oracle reads final production geometry. It does not import the layout
// engine, so using row-major placement or stale/default heights cannot pass.
async function waitMasonry(
    list: Locator,
    expectedIds: string[],
    expectedColumns?: number,
) {
    await list.waitFor({ state: "visible" });
    return await list.evaluate(async (element, { ids, columns, gap }) => {
        const measure = () => {
            const container = element.getBoundingClientRect();
            const items = Array.from(element.querySelectorAll<HTMLElement>(
                ":scope > .notes-workspace-masonry-item",
            )).map((wrapper) => {
                const rect = wrapper.getBoundingClientRect();
                const note = wrapper.querySelector<HTMLElement>(".note-card")!;
                return {
                    id: wrapper.dataset.noteId,
                    x: rect.x - container.x,
                    y: rect.y - container.y,
                    width: rect.width,
                    height: rect.height,
                    cardWidth: note.getBoundingClientRect().width,
                    visible: getComputedStyle(wrapper).visibility === "visible",
                };
            });
            return {
                layout: (element as HTMLElement).dataset.layout,
                columns: Number((element as HTMLElement).dataset.columns),
                width: element.clientWidth,
                height: container.height,
                overflow: element.scrollWidth > element.clientWidth + 2,
                items,
            };
        };
        const problem = (layout: ReturnType<typeof measure>): string | null => {
            if (layout.layout !== "masonry") return "Not masonry";
            const actualColumns = Math.max(
                1,
                Math.min(3, Math.floor((layout.width + gap) / (245 + gap))),
            );
            if (layout.columns !== (columns ?? actualColumns)) {
                return "Incorrect column count";
            }
            if (layout.columns !== actualColumns) {
                return "Wrong width threshold";
            }
            if (
                layout.items.map((note) => note.id).join("|") !== ids.join("|")
            ) {
                return "Canonical DOM order or membership changed";
            }
            if (layout.overflow) return "Horizontal list overflow";
            const columnWidth = (layout.width - gap * (layout.columns - 1)) /
                layout.columns;
            const bottoms = Array<number>(layout.columns).fill(0);
            for (const note of layout.items) {
                if (!note.visible || note.height <= 0) return "Unmeasured card";
                const shortest = bottoms.indexOf(Math.min(...bottoms));
                if (
                    Math.abs(note.x - shortest * (columnWidth + gap)) > 1.5 ||
                    Math.abs(note.y - bottoms[shortest]) > 1.5
                ) return `Not shortest-column placement: ${note.id}`;
                if (
                    Math.abs(note.width - columnWidth) > 2 ||
                    Math.abs(note.cardWidth - columnWidth) > 2
                ) return `Card does not fill its column: ${note.id}`;
                bottoms[shortest] += Math.round(note.height) + gap;
            }
            const expectedHeight = Math.max(...bottoms) - gap;
            if (Math.abs(layout.height - expectedHeight) > 2) {
                return "Stale masonry container height";
            }
            for (let a = 0; a < layout.items.length; a++) {
                for (let b = a + 1; b < layout.items.length; b++) {
                    const first = layout.items[a];
                    const second = layout.items[b];
                    const overlapX = Math.min(
                        first.x + first.width,
                        second.x + second.width,
                    ) - Math.max(first.x, second.x);
                    const overlapY = Math.min(
                        first.y + first.height,
                        second.y + second.height,
                    ) - Math.max(first.y, second.y);
                    if (overlapX > 1 && overlapY > 1) {
                        return "Overlapping cards";
                    }
                }
            }
            return null;
        };
        const deadline = performance.now() + 10_000;
        let layout = measure();
        let previous = "";
        let stableFrames = 0;
        while (stableFrames < 2) {
            const serialized = JSON.stringify(layout);
            stableFrames = !problem(layout) && serialized === previous
                ? stableFrames + 1
                : 0;
            previous = serialized;
            if (performance.now() > deadline) {
                throw new Error(
                    `${problem(layout)}: ${JSON.stringify(layout)}`,
                );
            }
            await new Promise<void>((resolve) =>
                requestAnimationFrame(() => resolve())
            );
            layout = measure();
        }
        return layout;
    }, { ids: expectedIds, columns: expectedColumns, gap: GAP });
}

async function assertNoHorizontalOverflow(fixture: Fixture): Promise<void> {
    const sizes = await fixture.root.evaluate((root) =>
        [
            root,
            ...root.querySelectorAll(".workspace-body, .notes-workspace-list"),
            document.documentElement,
        ].map((element) => ({
            element: element.className,
            width: element.clientWidth,
            scrollWidth: element.scrollWidth,
        }))
    );
    assert(
        sizes.every((size) => size.scrollWidth <= size.width + 2),
        `Horizontal overflow: ${JSON.stringify(sizes)}`,
    );
}

async function toggleExpanded(
    fixture: Fixture,
    id: string,
    expanded: boolean,
): Promise<void> {
    const note = card(fixture, id);
    await note.hover();
    await note.getByRole("button", {
        name: expanded ? "展开" : "折叠",
        exact: true,
    }).click();
    await fixture.page.mouse.move(0, 0);
    await fixture.page.waitForFunction(({ noteId, full }) => {
        const note = document.querySelector(
            `.notes-workspace [data-note-id="${noteId}"] .note-card`,
        );
        return note && note.classList.contains("note-card--compact") !== full;
    }, { noteId: id, full: expanded });
}

async function assertExpanded(fixture: Fixture, id: string): Promise<void> {
    assertEquals(
        await card(fixture, id).evaluate((note) =>
            note.classList.contains("note-card--compact")
        ),
        false,
        `Expansion must remain local and follow note id ${id}`,
    );
}

async function dragMouse(
    page: Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
): Promise<void> {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 12 });
}

async function moveWindowToInset(fixture: Fixture): Promise<void> {
    const chromeBottom = await fixture.page.evaluate(() =>
        Math.max(
            0,
            ...Array.from(
                document.querySelectorAll(".topbar, .connection-banner"),
            )
                .filter((element) => element.getClientRects().length > 0)
                .map((element) => element.getBoundingClientRect().bottom),
        )
    );
    const frame = await box(fixture.root);
    const title = await box(
        fixture.root.locator(".desktop-window-chrome-title"),
    );
    const from = {
        x: title.x + title.width / 2,
        y: title.y + title.height / 2,
    };
    await dragMouse(fixture.page, from, {
        x: from.x + 48 - frame.x,
        y: from.y + chromeBottom + 48 - frame.y,
    });
    await fixture.page.mouse.up();
    await fixture.page.waitForFunction(({ x, y }) => {
        const root = document.querySelector(
            '.desktop-window[data-window-id="notes"]',
        );
        if (!root || root.getAttribute("data-window-mode") !== "normal") {
            return false;
        }
        const rect = root.getBoundingClientRect();
        return Math.abs(rect.x - x) <= 1 && Math.abs(rect.y - y) <= 1;
    }, { x: 48, y: chromeBottom + 48 });
}

async function resizeWindow(
    fixture: Fixture,
    direction: "e" | "s" | "se",
    dx: number,
    dy: number,
): Promise<void> {
    const before = await box(fixture.root);
    const handle = await box(fixture.root.locator(
        `.desktop-window-resize-handle--${direction}`,
    ));
    const from = {
        x: handle.x + handle.width / 2,
        y: handle.y + handle.height / 2,
    };
    await fixture.page.mouse.move(from.x, from.y);
    await fixture.page.mouse.down();
    await fixture.page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
    await fixture.page.waitForFunction(({ width, height }) => {
        const root = document.querySelector(
            '.desktop-window[data-window-id="notes"]',
        );
        if (!root) return false;
        const rect = root.getBoundingClientRect();
        return Math.abs(rect.width - width) <= 1 &&
            Math.abs(rect.height - height) <= 1;
    }, { width: before.width + dx, height: before.height + dy }).catch(
        async (error) => {
            throw new Error(
                `Resize ${direction} (${dx}, ${dy}), before ${
                    JSON.stringify(before)
                }, after ${JSON.stringify(await box(fixture.root))}`,
                { cause: error },
            );
        },
    );
    await fixture.page.mouse.up();
}

async function setListWidth(
    fixture: Fixture,
    list: Locator,
    width: number,
): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const current = await list.evaluate((element) => element.clientWidth);
        if (current === width) return;
        await resizeWindow(fixture, "e", width - current, 0);
    }
    assertEquals(
        await list.evaluate((element) => element.clientWidth),
        width,
        "Widths refer to the real list content box, not viewport or frame width",
    );
}

async function prepareDesktop(fixture: Fixture, width: number): Promise<void> {
    await moveWindowToInset(fixture);
    await resizeWindow(fixture, "s", 0, 180);
    await setListWidth(fixture, otherList(fixture), width);
    await waitMasonry(fixedList(fixture), fixture.fixed.map((note) => note.id));
    await waitMasonry(otherList(fixture), fixture.other.map((note) => note.id));
}

async function waitApiOrder(page: Page, ids: string[]): Promise<NoteRecord[]> {
    await page.waitForFunction(async (expected) => {
        const response = await fetch("/api/notes");
        if (!response.ok) return false;
        const { data } = await response.json();
        const notes = (data as NoteRecord[]).sort((a, b) =>
            Number(b.isPinned) - Number(a.isPinned) ||
            a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
        );
        return notes.map((note) => note.id).join("|") === expected.join("|") &&
            notes.every((note, index) => note.sortOrder === index);
    }, ids);
    const notes = await snapshot(page);
    assertEquals(
        canonicalOrder(notes),
        ids,
        "Reordering must persist through the real API",
    );
    return notes;
}

async function beginPointerSort(
    fixture: Fixture,
    activeId: string,
    overId: string,
    half: "upper" | "lower",
): Promise<void> {
    const list = otherList(fixture);
    const ids = await list.locator(MASONRY_ITEM).evaluateAll((items) =>
        items.map((element) => (element as HTMLElement).dataset.noteId!)
    );
    await item(fixture, overId).scrollIntoViewIfNeeded();
    const handle = item(fixture, activeId).getByRole("button", {
        name: /^排序 /,
    });
    await handle.hover();
    const geometry = await waitMasonry(list, ids);
    const active = await box(item(fixture, activeId));
    const over = await box(item(fixture, overId));
    const grip = await box(handle);
    assert(
        Math.abs(active.x - over.x) > 20,
        "Drop must cross a masonry column",
    );
    const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
    // The grip is above the card center. Compensate for that pickup offset;
    // raw pointer half-tests would not exercise the translated Y-center rule.
    const targetCenterY = over.y + over.height / 2 +
        (half === "upper" ? -12 : 12);
    const to = {
        x: over.x + over.width / 2 - (active.x + active.width / 2 - from.x),
        y: targetCenterY - (active.y + active.height / 2 - from.y),
    };
    assert(to.x > over.x && to.x < over.x + over.width);
    assert(to.y > over.y && to.y < over.y + over.height);
    await dragMouse(fixture.page, from, to);
    const overlay = fixture.page.locator(OVERLAY);
    await overlay.waitFor({ state: "visible" });
    const overlayBox = await box(overlay);
    assert(
        Math.abs(overlayBox.width - active.width) <= 2,
        "Overlay fills one column",
    );
    assert(
        Math.abs(
            (await box(overlay.locator(".note-card"))).width - active.width,
        ) <= 2,
        "The overlay card, not just its wrapper, must fill the current column",
    );
    const overlayCenterY = overlayBox.y + overlayBox.height / 2;
    assertEquals(
        overlayCenterY > over.y + over.height / 2,
        half === "lower",
        "Drop semantics use translated card center, not pointer center",
    );
    assertEquals(
        await item(fixture, activeId).getAttribute("data-dragging"),
        "true",
    );
    assertEquals(
        await list.locator(MASONRY_ITEM).count(),
        ids.length,
        "The original slot must remain while dragging",
    );
    assertEquals(
        await list.locator(OVERLAY).count(),
        0,
        "Overlay is not measured in the list",
    );
    assert(
        Math.abs((await box(list)).height - geometry.height) <= 2,
        "Overlay must not change container height",
    );
}

function assertOnlyOrderWrites(writes: NoteWrite[]): void {
    assert(
        writes.length > 0,
        "A completed reorder must write to the real notes API",
    );
    for (const write of writes) {
        assertEquals(write.method, "PATCH");
        assert(/^\/api\/notes\/[^/]+$/.test(write.path));
        assertEquals(Object.keys(write.body ?? {}).sort(), [
            "sortOrder",
            "version",
        ]);
    }
}

async function chooseNoteAction(
    fixture: Fixture,
    noteId: string,
    action: string,
    method = "PATCH",
): Promise<NoteRecord | undefined> {
    const note = card(fixture, noteId);
    await note.hover();
    await note.getByRole("button", { name: "更多操作", exact: true }).click();
    const response = fixture.page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/notes/${noteId}` &&
        response.request().method() === method
    );
    await fixture.page.locator(".note-dropdown-content").getByRole("menuitem", {
        name: action,
        exact: true,
    }).click();
    const saved = await response;
    assert(saved.ok(), await saved.text());
    await fixture.page.mouse.move(0, 0);
    return (await saved.json()).data as NoteRecord | undefined;
}

Deno.test("production notes masonry contracts (#109)", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const evidenceDir = await createEvidenceDirectory("notes-masonry");

    await t.step(
        "Content widths 505/506/766/767, max three columns and every desktop window operation are write-free",
        async () => {
            await using stepCleanup = new AsyncDisposableStack();
            const fixture = await createFixture(
                browser,
                app.origin,
                stepCleanup,
                "widths",
            );
            await prepareDesktop(fixture, 505);
            const { page, root, fixed, other } = fixture;
            const before = await snapshot(page);
            const writes = observeWrites(page, stepCleanup);
            await toggleExpanded(fixture, other[0].id, true);
            await root.locator("input[data-workspace-search]").fill("Masonry");
            const list = searchList(fixture);
            const ids = [...fixed, ...other].map((note) => note.id);
            const route = page.url();
            async function assertPreserved(columns?: number) {
                await waitMasonry(list, ids, columns);
                assertEquals(
                    await root.locator("input[data-workspace-search]")
                        .inputValue(),
                    "Masonry",
                );
                await assertExpanded(fixture, other[0].id);
                assertEquals(
                    page.url(),
                    route,
                    "Reflow must not navigate or refresh the route",
                );
                await assertNoHorizontalOverflow(fixture);
                assertEquals(
                    writes,
                    [],
                    "Presentation changes cannot reorder or write layout data",
                );
                assertEquals(await snapshot(page), before);
            }
            for (
                const [width, columns] of [
                    [505, 1],
                    [506, 2],
                    [766, 2],
                    [767, 3],
                    [1200, 3],
                    [767, 3],
                    [506, 2],
                    [505, 1],
                ]
            ) {
                await setListWidth(fixture, list, width);
                assertEquals(
                    await list.evaluate((element) => element.clientWidth),
                    width,
                );
                await assertPreserved(columns);
                await root.locator("input[data-workspace-search]").fill("");
                await waitMasonry(
                    fixedList(fixture),
                    fixed.map((note) => note.id),
                    columns,
                );
                await waitMasonry(
                    otherList(fixture),
                    other.map((note) => note.id),
                    columns,
                );
                await root.locator("input[data-workspace-search]").fill(
                    "Masonry",
                );
                await assertPreserved(columns);
            }
            await setListWidth(fixture, list, 767);
            await resizeWindow(fixture, "s", 0, -80);
            await assertPreserved(3);
            await resizeWindow(fixture, "s", 0, 80);
            await assertPreserved(3);
            await resizeWindow(fixture, "se", 60, 16);
            await assertPreserved(3);
            await resizeWindow(fixture, "se", -60, -16);
            await assertPreserved(3);

            const normal = await box(root);
            await root.getByRole("button", { name: "最大化窗口", exact: true })
                .click();
            await page.waitForFunction(() =>
                document.querySelector(
                    '.desktop-window[data-window-id="notes"]',
                )
                    ?.getAttribute("data-window-mode") === "maximized"
            );
            await assertPreserved(3);
            await root.getByRole("button", {
                name: "向下还原窗口",
                exact: true,
            }).click();
            await page.waitForFunction(({ width, height }) => {
                const window = document.querySelector(
                    '.desktop-window[data-window-id="notes"]',
                );
                if (window?.getAttribute("data-window-mode") !== "normal") {
                    return false;
                }
                const rect = window.getBoundingClientRect();
                return Math.abs(rect.width - width) <= 1 &&
                    Math.abs(rect.height - height) <= 1;
            }, normal);
            await assertPreserved(3);

            const canvas = await box(page.locator(".desktop-canvas"));
            const title = await box(
                root.locator(".desktop-window-chrome-title"),
            );
            await dragMouse(page, {
                x: title.x + title.width / 2,
                y: title.y + title.height / 2,
            }, {
                x: canvas.x + 16,
                y: canvas.y + canvas.height / 2,
            });
            await page.mouse.up();
            await page.waitForFunction(() => {
                const root = document.querySelector(
                    '.desktop-window[data-window-id="notes"]',
                );
                return root?.getAttribute("data-window-mode") === "snapped" &&
                    root.getAttribute("data-window-snap") === "left";
            });
            await assertPreserved(2);
            await root.getByRole("button", {
                name: "向下还原窗口",
                exact: true,
            }).click();
            await assertPreserved(3);
            await root.locator("input[data-workspace-search]").fill("");
            await waitMasonry(
                otherList(fixture),
                other.map((note) => note.id),
                3,
            );
            await assertExpanded(fixture, other[0].id);
            assertEquals(await snapshot(page), before);
            assertEquals(writes, []);
        },
    );

    await t.step(
        "768–1023 constrained presets reflow without resetting query, expansion or API order",
        async () => {
            await using stepCleanup = new AsyncDisposableStack();
            const fixture = await createFixture(
                browser,
                app.origin,
                stepCleanup,
                "presets",
                {
                    viewport: { width: 768, height: 1100 },
                },
            );
            const { page, root, other, fixed } = fixture;
            await waitMasonry(otherList(fixture), other.map((note) => note.id));
            await toggleExpanded(fixture, other[0].id, true);
            await root.locator("input[data-workspace-search]").fill("Masonry");
            const ids = [...fixed, ...other].map((note) => note.id);
            const before = await snapshot(page);
            const writes = observeWrites(page, stepCleanup);
            const route = page.url();
            for (const width of [768, 1023, 768]) {
                await page.setViewportSize({ width, height: 1100 });
                const frames = [];
                for (
                    const label of ["中等尺寸", "大尺寸", "全屏", "中等尺寸"]
                ) {
                    await root.getByRole("button", {
                        name: "窗口尺寸",
                        exact: true,
                    }).click();
                    await page.getByRole("menuitem", {
                        name: label,
                        exact: true,
                    }).click();
                    await page.getByRole("menu").waitFor({ state: "detached" });
                    await waitMasonry(searchList(fixture), ids);
                    frames.push(await box(root));
                    assertEquals(
                        await root.locator(".desktop-window-resize-handle")
                            .count(),
                        0,
                    );
                    assertEquals(
                        await root.locator("input[data-workspace-search]")
                            .inputValue(),
                        "Masonry",
                    );
                    await assertExpanded(fixture, other[0].id);
                    await assertNoHorizontalOverflow(fixture);
                    assertEquals(page.url(), route);
                    assertEquals(await snapshot(page), before);
                    assertEquals(writes, []);
                }
                assert(
                    frames[1].width > frames[0].width &&
                        frames[1].height > frames[0].height,
                );
                assert(
                    frames[2].width > frames[1].width &&
                        frames[2].height > frames[1].height,
                );
                assert(Math.abs(frames[3].width - frames[0].width) <= 1);
            }
            await root.locator("input[data-workspace-search]").fill("");
            await waitMasonry(fixedList(fixture), fixed.map((note) => note.id));
            await waitMasonry(otherList(fixture), other.map((note) => note.id));
            await assertExpanded(fixture, other[0].id);
            assertEquals(await snapshot(page), before);
            assertEquals(writes, []);
        },
    );

    await t.step(
        "Unequal expanded Markdown heights use shortest columns; expand/collapse restores geometry without writes",
        async () => {
            await using stepCleanup = new AsyncDisposableStack();
            const fixture = await createFixture(
                browser,
                app.origin,
                stepCleanup,
                "heights",
            );
            await prepareDesktop(fixture, 767);
            const ids = fixture.other.map((note) => note.id);
            const list = otherList(fixture);
            const compact = await waitMasonry(list, ids, 3);
            const before = await snapshot(fixture.page);
            const writes = observeWrites(fixture.page, stepCleanup);
            for (const note of fixture.other.slice(0, 3)) {
                await toggleExpanded(fixture, note.id, true);
                await waitMasonry(list, ids, 3);
            }
            const expanded = await waitMasonry(list, ids, 3);
            const [tall, medium, short, following] = expanded.items;
            assert(
                tall.height > medium.height && medium.height > short.height,
            );
            assert(
                following.x !== tall.x && following.y < tall.y + tall.height,
                "A tall first column must not block later cards in shorter columns",
            );
            assert(expanded.height > compact.height);
            for (const note of fixture.other.slice(0, 3)) {
                await toggleExpanded(fixture, note.id, false);
                await waitMasonry(list, ids, 3);
            }
            const collapsed = await waitMasonry(list, ids, 3);
            assert(
                Math.abs(collapsed.height - compact.height) <= 2,
                "Collapse cannot leave a stale tall hole",
            );
            assertEquals(
                collapsed.items.map(({ id, x, y, width }) => ({
                    id,
                    x,
                    y,
                    width,
                })),
                compact.items.map(({ id, x, y, width }) => ({
                    id,
                    x,
                    y,
                    width,
                })),
            );
            await assertNoHorizontalOverflow(fixture);
            assertEquals(writes, []);
            assertEquals(await snapshot(fixture.page), before);
        },
    );

    await t.step(
        "Search uses independent nonsortable masonry, prunes filtered geometry and clear restores grouping and expansion",
        async () => {
            await using stepCleanup = new AsyncDisposableStack();
            const fixture = await createFixture(
                browser,
                app.origin,
                stepCleanup,
                "search",
            );
            await prepareDesktop(fixture, 767);
            const { page, root, fixed, other } = fixture;
            await toggleExpanded(fixture, other[0].id, true);
            await waitMasonry(
                otherList(fixture),
                other.map((note) => note.id),
                3,
            );
            const before = await snapshot(page);
            const writes = observeWrites(page, stepCleanup);
            await root.locator("input[data-workspace-search]").fill("needle");
            const ids = [fixed[0].id, other[0].id, other[2].id];
            await waitMasonry(searchList(fixture), ids, 3);
            assertEquals(
                await root.getByRole("region", {
                    name: "置顶与首页固定",
                    exact: true,
                }).count(),
                0,
            );
            assertEquals(
                await root.getByRole("region", {
                    name: "其他便签",
                    exact: true,
                }).count(),
                0,
            );
            const handles = searchList(fixture).locator(
                'button[aria-label^="不可排序 "]',
            );
            assertEquals(await handles.count(), ids.length);
            for (const handle of await handles.all()) {
                assertEquals(
                    await handle.getAttribute("aria-disabled"),
                    "true",
                );
                assertEquals(await handle.getAttribute("tabindex"), "-1");
            }
            const grip = await box(handles.first());
            const target = await box(item(fixture, other[2].id));
            await dragMouse(page, {
                x: grip.x + grip.width / 2,
                y: grip.y + grip.height / 2,
            }, {
                x: target.x + target.width / 2,
                y: target.y + target.height / 2,
            });
            assertEquals(await page.locator(OVERLAY).count(), 0);
            await page.mouse.up();
            await handles.first().focus();
            await page.keyboard.press("Space");
            await page.keyboard.press("ArrowRight");
            await page.keyboard.press("Space");
            assertEquals(await page.locator(OVERLAY).count(), 0);
            await waitMasonry(searchList(fixture), ids, 3);
            await assertExpanded(fixture, other[0].id);
            await root.locator("input[data-workspace-search]").fill(
                "Masonry F",
            );
            await waitMasonry(searchList(fixture), [other[5].id], 3);
            await root.locator("input[data-workspace-search]").fill(
                "no-result-109",
            );
            await root.getByRole("heading", {
                name: "没有匹配的便签",
                exact: true,
            }).waitFor();
            assertEquals(
                await root.locator(".notes-workspace-list").count(),
                0,
                "Empty states are not masonry containers",
            );
            await root.locator("input[data-workspace-search]").fill("");
            await waitMasonry(
                fixedList(fixture),
                fixed.map((note) => note.id),
                3,
            );
            await waitMasonry(
                otherList(fixture),
                other.map((note) => note.id),
                3,
            );
            await assertExpanded(fixture, other[0].id);
            assertEquals(
                await otherList(fixture).locator('button[aria-label^="排序 "]')
                    .count(),
                other.length,
            );
            assertEquals(
                await root.locator(MASONRY_ITEM).count(),
                fixed.length + other.length,
            );
            assertEquals(writes, []);
            assertEquals(await snapshot(page), before);
        },
    );

    await t.step(
        "Pin/home-fixed membership changes preserve expansion; deletion reflows both independent containers",
        async () => {
            await using stepCleanup = new AsyncDisposableStack();
            const fixture = await createFixture(
                browser,
                app.origin,
                stepCleanup,
                "membership",
            );
            await prepareDesktop(fixture, 767);
            const { page, root, fixed, other } = fixture;
            await toggleExpanded(fixture, other[0].id, true);
            await toggleExpanded(fixture, other[1].id, true);
            await waitMasonry(
                otherList(fixture),
                other.map((note) => note.id),
                3,
            );
            const writes = observeWrites(page, stepCleanup);
            const before = await snapshot(page);
            async function assertGroups(
                fixedIds: string[],
                otherIds: string[],
                expandedIds: string[],
            ) {
                await waitMasonry(fixedList(fixture), fixedIds, 3);
                await waitMasonry(otherList(fixture), otherIds, 3);
                assertEquals(
                    await root.locator(MASONRY_ITEM).count(),
                    fixedIds.length + otherIds.length,
                );
                for (const id of expandedIds) await assertExpanded(fixture, id);
                await assertNoHorizontalOverflow(fixture);
            }
            for (
                const operation of [
                    {
                        id: other[0].id,
                        label: "置顶便签",
                        flag: "isPinned",
                        value: true,
                        fixedIds: [fixed[0].id, other[0].id, fixed[1].id],
                        otherIds: other.slice(1).map((note) => note.id),
                    },
                    {
                        id: other[0].id,
                        label: "取消置顶",
                        flag: "isPinned",
                        value: false,
                        fixedIds: fixed.map((note) => note.id),
                        otherIds: other.map((note) => note.id),
                    },
                    {
                        id: other[1].id,
                        label: "固定到首页",
                        flag: "isHomeFixed",
                        value: true,
                        fixedIds: [
                            ...fixed.map((note) => note.id),
                            other[1].id,
                        ],
                        otherIds: other.filter((note) =>
                            note.id !== other[1].id
                        ).map((note) => note.id),
                    },
                    {
                        id: other[1].id,
                        label: "移出首页",
                        flag: "isHomeFixed",
                        value: false,
                        fixedIds: fixed.map((note) => note.id),
                        otherIds: other.map((note) => note.id),
                    },
                ]
            ) {
                writes.length = 0;
                const prior = await snapshot(page);
                const updated = await chooseNoteAction(
                    fixture,
                    operation.id,
                    operation.label,
                );
                assert(updated);
                assertEquals(
                    updated[operation.flag as "isPinned" | "isHomeFixed"],
                    operation.value,
                );
                await assertGroups(operation.fixedIds, operation.otherIds, [
                    other[0].id,
                    other[1].id,
                ]);
                const after = await snapshot(page);
                assertEquals(
                    after.filter((note) => note.id !== operation.id),
                    prior.filter((note) => note.id !== operation.id),
                );
                assertEquals(
                    after.map((note) => [note.id, note.sortOrder, note.layout]),
                    before.map((
                        note,
                    ) => [note.id, note.sortOrder, note.layout]),
                    "Membership reflow cannot reorder or persist expansion",
                );
                assertEquals(
                    writes.length,
                    1,
                    "Only the explicit membership action can write",
                );
                assertEquals(writes[0].method, "PATCH");
                assertEquals(writes[0].path, `/api/notes/${operation.id}`);
                assertEquals(writes[0].body?.[operation.flag], operation.value);
            }
            writes.length = 0;
            await chooseNoteAction(
                fixture,
                other[0].id,
                "移至回收站",
                "DELETE",
            );
            await assertGroups(
                fixed.map((note) => note.id),
                other.slice(1).map((note) => note.id),
                [other[1].id],
            );
            assertEquals(await item(fixture, other[0].id).count(), 0);
            assertEquals(writes.map(({ method, path }) => ({ method, path })), [
                { method: "DELETE", path: `/api/notes/${other[0].id}` },
            ]);
            writes.length = 0;
            await chooseNoteAction(
                fixture,
                fixed[1].id,
                "移至回收站",
                "DELETE",
            );
            await assertGroups(
                [fixed[0].id],
                other.slice(1).map((note) => note.id),
                [other[1].id],
            );
            assertEquals(await item(fixture, fixed[1].id).count(), 0);
            assertEquals(writes.map(({ method, path }) => ({ method, path })), [
                { method: "DELETE", path: `/api/notes/${fixed[1].id}` },
            ]);
            const after = await snapshot(page);
            assertEquals(
                after.map((note) => note.id),
                before.filter((note) =>
                    note.id !== other[0].id && note.id !== fixed[1].id
                ).map((note) => note.id),
            );
            const trash = await api<NoteRecord[]>(page, "/api/notes/trash");
            assert(trash.some((note) => note.id === other[0].id));
            assert(trash.some((note) => note.id === fixed[1].id));
            assertEquals(await root.locator(".note-editor").count(), 0);
        },
    );

    for (const columns of [2, 3]) {
        for (const half of ["upper", "lower"] as const) {
            await t.step(
                `${columns}-column pointer drop across columns at ${half} target center persists canonical order`,
                async () => {
                    await using stepCleanup = new AsyncDisposableStack();
                    const fixture = await createFixture(
                        browser,
                        app.origin,
                        stepCleanup,
                        `pointer_${columns}_${half}`,
                    );
                    await prepareDesktop(fixture, columns === 2 ? 600 : 767);
                    const { page, fixed, other } = fixture;
                    const before = await snapshot(page);
                    const writes = observeWrites(page, stepCleanup);
                    const expectedIndices = columns === 2
                        ? (half === "upper"
                            ? [1, 2, 0, 3, 4, 5]
                            : [1, 2, 3, 0, 4, 5])
                        : (half === "upper"
                            ? [1, 2, 3, 0, 4, 5]
                            : [1, 2, 3, 4, 0, 5]);
                    const expected = expectedIndices.map((index) =>
                        other[index].id
                    );
                    await beginPointerSort(
                        fixture,
                        other[0].id,
                        other[columns + 1].id,
                        half,
                    );
                    assertEquals(
                        writes,
                        [],
                        "Lifting/moving cannot persist until drop",
                    );
                    await page.mouse.up();
                    await page.locator(OVERLAY).waitFor({ state: "detached" });
                    await waitMasonry(otherList(fixture), expected, columns);
                    const persisted = await waitApiOrder(page, [
                        ...fixed.map((note) => note.id),
                        ...expected,
                    ]);
                    assertOnlyOrderWrites(writes);
                    for (const note of fixed) {
                        assertEquals(
                            persisted.find((saved) => saved.id === note.id),
                            before.find((saved) => saved.id === note.id),
                            "Fixed notes are excluded from sorting and writes",
                        );
                    }
                    const unchangedContent = (notes: NoteRecord[]) =>
                        notes.map(({
                            sortOrder: _sortOrder,
                            version: _version,
                            updatedAt: _updatedAt,
                            ...note
                        }) => note);
                    assertEquals(
                        unchangedContent(persisted),
                        unchangedContent(before),
                    );
                    writes.length = 0;
                    await closeNotes(fixture);
                    await openNotes(page);
                    await waitMasonry(otherList(fixture), expected);
                    await page.reload();
                    await fixture.root.waitFor({ state: "visible" });
                    await waitMasonry(otherList(fixture), expected);
                    assertEquals(canonicalOrder(await snapshot(page)), [
                        ...fixed.map((note) => note.id),
                        ...expected,
                    ]);
                    assertEquals(
                        writes,
                        [],
                        "Reopening/reloading must not persist visual placement",
                    );
                },
            );
        }

        await t.step(
            `${columns}-column keyboard cross-column reorder, keyboard/pointer cancel and fixed exclusion`,
            async () => {
                await using stepCleanup = new AsyncDisposableStack();
                const fixture = await createFixture(
                    browser,
                    app.origin,
                    stepCleanup,
                    `keyboard_${columns}`,
                );
                await prepareDesktop(fixture, columns === 2 ? 600 : 767);
                const { page, root, fixed, other } = fixture;
                const writes = observeWrites(page, stepCleanup);
                const handle = item(fixture, other[0].id).getByRole("button", {
                    name: /^排序 /,
                });
                const from = await box(item(fixture, other[0].id));
                const target = await box(item(fixture, other[1].id));
                assert(
                    target.x > from.x + 20,
                    "Keyboard target is in a different column",
                );
                assertEquals(await handle.getAttribute("tabindex"), "0");
                await handle.focus();
                await page.keyboard.press("Space");
                await page.locator(OVERLAY).waitFor({ state: "visible" });
                assertEquals(await handle.getAttribute("aria-pressed"), "true");
                await waitMasonry(
                    otherList(fixture),
                    other.map((note) => note.id),
                    columns,
                );
                await page.keyboard.press("ArrowRight");
                await page.waitForFunction((id) => {
                    const target = document.querySelector(
                        `.notes-workspace [data-note-id="${id}"]`,
                    );
                    const overlay = document.querySelector(
                        ".notes-workspace-masonry-overlay",
                    );
                    if (!target || !overlay) return false;
                    const a = target.getBoundingClientRect();
                    const b = overlay.getBoundingClientRect();
                    return Math.abs(a.x + a.width / 2 - b.x - b.width / 2) <= 2;
                }, other[1].id);
                assertEquals(writes, []);
                await page.keyboard.press("Space");
                await page.locator(OVERLAY).waitFor({ state: "detached" });
                const expected = [
                    other[1].id,
                    other[0].id,
                    ...other.slice(2).map((note) => note.id),
                ];
                await waitMasonry(otherList(fixture), expected, columns);
                await waitApiOrder(page, [
                    ...fixed.map((note) => note.id),
                    ...expected,
                ]);
                assertOnlyOrderWrites(writes);
                await closeNotes(fixture);
                await openNotes(page);
                await setListWidth(
                    fixture,
                    otherList(fixture),
                    columns === 2 ? 600 : 767,
                );
                await waitMasonry(otherList(fixture), expected, columns);

                const beforeCancel = await snapshot(page);
                writes.length = 0;
                const cancelHandle = item(fixture, other[1].id).getByRole(
                    "button",
                    { name: /^排序 / },
                );
                await cancelHandle.focus();
                await page.keyboard.press("Space");
                await page.locator(OVERLAY).waitFor({ state: "visible" });
                await waitMasonry(otherList(fixture), expected, columns);
                await page.keyboard.press("ArrowRight");
                await page.keyboard.press("Escape");
                await page.locator(OVERLAY).waitFor({ state: "detached" });
                assertEquals(
                    await root.isVisible(),
                    true,
                    "Drag cancel must not dismiss Notes",
                );
                await waitMasonry(otherList(fixture), expected, columns);
                assertEquals(writes, []);
                assertEquals(await snapshot(page), beforeCancel);

                await beginPointerSort(
                    fixture,
                    other[1].id,
                    other[0].id,
                    "lower",
                );
                await page.keyboard.press("Escape");
                await page.mouse.up();
                await page.locator(OVERLAY).waitFor({ state: "detached" });
                await waitMasonry(otherList(fixture), expected, columns);
                assertEquals(writes, []);
                assertEquals(await snapshot(page), beforeCancel);

                const fixedHandle = item(fixture, fixed[0].id).getByRole(
                    "button",
                    { name: /^不可排序 / },
                );
                assertEquals(
                    await fixedHandle.getAttribute("aria-disabled"),
                    "true",
                );
                assertEquals(await fixedHandle.getAttribute("tabindex"), "-1");
                const fixedGrip = await box(fixedHandle);
                const otherTarget = await box(item(fixture, other[1].id));
                await dragMouse(page, {
                    x: fixedGrip.x + fixedGrip.width / 2,
                    y: fixedGrip.y + fixedGrip.height / 2,
                }, {
                    x: otherTarget.x + otherTarget.width / 2,
                    y: otherTarget.y + otherTarget.height / 2,
                });
                assertEquals(await page.locator(OVERLAY).count(), 0);
                await page.mouse.up();
                const otherGrip = await box(cancelHandle);
                const fixedTarget = await box(item(fixture, fixed[0].id));
                await dragMouse(page, {
                    x: otherGrip.x + otherGrip.width / 2,
                    y: otherGrip.y + otherGrip.height / 2,
                }, {
                    x: fixedTarget.x + fixedTarget.width / 2,
                    y: fixedTarget.y + fixedTarget.height / 2,
                });
                await page.locator(OVERLAY).waitFor({ state: "visible" });
                await page.mouse.up();
                await page.locator(OVERLAY).waitFor({ state: "detached" });
                await waitMasonry(
                    fixedList(fixture),
                    fixed.map((note) => note.id),
                    columns,
                );
                await waitMasonry(otherList(fixture), expected, columns);
                assertEquals(
                    await root.locator(MASONRY_ITEM).count(),
                    fixed.length + other.length,
                );
                assertEquals(
                    writes,
                    [],
                    "Neither direction can sort across the fixed/other boundary",
                );
                assertEquals(await snapshot(page), beforeCancel);
            },
        );
    }

    for (const style of ["widgets", "zen"] as const) {
        for (
            const { width, height } of [
                { width: 390, height: 844 },
                { width: 768, height: 1024 },
                { width: 1440, height: 900 },
            ]
        ) {
            for (const scheme of ["light", "dark"] as const) {
                await t.step(
                    `${style} ${width}px ${scheme}: root/search presentation and home isolation with screenshot evidence`,
                    async () => {
                        await using stepCleanup = new AsyncDisposableStack();
                        const fixture = await createFixture(
                            browser,
                            app.origin,
                            stepCleanup,
                            `${style}_${width}_${scheme}`,
                            {
                                style,
                                viewport: {
                                    width,
                                    height,
                                },
                                scheme,
                                open: false,
                            },
                        );
                        const { page, root, fixed, other } = fixture;
                        const before = await snapshot(page);
                        const writes = observeWrites(page, stepCleanup);
                        const home = page.locator(
                            style === "widgets"
                                ? ".controlled-note-slot"
                                : ".pinned-area .note-position",
                        );
                        let homeBefore = null;
                        if (style === "widgets" || width === 1440) {
                            await home.first().waitFor({ state: "visible" });
                            homeBefore = await box(home.first());
                            assertEquals(
                                await home.locator(MASONRY_ITEM).count(),
                                0,
                            );
                        }
                        await openNotes(page);
                        const masonry = style === "widgets" && width >= 768;
                        const expectedLayout = masonry
                            ? "masonry"
                            : "single-column";
                        async function assertPresentation(
                            list: Locator,
                            ids: string[],
                        ) {
                            assertEquals(
                                await list.getAttribute("data-layout"),
                                expectedLayout,
                            );
                            if (masonry) {
                                await waitMasonry(list, ids);
                            } else {
                                assertEquals(
                                    await list.locator(MASONRY_ITEM).count(),
                                    0,
                                );
                                const geometry = await list.evaluate(
                                    (container) => {
                                        const list = container
                                            .getBoundingClientRect();
                                        return Array.from(
                                            container.querySelectorAll(
                                                ".note-card",
                                            ),
                                        ).map((note) => {
                                            const rect = note
                                                .getBoundingClientRect();
                                            return {
                                                x: rect.x - list.x,
                                                y: rect.y - list.y,
                                                width: rect.width,
                                                listWidth: list.width,
                                                height: rect.height,
                                            };
                                        });
                                    },
                                );
                                assertEquals(geometry.length, ids.length);
                                for (
                                    const [index, note] of geometry.entries()
                                ) {
                                    assert(
                                        Math.abs(note.width - note.listWidth) <=
                                            2,
                                    );
                                    assert(Math.abs(note.x) <= 2);
                                    if (index > 0) {
                                        assert(
                                            note.y >=
                                                geometry[index - 1].y +
                                                    geometry[index - 1].height -
                                                    1,
                                        );
                                    }
                                }
                            }
                            await assertNoHorizontalOverflow(fixture);
                        }
                        await otherList(fixture).locator(".note-card").first()
                            .waitFor({ state: "visible" });
                        await assertPresentation(
                            fixedList(fixture),
                            fixed.map((note) => note.id),
                        );
                        await assertPresentation(
                            otherList(fixture),
                            other.map((note) => note.id),
                        );
                        if (!masonry) {
                            assertEquals(
                                await page.locator(DESKTOP_ROOT).count(),
                                0,
                            );
                        }
                        await toggleExpanded(fixture, other[0].id, true);
                        await assertPresentation(
                            otherList(fixture),
                            other.map((note) => note.id),
                        );
                        await root.locator("input[data-workspace-search]").fill(
                            "needle",
                        );
                        await searchList(fixture).locator(".note-card").first()
                            .waitFor({ state: "visible" });
                        await assertPresentation(searchList(fixture), [
                            fixed[0].id,
                            other[0].id,
                            other[2].id,
                        ]);
                        await root.locator("input[data-workspace-search]").fill(
                            "",
                        );
                        await assertPresentation(
                            otherList(fixture),
                            other.map((note) => note.id),
                        );
                        await assertExpanded(fixture, other[0].id);
                        assertEquals(
                            await page.locator("html").getAttribute(
                                "data-theme",
                            ),
                            scheme,
                        );
                        await page.screenshot({
                            path:
                                `${evidenceDir}/notes-${style}-${width}-${scheme}.png`,
                            fullPage: true,
                        });
                        await closeNotes(fixture);
                        if (homeBefore) {
                            const after = await box(home.first());
                            for (
                                const key of [
                                    "x",
                                    "y",
                                    "width",
                                    "height",
                                ] as const
                            ) {
                                assert(
                                    Math.abs(after[key] - homeBefore[key]) <= 1,
                                    `Workspace presentation must not change ${style} home note ${key}`,
                                );
                            }
                            assertEquals(
                                await home.locator(MASONRY_ITEM).count(),
                                0,
                            );
                        }
                        assertEquals(await snapshot(page), before);
                        assertEquals(
                            writes,
                            [],
                            "Workspace expansion/search cannot change home layout or notes data",
                        );
                    },
                );
            }
        }
    }
});
