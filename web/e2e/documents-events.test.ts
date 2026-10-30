import { assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { openNotes } from "./helpers/library.ts";

declare global {
    var __documentStreams: EventSource[];
}

Deno.test("document editor opens share events and preserve conflict drafts", async () => {
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
    await page.addInitScript(() => {
        const NativeEventSource = globalThis.EventSource;
        const sources: EventSource[] = [];
        globalThis.__documentStreams = sources;
        globalThis.EventSource = class extends NativeEventSource {
            constructor(url: string | URL, options?: EventSourceInit) {
                super(url, options);
                if (String(url).endsWith("/api/documents/events")) {
                    sources.push(this);
                }
            }
        };
    });
    await loginAndVisit(page, app.origin, "/", credentials);
    const seeded = await page.evaluate(async () => {
        const request = async (url: string, body: unknown, method = "POST") => {
            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(await response.text());
            return (await response.json()).data;
        };
        const created: Array<
            { id: string; title: string; body: string; version: number }
        > = [];
        for (let i = 1; i <= 3; i++) {
            created.push(
                await request("/api/documents", {
                    title: `共享连接 ${i}`,
                    body: `初始正文 ${i}`,
                }),
            );
        }
        return created;
    });
    await page.reload();
    await openNotes(page);
    for (const item of seeded) {
        await page.locator(`[data-document-id="${item.id}"] h4 button`).click();
        await page.waitForFunction(
            (title) =>
                document.querySelector<HTMLInputElement>(
                    'input[aria-label="笔记标题"], textarea[aria-label="笔记标题"]',
                )?.value === title,
            item.title,
        );
        await page.locator(".document-editor-container .ProseMirror").waitFor();
    }
    // Only the open editor subscribes; opening another document closes the
    // previous stream. Exactly one stream may be live at any moment.
    await page.waitForFunction(() => {
        const live = globalThis.__documentStreams.filter((stream) =>
            stream.readyState !== EventSource.CLOSED
        );
        return live.length === 1 && live[0].readyState === EventSource.OPEN;
    });
    const remoteUpdate = async (id: string, body: string) => {
        await page.evaluate(async ({ id, body }) => {
            const current = (await (await fetch(`/api/documents/${id}`)).json())
                .data;
            const response = await fetch(`/api/documents/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ version: current.version, body }),
            });
            if (!response.ok) throw new Error(await response.text());
        }, { id, body });
    };
    await remoteUpdate(seeded[2].id, "静默同步的云端正文");
    await page.waitForFunction(
        () =>
            document.querySelector(
                ".document-editor-container .ProseMirror",
            )?.textContent === "静默同步的云端正文",
    );
    assertEquals(
        await page.getByRole("dialog", { name: "发现版本冲突" }).count(),
        0,
    );
    const dirty = page.locator(".document-editor-container .ProseMirror");
    await dirty.fill("不得丢失的本地草稿");
    await remoteUpdate(seeded[2].id, "另一设备的新正文");
    const conflict = page.getByRole("dialog", { name: "发现版本冲突" });
    await conflict.waitFor();
    const localMarkdown = await conflict.getByRole("textbox", {
        name: "合并内容",
        exact: true,
    }).inputValue();
    await conflict.getByRole("button", { name: "暂不处理", exact: true })
        .click();
    await conflict.waitFor({ state: "hidden" });
    assertEquals(await dirty.textContent(), "不得丢失的本地草稿");
    await page.getByRole("button", { name: "处理冲突", exact: true })
        .click();
    await conflict.getByRole("button", { name: "用我的版本", exact: true })
        .click();
    await page.getByRole("alertdialog").getByRole("button", {
        name: "返回",
        exact: true,
    }).click();
    assertEquals(await dirty.textContent(), "不得丢失的本地草稿");
    await page.route(
        "**/api/documents",
        (route) =>
            route.request().method() === "POST"
                ? route.abort("failed")
                : route.continue(),
    );
    await conflict.getByRole("button", { name: "复制草稿", exact: true })
        .click();
    await conflict.getByRole("alert").waitFor();
    assertEquals(await dirty.textContent(), "不得丢失的本地草稿");
    await page.unroute("**/api/documents");
    const copyResponse = page.waitForResponse((response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/documents"
    );
    await conflict.getByRole("button", { name: "复制草稿", exact: true })
        .click();
    const copy = (await (await copyResponse).json()).data as {
        id: string;
        body: string;
    };
    assertEquals(copy.body, localMarkdown);
    await conflict.waitFor({ state: "hidden" });
    await page.waitForFunction(
        () =>
            document.querySelector(
                ".document-editor-container .ProseMirror",
            )?.textContent === "另一设备的新正文",
    );
    const saved = await page.evaluate(async ({ original, copy }) => {
        const read = async (id: string) =>
            (await (await fetch(`/api/documents/${id}`)).json())
                .data as { id: string; body: string };
        return {
            original: (await read(original)).body,
            copy: (await read(copy)).body,
        };
    }, { original: seeded[2].id, copy: copy.id });
    assertEquals(saved, {
        original: "另一设备的新正文",
        copy: localMarkdown,
    });
    // Switching notes keeps the one shared stream: Home papers stay live.
    await page.waitForFunction(() => {
        const live = globalThis.__documentStreams.filter((stream) =>
            stream.readyState !== EventSource.CLOSED
        );
        return live.length === 1 && live[0].readyState === EventSource.OPEN;
    });
    await page.locator(`[data-document-id="${seeded[0].id}"] h4 button`)
        .click();
    await page.waitForFunction(() =>
        globalThis.__documentStreams.some((stream) =>
            stream.readyState === EventSource.OPEN
        )
    );
    await page.getByRole("button", { name: /^用户菜单/ }).click();
    await page.getByRole("menuitem", { name: "退出登录", exact: true }).click();
    await page.waitForFunction(() =>
        globalThis.__documentStreams.every((stream) =>
            stream.readyState === EventSource.CLOSED
        )
    );
    await page.getByRole("link", { name: "登录", exact: true }).first()
        .waitFor();
});
