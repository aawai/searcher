import { assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("home-papers-document: 220x220 geometry and lightweight home load without editor chunk", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const credentials = await app.seedAskFixtureUser({
        username: "home_doc_user",
        password: "Home-doc-pass-123!",
    });

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });

    await loginAndVisit(page, app.origin, "/", credentials);

    // 1. Seed a home-fixed document containing an image asset reference and a page-break
    await page.evaluate(async () => {
        const bodyContent =
            "# 封面笔记\n\n![示例图片](asset://sample-image-asset-id)\n\n<!-- pagebreak -->\n\n第二页内容";
        const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "首页便签文档",
                body: bodyContent,
                isHomeFixed: true,
                color: "sage",
            }),
        });
        if (!response.ok) throw new Error(await response.text());
        const data = (await response.json()).data as {
            id: string;
            title: string;
        };

        const layoutRes = await fetch(`/api/documents/${data.id}/layout`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                deviceClass: "desktop",
                x: 100,
                y: 100,
                expanded: true,
            }),
        });
        if (!layoutRes.ok) throw new Error(await layoutRes.text());
        return data;
    });
    // 2. Track network requests on reload to verify editor-vendor is NOT loaded on Home
    const requestedUrls: string[] = [];
    page.on("request", (req) => {
        requestedUrls.push(req.url());
    });

    await page.reload();
    // 3. Locate the pinned paper on Home
    const paper = page.locator(".floating-notes .note-card").filter({
        hasText: "首页便签文档",
    });
    await paper.waitFor({ state: "visible" });

    const position = page.locator(".floating-notes .note-position").filter({
        hasText: "首页便签文档",
    });
    const positionWidth = await position.evaluate((el) =>
        globalThis.getComputedStyle(el).width
    );
    const cardHeight = await paper.evaluate((el) =>
        globalThis.getComputedStyle(el).height
    );

    assertEquals(positionWidth, "220px");
    assertEquals(cardHeight, "220px");
    // Also assert client dimensions match 220px
    const rect = await paper.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { width: Math.round(r.width), height: Math.round(r.height) };
    });
    assertEquals(rect.width, 220);
    assertEquals(rect.height, 220);

    // 5. Verify editor chunk (editor-vendor) was NEVER requested on Home load
    const editorVendorRequested = requestedUrls.some((url) =>
        url.includes("editor-vendor")
    );
    assertEquals(
        editorVendorRequested,
        false,
        "editor-vendor bundle chunk must not be loaded on Home page",
    );
});
