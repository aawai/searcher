import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

declare global {
    var __noteStreams: EventSource[];
}

Deno.test("three note windows share events and preserve conflict drafts", async () => {
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
        await request("/api/preferences", { style: "widgets" }, "PATCH");
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
    let eventRequests = 0;
    page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/notes/events") {
            eventRequests++;
        }
    });
    for (const note of notes) {
        await page.locator('.desktop-dock button[data-workspace="notes"]')
            .click();
        await page.locator(".notes-workspace-list .note-title").filter({
            hasText: note.title,
        }).click();
        await page.locator(
            `.desktop-window[data-window-id="note:${note.id}"] .note-live-editor .ProseMirror`,
        ).waitFor();
    }
    await page.waitForFunction(() => {
        const streams = globalThis.__noteStreams;
        return streams.filter((stream) =>
            stream.readyState === EventSource.OPEN
        ).length === 1;
    });
    assertEquals(
        eventRequests,
        1,
        "opening three windows must not create three stream requests",
    );
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
    await remoteUpdate(notes[0].id, "静默同步的云端正文");
    await page.waitForFunction(
        (id) =>
            document.querySelector(
                `.desktop-window[data-window-id="note:${id}"] .ProseMirror`,
            )?.textContent === "静默同步的云端正文",
        notes[0].id,
    );
    assertEquals(
        await page.getByRole("dialog", { name: "发现版本冲突" }).count(),
        0,
    );
    const dirty = page.locator(
        `.desktop-window[data-window-id="note:${
            notes[2].id
        }"] .note-live-editor .ProseMirror`,
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
        (id) =>
            document.querySelector(
                `.desktop-window[data-window-id="note:${id}"] .ProseMirror`,
            )?.textContent === "另一设备的新正文",
        notes[2].id,
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
    for (const note of [...notes].reverse()) {
        await page.locator(
            `.desktop-dock [data-running-note="note:${note.id}"]`,
        ).click();
        await page.locator(`.desktop-window[data-window-id="note:${note.id}"]`)
            .getByRole("button", { name: "关闭便签", exact: true }).click();
    }
    await page.waitForFunction(() =>
        globalThis.__noteStreams.every((stream) =>
            stream.readyState === EventSource.CLOSED
        )
    );
    assertEquals(eventRequests, 1);
    await page.locator('.desktop-dock button[data-workspace="notes"]').click();
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
