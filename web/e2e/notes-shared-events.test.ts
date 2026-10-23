import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

declare global {
    var __noteStreams: EventSource[];
}

Deno.test("note editor opens share events and preserve conflict drafts", async () => {
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
        globalThis.__noteStreams = sources;
        globalThis.EventSource = class extends NativeEventSource {
            constructor(url: string | URL, options?: EventSourceInit) {
                super(url, options);
                if (String(url).endsWith("/api/notes/events")) {
                    sources.push(this);
                }
            }
        };
    });
    await loginAndVisit(page, app.origin, "/", credentials);
    const notes = await page.evaluate(async () => {
        const request = async (url: string, body: unknown, method = "POST") => {
            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(await response.text());
            return (await response.json()).data;
        };
        const notes: Array<
            { id: string; title: string; body: string; version: number }
        > = [];
        for (let i = 1; i <= 3; i++) {
            notes.push(
                await request("/api/notes", {
                    title: `共享连接 ${i}`,
                    body: `初始正文 ${i}`,
                }),
            );
        }
        return notes;
    });
    await page.reload();
    await page.locator('.zen-edge-btn[data-workspace="notes"]').click();
    for (const [index, note] of notes.entries()) {
        if (index > 0) {
            await page.getByRole("button", {
                name: "返回便签列表",
                exact: true,
            })
                .click();
        }
        await page.locator(".notes-workspace-list .note-title").filter({
            hasText: note.title,
        }).click();
        await page.waitForFunction(
            (title) =>
                document.querySelector<HTMLInputElement>(
                    '.workspace-panel input[aria-label="便签标题"]',
                )?.value === title,
            note.title,
        );
        await page.locator(
            ".workspace-panel .note-live-editor .ProseMirror",
        ).waitFor();
    }
    // The panel shows one editor at a time, so each open subscribes anew and
    // the previous stream closes. Exactly one stream may be live at any moment.
    await page.waitForFunction(() => {
        const live = globalThis.__noteStreams.filter((stream) =>
            stream.readyState !== EventSource.CLOSED
        );
        return live.length === 1 && live[0].readyState === EventSource.OPEN;
    });
    const remoteUpdate = async (id: string, body: string) => {
        await page.evaluate(async ({ id, body }) => {
            const note = (await (await fetch(`/api/notes/${id}`)).json()).data;
            const response = await fetch(`/api/notes/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ version: note.version, body }),
            });
            if (!response.ok) throw new Error(await response.text());
        }, { id, body });
    };
    await remoteUpdate(notes[2].id, "静默同步的云端正文");
    await page.waitForFunction(
        () =>
            document.querySelector(
                ".workspace-panel .note-live-editor .ProseMirror",
            )?.textContent === "静默同步的云端正文",
    );
    assertEquals(
        await page.getByRole("dialog", { name: "发现版本冲突" }).count(),
        0,
    );
    const dirty = page.locator(
        ".workspace-panel .note-live-editor .ProseMirror",
    );
    await dirty.fill("不得丢失的本地草稿");
    await remoteUpdate(notes[2].id, "另一设备的新正文");
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
    await page.getByRole("button", { name: "处理版本冲突", exact: true })
        .click();
    await conflict.getByRole("button", { name: "用我的版本", exact: true })
        .click();
    await page.getByRole("alertdialog").getByRole("button", {
        name: "返回",
        exact: true,
    }).click();
    assertEquals(await dirty.textContent(), "不得丢失的本地草稿");
    await page.route(
        "**/api/notes",
        (route) =>
            route.request().method() === "POST"
                ? route.abort("failed")
                : route.continue(),
    );
    await conflict.getByRole("button", { name: "另存副本", exact: true })
        .click();
    await conflict.getByRole("alert").waitFor();
    assertEquals(await dirty.textContent(), "不得丢失的本地草稿");
    await page.unroute("**/api/notes");
    const copyResponse = page.waitForResponse((response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/notes"
    );
    await conflict.getByRole("button", { name: "另存副本", exact: true })
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
                ".workspace-panel .note-live-editor .ProseMirror",
            )?.textContent === "另一设备的新正文",
    );
    const saved = await page.evaluate(async ({ original, copy }) => {
        const list = (await (await fetch("/api/notes")).json()).data as Array<
            { id: string; body: string }
        >;
        return {
            original: list.find((note) => note.id === original)?.body,
            copy: list.find((note) => note.id === copy)?.body,
        };
    }, { original: notes[2].id, copy: copy.id });
    assertEquals(saved, {
        original: "另一设备的新正文",
        copy: localMarkdown,
    });
    await page.getByRole("button", { name: "收起工作区", exact: true }).click();
    await page.locator(".workspace-panel").waitFor({ state: "detached" });
    await page.waitForFunction(() =>
        globalThis.__noteStreams.every((stream) =>
            stream.readyState === EventSource.CLOSED
        )
    );
    await page.locator('.zen-edge-btn[data-workspace="notes"]').click();
    await page.locator(".notes-workspace-list .note-title").filter({
        hasText: notes[0].title,
    }).click();
    await page.waitForFunction(() =>
        globalThis.__noteStreams.some((stream) =>
            stream.readyState === EventSource.OPEN
        )
    );
    await page.getByRole("button", { name: /^用户菜单/ }).click();
    await page.getByRole("menuitem", { name: "退出登录", exact: true }).click();
    await page.waitForFunction(() =>
        globalThis.__noteStreams.every((stream) =>
            stream.readyState === EventSource.CLOSED
        )
    );
    await page.getByRole("link", { name: "登录", exact: true }).first()
        .waitFor();
});
