import { assert, assertEquals } from "@std/assert";
import { chromium } from "playwright";
import type { Locator } from "playwright";
import type { DocumentDto } from "../../src/shared/documents.ts";
import { startProductionApp } from "./helpers/production-app.ts";

async function visiblePoint(locator: Locator, minimumHeight = 24) {
    await locator.scrollIntoViewIfNeeded();
    const point = await locator.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        let left = Math.max(0, rect.left),
            right = Math.min(innerWidth, rect.right);
        let top = Math.max(0, rect.top),
            bottom = Math.min(innerHeight, rect.bottom);
        for (
            let parent = node.parentElement;
            parent;
            parent = parent.parentElement
        ) {
            const style = getComputedStyle(parent),
                clip = parent.getBoundingClientRect();
            if (style.overflowX !== "visible") {
                left = Math.max(left, clip.left);
                right = Math.min(right, clip.right);
            }
            if (style.overflowY !== "visible") {
                top = Math.max(top, clip.top);
                bottom = Math.min(bottom, clip.bottom);
            }
        }
        const x = (left + right) / 2;
        let y = (top + bottom) / 2;
        let hit = document.elementFromPoint(x, y);
        // Sticky chrome can cover part of an otherwise unclipped body. Measure
        // the remaining painted area rather than assuming its center is usable.
        while (hit && hit !== node && !node.contains(hit) && bottom > top) {
            let occluder = hit;
            for (
                let parent = hit.parentElement;
                parent && !parent.contains(node);
                parent = parent.parentElement
            ) {
                const position = getComputedStyle(parent).position;
                if (position === "sticky" || position === "fixed") {
                    occluder = parent;
                    break;
                }
            }
            const cover = occluder.getBoundingClientRect();
            if (cover.top - top >= bottom - cover.bottom) {
                bottom = Math.min(bottom, cover.top);
            } else {
                top = Math.max(top, cover.bottom);
            }
            y = (top + bottom) / 2;
            hit = bottom > top ? document.elementFromPoint(x, y) : null;
        }
        return {
            x,
            y,
            height: bottom - top,
            width: right - left,
            hit: hit === node || (hit !== null && node.contains(hit)),
            rect: rect.toJSON(),
        };
    });
    assert(
        point.height >= Math.min(minimumHeight, point.rect.height) - 0.5 &&
            point.width > 0 && point.hit,
        JSON.stringify(point),
    );
    return point;
}

Deno.test("#158 Zen body owner, short-host access and unrelated lists", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        ignoreDefaultArgs: ["--hide-scrollbars"],
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(app.origin + "/register");
    await page.locator("#auth-username").fill("host158");
    await page.locator("#auth-display-name").fill("Host fixture");
    await page.locator("#auth-password").fill("Host-fixture-158!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(app.origin + "/");
    async function api<T>(
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
    await api("/api/preferences", "PATCH", { style: "zen", theme: "light" });
    const body = "FIRSTHOST158\n\n" +
        "Paragraph for source scrolling.\n\n".repeat(30) +
        "<!-- pagebreak -->\n\n<!-- pagebreak -->\n\nLASTHOST158";
    const doc = await api<DocumentDto>("/api/documents", "POST", {
        title: "Host fixture",
        body,
    });
    for (let index = 0; index < 32; index++) {
        await api("/api/documents", "POST", {
            title: `Library ${index}`,
            body: "Short",
        });
        await api("/api/webapps", "POST", {
            name: `Host app ${index}`,
            url: `https://example.org/host158/${index}`,
        });
    }
    for (
        const [width, height] of [
            [1440, 900],
            [1024, 768],
            [768, 1024],
            [390, 844],
            [1440, 240],
            [390, 240],
        ]
    ) {
        assert(
            await t.step(`${width}x${height}`, async () => {
                await page.setViewportSize({ width, height });
                await page.goto(app.origin + "/");
                await page.locator('button[data-workspace="documents"]').first()
                    .click();
                const host = page.locator(".workspace-panel");
                const row = host.locator(
                    `[data-document-id="${doc.id}"] h4 button`,
                );
                await row.click();
                await host.getByRole("button", { name: "编辑", exact: true })
                    .click();
                await host.locator(".ProseMirror").waitFor();
                assertEquals(
                    await host.getAttribute("data-presentation"),
                    width < 768 ? "sheet" : "panel",
                );
                await host.getByRole("button", { name: "分页", exact: true })
                    .click();
                await page.waitForFunction(() =>
                    Number(
                        document.querySelector<HTMLElement>(
                            ".pagination-viewport",
                        )?.dataset.pageCount,
                    ) >= 3
                );
                await page.evaluate(async () => {
                    await document.fonts.ready;
                    await Promise.all(
                        document.getAnimations().filter((animation) =>
                            animation.effect?.getComputedTiming().iterations !==
                                Infinity
                        ).map((animation) =>
                            animation.finished.catch(() => {})
                        ),
                    );
                });
                for (
                    const locator of [
                        host.locator(".workspace-title"),
                        host.getByRole("button", {
                            name: "返回上一级",
                            exact: true,
                        }),
                        host.getByRole("button", {
                            name: "收起工作区",
                            exact: true,
                        }),
                        host.getByRole("button", { name: "链接", exact: true }),
                    ]
                ) {
                    await visiblePoint(locator);
                }
                const metrics = await host.evaluate((node) => {
                    const root = node.querySelector<HTMLElement>(
                        ".document-editor-container",
                    )!;
                    const header = node.querySelector<HTMLElement>(
                        ".document-editor-header",
                    )!;
                    const toolbar = node.querySelector<HTMLElement>(
                        ".document-editor-toolbar",
                    )!;
                    const minimum = Number.parseFloat(
                        getComputedStyle(root).getPropertyValue(
                            "--editor-min-content-height",
                        ),
                    );
                    const owners = Array.from(
                        node.querySelectorAll<HTMLElement>(
                            ".workspace-body,.document-editor-container,.document-editor-content-layout,.document-editor-scroll-area,.pagination-viewport",
                        ),
                    ).filter((element) =>
                        /^(auto|scroll)$/.test(
                            getComputedStyle(element).overflowY,
                        ) && element.scrollHeight > element.clientHeight + 1
                    ).map((element) => element.classList[0]);
                    return {
                        fits: root.clientHeight >=
                            header.offsetHeight + toolbar.offsetHeight +
                                minimum,
                        owners,
                        pageWidth: document.documentElement.scrollWidth,
                        viewportWidth: innerWidth,
                    };
                });
                assert(
                    metrics.pageWidth <= metrics.viewportWidth + 1,
                    JSON.stringify(metrics),
                );
                if (metrics.fits) {
                    assertEquals(metrics.owners, [
                        "document-editor-scroll-area",
                    ]);
                } else {
                    assertEquals(
                        metrics.owners.filter((owner) =>
                            owner === "document-editor-scroll-area"
                        ),
                        ["document-editor-scroll-area"],
                    );
                    const chrome = metrics.owners.filter((owner) =>
                        owner !== "document-editor-scroll-area"
                    );
                    assert(
                        chrome.length <= 1 &&
                            chrome.every((owner) =>
                                owner === "document-editor-container" ||
                                owner === "workspace-body"
                            ),
                        JSON.stringify(metrics),
                    );
                }
                const scroll = host.locator(".document-editor-scroll-area");
                const point = await visiblePoint(scroll);
                const before = await host.evaluate((node) => ({
                    body: node.querySelector<HTMLElement>(
                        ".document-editor-scroll-area",
                    )!.scrollTop,
                    chrome: node.querySelector<HTMLElement>(
                        ".document-editor-container",
                    )!.scrollTop,
                }));
                await page.mouse.move(point.x, point.y);
                await page.mouse.wheel(0, 300);
                await page.waitForFunction(
                    (before) =>
                        document.querySelector<HTMLElement>(
                            ".document-editor-scroll-area",
                        )!.scrollTop > before + 1,
                    before.body,
                );
                assertEquals(
                    await host.locator(".document-editor-container").evaluate((
                        node,
                    ) => node.scrollTop),
                    before.chrome,
                    "wheel inside body must not also scroll chrome",
                );
                await visiblePoint(
                    host.locator(".ProseMirror p").filter({
                        hasText: "LASTHOST158",
                    }),
                    10,
                );
                await visiblePoint(
                    host.locator(".ProseMirror p").filter({
                        hasText: "FIRSTHOST158",
                    }),
                    10,
                );
                await host.getByRole("button", {
                    name: "Markdown 源码",
                    exact: true,
                })
                    .click();
                const source = host.getByRole("textbox", {
                    name: "Markdown 源码正文",
                    exact: true,
                });
                await visiblePoint(source);
                await source.focus();
                await page.keyboard.press("Control+End");
                assertEquals(await source.inputValue(), body);
                await page.waitForFunction(() => {
                    const source = document.querySelector<HTMLTextAreaElement>(
                        ".document-source-textarea",
                    )!;
                    return source.selectionStart === source.value.length &&
                        source.scrollTop > 0;
                });
                await visiblePoint(source);
                await host.getByRole("button", {
                    name: "返回上一级",
                    exact: true,
                }).click();
                await host.locator(
                    ".documents-workspace-list [data-document-id]",
                ).nth(32).waitFor();
                const libraryScroll = host.locator(".workspace-body");
                const libraryPoint = await visiblePoint(libraryScroll);
                await page.mouse.move(libraryPoint.x, libraryPoint.y);
                await page.mouse.wheel(0, 300);
                await page.waitForFunction(() =>
                    document.querySelector<HTMLElement>(".workspace-body")!
                        .scrollTop > 0
                );
                await host.getByRole("button", {
                    name: "收起工作区",
                    exact: true,
                }).click();
                await host.waitFor({ state: "detached" });
            }),
        );
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(app.origin + "/");
    await page.locator('button[data-workspace="apps"]').first().click();
    const appsScroll = page.locator(".workspace-panel .workspace-body");
    const appsPoint = await visiblePoint(appsScroll);
    await page.mouse.move(appsPoint.x, appsPoint.y);
    await page.mouse.wheel(0, 300);
    await page.waitForFunction(() =>
        document.querySelector<HTMLElement>(".workspace-body")!.scrollTop > 0
    );
    await visiblePoint(
        page.getByRole("button", { name: "打开 Host app 31", exact: true }),
    );
    assertEquals(errors, []);
});
