import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { assert, assertEquals } from "@std/assert";
import { type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import type { DocumentDto } from "../../src/shared/documents.ts";
import { startProductionApp } from "./helpers/production-app.ts";
import { waitForDocument } from "./helpers/document-state.ts";
import { libraryPanel, openNotes } from "./helpers/library.ts";

type PaperSize = "a4" | "letter";
type Orientation = "portrait" | "landscape";

interface ElementRect {
    x: number;
    y: number;
    right: number;
    bottom: number;
}

interface PaperRect extends ElementRect {
    width: number;
    height: number;
}

interface GlyphGeometry {
    sheets: PaperRect[];
    textRects: Record<string, ElementRect[]>;
    imageRect: ElementRect | null;
    scale: number;
}

interface TypographyMetrics {
    fontToken: string;
    fontSize: string;
    glyphHeight: number;
}
interface SelectionSnapshot {
    text: string;
    anchorText: string | null;
    anchorOffset: number | null;
    focusText: string | null;
    focusOffset: number | null;
}

interface LayoutExpectation {
    body: string;
    version: number;
    selection: SelectionSnapshot;
}

interface PrintFixture {
    name: string;
    body: string;
    pages: number;
    breaks: number;
    first?: string;
    last?: string;
    leading?: boolean;
    trailing?: boolean;
}

const PRINT_FIXTURES: readonly PrintFixture[] = [
    { name: "empty", body: "", pages: 1, breaks: 0 },
    {
        name: "middle",
        body:
            "PRINT_MIDDLE_FIRST_147\n\n<!-- pagebreak -->\n\nPRINT_MIDDLE_LAST_147",
        pages: 2,
        breaks: 1,
        first: "PRINT_MIDDLE_FIRST_147",
        last: "PRINT_MIDDLE_LAST_147",
    },
    {
        name: "leading",
        body: "<!-- pagebreak -->\n\nPRINT_LEADING_BODY_147",
        pages: 2,
        breaks: 1,
        first: "PRINT_LEADING_BODY_147",
        leading: true,
    },
    {
        name: "trailing",
        body: "PRINT_TRAILING_BODY_147\n\n<!-- pagebreak -->",
        pages: 2,
        breaks: 1,
        first: "PRINT_TRAILING_BODY_147",
        last: "PRINT_TRAILING_BODY_147",
        trailing: true,
    },
    {
        name: "consecutive",
        body:
            "PRINT_CONSECUTIVE_FIRST_147\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->\n\nPRINT_CONSECUTIVE_LAST_147",
        pages: 3,
        breaks: 2,
        first: "PRINT_CONSECUTIVE_FIRST_147",
        last: "PRINT_CONSECUTIVE_LAST_147",
    },
];

function physicalPaperDimensions(
    size: PaperSize,
    orientation: Orientation,
): { width: number; height: number } {
    const portrait = size === "a4"
        ? { width: 210 * 96 / 25.4, height: 297 * 96 / 25.4 }
        : { width: 215.9 * 96 / 25.4, height: 279.4 * 96 / 25.4 };
    return orientation === "portrait"
        ? portrait
        : { width: portrait.height, height: portrait.width };
}

async function stableLayout(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await document.fonts.ready;
        // Pagination may schedule another reflow after applying decorations.
        // Two animation frames are not a completion signal for a tall table.
        // Observe convergence, not whether the later containment assertion passes.
        const deadline = performance.now() + 10_000;
        let previous = "";
        let unchanged = 0;
        while (performance.now() < deadline) {
            await new Promise<void>((resolve) =>
                requestAnimationFrame(() => resolve())
            );
            const viewport = document.querySelector<HTMLElement>(
                ".pagination-viewport",
            );
            const rect = viewport?.getBoundingClientRect();
            const signature = JSON.stringify({
                mode: viewport?.dataset.paginationMode,
                pages: viewport?.dataset.pageCount,
                decorations: viewport?.dataset.decorationSignature,
                width: rect?.width,
                height: rect?.height,
                zoom: viewport ? getComputedStyle(viewport).zoom : null,
            });
            const ready = !viewport ||
                viewport.dataset.paginationMode !== "page" ||
                Number(viewport.dataset.pageCount) > 0;
            unchanged = ready && signature === previous ? unchanged + 1 : 0;
            if (unchanged >= 3) return;
            previous = signature;
        }
        throw new Error(`Pagination layout did not converge: ${previous}`);
    });
}

Deno.test("#147: production page layout, editing, paper settings and print flow", async () => {
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
        reducedMotion: "reduce",
        permissions: ["clipboard-read", "clipboard-write"],
    });
    cleanup.defer(() => context.close());
    await context.addInitScript(() => {
        // Keep the real prepared print DOM available for PDF capture in headless Chromium.
        globalThis.print = () => {};
    });
    const page = await context.newPage();
    const issueEvidenceDirectory = Deno.env.get("E2E_EVIDENCE_DIR")
        ? await createEvidenceDirectory("document-vertical-layout")
        : undefined;
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    async function request<T>(
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

    await page.goto(app.origin + "/register");
    await page.locator("#auth-username").fill("vertical_consumer_147");
    await page.locator("#auth-display-name").fill("Vertical consumer");
    await page.locator("#auth-password").fill("Vertical-consumer-147!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(app.origin + "/");
    await request("/api/preferences", "PATCH", { theme: "light" });
    const created = await request<DocumentDto>("/api/documents", "POST", {
        title: "Vertical consumer #147",
        body: "Image fixture will be attached.",
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
        const image = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Could not encode image fixture"));
            }, "image/png");
        });
        const form = new FormData();
        form.append("file", image, "vertical-layout-147.png");
        const response = await fetch(
            `/api/documents/${documentId}/assets`,
            { method: "POST", body: form },
        );
        if (!response.ok) throw new Error(await response.text());
        return (await response.json()).data as { assetId: string };
    }, created.id);
    const initialBody =
        `FIRSTPAGEGLYPH147\n\n<!-- pagebreak -->\n\nSECONDPAGEGLYPH147\n\n![page image](asset://${asset.assetId})\n\n<!-- pagebreak -->\n\nTHIRDPAGEGLYPH147`;
    const doc = await request<DocumentDto>(
        `/api/documents/${created.id}`,
        "PATCH",
        { body: initialBody, version: created.version },
    );

    await page.reload();
    await openNotes(page);
    await page.locator(`[data-document-id="${doc.id}"] h4 button`).click();
    const win = libraryPanel(page);
    const editor = win.locator(".ProseMirror");
    await editor.waitFor();
    const originalEditor = await editor.elementHandle();
    assert(originalEditor);
    const contentPatches: string[] = [];
    page.on("request", (request) => {
        if (
            request.method() === "PATCH" &&
            new URL(request.url()).pathname === `/api/documents/${doc.id}`
        ) {
            contentPatches.push(request.postData() ?? "");
        }
    });
    await win.getByRole("button", { name: "分页", exact: true }).click();
    await page.waitForFunction(() =>
        document.querySelector(".pagination-viewport")
            ?.getAttribute("data-page-count") === "3"
    );
    await stableLayout(page);
    assert(
        await originalEditor.evaluate((node) =>
            node === document.querySelector(".ProseMirror")
        ),
        "switching to page mode retains the original rich editor",
    );
    assertEquals(await win.locator(".ProseMirror").count(), 1);
    const pageModeGeometry = async (targetPage: Page = page) =>
        await targetPage.evaluate(() => {
            const scroll = document.querySelector<HTMLElement>(
                ".document-editor-scroll-area",
            );
            const viewport = document.querySelector<HTMLElement>(
                ".pagination-viewport",
            );
            if (!scroll || !viewport) {
                throw new Error("The document scroll area is unavailable");
            }
            const computedScale = Number.parseFloat(
                getComputedStyle(viewport).getPropertyValue("zoom"),
            );
            return {
                scale: Number.isFinite(computedScale) && computedScale > 0
                    ? computedScale
                    : 1,
                pageCount: Number(viewport.dataset.pageCount ?? "0"),
                sheets: Array.from(
                    document.querySelectorAll(".pagination-sheet"),
                ).map((sheet) => {
                    const { x, y, width, height } = sheet
                        .getBoundingClientRect();
                    return { x, y, width, height };
                }),
                scrollHeight: scroll.scrollHeight,
                clientHeight: scroll.clientHeight,
                scrollTop: scroll.scrollTop,
                innerOverflowY: getComputedStyle(viewport).overflowY,
                innerScrollHeight: viewport.scrollHeight,
                innerClientHeight: viewport.clientHeight,
                documentWidth: document.documentElement.scrollWidth,
                viewportWidth: innerWidth,
            };
        });
    const currentTypographyMetrics = async (
        targetPage: Page = page,
    ): Promise<TypographyMetrics> =>
        await targetPage.evaluate(() => {
            const editor = document.querySelector<HTMLElement>(".ProseMirror");
            if (!editor) throw new Error("The rich editor is unavailable");
            const walker = document.createTreeWalker(
                editor,
                NodeFilter.SHOW_TEXT,
            );
            let glyphRange: Range | null = null;
            while (walker.nextNode()) {
                const node = walker.currentNode as Text;
                const offset = node.data.indexOf("FIRSTPAGEGLYPH147");
                if (offset < 0) continue;
                glyphRange = document.createRange();
                glyphRange.setStart(node, offset);
                glyphRange.setEnd(
                    node,
                    offset + "FIRSTPAGEGLYPH147".length,
                );
                break;
            }
            if (!glyphRange) {
                throw new Error("The first-page glyph is unavailable");
            }
            return {
                fontToken: getComputedStyle(document.documentElement)
                    .getPropertyValue("--font-body-size").trim(),
                fontSize: getComputedStyle(editor).fontSize,
                glyphHeight: glyphRange.getBoundingClientRect().height,
            };
        });
    const initialGeometry = await pageModeGeometry();
    assertEquals(initialGeometry.pageCount, 3);
    assert(
        initialGeometry.scale > 0 && initialGeometry.scale <= 1,
        "the initial paper scale is positive and does not enlarge pages",
    );
    const initialTypography = await currentTypographyMetrics();
    assert(initialTypography.fontToken.length > 0);
    assertEquals(
        initialTypography.fontSize,
        initialTypography.fontToken,
        "the editor uses the configured body-size token",
    );
    assertEquals(initialGeometry.sheets.length, 3);
    for (let index = 1; index < initialGeometry.sheets.length; index++) {
        assertEquals(
            initialGeometry.sheets[index].x,
            initialGeometry.sheets[0].x,
            "all paper stays on one horizontal axis",
        );
        assert(
            initialGeometry.sheets[index].y >=
                initialGeometry.sheets[index - 1].y +
                    initialGeometry.sheets[index - 1].height,
            "each following sheet is below the preceding sheet",
        );
    }
    assert(
        initialGeometry.scrollHeight > initialGeometry.clientHeight,
        "the document scroll area provides vertical page access",
    );
    assert(
        initialGeometry.documentWidth <= initialGeometry.viewportWidth + 1,
        "the document does not overflow horizontally",
    );
    assert(
        !["scroll", "auto"].includes(initialGeometry.innerOverflowY) ||
            initialGeometry.innerScrollHeight <=
                initialGeometry.innerClientHeight + 1,
        "the pagination viewport does not add a competing vertical scroll",
    );

    await win.locator(".document-editor-scroll-area").evaluate((element) => {
        (element as HTMLElement).scrollTop = 0;
    });
    const scrollArea = win.locator(".document-editor-scroll-area");
    const scrollBox = await scrollArea.boundingBox();
    assert(scrollBox);
    await page.mouse.move(
        scrollBox.x + scrollBox.width / 2,
        scrollBox.y + scrollBox.height / 2,
    );
    const pagePitch = await page.evaluate(() => {
        const sheets = document.querySelectorAll(".pagination-sheet");
        return sheets[1].getBoundingClientRect().top -
            sheets[0].getBoundingClientRect().top;
    });
    await page.mouse.wheel(0, pagePitch);
    await page.waitForFunction(() => {
        const area = document.querySelector(".document-editor-scroll-area")!
            .getBoundingClientRect();
        const paragraph = [...document.querySelectorAll(".ProseMirror p")].find(
            (node) => node.textContent?.includes("SECONDPAGEGLYPH147"),
        )!.getBoundingClientRect();
        return paragraph.bottom > area.top && paragraph.top < area.bottom;
    }).catch(async (error: unknown) => {
        console.error(
            "Wheel geometry",
            await page.evaluate(() => {
                const area = document.querySelector<HTMLElement>(
                    ".document-editor-scroll-area",
                )!;
                const box = area.getBoundingClientRect();
                return {
                    area: box.toJSON(),
                    scrollTop: area.scrollTop,
                    scrollHeight: area.scrollHeight,
                    paragraphs: [...document.querySelectorAll(".ProseMirror p")]
                        .map((node) => ({
                            text: node.textContent,
                            rect: node.getBoundingClientRect().toJSON(),
                        })),
                    target: document.elementFromPoint(
                        box.x + box.width / 2,
                        box.y + box.height / 2,
                    )?.outerHTML.slice(0, 300),
                };
            }),
        );
        throw error;
    });
    await stableLayout(page);
    const secondPageBox = await win.locator(".ProseMirror p").filter({
        hasText: "SECONDPAGEGLYPH147",
    }).boundingBox();
    assert(secondPageBox);
    assert(
        secondPageBox.y + secondPageBox.height > scrollBox.y &&
            secondPageBox.y < scrollBox.y + scrollBox.height,
        "real wheel input reaches the second page",
    );
    await page.mouse.wheel(0, pagePitch);
    await page.waitForFunction(() => {
        const area = document.querySelector(".document-editor-scroll-area")!
            .getBoundingClientRect();
        const paragraph = [...document.querySelectorAll(".ProseMirror p")].find(
            (node) => node.textContent?.includes("THIRDPAGEGLYPH147"),
        )!.getBoundingClientRect();
        return paragraph.bottom > area.top && paragraph.top < area.bottom;
    });
    await stableLayout(page);
    const thirdPageBox = await win.locator(".ProseMirror p").filter({
        hasText: "THIRDPAGEGLYPH147",
    }).boundingBox();
    assert(thirdPageBox);
    assert(
        thirdPageBox.y + thirdPageBox.height > scrollBox.y &&
            thirdPageBox.y < scrollBox.y + scrollBox.height,
        "a second real wheel reaches the third page",
    );

    async function captureGlyphGeometry(
        markers: string[],
        image = false,
        wholeTextFor?: string,
        targetPage: Page = page,
    ): Promise<GlyphGeometry> {
        return await targetPage.evaluate(({ markers, image, wholeTextFor }) => {
            const editor = document.querySelector<HTMLElement>(".ProseMirror");
            if (!editor) throw new Error("The rich editor is unavailable");
            const sheets = Array.from(
                document.querySelectorAll(".pagination-sheet"),
            ).map((sheet) => {
                const { x, y, width, height } = sheet.getBoundingClientRect();
                return {
                    x,
                    y,
                    right: x + width,
                    bottom: y + height,
                    width,
                    height,
                };
            });
            const textRects = Object.fromEntries(markers.map((marker) => {
                const walker = document.createTreeWalker(
                    editor,
                    NodeFilter.SHOW_TEXT,
                );
                let found: Text | null = null;
                let offset = -1;
                while (walker.nextNode()) {
                    const node = walker.currentNode as Text;
                    offset = node.data.indexOf(marker);
                    if (offset >= 0) {
                        found = node;
                        break;
                    }
                }
                if (!found) return [marker, []];
                const range = document.createRange();
                if (marker === wholeTextFor) {
                    range.setStart(found, 0);
                    range.setEnd(found, found.length);
                } else {
                    range.setStart(found, offset);
                    range.setEnd(found, offset + marker.length);
                }
                return [
                    marker,
                    Array.from(range.getClientRects()).map((rect) => ({
                        x: rect.x,
                        y: rect.y,
                        right: rect.right,
                        bottom: rect.bottom,
                    })),
                ];
            }));
            const renderedImage = image
                ? editor.querySelector<HTMLImageElement>("img[src]")
                : null;
            const imageRect = renderedImage
                ? (() => {
                    const rect = renderedImage.getBoundingClientRect();
                    return {
                        x: rect.x,
                        y: rect.y,
                        right: rect.right,
                        bottom: rect.bottom,
                    };
                })()
                : null;
            const viewport = document.querySelector<HTMLElement>(
                ".pagination-viewport",
            );
            if (!viewport) throw new Error("The paper viewport is unavailable");
            const computedScale = Number.parseFloat(
                getComputedStyle(viewport).getPropertyValue("zoom"),
            );
            return {
                sheets,
                textRects,
                imageRect,
                scale: Number.isFinite(computedScale) && computedScale > 0
                    ? computedScale
                    : 1,
            };
        }, { markers, image, wholeTextFor });
    }
    function assertInsidePaper(geometry: GlyphGeometry, marginMm = 20) {
        const margin = marginMm * 96 / 25.4 * geometry.scale;
        for (const [marker, rects] of Object.entries(geometry.textRects)) {
            assert(rects.length > 0, `rendered text exists for ${marker}`);
            for (const rect of rects) {
                assert(
                    geometry.sheets.some((sheet) =>
                        rect.x >= sheet.x + margin - 2 &&
                        rect.right <= sheet.right - margin + 2 &&
                        rect.y >= sheet.y + margin - 2 &&
                        rect.bottom <= sheet.bottom - margin + 2
                    ),
                    `glyphs for ${marker} stay within a paper's content area: ${
                        JSON.stringify({
                            rect,
                            sheets: geometry.sheets,
                            scale: geometry.scale,
                        })
                    }`,
                );
            }
        }
        if (geometry.imageRect) {
            assert(
                geometry.sheets.some((sheet) =>
                    geometry.imageRect!.x >= sheet.x + margin - 2 &&
                    geometry.imageRect!.right <= sheet.right - margin + 2 &&
                    geometry.imageRect!.y >= sheet.y + margin - 2 &&
                    geometry.imageRect!.bottom <= sheet.bottom - margin + 2
                ),
                "the real image stays within a paper's content area",
            );
        }
    }
    await win.locator(".ProseMirror img[src]").evaluate(async (image) => {
        await (image as HTMLImageElement).decode();
    });
    assertInsidePaper(
        await captureGlyphGeometry(
            [
                "FIRSTPAGEGLYPH147",
                "SECONDPAGEGLYPH147",
                "THIRDPAGEGLYPH147",
            ],
            true,
        ),
    );
    if (issueEvidenceDirectory) {
        await page.screenshot({
            path: `${issueEvidenceDirectory}/three-pages.png`,
            fullPage: true,
        });
    }

    const secondParagraph = win.locator(".ProseMirror p").filter({
        hasText: "SECONDPAGEGLYPH147",
    });
    await secondParagraph.click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowRight");
    await stableLayout(page);
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
    const selectionBeforeGap = await selectionSnapshot();
    assert(selectionBeforeGap.text.length > 0);
    await scrollArea.evaluate((element) => {
        const scroll = element as HTMLElement;
        const sheets = Array.from(
            scroll.querySelectorAll(".pagination-sheet"),
        ).map((sheet) => sheet.getBoundingClientRect());
        if (sheets.length < 3) {
            throw new Error("Three paper sheets are required");
        }
        const gap = (sheets[1].bottom + sheets[2].top) / 2;
        const bounds = scroll.getBoundingClientRect();
        scroll.scrollTop += gap - (bounds.top + bounds.height / 2);
    });
    await stableLayout(page);
    const gap = await page.evaluate(() => {
        const scroll = document.querySelector<HTMLElement>(
            ".document-editor-scroll-area",
        );
        if (!scroll) return null;
        const bounds = scroll.getBoundingClientRect();
        const sheets = Array.from(
            scroll.querySelectorAll(".pagination-sheet"),
        ).map((sheet) => sheet.getBoundingClientRect());
        for (let index = 1; index < sheets.length; index++) {
            const y = (sheets[index - 1].bottom + sheets[index].top) / 2;
            if (y > bounds.top && y < bounds.bottom) {
                return {
                    x: (sheets[index - 1].left + sheets[index - 1].right) / 2,
                    y,
                };
            }
        }
        return null;
    });
    assert(gap, "a real paper gap is positioned within the scroll view");
    await page.mouse.click(gap.x, gap.y);
    await stableLayout(page);
    assertEquals(
        await selectionSnapshot(),
        selectionBeforeGap,
        "clicking the gap does not move the editor selection",
    );

    assertEquals(
        contentPatches,
        [],
        "initial page layout, scrolling and gap interaction do not PATCH content",
    );
    const firstParagraph = win.locator(".ProseMirror p").filter({
        hasText: "FIRSTPAGEGLYPH147",
    });
    await firstParagraph.click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" LAYOUTHISTORY147");
    await waitForDocument(
        page,
        doc.id,
        (document) => document.body.includes("LAYOUTHISTORY147"),
    );
    await page.keyboard.press("Shift+ArrowLeft");
    await stableLayout(page);
    const layoutSelection = await selectionSnapshot();
    assert(layoutSelection.text.length > 0);
    const settingsBaseline = await request<DocumentDto>(
        `/api/documents/${doc.id}`,
    );
    const selectionBeforeSettings = layoutSelection;
    const contentPatchCountBeforeSettings = contentPatches.length;
    async function setPaper(
        size: PaperSize,
        orientation: Orientation,
        expected: LayoutExpectation = {
            body: settingsBaseline.body,
            version: settingsBaseline.version,
            selection: selectionBeforeSettings,
        },
    ) {
        await win.getByRole("button", {
            name: "更多笔记操作",
            exact: true,
        }).click();
        await page.getByRole("menuitem", {
            name: "纸张设置",
            exact: true,
        }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("纸张规格", { exact: true }).selectOption(size);
        await dialog.getByLabel("版面方向", { exact: true })
            .selectOption(orientation);
        await dialog.getByRole("button", { name: "保存设置", exact: true })
            .click();
        await dialog.waitFor({ state: "hidden" });
        await stableLayout(page);
        assert(originalEditor);
        assert(
            await originalEditor.evaluate((node) =>
                node === document.querySelector(".ProseMirror")
            ),
            "paper changes keep the same rich editor mounted",
        );
        assertEquals(await win.locator(".ProseMirror").count(), 1);
        assertEquals(await win.locator(".pagination-sheet").count(), 3);
        const expectedDimensions = physicalPaperDimensions(size, orientation);
        const actual = await win.locator(".pagination-sheet").first()
            .evaluate((sheet) => {
                const { width, height } = sheet.getBoundingClientRect();
                return { width, height };
            });
        const scale = (await pageModeGeometry()).scale;
        assert(
            Math.abs(actual.width - expectedDimensions.width * scale) < 2 &&
                Math.abs(actual.height - expectedDimensions.height * scale) < 2,
            `${size} ${orientation} displays its physical paper dimensions`,
        );
        await editor.focus();
        assertEquals(
            await selectionSnapshot(),
            expected.selection,
            "paper settings preserve the editor selection",
        );
        const persisted = await request<DocumentDto>(
            `/api/documents/${doc.id}`,
        );
        assertEquals(persisted.body, expected.body);
        assertEquals(persisted.version, expected.version);
        await win.locator('.document-save-status[data-status="saved"]')
            .waitFor({ state: "attached" });
    }

    let matrixPage = await context.newPage();
    async function openMatrixDocument(
        viewport: { width: number; height: number },
    ) {
        if (matrixPage.context() !== context) {
            await matrixPage.context().close();
        } else await matrixPage.close();
        const isolatedContext = await browser.newContext({
            viewport,
            reducedMotion: "reduce",
            storageState: { cookies: await context.cookies(), origins: [] },
        });
        cleanup.defer(() => isolatedContext.close());
        matrixPage = await isolatedContext.newPage();
        await matrixPage.goto(app.origin + "/");
        await openNotes(matrixPage);
        await matrixPage.locator(`[data-document-id="${doc.id}"] h4 button`)
            .click();
        await matrixPage.locator(".ProseMirror").waitFor();
        await matrixPage.getByRole("button", { name: "分页", exact: true })
            .click();
        await stableLayout(matrixPage);
        await matrixPage.waitForFunction(() =>
            Number(
                document.querySelector(".pagination-viewport")?.getAttribute(
                    "data-page-count",
                ),
            ) > 0
        );
    }
    const responsiveViewports = [
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1024, height: 768 },
        { width: 1440, height: 900 },
    ] as const;
    for (
        const [size, orientation] of [
            ["a4", "portrait"],
            ["a4", "landscape"],
            ["letter", "portrait"],
            ["letter", "landscape"],
        ] as const
    ) {
        await setPaper(size, orientation);
        const expectedDimensions = physicalPaperDimensions(size, orientation);
        for (const viewport of responsiveViewports) {
            await openMatrixDocument(viewport);
            const responsiveGeometry = await pageModeGeometry(matrixPage);
            const label = `${viewport.width}px ${size} ${orientation}`;
            assert(
                responsiveGeometry.documentWidth <=
                    responsiveGeometry.viewportWidth + 1,
                `${label} keeps document width in the viewport`,
            );
            assertEquals(
                responsiveGeometry.pageCount,
                3,
                `${label} keeps three pages`,
            );
            assertEquals(
                responsiveGeometry.sheets.length,
                3,
                `${label} keeps three sheets`,
            );
            assert(
                responsiveGeometry.scale > 0 && responsiveGeometry.scale <= 1,
                `${label} uses a positive scale no greater than one`,
            );
            for (const sheet of responsiveGeometry.sheets) {
                assert(
                    Math.abs(
                                sheet.width -
                                    expectedDimensions.width *
                                        responsiveGeometry.scale,
                            ) < 2 &&
                        Math.abs(
                                sheet.height -
                                    expectedDimensions.height *
                                        responsiveGeometry.scale,
                            ) < 2,
                    `${label} preserves physical sheet dimensions at its scale`,
                );
            }
            for (
                let index = 1;
                index < responsiveGeometry.sheets.length;
                index++
            ) {
                assert(
                    Math.abs(
                                responsiveGeometry.sheets[index].x -
                                    responsiveGeometry.sheets[0].x,
                            ) < 1 &&
                        responsiveGeometry.sheets[index].y >=
                            responsiveGeometry.sheets[index - 1].y +
                                responsiveGeometry.sheets[index - 1].height,
                    `${label} keeps all papers on one vertical axis`,
                );
            }
            assertInsidePaper(
                await captureGlyphGeometry(
                    [
                        "FIRSTPAGEGLYPH147",
                        "SECONDPAGEGLYPH147",
                        "THIRDPAGEGLYPH147",
                    ],
                    true,
                    undefined,
                    matrixPage,
                ),
            );
            const typography = await currentTypographyMetrics(matrixPage);
            assertEquals(typography.fontToken, initialTypography.fontToken);
            assertEquals(typography.fontSize, initialTypography.fontSize);
            const expectedGlyphHeight = initialTypography.glyphHeight *
                responsiveGeometry.scale / initialGeometry.scale;
            assert(
                Math.abs(typography.glyphHeight - expectedGlyphHeight) <= 1.25,
                `${label} changes glyph geometry only by page zoom`,
            );
            assertEquals(
                await matrixPage.locator(".ProseMirror").count(),
                1,
                `${label} uses one rich editor in its actual responsive Host`,
            );
        }
    }
    await matrixPage.context().close();
    await page.bringToFront();
    assertEquals(
        contentPatches.length,
        contentPatchCountBeforeSettings,
        "paper changes and responsive reflow do not PATCH document content",
    );
    const unchanged = await waitForDocument(
        page,
        doc.id,
        (document) =>
            document.body === settingsBaseline.body &&
            document.version === settingsBaseline.version,
    );
    assert(unchanged.body.includes("LAYOUTHISTORY147"));
    await win.getByRole("button", { name: "撤销", exact: true }).click();
    await waitForDocument(
        page,
        doc.id,
        (document) => !document.body.includes("LAYOUTHISTORY147"),
    );
    await win.getByRole("button", { name: "重做", exact: true }).click();
    await waitForDocument(
        page,
        doc.id,
        (document) => document.body.includes("LAYOUTHISTORY147"),
    );
    assert(
        await originalEditor.evaluate((node) =>
            node === document.querySelector(".ProseMirror")
        ),
        "history remains usable after every paper size and orientation",
    );
    assertEquals(await win.locator(".ProseMirror").count(), 1);
    async function livePageBreakCount(): Promise<number> {
        return await editor.locator("[data-pagebreak]").count();
    }
    const waitForBreakCount = async (expected: number) =>
        await waitForDocument(
            page,
            doc.id,
            (document) =>
                (document.body.match(/<!-- pagebreak -->/g)?.length ?? 0) ===
                    expected,
        );
    await firstParagraph.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Delete");
    if (await livePageBreakCount() === 2) {
        await page.keyboard.press("Delete");
    }
    await waitForBreakCount(1);
    await page.keyboard.press("Control+z");
    await waitForBreakCount(2);
    await page.keyboard.press("Control+y");
    await waitForBreakCount(1);
    await page.keyboard.press("Control+z");
    await waitForBreakCount(2);

    await secondParagraph.click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Backspace");
    if (await livePageBreakCount() === 2) {
        await page.keyboard.press("Backspace");
    }
    await waitForBreakCount(1);
    await page.keyboard.press("Control+z");
    await waitForBreakCount(2);
    await page.keyboard.press("Control+y");
    await waitForBreakCount(1);
    await page.keyboard.press("Control+z");
    await waitForBreakCount(2);
    await firstParagraph.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("ENTERBLOCK147");
    await waitForDocument(
        page,
        doc.id,
        (document) => document.body.includes("ENTERBLOCK147"),
    );
    await page.keyboard.press("Control+z");
    await waitForDocument(
        page,
        doc.id,
        (document) => !document.body.includes("ENTERBLOCK147"),
    );
    await page.keyboard.press("Control+y");
    await waitForDocument(
        page,
        doc.id,
        (document) => document.body.includes("ENTERBLOCK147"),
    );

    await win.locator(".document-editor-scroll-area").evaluate((element) => {
        (element as HTMLElement).scrollTop = 0;
    });
    await stableLayout(page);
    const startRange = await firstParagraph.evaluate((paragraph) => {
        const walker = document.createTreeWalker(
            paragraph,
            NodeFilter.SHOW_TEXT,
        );
        while (walker.nextNode()) {
            const node = walker.currentNode as Text;
            const offset = node.data.indexOf("FIRSTPAGEGLYPH147");
            if (offset < 0) continue;
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset + "FIRSTPAGEGLYPH147".length);
            const rect = range.getBoundingClientRect();
            return { x: rect.x, y: rect.y, height: rect.height };
        }
        return null;
    });
    assert(startRange, "the first page text has a real glyph range");
    await page.mouse.move(
        startRange.x + 2,
        startRange.y + startRange.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
        startRange.x + 30,
        startRange.y + startRange.height / 2,
        { steps: 3 },
    );
    await stableLayout(page);
    const dragDistance = await win.locator(".ProseMirror p").filter({
        hasText: "THIRDPAGEGLYPH147",
    }).evaluate(
        (paragraph, firstTop) =>
            paragraph.getBoundingClientRect().top - firstTop,
        startRange.y,
    );
    await page.mouse.wheel(0, dragDistance);
    await page.waitForFunction(() => {
        const area = document.querySelector(".document-editor-scroll-area")!
            .getBoundingClientRect();
        const third = [...document.querySelectorAll(".ProseMirror p")].find((
            node,
        ) => node.textContent?.includes("THIRDPAGEGLYPH147"))!
            .getBoundingClientRect();
        return third.top >= area.top && third.bottom <= area.bottom;
    });
    await stableLayout(page);
    const endRange = await win.locator(".ProseMirror p").filter({
        hasText: "THIRDPAGEGLYPH147",
    }).evaluate((paragraph) => {
        const walker = document.createTreeWalker(
            paragraph,
            NodeFilter.SHOW_TEXT,
        );
        while (walker.nextNode()) {
            const node = walker.currentNode as Text;
            const offset = node.data.indexOf("THIRDPAGEGLYPH147");
            if (offset < 0) continue;
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset + "THIRDPAGEGLYPH147".length);
            const rect = range.getBoundingClientRect();
            return { x: rect.right - 2, y: rect.y + rect.height / 2 };
        }
        return null;
    });
    assert(endRange, "the third page text has a real glyph range");
    await page.mouse.move(endRange.x, endRange.y, { steps: 8 });
    await page.mouse.up();
    await stableLayout(page);
    const draggedText = await page.evaluate(() =>
        globalThis.getSelection()?.toString() ?? ""
    );
    assert(draggedText.includes("FIRST"), "drag selection starts on page one");
    assert(
        draggedText.includes("SECONDPAGEGLYPH147"),
        "drag selection traverses page two",
    );
    assert(
        draggedText.includes("THIRDPAGEGLYPH147"),
        "drag selection reaches page three",
    );
    await page.keyboard.press("Control+c");
    const copiedText = await page.evaluate(() =>
        navigator.clipboard.readText()
    );
    assert(copiedText.includes("FIRST"));
    assert(copiedText.includes("SECONDPAGEGLYPH147"));
    assert(copiedText.includes("THIRDPAGEGLYPH147"));
    await editor.focus();
    await page.keyboard.press("Control+End");
    await stableLayout(page);
    assert(
        await page.evaluate(() => globalThis.getSelection()?.isCollapsed),
        "paste starts at a collapsed document-end caret",
    );
    await page.keyboard.press("Control+v");
    await waitForDocument(
        page,
        doc.id,
        (document) =>
            (document.body.match(/THIRDPAGEGLYPH147/g)?.length ?? 0) > 1,
    );
    await page.keyboard.press("Control+z");
    await waitForDocument(
        page,
        doc.id,
        (document) =>
            (document.body.match(/THIRDPAGEGLYPH147/g)?.length ?? 0) === 1,
    );

    const repeatedTallCell =
        "Tall cell keeps its canonical editable text across physical pages. ";
    const tallRowBody =
        "# One tall editable row\n\n| Short | Tall |\n| --- | --- |\n| Short cell | " +
        repeatedTallCell.repeat(160) +
        " |\n| NEXT_ROW_147 | Text after the tall row |\n\nEND_DOCUMENT_147";
    await win.getByRole("button", { name: "Markdown 源码", exact: true })
        .click();
    const source = win.getByRole("textbox", {
        name: "Markdown 源码正文",
        exact: true,
    });
    await source.waitFor();
    await source.fill(tallRowBody);
    await win.getByRole("button", { name: "分页", exact: true }).click();
    await page.waitForFunction(() =>
        !!document.querySelector(
            '[data-pagination-mode="page"][data-page-count]',
        )
    );
    await waitForDocument(
        page,
        doc.id,
        (document) => document.body === tallRowBody,
    );
    await stableLayout(page);
    assertEquals(await win.locator(".ProseMirror table tr").count(), 3);
    const tallCell = win.locator(".ProseMirror td").filter({
        hasText:
            "Tall cell keeps its canonical editable text across physical pages.",
    });
    const renderedTallText = await tallCell.textContent() ?? "";
    assertEquals(
        renderedTallText.split(
            "Tall cell keeps its canonical editable text across physical pages.",
        ).length - 1,
        160,
        "the entire oversized cell remains rendered",
    );
    assert(
        (await win.locator(".ProseMirror").textContent())?.includes(
            "NEXT_ROW_147",
        ),
        "content in the row after the oversized cell remains rendered",
    );
    assert(
        (await win.locator(".ProseMirror").textContent())?.includes(
            "Text after the tall row",
        ),
        "the complete next row remains rendered",
    );
    assert(
        (await win.locator(".ProseMirror").textContent())?.includes(
            "END_DOCUMENT_147",
        ),
        "content after the table remains rendered",
    );
    const tallPageCount = Number(
        await win.locator(".pagination-viewport").getAttribute(
            "data-page-count",
        ),
    );
    assert(tallPageCount > 1, "the tall row flows through multiple papers");
    const tallGeometry = await captureGlyphGeometry(
        [
            repeatedTallCell,
            "NEXT_ROW_147",
            "END_DOCUMENT_147",
        ],
        false,
        repeatedTallCell,
    );
    assertInsidePaper(tallGeometry);
    const tallCellLineCount = tallGeometry.textRects[repeatedTallCell].length;
    assert(
        tallCellLineCount > 20,
        "the tall-cell range spans many real rendered line boxes",
    );
    await openMatrixDocument({ width: 390, height: 844 });
    const tallMobileGeometry = await pageModeGeometry(matrixPage);
    assert(
        tallMobileGeometry.documentWidth <=
            tallMobileGeometry.viewportWidth + 1,
        "the tall row does not create document-level horizontal overflow",
    );
    assertInsidePaper(
        await captureGlyphGeometry(
            [
                repeatedTallCell,
                "NEXT_ROW_147",
                "END_DOCUMENT_147",
            ],
            false,
            repeatedTallCell,
            matrixPage,
        ),
    );
    if (issueEvidenceDirectory) {
        await page.screenshot({
            path: `${issueEvidenceDirectory}/oversized-row.png`,
            fullPage: true,
        });
    }

    async function sourceFixture(markdown: string, expectedPages: number) {
        await win.getByRole("button", { name: "Markdown 源码", exact: true })
            .click();
        const markdownBody = win.getByRole("textbox", {
            name: "Markdown 源码正文",
            exact: true,
        });
        await markdownBody.waitFor();
        await markdownBody.fill(markdown);
        await win.getByRole("button", { name: "分页", exact: true }).click();
        await page.waitForFunction((pages) => {
            const viewport = document.querySelector<HTMLElement>(
                ".pagination-viewport",
            );
            return viewport?.dataset.mode === "page" &&
                viewport.dataset.pageCount === String(pages);
        }, expectedPages);
        const saved = await waitForDocument(
            page,
            doc.id,
            (document) =>
                markdown.length === 0
                    ? document.body.trim().length === 0
                    : document.body === markdown,
        );
        assertEquals(saved.body, markdown);
        await stableLayout(page);
    }
    for (const fixture of PRINT_FIXTURES) {
        await sourceFixture(fixture.body, fixture.pages);
        assertEquals(await win.locator(".ProseMirror").count(), 1);
        assertEquals(
            await win.locator(".ProseMirror [data-pagebreak]").count(),
            fixture.breaks,
            `${fixture.name} retains its canonical editor breaks`,
        );
        await win.getByRole("button", {
            name: "更多笔记操作",
            exact: true,
        }).click();
        await page.getByRole("menuitem", {
            name: "打印或另存为 PDF",
            exact: true,
        }).click();
        const printRoot = page.locator(
            ".document-print-root[data-print-active]",
        );
        await printRoot.waitFor({ state: "attached" });
        const printLayout = await page.evaluate((fixture) => {
            const root = document.querySelector<HTMLElement>(
                ".document-print-root[data-print-active]",
            );
            const body = root?.querySelector<HTMLElement>(
                ".document-print-body",
            );
            const header = root?.querySelector<HTMLElement>(
                ".document-print-header",
            );
            if (!root || !body || !header) {
                throw new Error("The prepared print document is unavailable");
            }
            const breaks = Array.from(
                root.querySelectorAll<HTMLElement>(
                    ".document-print-pagebreak",
                ),
            );
            const textElement = (container: HTMLElement, marker: string) => {
                const elements = container.querySelectorAll<HTMLElement>("*");
                for (const element of elements) {
                    if (
                        element.children.length === 0 &&
                        element.textContent?.includes(marker)
                    ) {
                        return element;
                    }
                }
                return null;
            };
            const first = fixture.first
                ? textElement(body, fixture.first)
                : null;
            const last = fixture.last ? textElement(body, fixture.last) : null;
            const before = (left: Element | null, right: Element) =>
                !!left &&
                !!(left.compareDocumentPosition(right) &
                    Node.DOCUMENT_POSITION_FOLLOWING);
            return {
                gapCount: root.querySelectorAll(".pagination-gap").length,
                breakCount: breaks.length,
                firstBeforeAllBreaks: fixture.leading || !first
                    ? true
                    : breaks.every((node) => before(first, node)),
                allBreaksBeforeLast: fixture.trailing || !last
                    ? true
                    : breaks.every((node) => before(node, last)),
                leadingBreakBeforeTitle: fixture.leading
                    ? root.firstElementChild === breaks[0] &&
                        before(breaks[0] ?? null, header)
                    : true,
                trailingBreakAfterContent: fixture.trailing
                    ? before(last, breaks[breaks.length - 1] ?? header)
                    : true,
            };
        }, fixture);
        assertEquals(printLayout.gapCount, 0, "print clones omit page gaps");
        assertEquals(printLayout.breakCount, fixture.breaks);
        assert(
            printLayout.firstBeforeAllBreaks,
            `${fixture.name} keeps breaks after its first canonical content`,
        );
        assert(
            printLayout.allBreaksBeforeLast,
            `${fixture.name} keeps breaks before its last canonical content`,
        );
        assert(
            printLayout.leadingBreakBeforeTitle,
            "a leading canonical break remains before the print title",
        );
        assert(
            printLayout.trailingBreakAfterContent,
            "a trailing canonical break remains after document content",
        );
        const pdf = await page.pdf({
            preferCSSPageSize: true,
            printBackground: true,
        });
        assert(pdf.byteLength > 0, `${fixture.name} produces a nonempty PDF`);
        if (issueEvidenceDirectory) {
            await Deno.writeFile(
                `${issueEvidenceDirectory}/${fixture.name}.pdf`,
                pdf,
            );
        }
        await page.evaluate(() =>
            globalThis.dispatchEvent(new Event("afterprint"))
        );
        await printRoot.waitFor({ state: "detached" });
        assertEquals(
            await page.locator("style[data-document-print-settings]").count(),
            0,
            "print settings are cleaned up after each generated PDF",
        );
    }
    if (issueEvidenceDirectory) {
        await page.screenshot({
            path: `${issueEvidenceDirectory}/print-fixtures.png`,
            fullPage: true,
        });
    }
    assertEquals(pageErrors, [], "the production consumer page has no errors");
});
