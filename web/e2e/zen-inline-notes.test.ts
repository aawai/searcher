import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { createEvidenceDirectory } from "./helpers/evidence.ts";

type ProductionChunk = {
    file: string;
    name?: string;
    src?: string;
};

type ProductionManifest = Record<string, ProductionChunk>;

type NoteRecord = {
    id: string;
    title: string | null;
    body: string;
    isPinned: boolean;
    isHomeFixed: boolean;
    sortOrder: number;
    version: number;
};

Deno.test("production Zen inline notes mobile behavior E2E (#191)", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const accountA = await app.seedAskFixtureUser({
        username: "zen_inline_notes_a",
        password: "Zen-inline-notes-A-191!",
        displayName: "Zen Inline Notes A",
    });
    const evidenceDir = await createEvidenceDirectory("zen-inline-notes-191");
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
        ignoreDefaultArgs: ["--hide-scrollbars"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        colorScheme: "light",
    });
    cleanup.defer(() => context.close());
    const manifest = JSON.parse(
        await Deno.readTextFile("web/dist/manifest.json"),
    ) as ProductionManifest;
    const editorVendor = Object.values(manifest).find((chunk) =>
        chunk.name === "editor-vendor" || chunk.file.includes("editor-vendor")
    );
    assert(editorVendor, "Production manifest must identify editor-vendor");
    const markdownRuntime = Object.entries(manifest).find(([key, chunk]) =>
        key.endsWith("features/markdown-editor/runtime.ts") ||
        chunk.src?.endsWith("features/markdown-editor/runtime.ts")
    );
    assert(
        markdownRuntime,
        "Production manifest must identify Markdown runtime",
    );
    const editorRelatedChunks = Object.entries(manifest).filter((
        [key, chunk],
    ) => chunk === editorVendor ||
        /NoteLivePreviewEditor|features\/markdown-editor\/runtime\.ts|spikes\/markdown-editor\/runtime\.ts/i
            .test(`${key} ${chunk.src ?? ""}`)
    ).map(([, chunk]) => chunk.file);
    const editorRuntimeFiles: Record<string, true> = Object.fromEntries(
        [...editorRelatedChunks, markdownRuntime[1].file].map((file) => [
            file,
            true,
        ]),
    );
    const page = await context.newPage();
    const requestedScripts: string[] = [];
    page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (
            request.resourceType() === "script" && path.startsWith("/assets/")
        ) {
            requestedScripts.push(path.slice(1));
        }
    });
    const notesRegion = page.getByRole("region", {
        name: "首页固定便签",
        exact: true,
    });
    await loginAndVisit(page, app.origin, "/", accountA);

    async function apiData<T>(
        path: string,
        method = "GET",
        body?: unknown,
    ): Promise<T> {
        return await page.evaluate(async ({ path, method, body }) => {
            const response = await fetch(path, {
                method,
                ...(body === undefined ? {} : {
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }),
            });
            const envelope = await response.json() as {
                data?: T;
                message?: string;
            };
            if (!response.ok) {
                throw new Error(
                    `${method} ${path} failed (${response.status}): ${
                        envelope
                            .message ?? "unknown error"
                    }`,
                );
            }
            return envelope.data as T;
        }, { path, method, body });
    }

    async function waitForHome(style: "zen" | "widgets" = "zen") {
        await page.locator(`main.home-${style}`).waitFor({ state: "visible" });
        await page.locator(".search-form-wrap").waitFor({ state: "visible" });
        await page.evaluate(async () => {
            await document.fonts.ready;
        });
    }

    async function setHome(
        style: "zen" | "widgets",
        theme: "light" | "dark",
        backgroundImage: string | null = null,
    ) {
        await page.emulateMedia({
            colorScheme: theme,
            reducedMotion: "no-preference",
        });
        await apiData("/api/preferences", "PATCH", {
            style,
            theme,
            backgroundImage,
        });
        await page.reload();
        await waitForHome(style);
        await page.waitForFunction(
            (expected) =>
                document.documentElement.getAttribute("data-theme") ===
                    expected,
            theme,
            { timeout: 5000 },
        );
        await settlePaint();
    }

    async function createNote(
        title: string,
        body: string,
        sortOrder: number,
        flags: { isPinned?: boolean; isHomeFixed?: boolean } = {},
    ): Promise<NoteRecord> {
        return await apiData<NoteRecord>("/api/notes", "POST", {
            title,
            body,
            sortOrder,
            isPinned: flags.isPinned ?? false,
            isHomeFixed: flags.isHomeFixed ?? true,
            layout: {
                deviceClass: "desktop",
                x: null,
                y: null,
                width: null,
                zIndex: 1,
                expanded: true,
            },
        });
    }

    function canonicalFixed(notes: NoteRecord[]) {
        return notes
            .filter((note) => note.isHomeFixed)
            .sort((a, b) =>
                a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
            );
    }

    async function currentId(): Promise<string | null> {
        return await page.evaluate(() =>
            document.querySelector(
                ".zen-inline-notes .zen-inline-note",
            )?.getAttribute("data-note-id") ?? null
        );
    }

    async function waitForCurrent(id: string) {
        await page.waitForFunction(
            (expectedId) =>
                document.querySelector(
                    ".zen-inline-notes .zen-inline-note",
                )?.getAttribute("data-note-id") === expectedId,
            id,
            { timeout: 5000 },
        );
    }

    async function waitForNoInlineNotes() {
        await page.waitForFunction(
            () => document.querySelector(".zen-inline-notes") === null,
            undefined,
            { timeout: 5000 },
        );
    }

    async function settlePaint() {
        await page.evaluate(async () => {
            await document.fonts.ready;
            const { promise, resolve } = Promise.withResolvers<void>();
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            await promise;
        });
    }

    async function readStableGeometry() {
        return await page.evaluate(() => {
            const rect = (element: Element | null) => {
                if (!element) return null;
                const box = element.getBoundingClientRect();
                const round = (value: number) => Math.round(value * 10) / 10;
                return {
                    x: round(box.x),
                    y: round(box.y),
                    width: round(box.width),
                    height: round(box.height),
                };
            };
            const fixedRegion = document.querySelector(".zen-inline-notes");
            const externalControls = Array.from(
                document.querySelectorAll<HTMLElement>(
                    "body button, body a, body input, body [role='navigation']",
                ),
            ).filter((element) => {
                if (element.closest(".zen-inline-notes")) return false;
                const style = getComputedStyle(element);
                const box = element.getBoundingClientRect();
                return style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    Number(style.opacity) > 0 && box.width > 0 &&
                    box.height > 0;
            }).map((element) => ({
                tag: element.tagName,
                name: element.getAttribute("aria-label") ??
                    element.textContent?.trim().replace(/\s+/g, " ").slice(
                        0,
                        60,
                    ) ??
                    "",
                rect: rect(element),
            }));
            return {
                viewport: { width: innerWidth, height: innerHeight },
                search: rect(document.querySelector(".search-form-wrap")),
                preview: rect(fixedRegion),
                externalControls,
            };
        });
    }

    async function dispatchTouchGesture(dx: number, dy: number) {
        const box = await notesRegion.boundingBox();
        assert(box && box.width > 0 && box.height > 0, "Preview has geometry");
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;
        const session = await context.newCDPSession(page);
        try {
            await session.send("Input.dispatchTouchEvent", {
                type: "touchStart",
                touchPoints: [{ x: startX, y: startY, id: 1 }],
            });
            for (let step = 1; step <= 4; step++) {
                await session.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: [{
                        x: startX + dx * step / 4,
                        y: startY + dy * step / 4,
                        id: 1,
                    }],
                });
            }
            await session.send("Input.dispatchTouchEvent", {
                type: "touchEnd",
                touchPoints: [],
            });
        } finally {
            await session.detach();
        }
    }

    async function registerAccount(
        username: string,
        password: string,
        displayName: string,
    ) {
        await page.goto(`${app.origin}/register`);
        await page.locator("#auth-username").fill(username);
        await page.locator("#auth-display-name").fill(displayName);
        await page.locator("#auth-password").fill(password);
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(`${app.origin}/`);
        await waitForHome();
    }
    async function logoutCurrentAccount() {
        const status = await page.evaluate(async () => {
            const response = await fetch("/api/auth/logout", {
                method: "POST",
            });
            return response.status;
        });
        assertEquals(status, 200);
    }

    // The fixed collection is independent from ordinary pinning, including its empty state.
    await setHome("zen", "light");
    const pinnedOnly = await createNote(
        "Pinned, not home-fixed",
        "This pinned-only note must never enter the Zen preview.",
        0,
        { isPinned: true, isHomeFixed: false },
    );
    assertEquals(pinnedOnly.isPinned, true);
    assertEquals(pinnedOnly.isHomeFixed, false);
    await page.reload();
    await waitForHome();
    await waitForNoInlineNotes();
    assertEquals(await page.locator(".zen-inline-note").count(), 0);

    const noteA = await createNote(
        "Inline note A",
        "A longer first note with two distinct lines of real preview text.\nSecond paragraph stays readable.",
        10,
    );
    await page.reload();
    await waitForHome();
    await waitForCurrent(noteA.id);
    await notesRegion.scrollIntoViewIfNeeded();
    assertEquals(await notesRegion.locator(".zen-inline-note").count(), 1);
    assertEquals(
        await notesRegion.locator(".zen-inline-notes-position").count(),
        0,
        "A single fixed note has no position marks",
    );
    const titleSpacing = await notesRegion.evaluate((region) => {
        const title = region.querySelector(".zen-inline-note-title")!;
        const body = region.querySelector(".zen-inline-note-body")!;
        const titleBox = title.getBoundingClientRect();
        return {
            titleHeight: titleBox.height,
            titleLineHeight: Number.parseFloat(
                getComputedStyle(title).lineHeight,
            ),
            gap: body.getBoundingClientRect().top - titleBox.bottom,
            expectedGap: Number.parseFloat(
                getComputedStyle(region).getPropertyValue("--space-inline-gap"),
            ),
        };
    });
    assert(
        titleSpacing.titleHeight <= titleSpacing.titleLineHeight + 1,
        "A one-line title must not reserve an empty second line",
    );
    assert(
        Math.abs(titleSpacing.gap - titleSpacing.expectedGap) <= 1,
        "Title and body share the inline content gap, not a section-sized void",
    );
    await notesRegion.locator(".zen-inline-note").focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await dispatchTouchGesture(-100, 0);
    assertEquals(await currentId(), noteA.id, "One note cannot be switched");
    assertEquals(await page.locator(".note-editor").count(), 0);

    const noteB = await createNote(
        "Inline note B",
        "Short second note.",
        20,
    );
    const noteC = await createNote(
        "Inline note C",
        "- Structured third note\n- A second preview line\n\n```ts\nconst note = true;\n```",
        20,
    );
    await page.reload();
    await waitForHome();
    const expectedOrder = canonicalFixed(
        await apiData<NoteRecord[]>("/api/notes"),
    );
    const tiedNotes = [noteB, noteC].sort((a, b) => a.id.localeCompare(b.id));
    assertEquals(
        expectedOrder.map((note) => note.id),
        [noteA.id, ...tiedNotes.map((note) => note.id)],
    );
    await waitForCurrent(expectedOrder[0].id);
    await page.locator("#search-query").focus();
    await page.keyboard.press("ArrowRight");
    assertEquals(
        await currentId(),
        expectedOrder[0].id,
        "Search arrow keys do not change the note selection",
    );
    assertEquals(await notesRegion.locator(".zen-inline-note").count(), 1);
    assertEquals(
        await notesRegion.locator(".zen-inline-notes-position").count() > 0,
        true,
        "Multiple fixed notes have position marks",
    );
    assertEquals(
        await notesRegion.locator(".zen-inline-note-title").textContent(),
        expectedOrder[0].title,
    );
    assertEquals(
        (await notesRegion.locator(".zen-inline-note-body").innerText())
            .includes("A longer first note"),
        true,
    );
    await notesRegion.scrollIntoViewIfNeeded();
    const initialScrollY = await page.evaluate(() => scrollY);
    assertEquals(await notesRegion.locator(".zen-inline-note").count(), 1);
    assertEquals(
        await notesRegion.getAttribute("aria-label"),
        "首页固定便签",
    );
    assertEquals(
        await notesRegion.locator(".zen-inline-note").getAttribute(
            "aria-label",
        ),
        `打开便签：${expectedOrder[0].title}`,
    );
    assertEquals(
        await notesRegion.locator(
            ".zen-inline-notes-position button, .zen-inline-notes-position a, .zen-inline-notes-position [tabindex], .zen-inline-notes-position [role='button'], .zen-inline-notes-position [role='link']",
        ).count(),
        0,
        "Position marks are decorative, not interactive",
    );
    assertEquals(
        /\b\d+\s*\/\s*\d+\b/.test(await notesRegion.innerText()),
        false,
        "The preview does not display a numeric page count",
    );
    const visualChrome = await notesRegion.evaluate((region) => {
        const alpha = (color: string) => {
            if (color === "transparent") return 0;
            const values = color.match(/rgba?\(([^)]+)\)/)?.[1]
                ?.split(/[\s,/]+/)
                .filter(Boolean) ?? [];
            return values.length >= 4 ? Number(values[3]) : 1;
        };
        const inspect = (element: Element) => {
            const style = getComputedStyle(element);
            const visibleBorder = ["top", "right", "bottom", "left"].some(
                (side) =>
                    Number.parseFloat(
                            style.getPropertyValue(`border-${side}-width`),
                        ) > 0 &&
                    style.getPropertyValue(`border-${side}-style`) !== "none" &&
                    alpha(style.getPropertyValue(`border-${side}-color`)) > 0,
            );
            return {
                backgroundAlpha: alpha(style.backgroundColor),
                visibleBorder,
                boxShadow: style.boxShadow,
            };
        };
        const content = region.querySelector(".zen-inline-note");
        if (!content) throw new Error("Inline note content is missing");
        return { region: inspect(region), content: inspect(content) };
    });
    for (const [scope, chrome] of Object.entries(visualChrome)) {
        assertEquals(chrome.backgroundAlpha, 0, `${scope} has no card fill`);
        assertEquals(
            chrome.visibleBorder,
            false,
            `${scope} has no visible border`,
        );
        assertEquals(chrome.boxShadow, "none", `${scope} has no card shadow`);
    }
    const visibleExtras = await notesRegion.locator(
        "button, a[href], input, [role='button'], [role='link']",
    ).evaluateAll(
        (buttons) =>
            buttons.filter((button) => {
                if (button.matches(".zen-inline-note")) return false;
                const style = getComputedStyle(button);
                const box = button.getBoundingClientRect();
                const hit = document.elementFromPoint(
                    box.x + box.width / 2,
                    box.y + box.height / 2,
                );
                return style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    Number(style.opacity) > 0 && box.width > 1 &&
                    box.height > 1 &&
                    (hit === button || (hit !== null && button.contains(hit)));
            }).length,
    );
    assertEquals(
        visibleExtras,
        0,
        "No visible pagination or management controls",
    );
    const initialGeometry = await readStableGeometry();
    assertEquals(initialGeometry.preview !== null, true);

    // A true Chromium touch stream distinguishes horizontal swipes from scrolling and suppresses the follow-up click.
    await dispatchTouchGesture(0, 80);
    assertEquals(await currentId(), expectedOrder[0].id);
    assertEquals(await page.locator(".note-editor").count(), 0);
    await page.evaluate(
        (expectedScrollY) => globalThis.scrollTo(0, expectedScrollY),
        initialScrollY,
    );
    await page.waitForFunction(
        (expectedScrollY) => scrollY === expectedScrollY,
        initialScrollY,
        { timeout: 3000 },
    );
    await dispatchTouchGesture(-110, 0);
    await waitForCurrent(expectedOrder[1].id);
    await dispatchTouchGesture(110, 0);
    await waitForCurrent(expectedOrder[0].id);
    assertEquals(await page.locator(".note-editor").count(), 0);
    await dispatchTouchGesture(-110, 0);
    await waitForCurrent(expectedOrder[1].id);
    assertEquals(await page.locator(".note-editor").count(), 0);
    await settlePaint();
    assertEquals(await readStableGeometry(), initialGeometry);

    // The hidden accessible controls remain discoverable by name and respond to a virtual activation.
    const next = notesRegion.getByRole("button", {
        name: "下一张便签",
        exact: true,
    });
    const previous = notesRegion.getByRole("button", {
        name: "上一张便签",
        exact: true,
    });
    assertEquals(await next.getAttribute("tabindex"), "-1");
    assertEquals(await previous.getAttribute("tabindex"), "-1");
    assertEquals(await next.count(), 1);
    assertEquals(await previous.count(), 1);
    await next.evaluate((button) => (button as HTMLButtonElement).click());
    await waitForCurrent(expectedOrder[2].id);
    await notesRegion.locator(".zen-inline-note").focus();
    await page.keyboard.press("ArrowRight");
    assertEquals(
        await currentId(),
        expectedOrder[2].id,
        "The last note does not wrap",
    );
    await previous.evaluate((button) => (button as HTMLButtonElement).click());
    await waitForCurrent(expectedOrder[1].id);
    await notesRegion.locator(".zen-inline-note").focus();
    await page.keyboard.press("ArrowLeft");
    await waitForCurrent(expectedOrder[0].id);
    await page.keyboard.press("ArrowLeft");
    assertEquals(
        await currentId(),
        expectedOrder[0].id,
        "The first note does not wrap",
    );
    const eagerEditorScripts = requestedScripts.filter((path) =>
        editorRuntimeFiles[path] === true
    );
    assertEquals(
        eagerEditorScripts,
        [],
        "Mobile home preview must not request NoteLivePreviewEditor, editor-vendor, or Markdown editor runtime before opening a note",
    );

    // Enter opens the existing mobile Sheet editor; a real content save leaves the selected ID intact.
    await page.keyboard.press("Enter");
    const sheet = page.locator(
        '.workspace-panel--mobile[data-presentation="sheet"]',
    );
    await sheet.waitFor({ state: "visible" });
    const editor = sheet.locator(".note-editor");
    await editor.waitFor({ state: "visible" });
    const liveEditor = editor.locator(".note-live-editor .ProseMirror");
    await liveEditor.waitFor({ state: "visible" });
    const saveResponse = page.waitForResponse(
        (response) =>
            response.request().method() === "PATCH" &&
            new URL(response.url()).pathname === `/api/notes/${noteA.id}` &&
            response.ok(),
        { timeout: 8000 },
    );
    await liveEditor.fill("Edited through the existing mobile note editor.");
    await liveEditor.press("Control+s");
    assertEquals((await saveResponse).status(), 200);
    const editedA = await apiData<NoteRecord>(`/api/notes/${noteA.id}`);
    assertEquals(
        editedA.body.trim(),
        "Edited through the existing mobile note editor.",
    );
    assertEquals(
        await currentId(),
        noteA.id,
        "Editing does not select another note",
    );
    await sheet.getByRole("button", {
        name: "收起工作区",
        exact: true,
    }).click();
    await editor.waitFor({ state: "hidden" });
    await page.waitForFunction(
        (id) => document.activeElement?.getAttribute("data-note-id") === id,
        noteA.id,
        { timeout: 5000 },
    );
    assertEquals(await currentId(), noteA.id);

    // The selection follows note ID through a canonical reorder, not its former array index.
    const currentA = await apiData<NoteRecord>(`/api/notes/${noteA.id}`);
    await apiData<NoteRecord>(`/api/notes/${noteA.id}`, "PATCH", {
        sortOrder: 40,
        version: currentA.version,
    });
    await page.reload();
    await waitForHome();
    await waitForCurrent(noteA.id);
    const reordered = canonicalFixed(
        await apiData<NoteRecord[]>("/api/notes"),
    );
    assertEquals(reordered.map((note) => note.id), [
        ...tiedNotes.map((note) => note.id),
        noteA.id,
    ]);

    // Exercise removal through the existing Notes workspace so the live home collection reconciles.
    const interiorOrder = canonicalFixed(
        await apiData<NoteRecord[]>("/api/notes"),
    );
    const interiorNote = interiorOrder[1];
    const nextAfterRemoval = interiorOrder[2];
    await notesRegion.locator(".zen-inline-note").focus();
    await page.keyboard.press("ArrowLeft");
    await waitForCurrent(interiorNote.id);
    await page.locator('.zen-edge-btn[data-workspace="notes"]').click();
    const notesWorkspace = page.locator(
        '.workspace-panel--mobile[data-presentation="sheet"]',
    );
    await notesWorkspace.waitFor({ state: "visible" });
    const interiorRow = notesWorkspace.locator(
        `[data-note-id="${interiorNote.id}"]`,
    );
    await interiorRow.getByRole("button", {
        name: "更多操作",
        exact: true,
    }).click();
    await page.getByRole("menuitem", {
        name: "移出首页",
        exact: true,
    }).click();
    await waitForCurrent(nextAfterRemoval.id);

    const finalRow = notesWorkspace.locator(
        `[data-note-id="${nextAfterRemoval.id}"]`,
    );
    await finalRow.getByRole("button", {
        name: "更多操作",
        exact: true,
    }).click();
    await page.getByRole("menuitem", {
        name: "移至回收站",
        exact: true,
    }).click();
    await waitForCurrent(interiorOrder[0].id);
    assertEquals(
        canonicalFixed(await apiData<NoteRecord[]>("/api/notes")).map((note) =>
            note.id
        ),
        [interiorOrder[0].id],
    );
    await notesWorkspace.getByRole("button", {
        name: "收起工作区",
        exact: true,
    }).click();
    await notesWorkspace.waitFor({ state: "hidden" });
    const accountAExtra1 = await createNote(
        "Account A exclusive first",
        "A account-only first body.",
        30,
    );
    const accountAExtra2 = await createNote(
        "Account A exclusive second",
        "A account-only second body.",
        40,
    );
    await page.reload();
    await waitForHome();
    await waitForCurrent(interiorOrder[0].id);
    await notesRegion.locator(".zen-inline-note").focus();
    await page.keyboard.press("ArrowRight");
    await waitForCurrent(accountAExtra1.id);
    await page.keyboard.press("ArrowRight");
    await waitForCurrent(accountAExtra2.id);

    // Build an independent second-account selection, then verify both accounts recover their own IDs.
    const accountB = {
        username: "zen_inline_notes_b",
        password: "Zen-inline-notes-B-191!",
    };
    await logoutCurrentAccount();
    await registerAccount(
        accountB.username,
        accountB.password,
        "Zen Inline Notes B",
    );
    await setHome("zen", "light");
    assertEquals(
        await page.locator(".zen-inline-notes .zen-inline-note").count(),
        0,
        "Account B must not show account A note content",
    );
    await waitForNoInlineNotes();
    const noteB1 = await createNote("Account B first", "B first body", 10);
    const noteB2 = await createNote(
        "Account B second",
        'B second body.\n\n- Structured account-specific content.\n- A second visible list item.\n\n```ts\nconst account = "B";\n```',
        20,
    );
    await page.reload();
    await waitForHome();
    await waitForCurrent(noteB1.id);
    await notesRegion.locator(".zen-inline-note").focus();
    await page.keyboard.press("ArrowRight");
    await waitForCurrent(noteB2.id);
    await page.reload();
    await waitForHome();
    await waitForCurrent(noteB2.id);
    await logoutCurrentAccount();

    await loginAndVisit(page, app.origin, "/", accountA);
    await setHome("zen", "light");
    await waitForCurrent(accountAExtra2.id);
    assertEquals(
        await page.evaluate(() =>
            document.body.innerText.includes("Account B first")
        ),
        false,
    );
    await logoutCurrentAccount();
    await loginAndVisit(page, app.origin, "/", accountB);
    await setHome("zen", "light");
    await waitForCurrent(noteB2.id);
    assertEquals(
        await page.evaluate(() =>
            document.body.innerText.includes("A account-only second body.")
        ),
        false,
    );

    // The new presentation is isolated to Zen below 768px; capture real app pages across the approved matrix.
    for (let index = 0; index < 7; index++) {
        await apiData("/api/webapps", "POST", {
            name: `首页应用 ${index + 1}`,
            url: `https://zen-inline-${index}.example/`,
            isPinned: true,
        });
    }
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
                if (style === "zen" && viewport.width < 768) {
                    await waitForCurrent(noteB2.id);
                    await settlePaint();
                    const axes = await page.evaluate(() => {
                        const center = (element: Element) => {
                            const rect = element.getBoundingClientRect();
                            return rect.x + rect.width / 2;
                        };
                        const search = document.querySelector(
                            ".search-form-wrap",
                        )!;
                        const expected = center(search);
                        const launcher = document.querySelector(
                            ".pinned-area .launcher-grid--home",
                        )!;
                        return [
                            center(launcher) - expected,
                            center(
                                document.querySelector(".zen-inline-note")!,
                            ) - expected,
                            center(
                                document.querySelector(".zen-edge-trigger")!,
                            ) - expected,
                        ];
                    });
                    assert(
                        axes.every((offset) => Math.abs(offset) <= 1),
                        `Search, launcher grid, note, and navigation share an axis: ${axes}`,
                    );
                } else {
                    await waitForNoInlineNotes();
                    await page.locator(
                        style === "zen"
                            ? ".floating-notes .note-position, .notes-flow-grid .note-flow-item, .floating-notes--flow .note-position"
                            : ".controlled-note-slot",
                    ).first().waitFor({ state: "visible" });
                }
                await settlePaint();
                assertEquals(
                    await page.evaluate(() =>
                        document.documentElement.scrollWidth <= innerWidth + 1
                    ),
                    true,
                );
                await page.screenshot({
                    path:
                        `${evidenceDir}/matrix-${viewport.width}x${viewport.height}-${theme}-${style}.png`,
                    fullPage: false,
                });
            }
        }
    }

    for (
        const [name, background] of [
            ["solid", "linear-gradient(0deg, #edf2ee, #edf2ee)"],
            ["gradient", "linear-gradient(135deg, #d8e7e0, #f4eee5)"],
        ]
    ) {
        await page.setViewportSize({ width: 390, height: 844 });
        await setHome("zen", "light", background);
        await waitForCurrent(noteB2.id);
        await settlePaint();
        await page.screenshot({
            path: `${evidenceDir}/wallpaper-css-${name}-light-390x844.png`,
        });
    }

    // Use an uploaded raster through the real wallpaper endpoint for representative non-default backgrounds.
    const wallpaperUrl = await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1600;
        canvas.height = 900;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable");
        const gradient = context.createLinearGradient(0, 0, 1600, 900);
        gradient.addColorStop(0, "#17334c");
        gradient.addColorStop(0.48, "#b58662");
        gradient.addColorStop(1, "#e4d7b7");
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "rgba(16, 25, 39, 0.72)";
        context.beginPath();
        context.moveTo(0, 640);
        context.lineTo(410, 310);
        context.lineTo(820, 620);
        context.lineTo(1200, 260);
        context.lineTo(1600, 560);
        context.lineTo(1600, 900);
        context.lineTo(0, 900);
        context.closePath();
        context.fill();
        const { promise, resolve, reject } = Promise.withResolvers<Blob>();
        canvas.toBlob(
            (value) =>
                value
                    ? resolve(value)
                    : reject(new Error("PNG encoding failed")),
            "image/png",
        );
        const blob = await promise;
        const form = new FormData();
        form.append("image", blob, "zen-inline-notes-gradient.png");
        const response = await fetch("/api/wallpaper", {
            method: "POST",
            body: form,
        });
        const envelope = await response.json() as {
            data?: { url?: string };
            message?: string;
        };
        if (!response.ok || !envelope.data?.url) {
            throw new Error(
                `Wallpaper upload failed: ${response.status} ${
                    envelope.message ?? ""
                }`,
            );
        }
        return envelope.data.url;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await setHome("zen", "light", wallpaperUrl);
    await waitForCurrent(noteB2.id);
    await page.screenshot({
        path: `${evidenceDir}/wallpaper-gradient-light-390x844.png`,
        fullPage: false,
    });
    await setHome("zen", "dark", wallpaperUrl);
    await waitForCurrent(noteB2.id);
    await page.locator('.wallpaper-surface[data-wallpaper-image="true"]')
        .first()
        .waitFor({ state: "attached" });
    await page.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
    }, wallpaperUrl);
    await settlePaint();
    await page.screenshot({
        path: `${evidenceDir}/wallpaper-gradient-dark-390x844.png`,
        fullPage: false,
    });

    // Reduced motion, dynamic font scaling, and a short viewport remain usable without horizontal overflow.
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.waitForFunction(() =>
        matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    await notesRegion.locator(".zen-inline-note").focus();
    await page.keyboard.press("ArrowLeft");
    await settlePaint();
    const reducedMotionState = await notesRegion.evaluate((element) => ({
        reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
        runningAnimations: element.getAnimations({ subtree: true }).filter(
            (animation) => animation.playState === "running",
        ).length,
    }));
    assertEquals(reducedMotionState.reduced, true);
    assertEquals(reducedMotionState.runningAnimations, 0);
    await notesRegion.locator(".zen-inline-note").focus();
    await page.keyboard.press("ArrowRight");
    await waitForCurrent(noteB2.id);
    const originalFontSize = await page.locator(".zen-inline-note-body")
        .evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).fontSize)
        );
    await page.evaluate(() => {
        const root = document.documentElement;
        const style = getComputedStyle(root);
        for (
            const token of [
                "--font-body-size",
                "--font-component-title-size",
                "--font-component-title-line-height",
            ]
        ) {
            root.style.setProperty(
                token,
                `${Number.parseFloat(style.getPropertyValue(token)) * 1.5}px`,
            );
        }
    });
    await page.setViewportSize({ width: 390, height: 520 });
    await settlePaint();
    const shortFontLayout = await page.evaluate(() => {
        const preview = document.querySelector(".zen-inline-notes")
            ?.getBoundingClientRect();
        return {
            viewportWidth: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            preview: preview
                ? {
                    x: preview.x,
                    y: preview.y,
                    width: preview.width,
                    height: preview.height,
                }
                : null,
        };
    });
    assertEquals(
        shortFontLayout.documentWidth <= shortFontLayout.viewportWidth + 1,
        true,
    );
    assertEquals(
        shortFontLayout.bodyWidth <= shortFontLayout.viewportWidth + 1,
        true,
    );
    assert(shortFontLayout.preview && shortFontLayout.preview.width > 0);
    assertEquals(
        await page.locator(".zen-inline-note-body").evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).fontSize)
        ),
        originalFontSize * 1.5,
    );
    await notesRegion.scrollIntoViewIfNeeded();
    await page.evaluate(() =>
        globalThis.scrollTo(0, document.documentElement.scrollHeight)
    );
    assertEquals(
        await page.evaluate(() =>
            document.querySelector(".zen-inline-note")!.getBoundingClientRect()
                .bottom <=
                document.querySelector(".zen-edge-trigger")!
                    .getBoundingClientRect().top
        ),
        true,
        "Last preview line can scroll above the floating navigation",
    );
    await page.screenshot({
        path: `${evidenceDir}/short-screen-dynamic-font-reduced-motion.png`,
        fullPage: true,
    });
    await page.evaluate(() => {
        for (
            const token of [
                "--font-body-size",
                "--font-component-title-size",
                "--font-component-title-line-height",
            ]
        ) {
            document.documentElement.style.removeProperty(token);
        }
    });

    // Crossing 767/768 while the existing editor is open must preserve its draft and note identity.
    await page.setViewportSize({ width: 767, height: 844 });
    await setHome("zen", "light");
    await waitForCurrent(noteB2.id);
    const responsiveOpener = page.locator(
        `.zen-inline-note[data-note-id="${noteB2.id}"]`,
    );
    await responsiveOpener.click();
    const responsiveSheet = page.locator(
        '.workspace-panel--mobile[data-presentation="sheet"]',
    );
    await responsiveSheet.waitFor({ state: "visible" });
    const responsiveEditor = page.locator(".note-editor");
    await responsiveEditor.waitFor({ state: "visible" });
    const responsiveLive = page.locator(
        ".note-editor .note-live-editor .ProseMirror",
    );
    await responsiveLive.fill("Draft preserved across the 767/768 breakpoint.");
    await page.screenshot({
        path: `${evidenceDir}/editing-at-767.png`,
        fullPage: false,
    });
    await page.setViewportSize({ width: 768, height: 1024 });
    await waitForNoInlineNotes();
    await responsiveEditor.waitFor({ state: "visible" });
    assertEquals(
        await responsiveLive.innerText(),
        "Draft preserved across the 767/768 breakpoint.",
    );
    await page.screenshot({
        path: `${evidenceDir}/editing-at-768.png`,
        fullPage: false,
    });
    await page.setViewportSize({ width: 767, height: 844 });
    await page.waitForFunction(() =>
        matchMedia("(max-width: 767px)").matches &&
        document.querySelector(".zen-inline-notes") !== null
    );
    assertEquals(
        await responsiveLive.innerText(),
        "Draft preserved across the 767/768 breakpoint.",
    );
    const responsiveSave = page.waitForResponse(
        (response) =>
            response.request().method() === "PATCH" &&
            new URL(response.url()).pathname === `/api/notes/${noteB2.id}` &&
            response.ok(),
        { timeout: 8000 },
    );
    await responsiveLive.press("Control+s");
    assertEquals((await responsiveSave).status(), 200);
    assertEquals(
        (await apiData<NoteRecord>(`/api/notes/${noteB2.id}`)).body.trim(),
        "Draft preserved across the 767/768 breakpoint.",
    );
    await responsiveSheet.getByRole("button", {
        name: "收起工作区",
        exact: true,
    }).click();
    await responsiveEditor.waitFor({ state: "hidden" });
    // The mobile opener was unmounted at 768px. Shared Host semantics restore
    // its workspace entry rather than focusing a detached or replacement node.
    await page.waitForFunction(
        () =>
            document.activeElement?.matches(
                '.zen-edge-btn[data-workspace="notes"]',
            ),
        undefined,
        { timeout: 5000 },
    );
    assertEquals(await currentId(), noteB2.id);
});
