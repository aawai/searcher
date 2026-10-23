import { assertEquals } from "@std/assert";
import { type Browser, chromium } from "playwright";
import { aiModels } from "../../src/db/ai-schema.ts";
import type {
    AiMessageDto,
    ChatStreamRequest,
} from "../../src/features/ai/types.ts";
import type { DocumentDto } from "../../src/shared/documents.ts";
import type { ConversationFullData } from "../src/features/ask/types.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("Ask: mobile guidance, local failure and interrupted retry (#204)", async () => {
    const app = await startProductionApp();
    let browser: Browser | null = null;
    try {
        const credentials = await app.seedAskFixtureUser({
            username: "ask_ui_204",
            password: "Ask-UI-password-204!",
        });
        await app.store.run(async (db) => {
            await db.insert(aiModels).values({
                id: "model_stability_no_tools_204",
                providerId: credentials.providerId,
                modelId: "mock-model-no-tools",
                displayName: "无工具模型",
                enabled: true,
                visibleToUsers: true,
                isDefault: false,
                supportsText: true,
                supportsVision: false,
                supportsTools: false,
                supportsStreaming: true,
                updatedAt: Date.now(),
            });
        });

        browser = await chromium.launch({
            handleSIGTERM: false,
            headless: true,
            args: ["--no-sandbox"],
        });
        const page = await browser.newPage({
            viewport: { width: 390, height: 844 },
        });
        const conversationId = `ask_ux_204_${crypto.randomUUID()}`;
        const requests: ChatStreamRequest[] = [];
        let canonicalConversation: ConversationFullData | null = null;
        let citationDocument:
            | Pick<DocumentDto, "id" | "displayTitle">
            | null = null;

        const createCanonicalConversation = (
            request: ChatStreamRequest,
            requestNumber: number,
        ): ConversationFullData => {
            const previousMessages = request.regenerateMessageId
                ? canonicalConversation?.messages ?? []
                : [];
            const previousAssistant = previousMessages.find((message) =>
                message.id === request.regenerateMessageId
            );
            const userMessageId = previousAssistant?.parentMessageId ??
                `ask-user-${requestNumber}`;
            const assistantMessageId = `ask-assistant-${requestNumber}`;
            const now = Date.now();
            const userMessage = previousMessages.find((message) =>
                message.id === userMessageId
            ) ?? {
                id: userMessageId,
                conversationId,
                parentMessageId: null,
                role: "user" as const,
                content: request.message,
                parts: [{ type: "text" as const, text: request.message }],
                providerId: null,
                modelId: null,
                status: "complete" as const,
                variantGroupId: null,
                inputTokens: null,
                outputTokens: null,
                createdAt: now,
            };
            const responseText = requestNumber === 1
                ? "部分回答"
                : requestNumber === 2
                ? "重试成功的回答"
                : requestNumber === 3
                ? "中断前的内容"
                : "中断后重试成功";
            const status: AiMessageDto["status"] = requestNumber === 1
                ? "failed"
                : requestNumber === 3
                ? "interrupted"
                : "complete";
            const assistantParts: NonNullable<AiMessageDto["parts"]> = [
                { type: "text", text: responseText },
            ];
            if (requestNumber === 2 && citationDocument) {
                assistantParts.push({
                    type: "sources",
                    sources: [{
                        type: "document",
                        documentId: citationDocument.id,
                        title: citationDocument.displayTitle,
                        snippet: "引用的笔记内容",
                    }],
                });
            }
            const assistantMessage: AiMessageDto = {
                id: assistantMessageId,
                conversationId,
                parentMessageId: userMessageId,
                role: "assistant",
                content: responseText,
                parts: assistantParts,
                providerId: credentials.providerId,
                modelId: "mock-model-standard",
                status,
                variantGroupId: request.regenerateMessageId ?? null,
                inputTokens: null,
                outputTokens: null,
                createdAt: now + 1,
            };
            const messages = previousMessages.filter((message) =>
                message.id !== assistantMessageId
            );
            if (
                !messages.some((message) =>
                    message.id === userMessageId
                )
            ) {
                messages.push(userMessage);
            }
            messages.push(assistantMessage);
            return {
                conversation: {
                    id: conversationId,
                    userId: credentials.userId,
                    title: request.message.slice(0, 60),
                    historyEnabled: true,
                    activeLeafMessageId: assistantMessageId,
                    systemInstruction: null,
                    createdAt: now,
                    updatedAt: now,
                },
                messages,
            };
        };

        await page.exposeFunction(
            "__recordAskStreamRequest",
            (request: ChatStreamRequest) => {
                requests.push(request);
                canonicalConversation = createCanonicalConversation(
                    request,
                    requests.length,
                );
                return requests.length;
            },
        );
        await page.addInitScript(({ conversationId }) => {
            type AskFixtureGlobals = typeof globalThis & {
                __recordAskStreamRequest?: (
                    request: ChatStreamRequest,
                ) => Promise<number>;
                __askStreamControls?: Record<number, {
                    appendToken: (text: string) => void;
                    fail: (reason: string) => void;
                }>;
                __askDocumentCitation?: {
                    type: "document";
                    documentId: string;
                    title: string;
                    snippet: string;
                };
            };
            const fixtureGlobal = globalThis as AskFixtureGlobals;
            const nativeFetch = globalThis.fetch.bind(globalThis);
            globalThis.fetch = async (input, init) => {
                const inputUrl = input instanceof Request
                    ? input.url
                    : String(input);
                if (
                    new URL(inputUrl, location.origin).pathname !==
                        "/api/ai/chat/stream"
                ) {
                    return nativeFetch(input, init);
                }
                const request = JSON.parse(
                    String(init?.body ?? "{}"),
                ) as ChatStreamRequest;
                const record = fixtureGlobal.__recordAskStreamRequest;
                if (!record) throw new Error("Ask SSE fixture is not ready");
                const requestNumber = await record(request);
                const userMessageId = requestNumber % 2 === 0
                    ? `ask-user-${requestNumber - 1}`
                    : `ask-user-${requestNumber}`;
                const encoder = new TextEncoder();
                return new Response(
                    new ReadableStream<Uint8Array>({
                        start(controller) {
                            const write = (event: string, data: unknown) => {
                                controller.enqueue(
                                    encoder.encode(
                                        `event: ${event}\ndata: ${
                                            JSON.stringify(data)
                                        }\n\n`,
                                    ),
                                );
                            };
                            write("meta", {
                                conversationId,
                                userMessageId,
                                assistantMessageId:
                                    `ask-assistant-${requestNumber}`,
                                title: request.message.slice(0, 60),
                            });
                            if (requestNumber === 1) {
                                write("token", "部分");
                                const controls = fixtureGlobal
                                    .__askStreamControls ??= {};
                                controls[requestNumber] = {
                                    appendToken: (text) => write("token", text),
                                    fail: (reason) => {
                                        write("error", reason);
                                        controller.close();
                                    },
                                };
                                return;
                            }
                            if (requestNumber === 3) {
                                write("token", "中断前的内容");
                                init?.signal?.addEventListener(
                                    "abort",
                                    () => controller.close(),
                                    { once: true },
                                );
                                return;
                            }
                            write(
                                "token",
                                requestNumber === 2
                                    ? "重试成功的回答"
                                    : "中断后重试成功",
                            );
                            if (requestNumber === 2) {
                                const citation =
                                    fixtureGlobal.__askDocumentCitation;
                                if (!citation) {
                                    throw new Error(
                                        "Document citation fixture is not ready",
                                    );
                                }
                                write("sources", { sources: [citation] });
                            }
                            write("done", {});
                            controller.close();
                        },
                    }),
                    { headers: { "Content-Type": "text/event-stream" } },
                );
            };
        }, { conversationId });
        await page.route(
            `**/api/ai/conversations/${conversationId}`,
            async (route) => {
                if (!canonicalConversation) {
                    await route.continue();
                    return;
                }
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        status: "success",
                        data: canonicalConversation,
                    }),
                });
            },
        );

        await loginAndVisit(page, app.origin, "/ask", credentials);
        const createdDocument = await page.evaluate(async () => {
            const response = await fetch("/api/documents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: "AI 来源笔记",
                    body: "此长笔记应由 AI 来源卡片打开。",
                }),
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            const payload = await response.json() as { data: DocumentDto };
            return {
                id: payload.data.id,
                displayTitle: payload.data.displayTitle,
            };
        });
        citationDocument = createdDocument;
        await page.evaluate((document) => {
            const fixtureGlobal = globalThis as typeof globalThis & {
                __askDocumentCitation?: {
                    type: "document";
                    documentId: string;
                    title: string;
                    snippet: string;
                };
            };
            fixtureGlobal.__askDocumentCitation = {
                type: "document",
                documentId: document.id,
                title: document.displayTitle,
                snippet: "引用的笔记内容",
            };
        }, createdDocument);
        const prompts = page.getByRole("group", { name: "示例问题" });
        await prompts.waitFor({ state: "visible" });
        assertEquals(await prompts.getByRole("button").count(), 3);
        await prompts.getByRole("button").first().click();
        const composer = page.locator(".ask-composer__textarea");
        await composer.waitFor({ state: "visible" });
        assertEquals(
            await composer.inputValue(),
            "用一个生活化例子解释机器学习",
        );

        const toolbarFits = await page.locator(".ask-composer__toolbar")
            .evaluate((toolbar) => {
                const bounds = toolbar.getBoundingClientRect();
                return toolbar.scrollWidth <= toolbar.clientWidth &&
                    Array.from(toolbar.children).every((child) => {
                        const childBounds = child.getBoundingClientRect();
                        return childBounds.left >= bounds.left &&
                            childBounds.right <= bounds.right;
                    });
            });
        assertEquals(toolbarFits, true, "390px composer controls must fit");

        await page.getByRole("button", { name: "更多设置" }).click();
        await page.getByRole("button", { name: "选择 AI 模型" }).click();
        await page.getByRole("menuitem", { name: /无工具模型/ }).click();
        await page.getByRole("button", { name: "更多设置" }).click();
        await page.getByText(
            "当前模型不支持工具调用。切换到支持工具的模型后，可使用搜索笔记、搜索应用和联网搜索。",
            { exact: true },
        ).waitFor({ state: "visible" });
        assertEquals(
            await page.getByRole("switch", { name: "搜索笔记" })
                .isDisabled(),
            true,
        );
        assertEquals(
            await page.getByRole("switch", { name: "搜索应用" })
                .isDisabled(),
            true,
        );
        await page.getByRole("button", { name: "选择 AI 模型" }).click();
        await page.getByRole("menuitem", { name: /标准稳定模型/ }).click();
        await page.getByRole("button", { name: "更多设置" }).click();
        const documentSwitch = page.getByRole("switch", { name: "搜索笔记" });
        const appsSwitch = page.getByRole("switch", { name: "搜索应用" });
        await documentSwitch.click();
        assertEquals(
            await documentSwitch.getAttribute("aria-checked"),
            "true",
        );
        assertEquals(await appsSwitch.getAttribute("aria-checked"), "false");
        await appsSwitch.click();
        const toolChipAboveInput = await page.locator(
            ".ask-composer__active-tools",
        ).evaluate((chips) => {
            const textarea = document.querySelector(
                ".ask-composer__textarea",
            );
            return textarea !== null &&
                chips.getBoundingClientRect().bottom <=
                    textarea.getBoundingClientRect().top;
        });
        assertEquals(toolChipAboveInput, true);
        const settingsPanel = page.locator(".ask-composer__settings-panel");
        await page.keyboard.press("Escape");
        await settingsPanel.waitFor({ state: "hidden" });

        await composer.click();
        await composer.fill("解释数据可视化");
        await page.getByRole("button", { name: /发送问题/ }).click();
        const liveStatus = page.locator(".ask-thread__live-status");
        await page.waitForFunction(() => {
            const status = document.querySelector(
                ".ask-thread__live-status",
            );
            return status?.textContent?.trim() === "正在生成回答。";
        });
        assertEquals(await liveStatus.getAttribute("aria-live"), "polite");
        await page.evaluate(() => {
            const fixtureGlobal = globalThis as typeof globalThis & {
                __askStreamControls?: Record<number, {
                    appendToken: (text: string) => void;
                    fail: (reason: string) => void;
                }>;
            };
            fixtureGlobal.__askStreamControls?.[1]?.appendToken("回答");
        });
        await page.getByText("部分回答", { exact: true }).waitFor();
        assertEquals(await liveStatus.textContent(), "正在生成回答。");
        await page.evaluate(() => {
            const fixtureGlobal = globalThis as typeof globalThis & {
                __askStreamControls?: Record<number, {
                    appendToken: (text: string) => void;
                    fail: (reason: string) => void;
                }>;
            };
            fixtureGlobal.__askStreamControls?.[1]?.fail(
                "Provider\u0000 failure\nTry again",
            );
        });
        const globalError = page.locator(".status-banner[role='alert']");
        await globalError.waitFor({ state: "visible" });
        assertEquals(
            (await globalError.textContent())?.includes("Provider"),
            true,
        );

        const failedMessage = page.locator(
            ".ask-interrupted-banner[role='alert']",
        );
        await failedMessage.getByText(
            "Provider failure Try again",
            { exact: true },
        ).waitFor({ state: "visible" });
        const retryButton = failedMessage.getByRole("button", {
            name: "重试生成",
        });
        const retryHeight = await retryButton.evaluate((button) =>
            button.getBoundingClientRect().height
        );
        assertEquals(retryHeight >= 44, true);
        await page.waitForFunction(() => {
            const status = document.querySelector(
                ".ask-thread__live-status",
            );
            return status?.textContent?.includes("回答生成失败") ?? false;
        });
        await retryButton.click();
        await page.getByText("重试成功的回答", { exact: true }).waitFor();
        await page.waitForFunction(() =>
            document.querySelector(".ask-thread__live-status")?.textContent
                ?.trim() === "回答生成完成。"
        );
        const completedRetryMessage = page.locator(
            ".ask-assistant-msg-container",
        ).filter({ hasText: "重试成功的回答" });
        assertEquals(
            await completedRetryMessage.locator("[role='alert']").count(),
            0,
        );
        assertEquals(requests.length, 2);
        assertEquals(requests[1].message, "解释数据可视化");
        assertEquals(requests[1].regenerateMessageId, "ask-assistant-1");
        assertEquals(requests[0].tools, {
            documents: true,
            apps: true,
            webSearch: false,
        });
        const documentCitation = page.getByRole("button", {
            name: `打开笔记：${createdDocument.displayTitle}`,
        });
        await documentCitation.waitFor({ state: "visible" });
        assertEquals(
            await page.getByText("笔记", { exact: true }).count() > 0,
            true,
        );
        await documentCitation.click();
        await page.waitForURL(app.origin + "/");
        await page.getByRole("textbox", {
            name: "笔记标题",
            exact: true,
        }).waitFor();
        assertEquals(requests[1].tools, requests[0].tools);
        await page.route("**/api/ai/capabilities", async (route) => {
            const response = await route.fetch();
            const payload = await response.json() as {
                data: { tools: { documents: boolean } };
            };
            payload.data.tools.documents = false;
            await route.fulfill({
                response,
                body: JSON.stringify(payload),
            });
        });

        await page.goto(app.origin + "/ask");
        await page.locator(".ask-empty-prompts").waitFor({
            state: "visible",
        });
        await page.getByRole("button", { name: "更多设置" }).click();
        assertEquals(
            await page.getByRole("switch", { name: "搜索笔记" })
                .isDisabled(),
            true,
        );
        assertEquals(
            await page.getByRole("switch", { name: "搜索应用" })
                .isDisabled(),
            false,
        );
        await page.keyboard.press("Escape");
        await composer.fill("停下来后继续");
        await page.getByRole("button", { name: /发送问题/ }).click();
        await page.getByText("中断前的内容", { exact: true }).waitFor();
        await page.getByRole("button", { name: "停止生成" }).click();
        const interruptedMessage = page.locator(
            ".ask-interrupted-banner[role='alert']",
        );
        await interruptedMessage.getByText("生成已中断", { exact: true })
            .waitFor({
                state: "visible",
            });
        await interruptedMessage.getByRole("button", {
            name: "重试生成",
        }).click();
        await page.getByText("中断后重试成功", { exact: true }).waitFor();
        const completedInterruptedRetry = page.locator(
            ".ask-assistant-msg-container",
        ).filter({ hasText: "中断后重试成功" });
        assertEquals(
            await completedInterruptedRetry.locator("[role='alert']").count(),
            0,
        );
        assertEquals(requests.length, 4);
        assertEquals(requests[3].message, "停下来后继续");
        assertEquals(requests[3].regenerateMessageId, "ask-assistant-3");
        assertEquals(requests[2].tools, {
            documents: false,
            apps: false,
            webSearch: false,
        });
        assertEquals(requests[3].tools, requests[2].tools);
    } finally {
        await browser?.close();
        await app.close();
    }
});
