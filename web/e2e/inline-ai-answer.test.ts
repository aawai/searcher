import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { eq } from "drizzle-orm";
import {
    type BrowserContext,
    type BrowserContextOptions,
    type Page,
} from "playwright";
import { chromium } from "./helpers/browser.ts";

type StorageState = Exclude<
    NonNullable<BrowserContextOptions["storageState"]>,
    string
>;
import { aiModels } from "../../src/db/ai-schema.ts";
import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { visitAsk } from "./helpers/ask.ts";

const QUESTION = "我的路线图是什么";
const NOTE_TITLE = "产品路线图";
const FIRST_TOKENS = "根据你的笔记";
const LAST_TOKENS = "下一步是发布。";
const FAKE_ENCRYPTION_KEY = "inline-ai-e2e-key";

type ChatBody = {
    messages: { role: string; content?: unknown }[];
    tools?: { function: { name: string } }[];
};

/**
 * An OpenAI-compatible provider that also plays SearXNG. It asks for the note
 * and web search tools first, then streams the answer; the answer's tail waits
 * for `hold()`'s release, and every dropped request is observable.
 */
function startFakeProvider() {
    const encoder = new TextEncoder();
    let gate = Promise.withResolvers<void>();
    gate.resolve();
    const chatBodies: ChatBody[] = [];
    let aborts = 0;
    let abortWaiters: (() => void)[] = [];

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
    const frame = (value: unknown) =>
        encoder.encode(
            `data: ${
                typeof value === "string" ? value : JSON.stringify(value)
            }\n\n`,
        );

    function toolRound(delivered: () => void): ReadableStream<Uint8Array> {
        return new ReadableStream({
            start(controller) {
                controller.enqueue(frame(chunk({
                    role: "assistant",
                    tool_calls: [
                        {
                            index: 0,
                            id: "call_web",
                            type: "function",
                            function: {
                                name: "web_search",
                                arguments: JSON.stringify({ query: "路线图" }),
                            },
                        },
                        {
                            index: 1,
                            id: "call_docs",
                            type: "function",
                            function: {
                                name: "lookup_documents",
                                arguments: JSON.stringify({ query: "路线图" }),
                            },
                        },
                    ],
                })));
                controller.enqueue(frame(chunk({}, "tool_calls")));
                controller.enqueue(frame("[DONE]"));
                delivered();
                controller.close();
            },
        });
    }

    function answerRound(
        signal: AbortSignal,
        delivered: () => void,
    ): ReadableStream<Uint8Array> {
        return new ReadableStream({
            start(controller) {
                controller.enqueue(
                    frame(chunk({ role: "assistant", content: FIRST_TOKENS })),
                );
                void (async () => {
                    const aborted = new Promise<void>((resolve) =>
                        signal.addEventListener("abort", () => resolve(), {
                            once: true,
                        })
                    );
                    await Promise.race([gate.promise, aborted]);
                    try {
                        if (signal.aborted) {
                            controller.close();
                            return;
                        }
                        controller.enqueue(
                            frame(chunk({ content: `，${LAST_TOKENS}` })),
                        );
                        controller.enqueue(frame(chunk({}, "stop")));
                        controller.enqueue(frame("[DONE]"));
                        delivered();
                        controller.close();
                    } catch {
                        // The client already left.
                    }
                })();
            },
        });
    }

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
            if (url.pathname === "/search") {
                return Response.json({
                    results: [{
                        title: "公开网页结果",
                        url: "https://example.com/roadmap",
                        content: "来自网络的片段",
                    }],
                });
            }
            if (
                url.pathname === "/v1/chat/completions" &&
                request.method === "POST"
            ) {
                const body = await request.json() as ChatBody;
                chatBodies.push(body);
                // Deno also fires "abort" once a response was delivered in full;
                // only a request dropped before that is the client leaving.
                let complete = false;
                request.signal.addEventListener("abort", () => {
                    if (complete) return;
                    aborts++;
                    const waiters = abortWaiters;
                    abortWaiters = [];
                    for (const waiter of waiters) waiter();
                }, { once: true });
                const answering = body.messages.some((message) =>
                    message.role === "tool"
                );
                const delivered = () => {
                    complete = true;
                };
                return new Response(
                    answering
                        ? answerRound(request.signal, delivered)
                        : toolRound(delivered),
                    { headers: { "content-type": "text/event-stream" } },
                );
            }
            return new Response("not found", { status: 404 });
        },
    );

    return {
        origin: `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`,
        chatBodies,
        abortCount: () => aborts,
        /** The next answer streams its first words, then waits for the release. */
        hold(): () => void {
            // A previous, unreleased hold must never strand later answers.
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

/** Reads the shared-element transitions the page ran, plus what animated. */
const TRANSITION_RECORDER = `(() => {
    window.__transitions = [];
    const original = document.startViewTransition?.bind(document);
    if (!original) return;
    const named = () => [...document.querySelectorAll("*")]
        .filter((element) => element.style.viewTransitionName &&
            element.style.viewTransitionName !== "none")
        .map((element) => element.style.viewTransitionName);
    document.startViewTransition = (callback) => {
        const record = { before: named(), after: null, animations: null };
        window.__transitions.push(record);
        const transition = original(async () => {
            await callback();
            record.after = named();
        });
        transition.ready.then(() => {
            record.animations = document.documentElement
                .getAnimations({ subtree: true })
                .map((animation) => ({
                    pseudo: animation.effect?.pseudoElement ?? null,
                    duration: animation.effect?.getComputedTiming().duration,
                    properties: [...new Set(
                        animation.effect.getKeyframes()
                            .flatMap((frame) => Object.keys(frame)),
                    )].filter((key) => ![
                        "offset", "easing", "composite", "computedOffset",
                    ].includes(key)),
                }));
        }).catch((error) => {
            record.animations = [];
            record.error = String(error);
        });
        // Cleanup runs after \`finished\` settles; mark it a task later.
        transition.finished.finally(() => setTimeout(() => {
            record.finished = true;
        }));
        return transition;
    };
})()`;

const NO_VIEW_TRANSITIONS = `(() => {
    window.__transitions = [];
    Object.defineProperty(Document.prototype, "startViewTransition", {
        value: undefined,
        configurable: true,
    });
})()`;

type TransitionRecord = {
    error?: string;
    before: string[];
    after: string[] | null;
    animations: {
        pseudo: string | null;
        duration: number;
        properties: string[];
    }[] | null;
};

const transitionsOf = (page: Page) =>
    page.evaluate<TransitionRecord[]>("window.__transitions");

const searchBox = (page: Page) => page.locator("#search-query");
const card = (page: Page) => page.getByRole("region", { name: "AI 回答" });
const suggestions = (page: Page) =>
    page.getByRole("listbox", { name: "搜索建议" });

async function mockWeb(context: BrowserContext) {
    await context.route(
        /\/api\/search\/suggestions\?/,
        (route) =>
            route.fulfill({
                contentType: "application/json",
                body: JSON.stringify({ status: true, data: [] }),
            }),
    );
    await context.route(
        /https:\/\/www\.bing\.com\//,
        (route) => route.fulfill({ status: 200, body: "search" }),
    );
}

async function openHome(page: Page, origin: string) {
    await page.goto(origin);
    await searchBox(page).waitFor({ state: "visible" });
}

async function askWithAltEnter(page: Page, text = QUESTION) {
    const search = searchBox(page);
    await search.fill(text);
    await page.getByRole("option", { name: /问 AI：/ }).waitFor();
    await search.press("Alt+Enter");
    await card(page).waitFor({ state: "visible" });
}

const searchIsFocused = (page: Page) =>
    page.waitForFunction(() => document.activeElement?.id === "search-query");

async function assertNoAiEntry(page: Page, origin: string) {
    await openHome(page, origin);
    assertEquals(
        await page.getByRole("link", { name: "AI 问答", exact: true }).count(),
        0,
        "no top-bar AI link on home",
    );
    await page.locator(".search-engine").click();
    await page.getByRole("menuitemradio").first().waitFor();
    assertEquals(
        await page.getByRole("menuitemradio", { name: "AI 问答" }).count(),
        0,
        "the engine menu offers no AI target",
    );
    await page.keyboard.press("Escape");
    const search = searchBox(page);
    await search.fill("灵感");
    await search.press("Alt+Enter");
    assertEquals(await page.getByText("问 AI：").count(), 0);
    assertEquals(await card(page).count(), 0);
    await search.fill("/");
    await page.getByRole("option").first().waitFor();
    const commands = await page.getByRole("option").allTextContents();
    assert(
        !commands.some((text) => text.includes("/ai ·")),
        "/ai is not offered",
    );
    assertEquals(new URL(page.url()).pathname, "/");
    // /ai without a model is only text: a literal search, never a card.
    await search.fill("/ai 问题");
    await search.press("Alt+Enter");
    assertEquals(await card(page).count(), 0);
    await search.press("Enter");
    await page.waitForURL(/bing\.com\/search/);
    assertEquals(
        new URL(page.url()).searchParams.get("q"),
        "/ai 问题",
    );
}

Deno.test("inline AI answer card: streaming, sources, Escape layers, expansion #237", async (t) => {
    const previousKey = Deno.env.get("ENCRYPTION_KEY");
    const previousSearxng = Deno.env.get("SEARXNG_URL");
    Deno.env.set("ENCRYPTION_KEY", previousKey ?? FAKE_ENCRYPTION_KEY);
    const fake = startFakeProvider();
    Deno.env.set("SEARXNG_URL", fake.origin);
    const app = await startProductionApp();
    const evidence = await createEvidenceDirectory("inline-ai-answer");
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });

    async function disableFixtureModels(providerId: string) {
        await app.store.run((db) =>
            db.update(aiModels).set({ enabled: false }).where(
                eq(aiModels.providerId, providerId),
            ).run()
        );
    }

    // Sign-in is rate limited: log each account in once and reuse the session.
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

    async function seedUser(name: string, withFakeModel: boolean) {
        const user = await app.seedAskFixtureUser({
            username: name,
            password: `${name}-Password-237!`,
        });
        await disableFixtureModels(user.providerId);
        if (!withFakeModel) return user;
        const context = await browser.newContext({
            storageState: await sessionOf(user),
        });
        try {
            const page = await context.newPage();
            const created = await page.request.post(
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
            const { data: provider } = await created.json();
            await app.store.run((db) =>
                db.update(aiModels).set({ supportsTools: true }).where(
                    eq(aiModels.providerId, provider.id),
                ).run()
            );
            const note = await page.request.post(
                app.origin + "/api/documents",
                {
                    headers: { Origin: app.origin },
                    data: {
                        title: NOTE_TITLE,
                        body: "路线图：先做搜索框，再做 AI 回答",
                    },
                },
            );
            assert(note.ok(), await note.text());
        } finally {
            await context.close();
        }
        return user;
    }

    async function newPage(
        user: { username: string; password: string } | null,
        options: {
            viewport?: { width: number; height: number };
            reducedMotion?: "reduce" | "no-preference";
            colorScheme?: "light" | "dark";
            script?: string;
        } = {},
    ) {
        const context = await browser.newContext({
            viewport: options.viewport ?? { width: 1440, height: 900 },
            reducedMotion: options.reducedMotion,
            colorScheme: options.colorScheme ?? "light",
            storageState: user ? await sessionOf(user) : undefined,
        });
        context.setDefaultTimeout(8_000);
        if (options.script) await context.addInitScript(options.script);
        await mockWeb(context);
        const page = await context.newPage();
        await page.goto(app.origin);
        await searchBox(page).waitFor({ state: "visible" });
        return { page, context };
    }

    try {
        const withModel = await seedUser("inline_ai_model", true);
        const noModel = await seedUser("inline_ai_plain", false);

        await t.step("guests have no AI entry point on home", async () => {
            const { page, context } = await newPage(null);
            try {
                await assertNoAiEntry(page, app.origin);
            } finally {
                await context.close();
            }
        });

        await t.step(
            "accounts without a usable model have none either",
            async () => {
                const { page, context } = await newPage(noModel);
                try {
                    await assertNoAiEntry(page, app.origin);
                } finally {
                    await context.close();
                }
            },
        );

        const { page, context } = await newPage(withModel, {
            script: TRANSITION_RECORDER,
        });
        let conversationId = "";
        let answerText = "";
        const sharedNames: string[] = [];

        try {
            await t.step(
                "home reaches AI from the user menu and commands, not the top bar or engine menu",
                async () => {
                    await openHome(page, app.origin);
                    assertEquals(
                        await page.getByRole("link", {
                            name: "AI 问答",
                            exact: true,
                        }).count(),
                        0,
                        "no top-bar AI link on home",
                    );
                    await page.locator(".search-engine").click();
                    await page.getByRole("menuitemradio").first().waitFor();
                    assertEquals(
                        await page.getByRole("menuitemradio", {
                            name: "AI 问答",
                        })
                            .count(),
                        0,
                    );
                    await page.keyboard.press("Escape");
                    // Keyboard only: the user menu leads to the AI workspace.
                    await page.getByRole("button", { name: /^用户菜单/ })
                        .focus();
                    await page.keyboard.press("Enter");
                    // The library entry leads the keyboard-opened menu.
                    await page.waitForFunction(() =>
                        document.activeElement?.getAttribute("role") ===
                            "menuitem" &&
                        document.activeElement.textContent?.trim() === "资料库"
                    );
                    await page.keyboard.press("ArrowDown");
                    await page.keyboard.press("ArrowDown");
                    await page.keyboard.press("ArrowDown");
                    await page.waitForFunction(() =>
                        document.activeElement?.textContent?.trim() ===
                            "AI 问答"
                    );
                    await page.keyboard.press("Enter");
                    await page.waitForURL(app.origin + "/ask");
                },
            );

            await t.step(
                "a streamed answer cites personal notes before the web",
                async () => {
                    await openHome(page, app.origin);
                    const release = fake.hold();
                    await askWithAltEnter(page);
                    assertEquals(new URL(page.url()).pathname, "/");
                    const answer = card(page);
                    await answer.getByText(FIRST_TOKENS).waitFor();
                    assertEquals(
                        await answer.getAttribute("aria-busy"),
                        "true",
                    );
                    assertEquals(
                        await answer.getByRole("button", { name: "展开" })
                            .isDisabled(),
                        true,
                        "expanding waits for a complete conversation",
                    );
                    const sources = answer.locator(".inline-ai-source");
                    await sources.nth(1).waitFor();
                    const texts = await sources.allTextContents();
                    assertEquals(texts.length, 2);
                    assert(
                        texts[0].includes("笔记") &&
                            texts[0].includes(NOTE_TITLE),
                        `the note comes first: ${texts[0]}`,
                    );
                    assert(
                        texts[1].includes("网页") &&
                            texts[1].includes("公开网页结果"),
                        `the web result follows: ${texts[1]}`,
                    );
                    // The note search reached the model as a tool, on the Ask stream.
                    const first = fake.chatBodies.at(-2)!;
                    assert(
                        first.tools?.some((tool) =>
                            tool.function.name === "lookup_documents"
                        ),
                        "documents tool offered",
                    );
                    release();
                    await page.waitForFunction(
                        () =>
                            document.querySelector(".inline-ai-card")
                                ?.getAttribute("data-status") === "done",
                    );
                    await answer.getByText(LAST_TOKENS).waitFor();
                    assertEquals(
                        await answer.getByRole("button", { name: "展开" })
                            .isEnabled(),
                        true,
                    );
                    await page.getByRole("button", { name: "关闭回答" })
                        .click();
                    await card(page).waitFor({ state: "detached" });
                    await searchIsFocused(page);
                },
            );

            await t.step(
                "Escape while streaming closes the card and aborts the request",
                async () => {
                    await openHome(page, app.origin);
                    const release = fake.hold();
                    await askWithAltEnter(page);
                    await card(page).getByText(FIRST_TOKENS).waitFor();
                    const before = fake.abortCount();
                    const clientAborted = page.waitForEvent("requestfailed", {
                        predicate: (request) =>
                            request.url().includes("/api/ai/chat/stream"),
                    });
                    await searchBox(page).press("Escape");
                    await card(page).waitFor({ state: "detached" });
                    const failed = await clientAborted;
                    assertEquals(
                        failed.failure()?.errorText,
                        "net::ERR_ABORTED",
                    );
                    await fake.abortedSince(before);
                    assertEquals(fake.abortCount(), before + 1);
                    await searchIsFocused(page);
                    // What was written stays in Ask history, marked interrupted.
                    await page.waitForFunction(
                        async ([first]) => {
                            const list = await (await fetch(
                                "/api/ai/conversations",
                            )).json();
                            for (const item of list.data) {
                                const detail = await (await fetch(
                                    `/api/ai/conversations/${item.id}`,
                                )).json();
                                if (
                                    detail.data.messages.some((
                                        message: {
                                            status: string;
                                            content: string;
                                        },
                                    ) => message.status === "interrupted" &&
                                        message.content.includes(first)
                                    )
                                ) return true;
                            }
                            return false;
                        },
                        [FIRST_TOKENS],
                    );
                    release();
                },
            );

            await t.step(
                "Escape closes the suggestion list, then a menu, before the card",
                async () => {
                    await openHome(page, app.origin);
                    const release = fake.hold();
                    await askWithAltEnter(page);
                    await card(page).getByText(FIRST_TOKENS).waitFor();
                    const before = fake.abortCount();
                    // Typing reopens the suggestion list over the card.
                    await searchBox(page).press("x");
                    await suggestions(page).waitFor({ state: "visible" });
                    await searchBox(page).press("Escape");
                    await suggestions(page).waitFor({ state: "hidden" });
                    assertEquals(await card(page).isVisible(), true);
                    assertEquals(
                        fake.abortCount(),
                        before,
                        "request kept running",
                    );
                    // An open menu outranks the card as well.
                    await page.locator(".search-engine").click();
                    await page.getByRole("menu").waitFor({ state: "visible" });
                    await page.keyboard.press("Escape");
                    await page.getByRole("menu").waitFor({ state: "hidden" });
                    assertEquals(await card(page).isVisible(), true);
                    assertEquals(
                        fake.abortCount(),
                        before,
                        "request kept running",
                    );
                    // Refocusing the box reopens the list: it still goes first.
                    await searchBox(page).focus();
                    await suggestions(page).waitFor({ state: "visible" });
                    await searchBox(page).press("Escape");
                    await suggestions(page).waitFor({ state: "hidden" });
                    assertEquals(await card(page).isVisible(), true);
                    assertEquals(fake.abortCount(), before);
                    // Only then the card, with the abort.
                    await searchBox(page).press("Escape");
                    await card(page).waitFor({ state: "detached" });
                    await fake.abortedSince(before);
                    await searchIsFocused(page);
                    release();
                },
            );

            await t.step(
                "expanding lands on /ask/:id with the same history, via one shared-element transition",
                async () => {
                    await openHome(page, app.origin);
                    await askWithAltEnter(page);
                    const answer = card(page);
                    await page.waitForFunction(
                        () =>
                            document.querySelector(".inline-ai-card")
                                ?.getAttribute("data-status") === "done",
                    );
                    answerText = (await answer.locator(".inline-ai-body")
                        .innerText()).trim();
                    assert(answerText.includes(LAST_TOKENS));
                    await answer.getByRole("button", { name: "展开" }).click();
                    await page.waitForURL(/\/ask\/[^/?]+$/);
                    conversationId = decodeURIComponent(
                        new URL(page.url()).pathname.split("/").at(-1)!,
                    );
                    const workspace = page.locator(
                        '[data-shared-target="ask-conversation"]',
                    );
                    await workspace.waitFor({ state: "visible" });

                    // History is the server's: question, then the very same answer.
                    await page.locator(".ask-assistant-body").first().waitFor();
                    assertEquals(
                        (await page.locator(".ask-user-msg-container")
                            .allInnerTexts())
                            .map((text) => text.trim()).filter(Boolean).length,
                        1,
                    );
                    assert(
                        (await page.locator(".ask-user-msg-container")
                            .innerText())
                            .includes(QUESTION),
                    );
                    assertEquals(
                        (await page.locator(".ask-assistant-body").first()
                            .innerText()).trim(),
                        answerText,
                    );
                    const cards = await page.locator(".ask-source-card")
                        .allInnerTexts();
                    assertEquals(cards.length, 2);
                    assert(cards[0].includes("笔记"), "note first in Ask too");
                    const history = await page.request.get(
                        `${app.origin}/api/ai/conversations/${conversationId}`,
                    );
                    const { data } = await history.json();
                    assertEquals(
                        data.messages.map((message: { role: string }) =>
                            message.role
                        ),
                        ["user", "assistant"],
                    );
                    assertEquals(data.messages[0].content, QUESTION);
                    assertEquals(data.messages[1].content.trim(), answerText);

                    // Focus moved into the target, and exactly one element carried
                    // the unique name in each snapshot.
                    await page.waitForFunction(
                        () =>
                            document.activeElement?.classList.contains(
                                "ask-composer__textarea",
                            ),
                    );
                    const [record] = await transitionsOf(page);
                    assertEquals(record.before.length, 1);
                    assertEquals(record.after, record.before);
                    assert(record.before[0].startsWith("shared-"));
                    sharedNames.push(record.before[0]);
                    await page.waitForFunction(
                        "window.__transitions[0]?.finished === true",
                    );
                    assertEquals(
                        await page.evaluate(() =>
                            [...document.querySelectorAll("*")].filter((
                                element,
                            ) => (element as HTMLElement).style
                                .viewTransitionName
                            ).length
                        ),
                        0,
                        "names are removed once the transition ended",
                    );
                },
            );

            await t.step(
                "going back to home focuses the search box",
                async () => {
                    await page.goBack();
                    await searchBox(page).waitFor({ state: "visible" });
                    await searchIsFocused(page);
                    assertEquals(await card(page).count(), 0);
                },
            );

            await t.step(
                "a second expansion uses a new name; the logo link also returns focus",
                async () => {
                    await askWithAltEnter(page, "再问一次路线图");
                    await page.waitForFunction(
                        () =>
                            document.querySelector(".inline-ai-card")
                                ?.getAttribute("data-status") === "done",
                    );
                    await card(page).getByRole("button", { name: "展开" })
                        .click();
                    await page.waitForURL(/\/ask\/[^/?]+$/);
                    const records = await transitionsOf(page);
                    const latest = records.at(-1)!;
                    assertEquals(latest.before.length, 1);
                    assertNotEquals(latest.before[0], sharedNames[0]);
                    await page.getByRole("link", { name: "Searcher 首页" })
                        .click();
                    await searchBox(page).waitFor({ state: "visible" });
                    await searchIsFocused(page);
                },
            );

            await t.step(
                "/ask/:id is a deep link and /ask stays the conversation workspace",
                async () => {
                    await page.goto(`${app.origin}/ask/${conversationId}`);
                    await page.locator(".ask-assistant-body").first().waitFor();
                    assertEquals(
                        (await page.locator(".ask-assistant-body").first()
                            .innerText()).trim(),
                        answerText,
                    );
                    assertEquals(
                        new URL(page.url()).pathname,
                        `/ask/${conversationId}`,
                    );
                    await page.getByRole("button", { name: "新建对话" })
                        .click();
                    await page.waitForURL(`${app.origin}/ask`);
                    await page.locator(".ask-user-msg-container").waitFor({
                        state: "detached",
                    });
                    await visitAsk(page, app.origin);
                    await page.locator(".ask-sidebar__item-title").first()
                        .click();
                    await page.waitForURL(/\/ask\/[^/?]+$/);
                },
            );
        } finally {
            await context.close();
        }

        await t.step(
            "without View Transitions the expansion is instant",
            async () => {
                const { page, context } = await newPage(withModel, {
                    script: NO_VIEW_TRANSITIONS,
                });
                try {
                    assertEquals(
                        await page.evaluate(() =>
                            typeof document.startViewTransition
                        ),
                        "undefined",
                    );
                    await askWithAltEnter(page);
                    await page.waitForFunction(
                        () =>
                            document.querySelector(".inline-ai-card")
                                ?.getAttribute("data-status") === "done",
                    );
                    await card(page).getByRole("button", { name: "展开" })
                        .click();
                    await page.waitForURL(/\/ask\/[^/?]+$/);
                    await page.locator(
                        '[data-shared-target="ask-conversation"]',
                    )
                        .waitFor({ state: "visible" });
                    await page.waitForFunction(
                        () =>
                            document.activeElement?.classList.contains(
                                "ask-composer__textarea",
                            ),
                    );
                    assertEquals((await transitionsOf(page)).length, 0);
                    await page.goBack();
                    await searchIsFocused(page);
                } finally {
                    await context.close();
                }
            },
        );

        for (const reduced of [false, true]) {
            await t.step(
                reduced
                    ? "reduced motion: same-duration opacity cross-fade only"
                    : "full motion: the shared object morphs its geometry",
                async () => {
                    const { page, context } = await newPage(withModel, {
                        script: TRANSITION_RECORDER,
                        reducedMotion: reduced ? "reduce" : "no-preference",
                    });
                    try {
                        await askWithAltEnter(page);
                        await page.waitForFunction(
                            () =>
                                document.querySelector(".inline-ai-card")
                                    ?.getAttribute("data-status") === "done",
                        );
                        await card(page).getByRole("button", { name: "展开" })
                            .click();
                        await page.waitForURL(/\/ask\/[^/?]+$/);
                        await page.waitForFunction(
                            "window.__transitions[0]?.animations != null",
                        );
                        const [record] = await transitionsOf(page);
                        const animations = record.animations!;
                        const name = record.before[0];
                        const own = animations.filter((animation) =>
                            animation.pseudo?.includes(name)
                        );
                        assert(own.length > 0, "the shared object animates");
                        const geometry = own.filter((animation) =>
                            animation.pseudo?.startsWith(
                                "::view-transition-group",
                            ) ||
                            animation.pseudo?.startsWith(
                                "::view-transition-image-pair",
                            )
                        );
                        const fades = own.filter((animation) =>
                            animation.pseudo?.startsWith(
                                "::view-transition-old",
                            ) ||
                            animation.pseudo?.startsWith(
                                "::view-transition-new",
                            )
                        );
                        assert(fades.length === 2, "old and new cross-fade");
                        for (const fade of fades) {
                            assertEquals(fade.properties, ["opacity"]);
                            assertEquals(fade.duration, 280);
                        }
                        if (reduced) {
                            assertEquals(
                                geometry.length,
                                0,
                                "no group or image-pair animation",
                            );
                        } else {
                            const properties = geometry.flatMap((animation) =>
                                animation.properties
                            );
                            assert(
                                properties.some((property) =>
                                    ["transform", "width", "height"].includes(
                                        property,
                                    )
                                ),
                                `geometry morph expected, got ${properties}`,
                            );
                        }
                    } finally {
                        await context.close();
                    }
                },
            );
        }

        await t.step(
            "screenshots: card streaming, done and expanded at 390/768/1440 × light/dark",
            async () => {
                const viewports = [
                    { width: 390, height: 844 },
                    { width: 768, height: 1024 },
                    { width: 1440, height: 900 },
                ];
                for (const colorScheme of ["light", "dark"] as const) {
                    for (const viewport of viewports) {
                        const { page, context } = await newPage(withModel, {
                            viewport,
                            colorScheme,
                        });
                        const tag = `${viewport.width}-${colorScheme}`;
                        try {
                            const release = fake.hold();
                            await askWithAltEnter(page);
                            await card(page).getByText(FIRST_TOKENS).waitFor();
                            await card(page).locator(".inline-ai-source").nth(1)
                                .waitFor();
                            await assertNoOverflow(page);
                            await page.screenshot({
                                path: `${evidence}/card-streaming-${tag}.png`,
                            });
                            release();
                            await page.waitForFunction(
                                () =>
                                    document.querySelector(".inline-ai-card")
                                        ?.getAttribute("data-status") ===
                                        "done",
                            );
                            await assertNoOverflow(page);
                            await page.screenshot({
                                path: `${evidence}/card-done-${tag}.png`,
                            });
                            await card(page).getByRole("button", {
                                name: "展开",
                            })
                                .click();
                            await page.waitForURL(/\/ask\/[^/?]+$/);
                            await page.locator(".ask-assistant-body").first()
                                .waitFor();
                            await page.waitForFunction(() =>
                                document.getAnimations().length === 0
                            );
                            await assertNoOverflow(page);
                            await page.screenshot({
                                path: `${evidence}/expanded-${tag}.png`,
                            });
                        } finally {
                            await context.close();
                        }
                    }
                }
            },
        );
    } finally {
        await browser.close();
        await app.close();
        await fake.close();
        if (previousKey === undefined) Deno.env.delete("ENCRYPTION_KEY");
        else Deno.env.set("ENCRYPTION_KEY", previousKey);
        if (previousSearxng === undefined) Deno.env.delete("SEARXNG_URL");
        else Deno.env.set("SEARXNG_URL", previousSearxng);
    }
});

async function assertNoOverflow(page: Page) {
    const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        card: (() => {
            const element = document.querySelector(".inline-ai-card");
            if (!element) return 0;
            const rect = element.getBoundingClientRect();
            return Math.max(0, rect.right - innerWidth, -rect.left);
        })(),
    }));
    assertEquals(overflow.page <= 0, true, "no horizontal page overflow");
    assertEquals(overflow.card, 0, "card stays inside the viewport");
}
