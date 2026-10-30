import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { eq } from "drizzle-orm";
import type {
    Browser,
    BrowserContext,
    BrowserContextOptions,
    Page,
} from "playwright";
import { aiModels } from "../../src/db/ai-schema.ts";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

type StorageState = Exclude<
    NonNullable<BrowserContextOptions["storageState"]>,
    string
>;

const FIRST_WORDS = "你好，";
const LAST_WORDS = "世界。";
const ENCRYPTION_KEY = "ai-window-e2e-key";

/**
 * An OpenAI-compatible provider that streams its first words at once and the
 * rest only after `release()`. Every request dropped before the reply was
 * complete is counted as the client leaving.
 */
function startFakeProvider() {
    const encoder = new TextEncoder();
    let gate = Promise.withResolvers<void>();
    gate.resolve();
    let aborts = 0;
    let abortWaiters: (() => void)[] = [];
    const frame = (value: unknown) =>
        encoder.encode(
            `data: ${
                typeof value === "string" ? value : JSON.stringify(value)
            }\n\n`,
        );
    const chunk = (
        delta: Record<string, unknown>,
        finish: string | null = null,
    ) => ({
        id: "chatcmpl-fake",
        object: "chat.completion.chunk",
        created: 0,
        model: "fake-model",
        choices: [{ index: 0, delta, finish_reason: finish }],
    });
    const server = Deno.serve(
        { hostname: "127.0.0.1", port: 0, onListen() {} },
        async (request) => {
            const url = new URL(request.url);
            if (url.pathname === "/v1/models") {
                return Response.json({
                    object: "list",
                    data: [{ id: "fake-model", object: "model" }],
                });
            }
            if (
                url.pathname !== "/v1/chat/completions" ||
                request.method !== "POST"
            ) return new Response("not found", { status: 404 });
            const body = await request.json() as { stream?: boolean };
            if (body.stream !== true) {
                return Response.json({
                    choices: [{
                        index: 0,
                        message: { role: "assistant", content: "标题" },
                        finish_reason: "stop",
                    }],
                });
            }
            let complete = false;
            request.signal.addEventListener("abort", () => {
                if (complete) return;
                aborts++;
                const waiters = abortWaiters;
                abortWaiters = [];
                for (const waiter of waiters) waiter();
            }, { once: true });
            const signal = request.signal;
            return new Response(
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(
                            frame(
                                chunk({
                                    role: "assistant",
                                    content: FIRST_WORDS,
                                }),
                            ),
                        );
                        void (async () => {
                            const aborted = new Promise<void>((resolve) =>
                                signal.addEventListener(
                                    "abort",
                                    () => resolve(),
                                    { once: true },
                                )
                            );
                            await Promise.race([gate.promise, aborted]);
                            try {
                                if (signal.aborted) {
                                    controller.close();
                                    return;
                                }
                                controller.enqueue(
                                    frame(chunk({ content: LAST_WORDS })),
                                );
                                controller.enqueue(frame(chunk({}, "stop")));
                                controller.enqueue(frame("[DONE]"));
                                complete = true;
                                controller.close();
                            } catch {
                                // The client already left.
                            }
                        })();
                    },
                }),
                { headers: { "content-type": "text/event-stream" } },
            );
        },
    );

    return {
        origin: `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`,
        abortCount: () => aborts,
        /** The next answers stream their first words, then wait for the release. */
        hold(): () => void {
            gate.resolve();
            gate = Promise.withResolvers<void>();
            return gate.resolve;
        },
        release: () => gate.resolve(),
        /** Resolves once the provider has seen more than `since` dropped requests. */
        async abortedSince(since: number): Promise<void> {
            if (aborts > since) return;
            const { promise, resolve } = Promise.withResolvers<void>();
            abortWaiters.push(resolve);
            const expired = Promise.withResolvers<never>();
            AbortSignal.timeout(10_000).addEventListener(
                "abort",
                () =>
                    expired.reject(
                        new Error("the provider saw no dropped request"),
                    ),
                { once: true },
            );
            await Promise.race([promise, expired.promise]);
        },
        close: () => server.shutdown(),
    };
}

const aiWindow = (page: Page) => page.locator('[data-window-id="ai"]');
const composer = (page: Page) =>
    aiWindow(page).getByRole("textbox", { name: "向 AI 提问" });
const dialog = (page: Page) => page.getByRole("alertdialog");
const conversationId = (page: Page) =>
    new URL(page.url()).pathname.split("/")[2];
const asked = (page: Page) => page.waitForURL(/\/ask\/[^/]+$/);

async function ask(page: Page, text: string) {
    await composer(page).fill(text);
    await composer(page).press("Enter");
}

async function windowText(page: Page, text: string) {
    await page.waitForFunction(
        (needle) =>
            document.querySelector('[data-window-id="ai"]')?.textContent
                ?.includes(needle) === true,
        text,
    );
}

async function openAi(page: Page, origin: string) {
    await page.locator('[data-dock-id="ai"]').click();
    await page.waitForURL(origin + "/ask");
    await aiWindow(page).waitFor({ state: "visible" });
    await composer(page).waitFor({ state: "visible" });
}

Deno.test("AI 窗口：后台保活、关闭 / 切换保护、临时会话与后台命名 #338 C3", async (t) => {
    const previousKey = Deno.env.get("ENCRYPTION_KEY");
    Deno.env.set("ENCRYPTION_KEY", previousKey ?? ENCRYPTION_KEY);
    const fake = startFakeProvider();
    const app = await startProductionApp();
    const browser: Browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });

    const sessions = new Map<string, StorageState>();
    async function sessionOf(
        user: { username: string; password: string },
    ): Promise<StorageState> {
        const known = sessions.get(user.username);
        if (known) return known;
        const context = await browser.newContext();
        try {
            await loginAndVisit(await context.newPage(), app.origin, "/", user);
            const state = await context.storageState();
            sessions.set(user.username, state);
            return state;
        } finally {
            await context.close();
        }
    }

    const user = await app.seedAskFixtureUser({
        username: "ai_window",
        password: "ai-window-Password-237!",
    });
    await app.store.run((db) =>
        db.update(aiModels).set({ enabled: false }).where(
            eq(aiModels.providerId, user.providerId),
        ).run()
    );
    {
        const context = await browser.newContext({
            storageState: await sessionOf(user),
        });
        try {
            const created = await context.request.post(
                app.origin + "/api/ai/providers",
                {
                    headers: { Origin: app.origin },
                    data: {
                        name: "Fake provider",
                        baseUrl: `${fake.origin}/v1`,
                        apiKey: "sk-fake",
                        scope: "user",
                    },
                },
            );
            assert(created.ok(), await created.text());
        } finally {
            await context.close();
        }
    }

    async function newPage(
        options: {
            viewport?: { width: number; height: number };
            /** Controls timers, so a long wait can be skipped. */
            clock?: boolean;
        } = {},
    ): Promise<{ page: Page; context: BrowserContext; releases: string[] }> {
        const context = await browser.newContext({
            viewport: options.viewport ?? { width: 1440, height: 900 },
            storageState: await sessionOf(user),
        });
        context.setDefaultTimeout(8_000);
        if (options.clock) {
            await context.clock.install();
            await context.clock.resume();
        }
        const page = await context.newPage();
        const releases: string[] = [];
        page.on("request", (request) => {
            if (
                request.method() === "DELETE" &&
                request.url().endsWith("/temporary")
            ) releases.push(request.url());
        });
        await page.goto(app.origin);
        await page.locator("#search-query").waitFor({ state: "visible" });
        return { page, context, releases };
    }

    async function conversation(page: Page, id: string) {
        const response = await page.request.get(
            `${app.origin}/api/ai/conversations/${id}`,
        );
        return {
            status: response.status(),
            body: response.ok() ? (await response.json()).data : null,
        };
    }

    try {
        await t.step(
            "opens at its own size, keeps streaming in the background and restores",
            async () => {
                const { page, context, releases } = await newPage();
                try {
                    fake.hold();
                    await openAi(page, app.origin);
                    const box = await aiWindow(page).boundingBox();
                    assert(box);
                    assertEquals([box.width, box.height], [960, 720]);
                    assertEquals(
                        await aiWindow(page).getAttribute("aria-label"),
                        "AI 问答",
                    );
                    await ask(page, "第一个问题");
                    await windowText(page, FIRST_WORDS);
                    await asked(page);
                    const id = conversationId(page);
                    const aborts = fake.abortCount();

                    await page.locator('[data-dock-id="settings"]').click();
                    await page.waitForURL(app.origin + "/settings");
                    await page.locator('[data-window-id="settings"]').waitFor({
                        state: "visible",
                    });
                    assert(await aiWindow(page).isVisible());
                    assertEquals(
                        await aiWindow(page).getAttribute("aria-hidden"),
                        "true",
                    );
                    assertEquals(await dialog(page).count(), 0);
                    fake.release();
                    await windowText(page, LAST_WORDS);
                    assertEquals(fake.abortCount(), aborts);

                    await page.locator('[data-dock-id="home"]').click();
                    await page.waitForURL(app.origin + "/");
                    await aiWindow(page).waitFor({ state: "hidden" });
                    await page.locator('[data-dock-id="ai"]').click();
                    await page.waitForURL(`${app.origin}/ask/${id}`);
                    await aiWindow(page).waitFor({ state: "visible" });
                    await windowText(page, LAST_WORDS);
                    assertEquals(await dialog(page).count(), 0);
                    assertEquals(releases.length, 0);

                    // Nothing is at risk: closing needs no confirmation.
                    await page.getByRole("button", { name: "关闭AI 问答" })
                        .click();
                    await page.waitForURL(app.origin + "/");
                    await aiWindow(page).waitFor({ state: "hidden" });
                    assertEquals(await dialog(page).count(), 0);
                    const saved = await conversation(page, id);
                    assertEquals(saved.status, 200);
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "closing a generating conversation asks first and keeps what was written",
            async () => {
                const { page, context } = await newPage();
                try {
                    fake.hold();
                    await openAi(page, app.origin);
                    await ask(page, "会被中断的问题");
                    await windowText(page, FIRST_WORDS);
                    await asked(page);
                    const id = conversationId(page);
                    const aborts = fake.abortCount();

                    await page.getByRole("button", { name: "关闭AI 问答" })
                        .click();
                    await dialog(page).waitFor();
                    assert(
                        (await dialog(page).textContent())?.includes(
                            "已生成的内容保留在历史会话中",
                        ),
                    );
                    await dialog(page).getByRole("button", { name: "取消" })
                        .click();
                    await dialog(page).waitFor({ state: "hidden" });
                    assertEquals(page.url(), `${app.origin}/ask/${id}`);
                    assert(await aiWindow(page).isVisible());
                    assertEquals(fake.abortCount(), aborts);

                    await page.getByRole("button", { name: "关闭AI 问答" })
                        .click();
                    await dialog(page).getByRole("button", { name: "仍要关闭" })
                        .click();
                    await page.waitForURL(app.origin + "/");
                    await aiWindow(page).waitFor({ state: "hidden" });
                    await fake.abortedSince(aborts);
                    await page.waitForFunction(async (url) => {
                        const response = await fetch(url);
                        if (!response.ok) return false;
                        const { data } = await response.json();
                        const reply = data.messages.findLast((
                            message: { role: string },
                        ) => message.role === "assistant");
                        return reply?.status === "interrupted" &&
                            reply.content.includes("你好，");
                    }, `${app.origin}/api/ai/conversations/${id}`);
                } finally {
                    fake.release();
                    await context.close();
                }
            },
        );

        await t.step(
            "a temporary conversation survives minimizing and is deleted only when closing is confirmed",
            async () => {
                const { page, context, releases } = await newPage();
                try {
                    fake.release();
                    await openAi(page, app.origin);
                    await page.getByRole("button", { name: "更多操作" })
                        .click();
                    await page.getByRole("menuitem", { name: "转为临时对话" })
                        .click();
                    await ask(page, "临时问题");
                    await windowText(page, LAST_WORDS);
                    await asked(page);
                    const id = conversationId(page);

                    await page.getByRole("button", { name: "最小化AI 问答" })
                        .click();
                    await aiWindow(page).waitFor({ state: "hidden" });
                    await page.locator('[data-dock-id="ai"]').click();
                    await aiWindow(page).waitFor({ state: "visible" });
                    assertEquals(releases.length, 0);
                    assertEquals((await conversation(page, id)).status, 200);

                    await page.getByRole("button", { name: "关闭AI 问答" })
                        .click();
                    await dialog(page).waitFor();
                    assert(
                        (await dialog(page).textContent())?.includes(
                            "临时会话及其消息、附件和未发送的输入将被删除",
                        ),
                    );
                    await dialog(page).getByRole("button", { name: "取消" })
                        .click();
                    assertEquals(releases.length, 0);
                    await page.getByRole("button", { name: "关闭AI 问答" })
                        .click();
                    await dialog(page).getByRole("button", { name: "仍要关闭" })
                        .click();
                    await aiWindow(page).waitFor({ state: "hidden" });
                    await page.waitForFunction(
                        async (url) => (await fetch(url)).status === 404,
                        `${app.origin}/api/ai/conversations/${id}`,
                    );
                    assertEquals(releases.length, 1);
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "a minimized temporary conversation keeps renewing its lease",
            async () => {
                const { page, context } = await newPage({ clock: true });
                try {
                    fake.release();
                    await openAi(page, app.origin);
                    await page.getByRole("button", { name: "更多操作" })
                        .click();
                    await page.getByRole("menuitem", { name: "转为临时对话" })
                        .click();
                    await ask(page, "长时间最小化的临时问题");
                    await windowText(page, LAST_WORDS);
                    await asked(page);
                    const id = conversationId(page);
                    await page.getByRole("button", { name: "最小化AI 问答" })
                        .click();
                    await aiWindow(page).waitFor({ state: "hidden" });
                    // A renewal period passes while the window stays minimized.
                    const renewal = page.waitForResponse((response) =>
                        response.request().method() === "PUT" &&
                        /\/temporary\/leases\//.test(response.url())
                    );
                    await context.clock.fastForward("06:00");
                    assert((await renewal).ok());
                    assertEquals((await conversation(page, id)).status, 200);
                    await page.locator('[data-dock-id="ai"]').click();
                    await aiWindow(page).waitFor({ state: "visible" });
                    await windowText(page, LAST_WORDS);
                    assertEquals(await dialog(page).count(), 0);
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "replacing a generating conversation asks, for the sidebar and for history moves",
            async () => {
                const { page, context } = await newPage();
                try {
                    fake.release();
                    await openAi(page, app.origin);
                    await ask(page, "第一轮问题");
                    await windowText(page, LAST_WORDS);
                    await asked(page);
                    fake.hold();
                    await page.getByRole("button", { name: /新建对话/ })
                        .click();
                    await page.waitForURL(app.origin + "/ask");
                    await page.waitForFunction(() =>
                        !document.querySelector(
                            '[data-window-id="ai"] .ask-assistant-body',
                        )
                    );
                    await ask(page, "正在生成的问题");
                    await windowText(page, FIRST_WORDS);
                    await asked(page);
                    const streaming = page.url();
                    const aborts = fake.abortCount();

                    await aiWindow(page).locator(".ask-sidebar").getByRole(
                        "button",
                        { name: "第一轮问题", exact: true },
                    ).click();
                    await dialog(page).waitFor();
                    assert(
                        (await dialog(page).textContent())?.includes(
                            "切换会话？",
                        ),
                    );
                    await dialog(page).getByRole("button", { name: "取消" })
                        .click();
                    await dialog(page).waitFor({ state: "hidden" });
                    assertEquals(page.url(), streaming);
                    assertEquals(fake.abortCount(), aborts);

                    // Back to the earlier conversation is also a replacement.
                    await page.goBack();
                    await dialog(page).waitFor();
                    await dialog(page).getByRole("button", { name: "取消" })
                        .click();
                    await dialog(page).waitFor({ state: "hidden" });
                    assertEquals(page.url(), streaming);
                    assertEquals(fake.abortCount(), aborts);

                    await page.goBack();
                    await dialog(page).waitFor();
                    await dialog(page).getByRole("button", { name: "继续切换" })
                        .click();
                    await page.waitForURL((url) =>
                        url.toString() !== streaming
                    );
                    await fake.abortedSince(aborts);
                } finally {
                    fake.release();
                    await context.close();
                }
            },
        );

        await t.step(
            "a conversation named while the window is behind keeps the address and aligns on return",
            async () => {
                const { page, context } = await newPage();
                try {
                    fake.release();
                    const gate = Promise.withResolvers<void>();
                    await page.route("**/api/ai/chat/stream", async (route) => {
                        await gate.promise;
                        await route.continue();
                    });
                    await openAi(page, app.origin);
                    await ask(page, "后台命名的问题");
                    await page.locator('[data-dock-id="settings"]').click();
                    await page.waitForURL(app.origin + "/settings");
                    gate.resolve();
                    await page.waitForFunction(async () => {
                        const response = await fetch("/api/ai/conversations");
                        const { data } = await response.json();
                        return data.some((item: { title: string }) =>
                            item.title.includes("后台命名")
                        );
                    });
                    await windowText(page, LAST_WORDS);
                    // The address belongs to the active window: it did not move.
                    assertEquals(page.url(), app.origin + "/settings");
                    await page.locator('[data-dock-id="ai"]').click();
                    await page.waitForURL(/\/ask\/[^/]+$/);
                    const named = page.url();
                    assertNotEquals(named, app.origin + "/ask");

                    await page.goBack();
                    await page.waitForURL(app.origin + "/settings");
                    await page.goBack();
                    await page.waitForURL(named);
                    assert(await aiWindow(page).isVisible());
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "the keyboard can move, minimize and restore the AI window",
            async () => {
                const { page, context } = await newPage();
                try {
                    fake.release();
                    await openAi(page, app.origin);
                    const before = await aiWindow(page).boundingBox();
                    assert(before);
                    const menu = page.getByRole("button", {
                        name: "AI 问答窗口菜单",
                    });
                    await menu.focus();
                    await page.keyboard.press("Enter");
                    await page.getByRole("menuitem", { name: "移动窗口" })
                        .waitFor();
                    await page.keyboard.press("Enter");
                    await page.waitForFunction(() =>
                        !document.querySelector(
                            '[aria-label="AI 问答窗口菜单"][aria-expanded="true"]',
                        )
                    );
                    await page.keyboard.press("ArrowRight");
                    await page.waitForFunction(
                        (x) =>
                            document.querySelector('[data-window-id="ai"]')!
                                .getBoundingClientRect().x > x,
                        before.x,
                    );
                    await page.keyboard.press("Enter");

                    await page.getByRole("button", { name: "最小化AI 问答" })
                        .focus();
                    await page.keyboard.press("Enter");
                    await aiWindow(page).waitFor({ state: "hidden" });
                    await page.locator('[data-dock-id="ai"]').focus();
                    await page.keyboard.press("Enter");
                    await aiWindow(page).waitFor({ state: "visible" });
                    assertEquals(await dialog(page).count(), 0);
                    await page.getByRole("button", { name: "关闭AI 问答" })
                        .focus();
                    await page.keyboard.press("Enter");
                    await aiWindow(page).waitFor({ state: "hidden" });
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "signing out asks while an answer is generating",
            async () => {
                const { page, context } = await newPage();
                try {
                    fake.hold();
                    await openAi(page, app.origin);
                    await ask(page, "退出前的问题");
                    await windowText(page, FIRST_WORDS);
                    await page.getByRole("button", { name: /用户菜单/ })
                        .click();
                    await page.getByRole("menuitem", { name: "退出登录" })
                        .click();
                    await dialog(page).waitFor();
                    assert(
                        (await dialog(page).textContent())?.includes(
                            "退出登录？",
                        ),
                    );
                    await dialog(page).getByRole("button", { name: "取消" })
                        .click();
                    await dialog(page).waitFor({ state: "hidden" });
                    assert(await aiWindow(page).isVisible());
                } finally {
                    fake.release();
                    await context.close();
                }
            },
        );
    } finally {
        await browser.close();
        await fake.close();
        await app.close();
        if (previousKey === undefined) Deno.env.delete("ENCRYPTION_KEY");
        else Deno.env.set("ENCRYPTION_KEY", previousKey);
    }
});
