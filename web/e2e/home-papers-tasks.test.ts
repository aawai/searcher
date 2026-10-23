import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("Home paper task checkboxes toggle directly and save through the document version", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser();
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
    const documentId = await page.evaluate(async () => {
        const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "直接勾选",
                body:
                    "- [ ] 第一项\n- [x] 第二项\n\n```\n- [ ] 代码里的不是任务\n```",
                isHomeFixed: true,
            }),
        });
        return (await response.json()).data.id as string;
    });
    await page.reload();
    const paper = page.locator(".floating-notes .note-card").filter({
        hasText: "第一项",
    });
    const first = paper.getByRole("checkbox", {
        name: "未完成任务，点击标记为已完成",
    });
    await Promise.all([
        page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            response.url().endsWith(`/api/documents/${documentId}`) &&
            response.ok()
        ),
        first.click(),
    ]);
    await paper.getByRole("checkbox", { name: /已完成任务，点击标记为未完成/ })
        .first().waitFor();

    const body = await page.evaluate(
        async (id) =>
            (await (await fetch(`/api/documents/${id}`)).json()).data
                .body as string,
        documentId,
    );
    assertEquals(
        body,
        "- [x] 第一项\n- [x] 第二项\n\n```\n- [ ] 代码里的不是任务\n```",
    );

    await page.reload();
    await paper.waitFor();
    assertEquals(
        await paper.getByRole("checkbox", {
            name: "已完成任务，点击标记为未完成",
        }).count(),
        2,
    );
});
