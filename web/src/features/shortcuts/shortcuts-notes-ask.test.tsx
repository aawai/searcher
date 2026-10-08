import { assertEquals } from "@std/assert";
import ReactDOMServer from "react-dom/server";
import type { AiMessageDto } from "../ask/types.ts";
import { ConversationHeader } from "../ask/ConversationHeader.tsx";

Deno.test("Ask ConversationHeader renders platform-specific search hints", () => {
    const mockMessage: AiMessageDto = {
        id: "msg-1",
        conversationId: "conv-1",
        parentMessageId: null,
        role: "user",
        content: "hello",
        providerId: null,
        modelId: null,
        status: "complete",
        variantGroupId: null,
        inputTokens: null,
        outputTokens: null,
        createdAt: Date.now(),
    };

    const headerMac = ReactDOMServer.renderToStaticMarkup(
        <ConversationHeader
            conversation={{
                id: "conv-1",
                userId: "user-1",
                title: "测试会话",
                historyEnabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }}
            messages={[mockMessage]}
            onOpenDrawer={() => {}}
            onRename={async () => {}}
            onDelete={async () => {}}
            onToggleHistory={async () => {}}
            onSaveSystemInstruction={async () => {}}
            onOpenSearch={() => {}}
            platform="mac"
        />,
    );
    assertEquals(headerMac.includes('title="会话内搜索 (⌘ F)"'), true);
    assertEquals(headerMac.includes('aria-label="会话内搜索 (⌘ F)"'), true);

    const headerOther = ReactDOMServer.renderToStaticMarkup(
        <ConversationHeader
            conversation={{
                id: "conv-1",
                userId: "user-1",
                title: "测试会话",
                historyEnabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }}
            messages={[mockMessage]}
            onOpenDrawer={() => {}}
            onRename={async () => {}}
            onDelete={async () => {}}
            onToggleHistory={async () => {}}
            onSaveSystemInstruction={async () => {}}
            onOpenSearch={() => {}}
            platform="other"
        />,
    );
    assertEquals(headerOther.includes('title="会话内搜索 (Ctrl + F)"'), true);
    assertEquals(
        headerOther.includes('aria-label="会话内搜索 (Ctrl + F)"'),
        true,
    );
});
