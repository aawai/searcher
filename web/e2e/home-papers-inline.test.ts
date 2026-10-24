import { assert, assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { openNotes } from "./helpers/desk.ts";

type ProductionChunk = {
    file: string;
    name?: string;
    src?: string;
};

type ProductionManifest = Record<string, ProductionChunk>;

type DocumentRecord = {
    id: string;
    title: string | null;
    displayTitle: string;
    body: string;
    isFavorite: boolean;
    isHomeFixed: boolean;
    homeSortOrder: number | null;
    version: number;
};

Deno.test("production Zen inline papers mobile behavior E2E (#191)", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const accountA = await app.seedAskFixtureUser({
        username: "zen_inline_papers_a",
        password: "Zen-inline-papers-A-191!",
        displayName: "Zen Inline Papers A",
    });
    const evidenceDir = await createEvidenceDirectory("zen-inline-papers-191");
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
        /DocumentEditor|features\/markdown-editor\/runtime\.ts|spikes\/markdown-editor\/runtime\.ts/i
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
    const inlineRegion = page.getByRole("region", {
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

    async function waitForHome() {
        await page.locator("main.home").waitFor({ state: "visible" });
        await page.locator(".search-form-wrap").waitFor({ state: "visible" });
        await page.evaluate(async () => {
            await document.fonts.ready;
        });
    }

    async function setHome(
        theme: "light" | "dark",
        backgroundImage: string | null = null,
    ) {
        await page.emulateMedia({
            colorScheme: theme,
            reducedMotion: "no-preference",
        });
        await apiData("/api/preferences", "PATCH", {
            theme,
            backgroundImage,
        });
        await page.reload();
        await waitForHome();
        await page.waitForFunction(
            (expected) =>
                document.documentElement.getAttribute("data-theme") ===
                    expected,
            theme,
            { timeout: 5000 },
        );
        await settlePaint();
    }

    async function createDocument(
        title: string,
        body: string,
        homeSortOrder: number,
        flags: { isFavorite?: boolean; isHomeFixed?: boolean } = {},
    ): Promise<DocumentRecord> {
        return await apiData<DocumentRecord>("/api/documents", "POST", {
            title,
            body,
            homeSortOrder,
            isFavorite: flags.isFavorite ?? false,
            isHomeFixed: flags.isHomeFixed ?? true,
        });
    }

    async function listHomeDocuments(): Promise<DocumentRecord[]> {
        return (await apiData<{ items: DocumentRecord[] }>(
            "/api/documents?scope=home",
        )).items;
    }

    function canonicalFixed(documents: DocumentRecord[]) {
        return documents
            .filter((document) => document.isHomeFixed)
            .sort((a, b) =>
                (a.homeSortOrder ?? 0) - (b.homeSortOrder ?? 0) ||
                b.id.localeCompare(a.id)
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
        await settlePaint();
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
        const box = await inlineRegion.boundingBox();
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

    // The fixed collection is independent from favorites, including its empty state.
    await setHome("light");
    const favoriteOnly = await createDocument(
        "Favorite, not home-fixed",
        "This favorited document must never enter the Zen preview.",
        0,
        { isFavorite: true, isHomeFixed: false },
    );
    assertEquals(favoriteOnly.isFavorite, true);
    assertEquals(favoriteOnly.isHomeFixed, false);
    await page.reload();
    await waitForHome();
    await waitForNoInlineNotes();
    assertEquals(await page.locator(".zen-inline-note").count(), 0);

    const docA = await createDocument(
        "Inline note A",
        "A longer first note with two distinct lines of real preview text.\nSecond paragraph stays readable.",
        10,
    );
    await page.reload();
    await waitForHome();
    await waitForCurrent(docA.id);
    await inlineRegion.scrollIntoViewIfNeeded();
    assertEquals(await inlineRegion.locator(".zen-inline-note").count(), 1);
    assertEquals(
        await inlineRegion.locator(".zen-inline-notes-position").count(),
        0,
        "A single fixed note has no position marks",
    );
    const titleSpacing = await inlineRegion.evaluate((region) => {
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
    await inlineRegion.locator(".zen-inline-note-open").focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await dispatchTouchGesture(-100, 0);
    assertEquals(await currentId(), docA.id, "One note cannot be switched");
    assertEquals(await page.locator(".document-editor-container").count(), 0);

    const docB = await createDocument(
        "Inline note B",
        "Short second note.",
        20,
    );
    const docC = await createDocument(
        "Inline note C",
        "- Structured third note\n- A second preview line\n\n```ts\nconst note = true;\n```",
        20,
    );
    await page.reload();
    await waitForHome();
    const expectedOrder = canonicalFixed(await listHomeDocuments());
    const tiedDocs = [docB, docC].sort((a, b) => b.id.localeCompare(a.id));
    assertEquals(
        expectedOrder.map((document) => document.id),
        [docA.id, ...tiedDocs.map((document) => document.id)],
    );
    await waitForCurrent(expectedOrder[0].id);
    await page.locator("#search-query").focus();
    await page.keyboard.press("ArrowRight");
    assertEquals(
        await currentId(),
        expectedOrder[0].id,
        "Search arrow keys do not change the note selection",
    );
    assertEquals(await inlineRegion.locator(".zen-inline-note").count(), 1);
    assertEquals(
        await inlineRegion.locator(".zen-inline-notes-position").count() > 0,
        true,
        "Multiple fixed notes have position marks",
    );
    assertEquals(
        await inlineRegion.locator(".zen-inline-note-title").textContent(),
        expectedOrder[0].displayTitle,
    );
    assertEquals(
        (await inlineRegion.locator(".zen-inline-note-body").innerText())
            .includes("A longer first note"),
        true,
    );
    await inlineRegion.scrollIntoViewIfNeeded();
    const initialScrollY = await page.evaluate(() => scrollY);
    assertEquals(await inlineRegion.locator(".zen-inline-note").count(), 1);
    assertEquals(
        await inlineRegion.getAttribute("aria-label"),
        "首页固定便签",
    );
    assertEquals(
        await inlineRegion.locator(".zen-inline-note-open").getAttribute(
            "aria-label",
        ),
        `打开便签：${expectedOrder[0].displayTitle}`,
    );
    assertEquals(
        await inlineRegion.locator(
            ".zen-inline-notes-position button, .zen-inline-notes-position a, .zen-inline-notes-position [tabindex], .zen-inline-notes-position [role='button'], .zen-inline-notes-position [role='link']",
        ).count(),
        0,
        "Position marks are decorative, not interactive",
    );
    assertEquals(
        /\b\d+\s*\/\s*\d+\b/.test(await inlineRegion.innerText()),
        false,
        "The preview does not display a numeric page count",
    );
    const visualChrome = await inlineRegion.evaluate((region) => {
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
    // The wrapper is bare; the active note is the single translucent material card.
    assertEquals(visualChrome.region.backgroundAlpha, 0, "region has no fill");
    assertEquals(visualChrome.region.boxShadow, "none", "region has no shadow");
    assert(
        visualChrome.content.backgroundAlpha > 0,
        "the active note has a material fill",
    );
    assert(
        visualChrome.content.boxShadow !== "none",
        "the active note floats on one shadow",
    );
    for (const [scope, chrome] of Object.entries(visualChrome)) {
        assertEquals(
            chrome.visibleBorder,
            false,
            `${scope} has no visible border`,
        );
    }
    const visibleExtras = await inlineRegion.locator(
        "button, a[href], input, [role='button'], [role='link']",
    ).evaluateAll(
        (buttons) =>
            buttons.filter((button) => {
                if (button.matches(".zen-inline-note-open")) return false;
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
    async function assertBodyAlignment(id: string) {
        const alignment = await page.evaluate(() => {
            const region = document.querySelector(".zen-inline-notes")!;
            const body = region.querySelector<HTMLElement>(
                ".zen-inline-note-body",
            )!;
            const center = (element: Element) => {
                const box = element.getBoundingClientRect();
                return box.x + box.width / 2;
            };
            return {
                structured: body.hasAttribute("data-structured"),
                textAlign: getComputedStyle(body).textAlign,
                offset: Math.abs(center(body) - center(region)),
            };
        });
        assertEquals(
            alignment.structured,
            id === docC.id,
            "Only the Markdown list/code note is structured",
        );
        assertEquals(
            alignment.textAlign,
            alignment.structured ? "start" : "center",
        );
        if (alignment.structured) {
            assert(
                alignment.offset <= 1,
                `Structured body stays on the shared axis (${alignment.offset})`,
            );
        }
    }
    const initialGeometry = await readStableGeometry();
    assertEquals(initialGeometry.preview !== null, true);

    // A true Chromium touch stream distinguishes horizontal swipes from scrolling and suppresses the follow-up click.
    await dispatchTouchGesture(0, 80);
    assertEquals(await currentId(), expectedOrder[0].id);
    assertEquals(await page.locator(".document-editor-container").count(), 0);
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
    assertEquals(await page.locator(".document-editor-container").count(), 0);
    await dispatchTouchGesture(-110, 0);
    await waitForCurrent(expectedOrder[1].id);
    assertEquals(await page.locator(".document-editor-container").count(), 0);
    await settlePaint();
    assertEquals(await readStableGeometry(), initialGeometry);

    // The hidden accessible controls remain discoverable by name and respond to a virtual activation.
    const next = inlineRegion.getByRole("button", {
        name: "下一张便签",
        exact: true,
    });
    const previous = inlineRegion.getByRole("button", {
        name: "上一张便签",
        exact: true,
    });
    assertEquals(await next.getAttribute("tabindex"), "-1");
    assertEquals(await previous.getAttribute("tabindex"), "-1");
    assertEquals(await next.count(), 1);
    assertEquals(await previous.count(), 1);
    await next.evaluate((button) => (button as HTMLButtonElement).click());
    await waitForCurrent(expectedOrder[2].id);
    await assertBodyAlignment(expectedOrder[2].id);
    await inlineRegion.locator(".zen-inline-note-open").focus();
    await page.keyboard.press("ArrowRight");
    assertEquals(
        await currentId(),
        expectedOrder[2].id,
        "The last note does not wrap",
    );
    await previous.evaluate((button) => (button as HTMLButtonElement).click());
    await waitForCurrent(expectedOrder[1].id);
    await assertBodyAlignment(expectedOrder[1].id);
    await inlineRegion.locator(".zen-inline-note-open").focus();
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
        "Mobile home preview must not request DocumentEditor, editor-vendor, or Markdown editor runtime before opening a note",
    );

    // Enter opens the existing mobile Sheet editor; a real content save leaves the selected ID intact.
    await page.keyboard.press("Enter");
    const sheet = page.locator(
        '.workspace-panel--mobile[data-presentation="sheet"]',
    );
    await sheet.waitFor({ state: "visible" });
    const editor = sheet.locator(".document-editor-container");
    await editor.waitFor({ state: "visible" });
    const liveEditor = editor.locator(
        ".document-editor-scroll-area .ProseMirror",
    );
    await liveEditor.waitFor({ state: "visible" });
    const saveResponse = page.waitForResponse(
        (response) =>
            response.request().method() === "PATCH" &&
            new URL(response.url()).pathname === `/api/documents/${docA.id}` &&
            response.ok(),
        { timeout: 8000 },
    );
    await liveEditor.fill(
        "Edited through the existing mobile document editor.",
    );
    await liveEditor.press("Control+s");
    assertEquals((await saveResponse).status(), 200);
    const editedA = await apiData<DocumentRecord>(`/api/documents/${docA.id}`);
    assertEquals(
        editedA.body.trim(),
        "Edited through the existing mobile document editor.",
    );
    assertEquals(
        await currentId(),
        docA.id,
        "Editing does not select another note",
    );
    await sheet.getByRole("button", {
        name: "返回首页",
        exact: true,
    }).click();
    await sheet.waitFor({ state: "detached" });
    await page.waitForFunction(
        (id) => document.activeElement?.getAttribute("data-note-id") === id,
        docA.id,
        { timeout: 5000 },
    );
    assertEquals(await currentId(), docA.id);

    // The selection follows note ID through a canonical reorder, not its former array index.
    const currentA = await apiData<DocumentRecord>(`/api/documents/${docA.id}`);
    await apiData<DocumentRecord>(`/api/documents/${docA.id}`, "PATCH", {
        homeSortOrder: 40,
        version: currentA.version,
    });
    await page.reload();
    await waitForHome();
    await waitForCurrent(docA.id);
    const reordered = canonicalFixed(await listHomeDocuments());
    assertEquals(reordered.map((document) => document.id), [
        ...tiedDocs.map((document) => document.id),
        docA.id,
    ]);

    // Exercise removal through the documents library sheet so the live home collection reconciles.
    const interiorOrder = canonicalFixed(await listHomeDocuments());
    const interiorDoc = interiorOrder[1];
    const nextAfterRemoval = interiorOrder[2];
    await inlineRegion.locator(".zen-inline-note-open").focus();
    await page.keyboard.press("ArrowLeft");
    await waitForCurrent(interiorDoc.id);
    const libraryPanel = await openNotes(page);
    await libraryPanel.getByRole("button", {
        name: `笔记操作：${interiorDoc.displayTitle}`,
        exact: true,
    }).click();
    await page.getByRole("menuitem", { name: "移出首页", exact: true })
        .click();
    await waitForCurrent(nextAfterRemoval.id);

    const finalRow = libraryPanel.locator(
        `[data-document-id="${nextAfterRemoval.id}"]`,
    );
    await finalRow.getByRole("button", {
        name: `笔记操作：${nextAfterRemoval.displayTitle}`,
        exact: true,
    }).click();
    await page.getByRole("menuitem", {
        name: "移至回收站",
        exact: true,
    }).click();
    await page.getByRole("alertdialog").getByRole("button", {
        name: "移至回收站",
        exact: true,
    }).click();
    await waitForCurrent(interiorOrder[0].id);
    assertEquals(
        canonicalFixed(await listHomeDocuments()).map((document) =>
            document.id
        ),
        [interiorOrder[0].id],
    );
    await libraryPanel.getByRole("button", {
        name: "返回首页",
        exact: true,
    }).click();
    await libraryPanel.waitFor({ state: "detached" });
    const accountAExtra1 = await createDocument(
        "Account A exclusive first",
        "A account-only first body.",
        30,
    );
    const accountAExtra2 = await createDocument(
        "Account A exclusive second",
        "A account-only second body.",
        40,
    );
    await page.reload();
    await waitForHome();
    await waitForCurrent(interiorOrder[0].id);
    await inlineRegion.locator(".zen-inline-note-open").focus();
    await page.keyboard.press("ArrowRight");
    await waitForCurrent(accountAExtra1.id);
    await page.keyboard.press("ArrowRight");
    await waitForCurrent(accountAExtra2.id);

    // Build an independent second-account selection, then verify both accounts recover their own IDs.
    const accountB = {
        username: "zen_inline_papers_b",
        password: "Zen-inline-papers-B-191!",
    };
    await logoutCurrentAccount();
    await registerAccount(
        accountB.username,
        accountB.password,
        "Zen Inline Papers B",
    );
    await setHome("light");
    assertEquals(
        await page.locator(".zen-inline-notes .zen-inline-note").count(),
        0,
        "Account B must not show account A note content",
    );
    await waitForNoInlineNotes();
    const docB1 = await createDocument("Account B first", "B first body", 10);
    const docB2 = await createDocument(
        "Account B second",
        'B second body.\n\n- Structured account-specific content.\n- A second visible list item.\n\n```ts\nconst account = "B";\n```',
        20,
    );
    await page.reload();
    await waitForHome();
    await waitForCurrent(docB1.id);
    await inlineRegion.locator(".zen-inline-note-open").focus();
    await page.keyboard.press("ArrowRight");
    await waitForCurrent(docB2.id);
    await page.reload();
    await waitForHome();
    await waitForCurrent(docB2.id);
    await logoutCurrentAccount();

    await loginAndVisit(page, app.origin, "/", accountA);
    await setHome("light");
    await waitForCurrent(accountAExtra2.id);
    assertEquals(
        await page.evaluate(() =>
            document.body.innerText.includes("Account B first")
        ),
        false,
    );
    await logoutCurrentAccount();
    await loginAndVisit(page, app.origin, "/", accountB);
    await setHome("light");
    await waitForCurrent(docB2.id);
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
            await page.setViewportSize(viewport);
            await setHome(theme);
            if (viewport.width < 768) {
                await waitForCurrent(docB2.id);
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
                    ];
                });
                assert(
                    axes.every((offset) => Math.abs(offset) <= 1),
                    `Search, launcher grid, and note share an axis: ${axes}`,
                );
            } else {
                await waitForNoInlineNotes();
                await page.locator(
                    ".floating-notes .note-position, .notes-flow-grid .note-flow-item",
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
                    `${evidenceDir}/matrix-${viewport.width}x${viewport.height}-${theme}.png`,
                fullPage: false,
            });
        }
    }

    for (
        const [name, background] of [
            ["solid", "linear-gradient(0deg, #edf2ee, #edf2ee)"],
            ["gradient", "linear-gradient(135deg, #d8e7e0, #f4eee5)"],
        ]
    ) {
        await page.setViewportSize({ width: 390, height: 844 });
        await setHome("light", background);
        await waitForCurrent(docB2.id);
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
        form.append("image", blob, "zen-inline-papers-gradient.png");
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
    await setHome("light", wallpaperUrl);
    await waitForCurrent(docB2.id);
    await page.screenshot({
        path: `${evidenceDir}/wallpaper-gradient-light-390x844.png`,
        fullPage: false,
    });
    await setHome("dark", wallpaperUrl);
    await waitForCurrent(docB2.id);
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
    await inlineRegion.locator(".zen-inline-note-open").focus();
    await page.keyboard.press("ArrowLeft");
    await settlePaint();
    await page.waitForFunction(
        () =>
            [...document.querySelectorAll(".zen-inline-notes")].every((
                element,
            ) => element.getAnimations({ subtree: true }).every((animation) =>
                animation.playState !== "running"
            )),
        null,
        { timeout: 2000 },
    );
    const reducedMotionState = await inlineRegion.evaluate((element) => ({
        reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
        runningAnimations: element.getAnimations({ subtree: true }).filter(
            (animation) => animation.playState === "running",
        ).length,
    }));
    assertEquals(reducedMotionState.reduced, true);
    assertEquals(reducedMotionState.runningAnimations, 0);
    await inlineRegion.locator(".zen-inline-note-open").focus();
    await page.keyboard.press("ArrowRight");
    await waitForCurrent(docB2.id);
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
                "--font-body-line-height",
                "--font-title-size",
                "--font-title-line-height",
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
    await inlineRegion.scrollIntoViewIfNeeded();
    await page.evaluate(() =>
        globalThis.scrollTo(0, document.documentElement.scrollHeight)
    );
    assertEquals(
        await page.evaluate(() =>
            document.querySelector(".zen-inline-note")!.getBoundingClientRect()
                .bottom <=
                innerHeight
        ),
        true,
        "Last preview line can scroll fully into the viewport",
    );
    await page.screenshot({
        path: `${evidenceDir}/short-screen-dynamic-font-reduced-motion.png`,
        fullPage: true,
    });
    await page.evaluate(() => {
        for (
            const token of [
                "--font-body-size",
                "--font-body-line-height",
                "--font-title-size",
                "--font-title-line-height",
            ]
        ) {
            document.documentElement.style.removeProperty(token);
        }
    });

    // Crossing 767/768 while the existing editor is open must preserve its draft and note identity.
    await page.setViewportSize({ width: 767, height: 844 });
    await setHome("light");
    await waitForCurrent(docB2.id);
    const responsiveOpener = page.locator(
        `.zen-inline-note[data-note-id="${docB2.id}"]`,
    );
    await responsiveOpener.click();
    const responsiveSheet = page.locator(
        '.workspace-panel--mobile[data-presentation="sheet"]',
    );
    await responsiveSheet.waitFor({ state: "visible" });
    const responsiveEditor = page.locator(".document-editor-container");
    await responsiveEditor.waitFor({ state: "visible" });
    const responsiveLive = page.locator(
        ".document-editor-container .document-editor-scroll-area .ProseMirror",
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
            new URL(response.url()).pathname === `/api/documents/${docB2.id}` &&
            response.ok(),
        { timeout: 8000 },
    );
    await responsiveLive.press("Control+s");
    assertEquals((await responsiveSave).status(), 200);
    assertEquals(
        (await apiData<DocumentRecord>(`/api/documents/${docB2.id}`)).body
            .trim(),
        "Draft preserved across the 767/768 breakpoint.",
    );
    await responsiveSheet.getByRole("button", {
        name: "返回首页",
        exact: true,
    }).click();
    await responsiveSheet.waitFor({ state: "detached" });
    // The mobile opener unmounted at 768px, so closing returns to the search box.
    await page.waitForFunction(
        () =>
            document.activeElement?.matches(
                "#search-query",
            ),
        undefined,
        { timeout: 5000 },
    );
    assertEquals(await currentId(), docB2.id);
});
