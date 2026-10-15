import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright";
import type { Page, Route } from "playwright";
import type {
    DocumentDto,
    DocumentSettingsDto,
} from "../../src/shared/documents.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { waitForDocument } from "./helpers/document-state.ts";

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface MarkerGeometry extends Rect {
    lines: number;
}

interface LayoutFrame {
    mode: string | null;
    pageCount: number;
    scale: number;
    sheets: Rect[];
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    clientWidth: number;
    innerWidth: number;
    marker: MarkerGeometry | null;
}

interface SelectionSnapshot {
    text: string;
    anchorText: string | null;
    anchorOffset: number | null;
    focusText: string | null;
    focusOffset: number | null;
}

const FRAME_SAMPLE_COUNT = 48;
const FRAME_STABILITY_TAIL = 8;
const IMAGE_AFTER_MARKER = "AFTER_IMAGE_LAYOUT_MARKER_158";
const FONT_FAMILY = "Issue158LateFont158";
const FONT_PAYLOAD = Array.from({ length: 64 }, () => "iiiiiiii").join(" ");
const VIEW_SWITCH_MARKER = "PRESERVEHISTORY158";
const IN_FLIGHT_MARKER = "INFLIGHTSAVE158";

function assertNear(
    actual: number,
    expected: number,
    tolerance: number,
    message: string,
): void {
    assert(
        Math.abs(actual - expected) <= tolerance,
        `${message}: expected ${expected} ± ${tolerance}, received ${actual}`,
    );
}

async function finishFiniteAnimations(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await Promise.all(
            document.getAnimations().filter((animation) =>
                animation.effect?.getComputedTiming().iterations !== Infinity
            ).map((animation) => animation.finished.catch(() => {})),
        );
    });
}

async function waitForPaginationMode(
    page: Page,
    mode: "continuous" | "page",
): Promise<void> {
    await page.waitForFunction((expectedMode) => {
        const viewport = document.querySelector<HTMLElement>(
            ".pagination-viewport",
        );
        if (viewport?.dataset.paginationMode !== expectedMode) return false;
        return expectedMode !== "page" ||
            Number(viewport.dataset.pageCount ?? "0") > 0;
    }, mode);
}

async function captureLayoutFrames(
    page: Page,
    marker: string | undefined,
    count: number,
): Promise<LayoutFrame[]> {
    return await page.evaluate(async ({ marker, count }) => {
        function readMarker(
            editor: HTMLElement,
            target: string | undefined,
        ): MarkerGeometry | null {
            if (!target) return null;
            const walker = document.createTreeWalker(
                editor,
                NodeFilter.SHOW_TEXT,
            );
            while (walker.nextNode()) {
                const node = walker.currentNode as Text;
                const start = node.data.indexOf(target);
                if (start < 0) continue;
                const range = document.createRange();
                range.setStart(node, start);
                range.setEnd(node, start + target.length);
                const rect = range.getBoundingClientRect();
                return {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    lines: range.getClientRects().length,
                };
            }
            return null;
        }

        function sample(): LayoutFrame {
            const viewport = document.querySelector<HTMLElement>(
                ".pagination-viewport",
            );
            const scroll = document.querySelector<HTMLElement>(
                ".document-editor-scroll-area",
            );
            const editor = document.querySelector<HTMLElement>(".ProseMirror");
            if (!viewport || !scroll || !editor) {
                throw new Error(
                    "Zen document pagination geometry is not mounted",
                );
            }
            const zoom = Number.parseFloat(
                getComputedStyle(viewport).getPropertyValue("zoom"),
            );
            return {
                mode: viewport.dataset.paginationMode ?? null,
                pageCount: Number(viewport.dataset.pageCount ?? "0"),
                scale: Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
                sheets: Array.from(
                    viewport.querySelectorAll<HTMLElement>(
                        ".pagination-sheet",
                    ),
                ).map((sheet) => {
                    const rect = sheet.getBoundingClientRect();
                    return {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                    };
                }),
                scrollTop: scroll.scrollTop,
                scrollHeight: scroll.scrollHeight,
                clientHeight: scroll.clientHeight,
                clientWidth: scroll.clientWidth,
                innerWidth,
                marker: readMarker(editor, marker),
            };
        }

        const samples: LayoutFrame[] = [];
        for (let index = 0; index < count; index++) {
            const { promise, resolve } = Promise.withResolvers<void>();
            requestAnimationFrame(() => resolve());
            await promise;
            samples.push(sample());
        }
        return samples;
    }, { marker, count });
}

function assertValidLayout(frame: LayoutFrame, label: string): void {
    assertEquals(frame.mode, "page", `${label}: page presentation is active`);
    assert(frame.pageCount > 0, `${label}: at least one page is laid out`);
    assertEquals(
        frame.sheets.length,
        frame.pageCount,
        `${label}: visible paper count matches the reported page count`,
    );
    assert(
        frame.scale > 0 && frame.scale <= 1.001,
        `${label}: valid page scale`,
    );
    assert(frame.clientWidth > 0 && frame.clientHeight > 0);
    for (let index = 0; index < frame.sheets.length; index++) {
        const sheet = frame.sheets[index];
        assert(sheet.width > 0 && sheet.height > 0, `${label}: paper has area`);
        assert(
            sheet.x >= -1,
            `${label}: paper is not clipped off the left edge`,
        );
        assert(
            sheet.x + sheet.width <= frame.innerWidth + 1,
            `${label}: paper fits within the browser viewport`,
        );
        if (index > 0) {
            assertNear(
                sheet.x,
                frame.sheets[0].x,
                1,
                `${label}: sheets share one horizontal axis`,
            );
            assert(
                sheet.y >=
                    frame.sheets[index - 1].y +
                        frame.sheets[index - 1].height - 1,
                `${label}: paper order is vertical and non-overlapping`,
            );
        }
    }
}

function assertConvergedFrames(
    samples: LayoutFrame[],
    label: string,
): LayoutFrame {
    assertEquals(samples.length, FRAME_SAMPLE_COUNT);
    const tail = samples.slice(-FRAME_STABILITY_TAIL);
    const final = tail[tail.length - 1];
    assertValidLayout(final, label);

    for (const frame of tail) {
        assertValidLayout(frame, label);
        assertEquals(frame.pageCount, final.pageCount, `${label}: page count`);
        assertEquals(frame.sheets.length, final.sheets.length);
        assertNear(frame.scale, final.scale, 0.001, `${label}: scale`);
        assertNear(
            frame.scrollTop,
            final.scrollTop,
            0.5,
            `${label}: scrollTop`,
        );
        for (let index = 0; index < final.sheets.length; index++) {
            assertNear(
                frame.sheets[index].x,
                final.sheets[index].x,
                1,
                `${label}: sheet ${index + 1} x position`,
            );
            assertNear(
                frame.sheets[index].y,
                final.sheets[index].y,
                1,
                `${label}: sheet ${index + 1} y position`,
            );
            assertNear(
                frame.sheets[index].width,
                final.sheets[index].width,
                1,
                `${label}: sheet ${index + 1} width`,
            );
            assertNear(
                frame.sheets[index].height,
                final.sheets[index].height,
                1,
                `${label}: sheet ${index + 1} height`,
            );
        }
        if (final.marker) {
            assert(frame.marker, `${label}: marker stays measurable`);
            assertNear(frame.marker.y, final.marker.y, 1, `${label}: marker y`);
            assertNear(
                frame.marker.height,
                final.marker.height,
                1,
                `${label}: marker height`,
            );
            assertEquals(frame.marker.lines, final.marker.lines);
        }
    }
    return final;
}

function layoutChanged(before: LayoutFrame, after: LayoutFrame): boolean {
    const left = before.sheets[0];
    const right = after.sheets[0];
    return Math.abs(left.x - right.x) > 2 ||
        Math.abs(left.y - right.y) > 2 ||
        Math.abs(left.width - right.width) > 2 ||
        Math.abs(left.height - right.height) > 2 ||
        Math.abs(before.scale - after.scale) > 0.005;
}

interface DocumentPatchGate {
    readonly started: Promise<void>;
    readonly requestCount: () => number;
    release(): void;
    close(): Promise<void>;
}

async function holdFirstDocumentPatch(
    page: Page,
    documentId: string,
): Promise<DocumentPatchGate> {
    const matcher = `**/api/documents/${documentId}`;
    const pathname = `/api/documents/${documentId}`;
    const started = page.waitForRequest(
        (request) =>
            request.method() === "PATCH" &&
            new URL(request.url()).pathname === pathname,
        { timeout: 10_000 },
    ).then(() => {});
    const { promise: mayContinue, resolve: allowRequest } = Promise
        .withResolvers<void>();
    let requestCount = 0;
    let firstRequestHeld = false;
    const handler = async (route: Route): Promise<void> => {
        if (route.request().method() !== "PATCH") {
            await route.continue();
            return;
        }
        requestCount++;
        if (!firstRequestHeld) {
            firstRequestHeld = true;
            await mayContinue;
        }
        await route.continue();
    };
    await page.route(matcher, handler);
    return {
        started,
        requestCount: () => requestCount,
        release: () => allowRequest(),
        async close() {
            allowRequest();
            await page.unroute(matcher, handler);
        },
    };
}

function paperAspect(
    size: DocumentSettingsDto["paperSize"],
    orientation: DocumentSettingsDto["orientation"],
): number {
    const [width, height] = size === "a4" ? [210, 297] : [215.9, 279.4];
    return orientation === "portrait" ? width / height : height / width;
}

Deno.test("Zen document presentations preserve editor, layout and save contracts", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const credentials = await app.seedAskFixtureUser({
        username: "zen_presentation_158",
        password: "Zen-presentation-158!",
        displayName: "Zen Presentation Contract",
    });
    await loginAndVisit(page, app.origin, "/", credentials);

    async function api<T>(
        path: string,
        method = "GET",
        body?: object,
    ): Promise<T> {
        return await page.evaluate(async ({ path, method, body }) => {
            const response = await fetch(path, {
                method,
                headers: { "Content-Type": "application/json" },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            if (!response.ok) throw new Error(await response.text());
            return (await response.json()).data;
        }, { path, method, body }) as T;
    }

    await api("/api/preferences", "PATCH", {
        style: "zen",
        theme: "light",
    });
    const created = await api<DocumentDto>("/api/documents", "POST", {
        title: "Zen presentation contract #158",
        body: "Preparing a late image fixture.",
    });
    const asset = await page.evaluate(async (documentId) => {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const drawing = canvas.getContext("2d");
        if (!drawing) throw new Error("Could not create image fixture");
        drawing.fillStyle = "#eef4ff";
        drawing.fillRect(0, 0, canvas.width, canvas.height);
        drawing.fillStyle = "#315d9b";
        drawing.fillRect(20, 20, 280, 140);
        const { promise, resolve, reject } = Promise.withResolvers<Blob>();
        canvas.toBlob((result: Blob | null) => {
            if (result) resolve(result);
            else reject(new Error("Could not encode image fixture"));
        }, "image/png");
        const blob = await promise;
        const form = new FormData();
        form.append("file", blob, "late-layout-158.png");
        const response = await fetch(
            `/api/documents/${documentId}/assets`,
            { method: "POST", body: form },
        );
        if (!response.ok) throw new Error(await response.text());
        return (await response.json()).data as { assetId: string };
    }, created.id);

    const body = [
        "# Zen presentation contract 158",
        "FIRST_PAGE_BEFORE_IMAGE_158",
        `![late layout fixture](asset://${asset.assetId})`,
        IMAGE_AFTER_MARKER,
        "<!-- pagebreak -->",
        "SECOND_PAGE_MARKER_158",
        "<!-- pagebreak -->",
        "THIRD_PAGE_MARKER_158",
        `LATE_FONT_PAYLOAD_158 ${FONT_PAYLOAD}`,
    ].join("\n\n");
    const fixtureDocument = await api<DocumentDto>(
        `/api/documents/${created.id}`,
        "PATCH",
        { body, version: created.version },
    );
    const initialSettings = await api<DocumentSettingsDto>(
        `/api/documents/${fixtureDocument.id}/settings`,
    );

    const imagePath =
        `**/api/documents/${fixtureDocument.id}/assets/${asset.assetId}`;
    const { promise: imageRequestStarted, resolve: resolveImageRequest } =
        Promise.withResolvers<void>();
    const { promise: imageMayContinue, resolve: releaseImage } = Promise
        .withResolvers<void>();
    let imageRequestCount = 0;
    const imageHandler = async (route: Route): Promise<void> => {
        imageRequestCount++;
        if (imageRequestCount === 1) {
            resolveImageRequest();
            await imageMayContinue;
        }
        await route.continue();
    };
    await page.route(imagePath, imageHandler);
    cleanup.defer(async () => {
        releaseImage();
        await page.unroute(imagePath, imageHandler);
    });

    const bodyPatchRequests: string[] = [];
    page.on("request", (request) => {
        if (
            request.method() === "PATCH" &&
            new URL(request.url()).pathname ===
                `/api/documents/${fixtureDocument.id}`
        ) {
            bodyPatchRequests.push(request.postData() ?? "");
        }
    });

    await page.reload();
    await page.locator('button[data-workspace="documents"]').first().click();
    const panel = page.locator(
        'aside.workspace-panel[data-presentation="panel"]',
    );
    await panel.waitFor({ state: "visible" });
    await page.locator(`[data-document-id="${fixtureDocument.id}"] h4 button`)
        .click();
    const editor = page.locator(".ProseMirror");
    await editor.waitFor({ state: "visible" });
    const originalEditor = await editor.elementHandle();
    assert(originalEditor, "Zen opens a live rich-text editor");

    await editor.evaluate((node, family) => {
        (node as HTMLElement).style.fontFamily = `"${family}", monospace`;
    }, FONT_FAMILY);
    const image = page.locator(
        `.ProseMirror img[data-canonical-src="asset://${asset.assetId}"]`,
    );
    await image.waitFor({ state: "attached" });
    await image.scrollIntoViewIfNeeded();
    await imageRequestStarted;
    const pendingImage = await image.evaluate((node) => {
        const element = node as HTMLImageElement;
        return {
            complete: element.complete,
            naturalWidth: element.naturalWidth,
        };
    });
    assertEquals(
        pendingImage.naturalWidth,
        0,
        "the page-mode baseline uses a real image request held before decode",
    );

    await editor.evaluate((node) => (node as HTMLElement).focus());
    await page.getByRole("button", { name: "页面", exact: true }).click();
    await waitForPaginationMode(page, "page");
    await page.evaluate(async () => {
        await document.fonts.ready;
    });
    await finishFiniteAnimations(page);
    const initialSamples = await captureLayoutFrames(
        page,
        IMAGE_AFTER_MARKER,
        FRAME_SAMPLE_COUNT,
    );
    const beforeImage = assertConvergedFrames(
        initialSamples,
        "initial page layout with the image response pending",
    );
    assert(beforeImage.marker, "the post-image content marker is measurable");

    await page.getByRole("button", { name: "连续", exact: true }).click();
    await waitForPaginationMode(page, "continuous");
    assert(
        await originalEditor.evaluate((node) =>
            node === document.querySelector(".ProseMirror")
        ),
        "the initial continuous/page presentation uses the same editor view",
    );
    await editor.evaluate((node) => {
        node.dispatchEvent(
            new CompositionEvent("compositionstart", {
                bubbles: true,
                data: "",
            }),
        );
    });
    await page.getByRole("button", { name: "页面", exact: true }).click();
    await page.evaluate(async () => {
        const { promise, resolve } = Promise.withResolvers<void>();
        requestAnimationFrame(() => resolve());
        await promise;
    });
    assertEquals(
        await page.locator(".pagination-viewport").getAttribute(
            "data-pagination-mode",
        ),
        "continuous",
        "presentation remains continuous until composition ends",
    );
    await editor.evaluate((node) => {
        node.dispatchEvent(
            new CompositionEvent("compositionend", {
                bubbles: true,
                data: "",
            }),
        );
    });
    await waitForPaginationMode(page, "page");
    assert(
        await originalEditor.evaluate((node) =>
            node === document.querySelector(".ProseMirror")
        ),
        "ending composition applies page layout without replacing the editor",
    );
    await page.getByRole("button", { name: "连续", exact: true }).click();
    await waitForPaginationMode(page, "continuous");

    releaseImage();
    await image.evaluate(async (node) => {
        await (node as HTMLImageElement).decode();
    });
    const imageEvidence = await image.evaluate((node) => {
        const element = node as HTMLImageElement;
        return {
            complete: element.complete,
            naturalWidth: element.naturalWidth,
            naturalHeight: element.naturalHeight,
        };
    });
    assertEquals(imageEvidence.complete, true);
    assertEquals(imageEvidence.naturalWidth, 320);
    assertEquals(imageEvidence.naturalHeight, 180);
    await page.unroute(imagePath, imageHandler);

    await page.getByRole("button", { name: "页面", exact: true }).click();
    await waitForPaginationMode(page, "page");
    await finishFiniteAnimations(page);
    const imageSamples = await captureLayoutFrames(
        page,
        IMAGE_AFTER_MARKER,
        FRAME_SAMPLE_COUNT,
    );
    const afterImage = assertConvergedFrames(
        imageSamples,
        "after the decoded image triggers pagination",
    );
    assert(afterImage.marker);
    assert(
        Math.abs(afterImage.marker.y - beforeImage.marker.y) > 24 ||
            afterImage.marker.lines !== beforeImage.marker.lines,
        "decoded image dimensions change downstream content geometry",
    );

    const fontBeforeSamples = await captureLayoutFrames(
        page,
        FONT_PAYLOAD,
        FRAME_SAMPLE_COUNT,
    );
    const beforeFont = assertConvergedFrames(
        fontBeforeSamples,
        "page layout before late font loading",
    );
    assert(beforeFont.marker, "the font payload is measurable before loading");
    const fontLoad = await page.evaluate(async ({ family, payload }) => {
        const localFamilies = [
            "DejaVu Sans",
            "Liberation Sans",
            "Arial",
            "Times New Roman",
        ];
        for (const localFamily of localFamilies) {
            try {
                const face = new FontFace(
                    family,
                    `local("${localFamily}")`,
                );
                await face.load();
                if (face.status !== "loaded") continue;
                document.fonts.add(face);
                const requested = await document.fonts.load(
                    `16px "${family}"`,
                    payload,
                );
                return {
                    localFamily,
                    status: face.status,
                    presentInLoadedFaces: requested.includes(face),
                    loadedFaceCount: requested.length,
                    fontSetCheck: document.fonts.check(
                        `16px "${family}"`,
                        payload,
                    ),
                };
            } catch {
                // Try another installed local font; the later geometry assertion
                // still requires this loaded face to affect rendered text.
            }
        }
        throw new Error("No usable local font face could be loaded");
    }, { family: FONT_FAMILY, payload: FONT_PAYLOAD });
    assertEquals(fontLoad.status, "loaded");
    assert(fontLoad.presentInLoadedFaces && fontLoad.loadedFaceCount > 0);
    assertEquals(fontLoad.fontSetCheck, true);

    const fontSamples = await captureLayoutFrames(
        page,
        FONT_PAYLOAD,
        FRAME_SAMPLE_COUNT,
    );
    const afterFont = assertConvergedFrames(
        fontSamples,
        "after the late font face loads",
    );
    assert(afterFont.marker);
    assert(
        Math.abs(afterFont.marker.height - beforeFont.marker.height) > 1 ||
            afterFont.marker.lines !== beforeFont.marker.lines ||
            Math.abs(afterFont.marker.width - beforeFont.marker.width) > 2,
        "the actually loaded font changes rendered text geometry",
    );

    const beforePaper = afterFont;
    const targetPaperSize = initialSettings.paperSize === "a4"
        ? "letter"
        : "a4";
    await page.getByRole("button", { name: "纸张", exact: true }).click();
    const settingsDialog = page.getByRole("dialog");
    await settingsDialog.getByLabel("纸张规格", { exact: true }).selectOption(
        targetPaperSize,
    );
    await settingsDialog.getByLabel("版面方向", { exact: true }).selectOption(
        initialSettings.orientation,
    );
    await settingsDialog.getByRole("button", {
        name: "保存设置",
        exact: true,
    }).click();
    await settingsDialog.waitFor({ state: "hidden" });
    const paperSamples = await captureLayoutFrames(
        page,
        FONT_PAYLOAD,
        FRAME_SAMPLE_COUNT,
    );
    const afterPaper = assertConvergedFrames(
        paperSamples,
        "after saving the alternate paper size",
    );
    const beforeAspect = beforePaper.sheets[0].width /
        beforePaper.sheets[0].height;
    const afterAspect = afterPaper.sheets[0].width /
        afterPaper.sheets[0].height;
    assert(
        Math.abs(
            afterAspect -
                paperAspect(targetPaperSize, initialSettings.orientation),
        ) <
            0.02,
        "paper settings update the displayed physical page proportions",
    );
    assert(
        Math.abs(afterAspect - beforeAspect) > 0.035,
        "changing paper size produces a visible paper geometry change",
    );

    const beforeResize = afterPaper;
    await page.setViewportSize({ width: 390, height: 844 });
    await finishFiniteAnimations(page);
    const narrowSamples = await captureLayoutFrames(
        page,
        FONT_PAYLOAD,
        FRAME_SAMPLE_COUNT,
    );
    const narrowLayout = assertConvergedFrames(
        narrowSamples,
        "after Zen viewport resize to a narrow sheet",
    );
    assert(
        layoutChanged(beforeResize, narrowLayout),
        "viewport resizing changes valid page geometry or scale",
    );
    const beforeWideResize = narrowLayout;
    await page.setViewportSize({ width: 1440, height: 900 });
    await finishFiniteAnimations(page);
    const wideSamples = await captureLayoutFrames(
        page,
        FONT_PAYLOAD,
        FRAME_SAMPLE_COUNT,
    );
    const wideLayout = assertConvergedFrames(
        wideSamples,
        "after restoring the Zen desktop viewport",
    );
    assert(
        layoutChanged(beforeWideResize, wideLayout),
        "restoring viewport width reflows the paper geometry",
    );

    const sourceBodyBaseline = await api<DocumentDto>(
        `/api/documents/${fixtureDocument.id}`,
    );
    const cleanSaved = await waitForDocument(
        page,
        fixtureDocument.id,
        (saved) =>
            saved.body === fixtureDocument.body &&
            saved.version === fixtureDocument.version,
    );
    assertEquals(cleanSaved.body, fixtureDocument.body);
    assertEquals(cleanSaved.version, fixtureDocument.version);
    assertEquals(
        bodyPatchRequests,
        [],
        "clean layout, resource, paper, resize and view operations do not PATCH body",
    );
    assertEquals(sourceBodyBaseline.body, fixtureDocument.body);
    assertEquals(sourceBodyBaseline.version, fixtureDocument.version);

    await page.getByRole("button", { name: "源码", exact: true }).click();
    const source = page.getByRole("textbox", {
        name: "Markdown 源码正文",
        exact: true,
    });
    await source.waitFor({ state: "visible" });
    assertEquals(await source.inputValue(), fixtureDocument.body);
    await page.getByRole("button", { name: "页面", exact: true }).click();
    await editor.waitFor({ state: "visible" });
    await waitForPaginationMode(page, "page");
    assertEquals(await source.count(), 0);
    assertEquals(bodyPatchRequests.length, 0);
    const cleanAfterSource = await api<DocumentDto>(
        `/api/documents/${fixtureDocument.id}`,
    );
    assertEquals(cleanAfterSource.body, fixtureDocument.body);
    assertEquals(cleanAfterSource.version, fixtureDocument.version);

    await page.getByRole("button", { name: "连续", exact: true }).click();
    await waitForPaginationMode(page, "continuous");
    const firstSaveGate = await holdFirstDocumentPatch(
        page,
        fixtureDocument.id,
    );
    await editor.evaluate((node) => (node as HTMLElement).focus());
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText(`\n\n${VIEW_SWITCH_MARKER}`);

    try {
        await page.getByRole("button", { name: "页面", exact: true }).click();
        await firstSaveGate.started;
        await page.locator('.document-save-status[data-status="saving"]')
            .waitFor({ state: "attached" });
        await waitForPaginationMode(page, "page");
        firstSaveGate.release();
        const savedAfterViewChange = await waitForDocument(
            page,
            fixtureDocument.id,
            (saved) => saved.body.includes(VIEW_SWITCH_MARKER),
        );
        await page.locator('.document-save-status[data-status="saved"]')
            .waitFor({ state: "attached" });
        assertEquals(savedAfterViewChange.version, fixtureDocument.version + 1);
        assertEquals(firstSaveGate.requestCount(), 1);
    } finally {
        await firstSaveGate.close();
    }
    assertEquals(bodyPatchRequests.length, 1);

    const historyParagraph = editor.locator("p").filter({
        hasText: VIEW_SWITCH_MARKER,
    });
    await historyParagraph.click();
    await page.keyboard.press("End");
    for (let index = 0; index < 6; index++) {
        await page.keyboard.press("Shift+ArrowLeft");
    }
    await page.evaluate(async () => {
        const { promise, resolve } = Promise.withResolvers<void>();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        await promise;
    });
    const selectionSnapshot = async (): Promise<SelectionSnapshot> =>
        await page.evaluate(() => {
            const selection = globalThis.getSelection();
            return {
                text: selection?.toString() ?? "",
                anchorText: selection?.anchorNode?.textContent ?? null,
                anchorOffset: selection?.anchorOffset ?? null,
                focusText: selection?.focusNode?.textContent ?? null,
                focusOffset: selection?.focusOffset ?? null,
            };
        });
    const selected = await selectionSnapshot();
    assertEquals(
        selected.text.length,
        6,
        "the editor has a real text selection",
    );
    assert(selected.anchorText?.includes(VIEW_SWITCH_MARKER));
    const presentationEditor = await editor.elementHandle();
    assert(presentationEditor);

    const preservedSelection = selected;
    for (let cycle = 0; cycle < 20; cycle++) {
        await page.getByRole("button", { name: "连续", exact: true }).click();
        await waitForPaginationMode(page, "continuous");
        assert(
            await presentationEditor.evaluate((node) =>
                node === document.querySelector(".ProseMirror")
            ),
            `cycle ${cycle + 1}: continuous retains the same editor view`,
        );
        await editor.focus();
        assertEquals(
            await selectionSnapshot(),
            preservedSelection,
            `cycle ${cycle + 1}: continuous restores the selected text`,
        );

        await page.getByRole("button", { name: "页面", exact: true }).click();
        await waitForPaginationMode(page, "page");
        assert(
            await presentationEditor.evaluate((node) =>
                node === document.querySelector(".ProseMirror")
            ),
            `cycle ${cycle + 1}: page retains the same editor view`,
        );
        await editor.focus();
        assertEquals(
            await selectionSnapshot(),
            preservedSelection,
            `cycle ${cycle + 1}: page restores the selected text`,
        );
        assertEquals(await page.locator(".ProseMirror").count(), 1);
    }
    assertEquals(
        bodyPatchRequests.length,
        1,
        "presentation-only switching does not add clean-document body PATCHes",
    );

    await page.getByRole("button", { name: "撤销", exact: true }).click();
    const undone = await waitForDocument(
        page,
        fixtureDocument.id,
        (saved) => !saved.body.includes(VIEW_SWITCH_MARKER),
    );
    await page.locator('.document-save-status[data-status="saved"]')
        .waitFor({ state: "attached" });
    assertEquals(undone.version, fixtureDocument.version + 2);
    assert(
        !(await editor.textContent() ?? "").includes(VIEW_SWITCH_MARKER),
        "undo after presentation cycles removes the user's edit",
    );

    await page.getByRole("button", { name: "重做", exact: true }).click();
    const redone = await waitForDocument(
        page,
        fixtureDocument.id,
        (saved) => saved.body.includes(VIEW_SWITCH_MARKER),
    );
    await page.locator('.document-save-status[data-status="saved"]')
        .waitFor({ state: "attached" });
    assertEquals(redone.version, fixtureDocument.version + 3);
    assert(
        (await editor.textContent() ?? "").includes(VIEW_SWITCH_MARKER),
        "redo after undo restores the user's edit",
    );

    await page.getByRole("button", { name: "连续", exact: true }).click();
    await waitForPaginationMode(page, "continuous");
    const patchesBeforeInFlight = bodyPatchRequests.length;
    const inFlightGate = await holdFirstDocumentPatch(page, fixtureDocument.id);
    await editor.evaluate((node) => (node as HTMLElement).focus());
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText(`\n\n${IN_FLIGHT_MARKER}`);

    try {
        await inFlightGate.started;
        await page.locator('.document-save-status[data-status="saving"]')
            .waitFor({ state: "attached" });
        await page.getByRole("button", { name: "页面", exact: true }).click();
        await waitForPaginationMode(page, "page");
        inFlightGate.release();
        const savedInFlight = await waitForDocument(
            page,
            fixtureDocument.id,
            (saved) => saved.body.includes(IN_FLIGHT_MARKER),
        );
        await page.locator('.document-save-status[data-status="saved"]')
            .waitFor({ state: "attached" });
        assertEquals(savedInFlight.version, fixtureDocument.version + 4);
        assertEquals(inFlightGate.requestCount(), 1);
    } finally {
        await inFlightGate.close();
    }
    assertEquals(
        bodyPatchRequests.length,
        patchesBeforeInFlight + 1,
        "the in-flight autosave completes once and layout adds no body PATCH",
    );

    const beforeSource = await api<DocumentDto>(
        `/api/documents/${fixtureDocument.id}`,
    );
    const patchesBeforeSource = bodyPatchRequests.length;
    await page.getByRole("button", { name: "源码", exact: true }).click();
    const finalSource = page.getByRole("textbox", {
        name: "Markdown 源码正文",
        exact: true,
    });
    await finalSource.waitFor({ state: "visible" });
    assertEquals(await finalSource.inputValue(), beforeSource.body);
    await page.getByRole("button", { name: "页面", exact: true }).click();
    await editor.waitFor({ state: "visible" });
    await waitForPaginationMode(page, "page");
    const finalSaved = await api<DocumentDto>(
        `/api/documents/${fixtureDocument.id}`,
    );
    assertEquals(finalSaved.body, beforeSource.body);
    assertEquals(finalSaved.version, beforeSource.version);
    assertEquals(
        bodyPatchRequests.length,
        patchesBeforeSource,
        "page/source round trips preserve the saved body without another PATCH",
    );
    assert(
        (await editor.textContent() ?? "").includes(VIEW_SWITCH_MARKER) &&
            (await editor.textContent() ?? "").includes(IN_FLIGHT_MARKER),
        "rich page mode still shows both saved user edits",
    );
    await editor.focus();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("字");
    await page.keyboard.press("Control+s");
    const oneCharacter = await waitForDocument(
        page,
        fixtureDocument.id,
        (saved) => saved.body.trimEnd().endsWith(`${IN_FLIGHT_MARKER}字`),
    );
    assertEquals(oneCharacter.version, finalSaved.version + 1);
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+s");
    const characterUndone = await waitForDocument(
        page,
        fixtureDocument.id,
        (saved) => saved.body === finalSaved.body,
    );
    assertEquals(characterUndone.version, oneCharacter.version + 1);
    await page.keyboard.press("Control+Shift+z");
    await page.keyboard.press("Control+s");
    const characterRedone = await waitForDocument(
        page,
        fixtureDocument.id,
        (saved) => saved.body === oneCharacter.body,
    );
    assertEquals(characterRedone.version, characterUndone.version + 1);
    assertEquals(pageErrors, [], "real browser interaction has no page errors");
});
