import { chromium } from "playwright";
import { assert, assertEquals } from "@std/assert";
import horizontalBaseline from "./issue147-horizontal-baseline.json" with {
    type: "json",
};

import {
    AUTOMATIC_FIXTURE,
    createPerformanceFixture,
    FLOAT_FAILURE_FIXTURES,
    SHORT_PAGEBREAK_FIXTURES,
    THREE_PAGE_FIXTURE,
} from "./issue147-fixtures.ts";
import { DEFAULT_PAPER_SETTINGS } from "../../features/documents/paper.ts";
import type { PreparedDocumentPrint } from "../../features/documents/document-print.ts";
import type { DecorationFlowRepro } from "./decoration-flow-repro.ts";
import type { FlowIntegrity } from "./flow-integrity.ts";

const origin = Deno.args[0] ?? "http://127.0.0.1:5173";
const evidenceDirectory = Deno.args[1] ?? ".artifacts/issue-147/pagination/m3b";
const candidate = Deno.args[2] ?? "decorations";
const candidateFile = candidate === "decorations"
    ? "decoration-flow-repro"
    : "vertical-repro";
const evidencePrefix = candidate === "decorations"
    ? "decoration-flow"
    : "vertical";
const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const paper = { ...DEFAULT_PAPER_SETTINGS };
const report: Record<string, unknown> = {
    environment: {},
    horizontalBaseline: {},
    threePage: {},
    shortPagebreaks: {},
    automatic: {},
    specialContent: {},
    orientations: {},
    mobile: {},
    editing: {},
    performance: {},
    errors: [],
};

await Deno.mkdir(evidenceDirectory, { recursive: true });
const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
});
const errors: string[] = [];
try {
    const settle = async () => {
        await page.evaluate(() =>
            new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve())
                )
            )
        );
    };
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1.25,
        userAgent: ua,
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(
        `${origin}/src/spikes/editable-pagination/m3b.html`,
        { waitUntil: "networkidle" },
    );
    await page.evaluate(() => document.fonts.ready);

    const environment = await page.evaluate((browserVersion) => ({
        userAgent: navigator.userAgent,
        devicePixelRatio: globalThis.devicePixelRatio,
        viewport: {
            width: globalThis.innerWidth,
            height: globalThis.innerHeight,
        },
        browserVersion,
        platform: navigator.platform,
    }), browser.version());
    report.environment = environment;
    // The denominator is immutable: after M4 the current owner is no longer horizontal.
    assertEquals(
        environment,
        horizontalBaseline.environment,
        "Reflow comparisons require the recorded Chromium/viewport/DPR environment",
    );
    report.horizontalBaseline = horizontalBaseline.horizontalBaseline;
    report.baselineSourceCommit = horizontalBaseline.sourceCommit;

    const moduleUrl =
        `${origin}/src/spikes/editable-pagination/${candidateFile}.ts`;
    const mount = async (markdown: string, settings = paper) =>
        await page.evaluate(
            async ({ markdown, settings, moduleUrl, candidate }) => {
                const global = globalThis as typeof globalThis & {
                    __issue147Repro?: DecorationFlowRepro;
                };
                await global.__issue147Repro?.destroy();
                // The live Milkdown view must load through Vite in Chromium, not Deno's server-side DOM.
                if (candidate === "decorations") {
                    const { mountDecorationFlowRepro } = await import(
                        /* @vite-ignore */ moduleUrl
                    );
                    global.__issue147Repro = await mountDecorationFlowRepro(
                        markdown,
                        settings,
                    );
                } else {
                    const { mountVerticalWritingModeRepro } = await import(
                        /* @vite-ignore */ moduleUrl
                    );
                    global.__issue147Repro =
                        await mountVerticalWritingModeRepro(
                            markdown,
                            settings,
                        );
                }
                if (!global.__issue147Repro) {
                    throw new Error("Fixture mount did not return an editor");
                }
                return global.__issue147Repro.reflow();
            },
            { markdown, settings, moduleUrl, candidate },
        );
    const integrity = async (settings = paper): Promise<FlowIntegrity> => {
        const deadline = globalThis.performance.now() + 5000;
        let result: FlowIntegrity;
        do {
            result = await page.evaluate(async (settings) => {
                // DOM range measurement must execute in Chromium's document.
                const helperPath =
                    "/src/spikes/editable-pagination/flow-integrity.ts";
                const { measureFlowIntegrity } = await import(helperPath);
                const repro = (globalThis as typeof globalThis & {
                    __issue147Repro: DecorationFlowRepro;
                }).__issue147Repro;
                return measureFlowIntegrity(repro, settings) as FlowIntegrity;
            }, settings);
            if (result.bad.length === 0) return result;
            await settle();
        } while (globalThis.performance.now() < deadline);
        throw new Error(
            `Glyph/image fragments outside printable pages: ${
                JSON.stringify(result.bad.slice(0, 8))
            }`,
        );
    };

    const editorSelector = candidate === "decorations"
        ? ".issue147-decoration-editor"
        : ".issue147-vertical-repro-editor";
    const sheetSelector = candidate === "decorations"
        ? ".pagination-sheet"
        : ".issue147-vertical-repro-sheet";
    const geometry = async () =>
        await page.evaluate(({ sheetSelector }) => {
            const repro = (globalThis as typeof globalThis & {
                __issue147Repro: DecorationFlowRepro;
            }).__issue147Repro;
            const rect = (element: Element) => {
                const { x, y, width, height, top, right, bottom, left } =
                    element.getBoundingClientRect();
                return { x, y, width, height, top, right, bottom, left };
            };
            const sheets = [
                ...repro.viewport.querySelectorAll<HTMLElement>(sheetSelector),
            ];
            const editorElement = repro.root.matches(".ProseMirror")
                ? repro.root
                : repro.root.querySelector<HTMLElement>(".ProseMirror");
            return {
                sheetRects: sheets.map(rect),
                rootRect: rect(repro.root),
                editorRect: editorElement ? rect(editorElement) : null,
                editorHtml: editorElement?.outerHTML.slice(0, 1200) ?? null,
                scrollAreaRect: rect(repro.scrollArea),
                scroll: {
                    scrollTop: repro.scrollArea.scrollTop,
                    scrollHeight: repro.scrollArea.scrollHeight,
                    clientHeight: repro.scrollArea.clientHeight,
                    scrollWidth: repro.scrollArea.scrollWidth,
                    clientWidth: repro.scrollArea.clientWidth,
                },
                editorCount: (repro.root.matches(".ProseMirror") ? 1 : 0) +
                    repro.root.querySelectorAll(".ProseMirror").length,
                pagebreakCount:
                    repro.root.querySelectorAll("[data-pagebreak]").length,
                documentOverflowX: document.documentElement.scrollWidth >
                    globalThis.innerWidth + 1,
                viewportOverflowX: repro.scrollArea.scrollWidth >
                    repro.scrollArea.clientWidth + 1,
                sheetOverflowX: sheets.some((sheet) => {
                    const sheetRect = sheet.getBoundingClientRect();
                    const scrollRect = repro.scrollArea.getBoundingClientRect();
                    return sheetRect.left < scrollRect.left ||
                        sheetRect.right > scrollRect.right;
                }),
                paragraphRects: [
                    ...repro.root.querySelectorAll<HTMLElement>("p"),
                ].map(rect),
                caretHitAtPaperCenter: repro.editor.view.posAtCoords({
                    left: rect(repro.root).left + 80,
                    top: rect(repro.root).top + 100,
                }) !== null,
            };
        }, { sheetSelector });

    const threePageSnapshot = await mount(THREE_PAGE_FIXTURE);
    const threePageGeometry = await geometry();
    report.threePage = {
        snapshot: threePageSnapshot,
        geometry: threePageGeometry,
    };
    await page.screenshot({
        path: `${evidenceDirectory}/${evidencePrefix}-three-page.png`,
        fullPage: true,
    });
    const scrollArea = page.locator(".issue147-decoration-scroll");
    const scrollAreaBox = await scrollArea.boundingBox();
    if (!scrollAreaBox) throw new Error("Decoration scroll area has no box");
    await page.mouse.move(
        scrollAreaBox.x + scrollAreaBox.width / 2,
        scrollAreaBox.y + scrollAreaBox.height / 2,
    );
    await page.mouse.wheel(0, 900);
    await page.waitForFunction(
        () => {
            const area = document.querySelector(
                ".issue147-decoration-scroll",
            ) as HTMLElement | null;
            return (area?.scrollTop ?? 0) > 0;
        },
        undefined,
        { timeout: 5000 },
    );
    const afterFirstWheel = await scrollArea.evaluate((element) =>
        (element as HTMLElement).scrollTop
    );
    await page.screenshot({
        path: `${evidenceDirectory}/${evidencePrefix}-wheel-page-2.png`,
        fullPage: true,
    });
    await page.mouse.wheel(0, 1100);
    await page.waitForFunction(
        (previous) => {
            const area = document.querySelector(
                ".issue147-decoration-scroll",
            ) as HTMLElement | null;
            return (area?.scrollTop ?? 0) > previous;
        },
        afterFirstWheel,
        { timeout: 5000 },
    );
    const afterSecondWheel = await scrollArea.evaluate((element) =>
        (element as HTMLElement).scrollTop
    );
    await page.screenshot({
        path: `${evidenceDirectory}/${evidencePrefix}-wheel-page-3.png`,
        fullPage: true,
    });
    await page.locator(`${editorSelector} p`).nth(2).click();
    await settle();
    const selectionBeforeGap = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        const selection = repro.editor.view.state.selection;
        return {
            from: selection.from,
            to: selection.to,
            anchor: selection.anchor,
        };
    });
    await scrollArea.evaluate((element) => {
        (element as HTMLElement).scrollTop = 900;
    });
    await settle();
    const gapPoint = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        const paragraphs = repro.root.querySelectorAll("p");
        const first = paragraphs[0].getBoundingClientRect();
        const firstSheet = document.querySelector(".pagination-sheet")!
            .getBoundingClientRect();
        const point = {
            left: first.left + 12,
            top: firstSheet.bottom + 12,
        };
        const element = document.elementFromPoint(point.left, point.top);
        return {
            point,
            hit: repro.editor.view.posAtCoords(point),
            target: element?.tagName ?? null,
            targetClass: element?.getAttribute("class") ?? null,
        };
    });
    await page.mouse.click(gapPoint.point.left, gapPoint.point.top);
    await settle();
    const gapClick = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        const selection = repro.editor.view.state.selection;
        return {
            type: selection.constructor.name,
            from: selection.from,
            to: selection.to,
            empty: selection.empty,
            anchor: selection.anchor,
            head: selection.head,
            parentType: selection.$from.parent.type.name,
            selectedNodeType: selection.toJSON().type === "node"
                ? selection.$from.nodeAfter?.type.name ?? null
                : null,
        };
    });
    report.threePageNavigation = {
        initialScrollTop: threePageGeometry.scroll.scrollTop,
        afterFirstWheel,
        afterSecondWheel,
        gapPoint: gapPoint.point,
        gapTarget: { tag: gapPoint.target, className: gapPoint.targetClass },
        gapHitPos: gapPoint.hit?.pos ?? null,
        gapClick,
        selectionBeforeGap,
    };
    await scrollArea.evaluate((element) => {
        (element as HTMLElement).scrollTop = 0;
    });
    await settle();
    const dragStart = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        const first = repro.root.querySelector("p")!.getBoundingClientRect();
        return { x: first.left + 2, y: first.top + first.height / 2 };
    });
    const dragSeed = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        return repro.editor.getMarkdown();
    });
    await page.mouse.click(dragStart.x, dragStart.y);
    await settle();
    const selectionAnchor = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        const selection = repro.editor.view.state.selection;
        return { anchor: selection.anchor, from: selection.from };
    });
    const dragScrollTop = await scrollArea.evaluate((element) => {
        const area = element as HTMLElement;
        area.scrollTop = 1800;
        return area.scrollTop;
    });
    await settle();
    const dragEnd = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        const paragraphs = repro.root.querySelectorAll("p");
        const last = paragraphs[paragraphs.length - 1];
        const text = last.firstChild;
        const range = document.createRange();
        if (!text) throw new Error("Missing third-page text");
        range.selectNodeContents(text);
        const textRect = range.getBoundingClientRect();
        return { x: textRect.right - 2, y: textRect.top + textRect.height / 2 };
    });
    await page.keyboard.down("Shift");
    await page.mouse.click(dragEnd.x, dragEnd.y);
    await page.keyboard.up("Shift");
    await settle();
    const mouseSelection = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        const { state } = repro.editor.view;
        return {
            type: state.selection.constructor.name,
            from: state.selection.from,
            to: state.selection.to,
            empty: state.selection.empty,
            text: state.doc.textBetween(
                state.selection.from,
                state.selection.to,
                "\n",
            ),
        };
    });
    await page.screenshot({
        path: `${evidenceDirectory}/${evidencePrefix}-cross-page-selection.png`,
        fullPage: true,
    });
    await page.keyboard.press("Control+c");
    await settle();
    const copiedText = await page.evaluate(async () => {
        try {
            return await navigator.clipboard.readText();
        } catch (error) {
            return `CLIPBOARD_READ_ERROR: ${String(error)}`;
        }
    });
    await page.keyboard.press("Control+x");
    await settle();
    const afterCut = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        return repro.editor.getMarkdown();
    });
    await page.keyboard.press("Control+v");
    await settle();
    const afterPaste = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        return repro.editor.getMarkdown();
    });
    const contentFragments = [
        "First editable page.",
        "Second editable page.",
        "Third editable page.",
    ];
    await page.keyboard.press("Control+z");
    await settle();
    const afterUndo = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        return repro.editor.getMarkdown();
    });
    await page.keyboard.press("Control+y");
    await settle();
    const afterRedo = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        return repro.editor.getMarkdown();
    });
    const clipboardRoundTrip = {
        dragScrollTop,
        method: "mouse click followed by Shift-click across scrolled pages",
        selectionAnchor,
        dragEnd,
        selection: mouseSelection,
        clipboardText: copiedText,
        copiedAllPages: contentFragments.every((text) =>
            copiedText.includes(text)
        ),
        cutChangedDocument: afterCut !== dragSeed,
        pasteChangedDocument: afterPaste !== afterCut,
        pasteRestoredAllPages: contentFragments.every((text) =>
            afterPaste.includes(text)
        ),
        pasteRestoredExact: afterPaste === dragSeed,
        undoChangedDocument: afterUndo !== afterPaste,
        undoReturnedToCutOrOriginal: afterUndo === afterCut ||
            afterUndo === dragSeed,
        redoRestoredDocument: afterRedo === afterPaste,
    };
    report.crossPageMouseClipboard = clipboardRoundTrip;
    await mount(THREE_PAGE_FIXTURE);
    const pointerStart = await page.locator(`${editorSelector} p`).first()
        .boundingBox();
    if (!pointerStart) throw new Error("Missing first-page text");
    await page.mouse.move(
        pointerStart.x + 2,
        pointerStart.y + pointerStart.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
        pointerStart.x + 30,
        pointerStart.y + pointerStart.height / 2,
        { steps: 3 },
    );
    await settle();
    report.pointerDragStart = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        return {
            selection: repro.editor.view.state.selection.toJSON(),
            nativeText: getSelection()?.toString(),
        };
    });
    await page.mouse.wheel(0, 1800);
    await page.waitForFunction(() =>
        (document.querySelector<HTMLElement>(".issue147-decoration-scroll")
            ?.scrollTop ?? 0) >= 1800
    );
    report.pointerDragAfterWheel = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        return {
            selection: repro.editor.view.state.selection.toJSON(),
            nativeText: getSelection()?.toString(),
        };
    });
    const pointerEnd = await page.locator(`${editorSelector} p`).last()
        .evaluate((paragraph) => {
            const range = document.createRange();
            range.selectNodeContents(paragraph);
            const rect = range.getBoundingClientRect();
            return { x: rect.right - 2, y: rect.top + rect.height / 2 };
        });
    await page.mouse.move(pointerEnd.x, pointerEnd.y, { steps: 8 });
    await page.mouse.up();
    await settle();
    report.crossPagePointerDrag = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        const state = repro.editor.view.state;
        return {
            from: state.selection.from,
            to: state.selection.to,
            text: state.doc.textBetween(
                state.selection.from,
                state.selection.to,
                "\n",
            ),
        };
    });
    const backspaceFixture = await mount(THREE_PAGE_FIXTURE);
    const backspaceSeed = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        return repro.editor.getMarkdown();
    });
    await page.locator(`${editorSelector} p`).nth(1).click();
    await settle();
    await page.keyboard.press("Home");
    await settle();
    await page.keyboard.press("Backspace");
    await settle();
    const afterFirstBackspace = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        const selection = repro.editor.view.state.selection;
        return {
            markdown: repro.editor.getMarkdown(),
            selection: selection.constructor.name,
            selectedNode: selection.toJSON().type === "node"
                ? selection.$from.nodeAfter?.type.name ?? null
                : null,
            pages: Number(repro.viewport.dataset.pageCount),
        };
    });
    if (afterFirstBackspace.markdown === backspaceSeed) {
        await page.keyboard.press("Backspace");
        await settle();
    }
    const afterBackspace = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        return {
            markdown: repro.editor.getMarkdown(),
            pages: Number(repro.viewport.dataset.pageCount),
        };
    });
    report.crossPageKeyboardPartial = {
        backspaceFixture,
        backspaceSeed,
        afterFirstBackspace,
        afterBackspace,
    };
    const backspaceRemovedBreak =
        (afterBackspace.markdown.match(/<!-- pagebreak -->/g)?.length ?? 0) ===
            1;
    const backspaceReflowed = backspaceRemovedBreak
        ? await page.waitForFunction(
            () => {
                const repro = (globalThis as typeof globalThis & {
                    __issue147Repro: DecorationFlowRepro;
                }).__issue147Repro;
                return Number(repro.viewport.dataset.pageCount) === 2;
            },
            undefined,
            { timeout: 5000 },
        ).then(() => true, () => false)
        : false;
    let afterBoundaryUndo = afterBackspace.markdown;
    let backspaceUndoRestored = false;
    let backspaceUndoReflowed = false;
    let backspaceRedoRestored = false;
    if (backspaceRemovedBreak) {
        await page.keyboard.press("Control+z");
        afterBoundaryUndo = await page.evaluate(() => {
            const repro = (globalThis as typeof globalThis & {
                __issue147Repro: DecorationFlowRepro;
            }).__issue147Repro;
            return repro.editor.getMarkdown();
        });
        backspaceUndoRestored =
            (afterBoundaryUndo.match(/<!-- pagebreak -->/g)?.length ?? 0) === 2;
        if (backspaceUndoRestored) {
            backspaceUndoReflowed = await page.waitForFunction(
                () => {
                    const repro = (globalThis as typeof globalThis & {
                        __issue147Repro: DecorationFlowRepro;
                    }).__issue147Repro;
                    return Number(repro.viewport.dataset.pageCount) === 3;
                },
                undefined,
                { timeout: 5000 },
            ).then(() => true, () => false);
            await page.keyboard.press("Control+y");
            const afterRedo = await page.evaluate(() => {
                const repro = (globalThis as typeof globalThis & {
                    __issue147Repro: DecorationFlowRepro;
                }).__issue147Repro;
                return repro.editor.getMarkdown();
            });
            backspaceRedoRestored =
                (afterRedo.match(/<!-- pagebreak -->/g)?.length ?? 0) === 1;
        }
    }

    const deleteFixture = await mount(THREE_PAGE_FIXTURE);
    const deleteSeed = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        return repro.editor.getMarkdown();
    });
    await page.locator(`${editorSelector} p`).first().click();
    await settle();
    await page.keyboard.press("End");
    await settle();
    await page.keyboard.press("Delete");
    await settle();
    const afterFirstDelete = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        const selection = repro.editor.view.state.selection;
        return {
            markdown: repro.editor.getMarkdown(),
            selection: selection.constructor.name,
            selectedNode: selection.toJSON().type === "node"
                ? selection.$from.nodeAfter?.type.name ?? null
                : null,
        };
    });
    if (afterFirstDelete.markdown === deleteSeed) {
        await page.keyboard.press("Delete");
        await settle();
    }
    const afterDelete = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        return {
            markdown: repro.editor.getMarkdown(),
            pages: Number(repro.viewport.dataset.pageCount),
        };
    });
    const deleteRemovedBreak =
        (afterDelete.markdown.match(/<!-- pagebreak -->/g)?.length ?? 0) === 1;
    const deleteReflowed = deleteRemovedBreak
        ? await page.waitForFunction(
            () => {
                const repro = (globalThis as typeof globalThis & {
                    __issue147Repro: DecorationFlowRepro;
                }).__issue147Repro;
                return Number(repro.viewport.dataset.pageCount) === 2;
            },
            undefined,
            { timeout: 5000 },
        ).then(() => true, () => false)
        : false;
    let afterDeleteUndo = afterDelete.markdown;
    let deleteUndoRestored = false;
    let deleteUndoReflowed = false;
    let deleteRedoRestored = false;
    if (deleteRemovedBreak) {
        await page.keyboard.press("Control+z");
        afterDeleteUndo = await page.evaluate(() => {
            const repro = (globalThis as typeof globalThis & {
                __issue147Repro: DecorationFlowRepro;
            }).__issue147Repro;
            return repro.editor.getMarkdown();
        });
        deleteUndoRestored =
            (afterDeleteUndo.match(/<!-- pagebreak -->/g)?.length ?? 0) === 2;
        if (deleteUndoRestored) {
            deleteUndoReflowed = await page.waitForFunction(
                () => {
                    const repro = (globalThis as typeof globalThis & {
                        __issue147Repro: DecorationFlowRepro;
                    }).__issue147Repro;
                    return Number(repro.viewport.dataset.pageCount) === 3;
                },
                undefined,
                { timeout: 5000 },
            ).then(() => true, () => false);
            await page.keyboard.press("Control+y");
            const afterRedo = await page.evaluate(() => {
                const repro = (globalThis as typeof globalThis & {
                    __issue147Repro: DecorationFlowRepro;
                }).__issue147Repro;
                return repro.editor.getMarkdown();
            });
            deleteRedoRestored =
                (afterRedo.match(/<!-- pagebreak -->/g)?.length ?? 0) === 1;
        }
    }
    report.crossPageKeyboard = {
        backspaceFixture,
        backspaceSeed,
        afterFirstBackspace,
        afterBackspace,
        backspaceRemovedBreak,
        backspaceReflowed,
        backspaceUndoRestored,
        backspaceUndoReflowed,
        backspaceRedoRestored,
        deleteFixture,
        deleteSeed,
        afterFirstDelete,
        afterDelete,
        deleteRemovedBreak,
        deleteReflowed,
        deleteUndoRestored,
        deleteUndoReflowed,
        deleteRedoRestored,
    };

    const shortResults: Record<string, unknown> = {};
    for (const [name, markdown] of Object.entries(SHORT_PAGEBREAK_FIXTURES)) {
        const snapshot = await mount(markdown);
        const details = await geometry();
        const expectedPages = ({
            empty: 1,
            middle: 2,
            leading: 2,
            trailing: 2,
            consecutive: 3,
        } as const)[
            name as keyof typeof SHORT_PAGEBREAK_FIXTURES
        ];
        shortResults[name] = { expectedPages, snapshot, geometry: details };
        await page.evaluate(async (settings) => {
            // Printing is a browser-only module boundary, not a Deno import.
            const printPath = "/src/features/documents/document-print.ts";
            const { prepareDocumentPrint } = await import(printPath);
            const global = globalThis as typeof globalThis & {
                __issue147Repro: { root: HTMLElement };
                __issue147Print?: PreparedDocumentPrint;
            };
            const body = global.__issue147Repro.root.querySelector<HTMLElement>(
                ".ProseMirror",
            );
            if (!body) throw new Error("Missing editable print source");
            global.__issue147Print = await prepareDocumentPrint(
                body,
                "Print boundary",
                settings,
            );
        }, paper);
        const pdfPath =
            `${evidenceDirectory}/${evidencePrefix}-print-${name}.pdf`;
        await page.pdf({
            path: pdfPath,
            preferCSSPageSize: true,
            printBackground: true,
        });
        shortResults[name] = {
            expectedPages,
            snapshot,
            geometry: details,
            print: { pdfPath },
        };
        await page.evaluate(() => {
            (globalThis as typeof globalThis & {
                __issue147Print?: PreparedDocumentPrint;
            }).__issue147Print?.dispose();
        });
    }
    report.shortPagebreaks = shortResults;

    const automaticSnapshot = await mount(AUTOMATIC_FIXTURE);
    const automaticGeometry = await geometry();
    report.automatic = {
        snapshot: automaticSnapshot,
        geometry: automaticGeometry,
        markdownLength: AUTOMATIC_FIXTURE.length,
        renderedTextLength: await page.evaluate(() => {
            const root = (globalThis as typeof globalThis & {
                __issue147Repro: DecorationFlowRepro;
            }).__issue147Repro.root;
            return root.textContent?.length ?? 0;
        }),
    };
    report.automaticIntegrity = await integrity();
    await page.screenshot({
        path: `${evidenceDirectory}/${evidencePrefix}-automatic.png`,
        fullPage: true,
    });

    const specialResults: Record<string, unknown> = {};
    for (const [name, markdown] of Object.entries(FLOAT_FAILURE_FIXTURES)) {
        const source = typeof markdown === "function"
            ? await page.evaluate(async (fixtureName) => {
                // Canvas creation must run in Chromium; a runner-side static import cannot provide its document.
                const fixturePath =
                    "/src/spikes/editable-pagination/issue147-fixtures.ts";
                const fixtures = await import(fixturePath);
                return fixtures.FLOAT_FAILURE_FIXTURES[fixtureName]() as string;
            }, name)
            : markdown;
        const snapshot = await mount(source);
        await page.locator(`${editorSelector} img[src]`).evaluateAll(async (
            images,
        ) => await Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
        ));
        await settle();
        const details = await geometry();
        const physicalIntegrity = await integrity();
        if (candidate === "decorations") {
            assertEquals(
                physicalIntegrity.bad,
                [],
                `${name}: physical printable boundaries`,
            );
        }
        specialResults[name] = {
            snapshot,
            geometry: details,
            sourceLength: source.length,
            integrity: physicalIntegrity,
            renderedTextLength: await page.evaluate(() => {
                const root = (globalThis as typeof globalThis & {
                    __issue147Repro: DecorationFlowRepro;
                }).__issue147Repro.root;
                return root.textContent?.length ?? 0;
            }),
        };
        if (name === "image") {
            await page.setViewportSize({ width: 390, height: 844 });
            await settle();
            report.oversizedLiveResize = {
                viewport: "390x844",
                geometry: await geometry(),
                integrity: await integrity(),
            };
            await page.setViewportSize({ width: 1440, height: 900 });
            await settle();
            report.oversizedResizeRestore = await integrity();
        }
    }
    report.specialContent = specialResults;

    const orientationResults: Record<string, unknown> = {};
    for (const size of ["a4", "letter"] as const) {
        for (const orientation of ["portrait", "landscape"] as const) {
            const settings = { ...paper, paperSize: size, orientation };
            const snapshot = await mount(THREE_PAGE_FIXTURE, settings);
            orientationResults[`${size}-${orientation}`] = {
                snapshot,
                geometry: await geometry(),
                integrity: await integrity(settings),
            };
        }
    }
    report.orientations = orientationResults;

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileSnapshot = await mount(THREE_PAGE_FIXTURE);
    report.mobile = { snapshot: mobileSnapshot, geometry: await geometry() };
    report.mobileIntegrity = await integrity();
    await page.screenshot({
        path: `${evidenceDirectory}/${evidencePrefix}-mobile-390.png`,
        fullPage: true,
    });

    const widthResults: Record<string, unknown> = {};
    for (
        const [width, height] of [
            [768, 1024],
            [1024, 768],
            [1440, 900],
        ] as const
    ) {
        await page.setViewportSize({ width, height });
        const snapshot = await mount(THREE_PAGE_FIXTURE);
        widthResults[`${width}x${height}`] = {
            snapshot,
            geometry: await geometry(),
            integrity: await integrity(),
        };
        if (width !== 1440) {
            await page.screenshot({
                path:
                    `${evidenceDirectory}/${evidencePrefix}-${width}x${height}.png`,
                fullPage: true,
            });
        }
    }
    report.responsiveWidths = widthResults;

    await mount(THREE_PAGE_FIXTURE);
    await page.locator(`${editorSelector} p`).first().click();
    await settle();
    const beforeComposition = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        return {
            signature: repro.viewport.dataset.decorationSignature,
            markdown: repro.editor.getMarkdown(),
        };
    });
    await page.locator(`${editorSelector} .ProseMirror`).dispatchEvent(
        "compositionstart",
        { data: "" },
    );
    await page.keyboard.insertText("中文输入");
    await settle();
    const duringComposition = await page.evaluate(() => {
        const repro = (globalThis as typeof globalThis & {
            __issue147Repro: DecorationFlowRepro;
        }).__issue147Repro;
        return {
            signature: repro.viewport.dataset.decorationSignature,
            markdown: repro.editor.getMarkdown(),
        };
    });
    await page.locator(`${editorSelector} .ProseMirror`).dispatchEvent(
        "compositionend",
        { data: "中文输入" },
    );
    await settle();
    report.composition = {
        mechanism:
            "synthetic CompositionEvent plus Chromium insertText; OS IME unavailable",
        before: beforeComposition,
        during: duringComposition,
        integrity: await integrity(),
    };

    await page.setViewportSize({ width: 1440, height: 900 });
    await mount(THREE_PAGE_FIXTURE);
    await page.evaluate(() => {
        const global = globalThis as typeof globalThis & {
            __issue147Repro: {
                editor: {
                    getMarkdown(): string;
                    view: object;
                };
            };
            __issue147InitialView?: object;
            __issue147InitialMarkdown?: string;
        };
        global.__issue147InitialView = global.__issue147Repro.editor.view;
        global.__issue147InitialMarkdown = global.__issue147Repro.editor
            .getMarkdown();
    });
    const firstParagraph = page.locator(
        `${editorSelector} p`,
    ).first();
    await firstParagraph.click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" typed");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("keyboard-next");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Delete");
    const afterKeyboard = await page.evaluate(() => {
        const global = globalThis as typeof globalThis & {
            __issue147Repro: {
                editor: { getMarkdown(): string; view: object };
                root: HTMLElement;
            };
            __issue147InitialView?: object;
            __issue147InitialMarkdown?: string;
        };
        const markdown = global.__issue147Repro.editor.getMarkdown();
        return {
            markdown,
            initialMarkdown: global.__issue147InitialMarkdown,
            inputApplied: markdown.includes("First editable page. typed"),
            enterCreatedNextBlock: markdown.includes("keyboard-nex"),
            viewIdentityPreserved: global.__issue147Repro.editor.view ===
                global.__issue147InitialView,
            editorCount:
                (global.__issue147Repro.root.matches(".ProseMirror") ? 1 : 0) +
                global.__issue147Repro.root.querySelectorAll(".ProseMirror")
                    .length,
        };
    });
    const undoStates: string[] = [];
    for (let index = 0; index < 8; index++) {
        await page.keyboard.press("Control+z");
        const markdown = await page.evaluate(() => {
            const global = globalThis as typeof globalThis & {
                __issue147Repro: { editor: { getMarkdown(): string } };
            };
            return global.__issue147Repro.editor.getMarkdown();
        });
        undoStates.push(markdown);
        if (markdown === afterKeyboard.initialMarkdown) break;
        if (undoStates.length > 1 && markdown === undoStates.at(-2)) break;
    }
    const redoStates: string[] = [];
    for (let index = 0; index < undoStates.length; index++) {
        await page.keyboard.press("Control+y");
        const markdown = await page.evaluate(() => {
            const global = globalThis as typeof globalThis & {
                __issue147Repro: { editor: { getMarkdown(): string } };
            };
            return global.__issue147Repro.editor.getMarkdown();
        });
        redoStates.push(markdown);
        if (markdown === afterKeyboard.markdown) break;
        if (redoStates.length > 1 && markdown === redoStates.at(-2)) break;
    }
    const historyAfterUndoRedo = {
        undoSteps: undoStates.length,
        undoRestoredInitial:
            undoStates.at(-1) === afterKeyboard.initialMarkdown,
        redoSteps: redoStates.length,
        redoRestoredEdited: redoStates.at(-1) === afterKeyboard.markdown,
        viewIdentityPreserved: await page.evaluate(() => {
            const global = globalThis as typeof globalThis & {
                __issue147Repro: {
                    editor: { view: object };
                    root: HTMLElement;
                };
                __issue147InitialView?: object;
            };
            return global.__issue147Repro.editor.view ===
                    global.__issue147InitialView &&
                global.__issue147Repro.root.querySelectorAll(".ProseMirror")
                        .length === 1;
        }),
    };
    report.editing = { afterKeyboard, historyAfterUndoRedo };
    await page.screenshot({
        path: `${evidenceDirectory}/${evidencePrefix}-editing.png`,
        fullPage: true,
    });

    const performance: Record<string, unknown> = {};
    for (const pages of [10, 30] as const) {
        const initial = await mount(createPerformanceFixture(pages));
        assertEquals(
            initial.pages,
            pages,
            "Benchmark must measure the requested real page count",
        );
        const warmup: number[] = [];
        const samples: number[] = [];
        for (let index = 0; index < 23; index++) {
            const duration = await page.evaluate(async () => {
                const repro = (globalThis as typeof globalThis & {
                    __issue147Repro: DecorationFlowRepro;
                }).__issue147Repro;
                const snapshot = await repro.reflow();
                if (snapshot.durationMs === undefined) {
                    throw new Error("Missing actual reflow duration");
                }
                return snapshot.durationMs;
            });
            (index < 3 ? warmup : samples).push(duration);
        }
        const sorted = [...samples].sort((a, b) => a - b);
        const medianMs = (sorted[9] + sorted[10]) / 2;
        if (pages === 30) {
            assert(
                medianMs <=
                    2 *
                        horizontalBaseline.horizontalBaseline.thirtyPages
                            .medianMs,
                "Production 30-page reflow exceeds twice the frozen horizontal median",
            );
        }
        performance[`${pages}-pages`] = {
            fixturePages: pages,
            actualPages: initial.pages,
            warmup,
            samples,
            medianMs,
            maxMs: Math.max(...samples),
            measurements: initial.measurements,
        };
    }
    report.performance = performance;
    report.errors = errors;
    await Deno.writeTextFile(
        `${evidenceDirectory}/${evidencePrefix}-spike.json`,
        `${JSON.stringify(report, null, 2)}\n`,
    );
} catch (error) {
    report.errors = errors;
    report.runError = String(error);
    await Deno.writeTextFile(
        `${evidenceDirectory}/${evidencePrefix}-spike.json`,
        `${JSON.stringify(report, null, 2)}\n`,
    );
    throw error;
} finally {
    await browser.close();
}
