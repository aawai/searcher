import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright";
import type { Page, Request } from "playwright";
import type { DocumentDto } from "../../src/shared/documents.ts";
import { startProductionApp } from "./helpers/production-app.ts";

async function sample(page: Page, duration: number) {
    return await page.evaluate(async (duration) => {
        const selectors = [
            ".workspace-body",
            ".document-editor-container",
            ".document-editor-scroll-area",
            ".pagination-viewport",
            ".pagination-sheet:nth-child(1)",
            ".pagination-sheet:nth-child(2)",
        ];
        const frames: Array<
            {
                time: number;
                elements: Array<null | Record<string, string | number>>;
                active: string;
            }
        > = [];
        const start = performance.now();
        let reflows = 0;
        const viewport = document.querySelector(".pagination-viewport");
        const observer = new MutationObserver((records) => {
            reflows += records.filter((record) =>
                record.attributeName === "data-duration-ms"
            ).length;
        });
        if (viewport) observer.observe(viewport, { attributes: true });
        const { promise, resolve } = Promise.withResolvers<void>();
        function frame() {
            frames.push({
                time: performance.now() - start,
                active: document.activeElement?.className ?? "",
                elements: selectors.map((selector) => {
                    const node = document.querySelector<HTMLElement>(selector);
                    if (!node) return null;
                    const rect = node.getBoundingClientRect();
                    const style = getComputedStyle(node);
                    return {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                        clientWidth: node.clientWidth,
                        clientHeight: node.clientHeight,
                        scrollWidth: node.scrollWidth,
                        scrollHeight: node.scrollHeight,
                        scrollTop: node.scrollTop,
                        overflowX: style.overflowX,
                        overflowY: style.overflowY,
                        zoom: node.style.zoom,
                        cssWidth: node.style.width,
                        cssHeight: node.style.height,
                        pages: node.dataset.pageCount ?? "",
                        signature: node.dataset.decorationSignature ?? "",
                    };
                }),
            });
            if (performance.now() - start >= duration) resolve();
            else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        await promise;
        observer.disconnect();
        return { frames, reflows };
    }, duration);
}

async function ready(page: Page) {
    await page.waitForFunction(
        () => {
            const viewport = document.querySelector<HTMLElement>(
                ".pagination-viewport",
            );
            return viewport?.dataset.paginationMode === "page" &&
                Number(viewport.dataset.pageCount) > 0 &&
                !!document.querySelector(".pagination-sheet");
        },
        undefined,
        { timeout: 10000 },
    );
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
            Array.from(
                // DocumentImageView owns canonical content; Milkdown also has an empty tool image.
                document.querySelectorAll<HTMLImageElement>(
                    ".ProseMirror img[data-canonical-src]",
                ),
            ).map(async (image) => {
                try {
                    await image.decode();
                } catch (error) {
                    throw new Error(
                        `Fixture image decode failed: ${
                            JSON.stringify({
                                src: image.src,
                                currentSrc: image.currentSrc,
                                complete: image.complete,
                                naturalWidth: image.naturalWidth,
                                canonical: image.dataset.canonicalSrc,
                            })
                        }`,
                        { cause: error },
                    );
                }
            }),
        );
        await Promise.all(
            document.getAnimations().filter((animation) =>
                animation.effect?.getComputedTiming().iterations !== Infinity
            ).map((animation) => animation.finished.catch(() => {})),
        );
        // Allow the scheduled first pagination and its decoration pass, never wait for idle.
        const { promise, resolve } = Promise.withResolvers<void>();
        requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
        await promise;
    });
}

Deno.test("#158 Zen page layout reaches an idle fixed point", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
        ignoreDefaultArgs: ["--hide-scrollbars"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const evidence = Deno.env.get("E2E_EVIDENCE_DIR")
        ? await createEvidenceDirectory("document-zen-pagination-stability")
        : undefined;
    await page.goto(
        (Deno.env.get("E2E_FRONTEND_ORIGIN") ?? app.origin) + "/register",
    );
    await page.locator("#auth-username").fill("zen_stability_158");
    await page.locator("#auth-display-name").fill("Zen stability");
    await page.locator("#auth-password").fill("Zen-stability-158!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL("**/");
    async function request<T>(
        path: string,
        method = "GET",
        body?: object,
    ): Promise<T> {
        return await page.evaluate(async ({ path, method, body }) => {
            const response = await fetch(path, {
                method,
                headers: { "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) throw new Error(await response.text());
            return (await response.json()).data;
        }, { path, method, body }) as T;
    }
    await request("/api/preferences", "PATCH", {
        style: "zen",
        theme: "light",
    });
    const fixtures = [
        { name: "short", body: "# Short\n\nOne static paragraph." },
        {
            name: "manual",
            body:
                "FIRST158\n\n<!-- pagebreak -->\n\nSECOND158\n\n<!-- pagebreak -->\n\nTHIRD158",
        },
        {
            name: "consecutive",
            body:
                "FIRST158\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->\n\nLAST158",
        },
        {
            name: "mixed",
            body: "# Long paragraph\n\n" + "long paragraph words ".repeat(500) +
                "\n\n| A | B |\n| --- | --- |\n" +
                "| row | text |\n".repeat(40) + "\n```ts\n" +
                "const example = 158;\n".repeat(50) + "```",
        },
    ];
    const failures: string[] = [];
    for (const fixture of fixtures) {
        if (
            Deno.env.get("E2E_FIXTURE") &&
            Deno.env.get("E2E_FIXTURE") !== fixture.name
        ) continue;
        let doc = await request<DocumentDto>("/api/documents", "POST", {
            title: fixture.name,
            body: fixture.body,
        });
        if (fixture.name === "mixed") {
            const asset = await page.evaluate(async (id) => {
                const canvas = document.createElement("canvas");
                canvas.width = 320;
                canvas.height = 180;
                canvas.getContext("2d")!.fillRect(0, 0, 320, 180);
                const { promise, resolve, reject } = Promise.withResolvers<
                    Blob
                >();
                canvas.toBlob(
                    (blob) =>
                        blob ? resolve(blob) : reject(
                            new Error("Image fixture encoding failed"),
                        ),
                    "image/png",
                );
                const form = new FormData();
                form.append("file", await promise, "layout.png");
                const response = await fetch(`/api/documents/${id}/assets`, {
                    method: "POST",
                    body: form,
                });
                if (!response.ok) throw new Error(await response.text());
                return (await response.json()).data as { assetId: string };
            }, doc.id);
            doc = await request<DocumentDto>(
                `/api/documents/${doc.id}`,
                "PATCH",
                {
                    body:
                        `![layout image](asset://${asset.assetId})\n\n${fixture.body}`,
                    version: doc.version,
                },
            );
        }
        const viewports = Deno.env.get("E2E_TALL_ONLY")
            ? [[1024, 1552], [1024, 1548], [1024, 1556]]
            : [[1440, 900], [1024, 768], [768, 1024], [390, 844], [1024, 1552]];
        const scenarios = viewports.flatMap(([width, height]) =>
            (["light", "dark"] as const).map((theme) => ({
                width,
                height,
                theme,
            }))
        );
        for (const { width, height, theme } of scenarios) {
            const name = `${fixture.name}-${width}x${height}-${theme}`;
            const passed = await t.step(name, async () => {
                await page.setViewportSize({ width, height });
                await page.emulateMedia({
                    colorScheme: theme,
                    reducedMotion: theme === "dark"
                        ? "reduce"
                        : "no-preference",
                });
                const origin = Deno.env.get("E2E_FRONTEND_ORIGIN") ??
                    app.origin;
                await page.goto(origin + "/settings");
                await request("/api/preferences", "PATCH", { theme });
                await page.goto(origin + "/");
                await page.waitForFunction(
                    (theme) => document.documentElement.dataset.theme === theme,
                    theme,
                );
                await page.locator('button[data-workspace="documents"]').first()
                    .click();
                await page.locator(`[data-document-id="${doc.id}"] h4 button`)
                    .click();
                await page.locator(".ProseMirror").waitFor();
                const patches: string[] = [];
                const listener = (req: Request) => {
                    if (
                        req.method() === "PATCH" &&
                        new URL(req.url()).pathname ===
                            `/api/documents/${doc.id}`
                    ) patches.push(req.postData() ?? "");
                };
                page.on("request", listener);
                await page.getByRole("button", { name: "页面", exact: true })
                    .click();
                const initial = await sample(page, 5000);
                await ready(page);
                if (fixture.name === "mixed") {
                    const dimensions = await page.locator(
                        ".ProseMirror img[data-canonical-src]",
                    ).evaluate((image) => {
                        const content = image as HTMLImageElement;
                        return [content.naturalWidth, content.naturalHeight];
                    });
                    assertEquals(
                        dimensions,
                        [320, 180],
                        "fixture asset actually decodes",
                    );
                }
                const idleSample = await sample(
                    page,
                    height === 1552 ||
                        (fixture.name === "manual" && width === 1440)
                        ? 9000
                        : 2000,
                );
                const idle = idleSample.frames;
                page.off("request", listener);
                if (evidence) {
                    await Deno.writeTextFile(
                        `${evidence}/${name}.json`,
                        JSON.stringify({ initial, idle: idleSample }, null, 2),
                    );
                    await page.screenshot({ path: `${evidence}/${name}.png` });
                }
                assertEquals(
                    idleSample.reflows,
                    0,
                    `${name} idle must not continuously reflow itself`,
                );
                for (const index of [4, 5]) {
                    if (!idle[0].elements[index]) continue;
                    for (const dimension of ["x", "y", "width", "height"]) {
                        const values = idle.map((frame) =>
                            Number(frame.elements[index]?.[dimension])
                        );
                        const variation = Math.max(...values) -
                            Math.min(...values);
                        assert(
                            variation <= 1,
                            `${name} sheet ${
                                index - 3
                            } ${dimension} varied ${variation}px`,
                        );
                    }
                }
                for (
                    const dimension of [
                        "zoom",
                        "cssWidth",
                        "cssHeight",
                        "pages",
                        "signature",
                    ]
                ) {
                    assertEquals(
                        new Set(
                            idle.map((frame) => frame.elements[3]?.[dimension]),
                        ).size,
                        1,
                        `${name} viewport ${dimension} must converge`,
                    );
                }
                for (const index of [0, 1, 2]) {
                    const values = idle.map((frame) =>
                        Number(frame.elements[index]?.scrollTop ?? 0)
                    );
                    assert(
                        Math.max(...values) - Math.min(...values) <= 0.5,
                        `${name} idle scroll owner ${index} moved`,
                    );
                }
                assertEquals(patches, [], "clean layout must not save content");
                assertEquals(
                    (await request<DocumentDto>(`/api/documents/${doc.id}`))
                        .version,
                    doc.version,
                );
            });
            if (!passed) failures.push(name);
        }
    }
    assertEquals(errors, []);
    assertEquals(failures, []);
});
