import { assertEquals } from "@std/assert";
import {
    type AskLoss,
    lossDescriptions,
    needsConfirmation,
    warnsOnUnload,
} from "./leave-loss.ts";

const NOTHING: AskLoss = {
    streaming: false,
    temporary: false,
    draft: false,
    attachments: false,
};

Deno.test("switching keeps text drafts of history conversations but not attachments", () => {
    assertEquals(
        needsConfirmation({ ...NOTHING, draft: true }, "switch"),
        false,
    );
    assertEquals(
        needsConfirmation({ ...NOTHING, attachments: true }, "switch"),
        true,
    );
    assertEquals(
        needsConfirmation({ ...NOTHING, streaming: true }, "switch"),
        true,
    );
    assertEquals(
        needsConfirmation({ ...NOTHING, temporary: true }, "switch"),
        true,
    );
});

Deno.test("closing and signing out lose every unsent draft", () => {
    for (const leave of ["close", "logout"] as const) {
        assertEquals(needsConfirmation(NOTHING, leave), false);
        assertEquals(
            needsConfirmation({ ...NOTHING, draft: true }, leave),
            true,
        );
    }
});

Deno.test("leaving the page warns for streams and unsent input only", () => {
    assertEquals(warnsOnUnload({ ...NOTHING, temporary: true }), false);
    assertEquals(warnsOnUnload({ ...NOTHING, streaming: true }), true);
    assertEquals(warnsOnUnload({ ...NOTHING, draft: true }), true);
    assertEquals(warnsOnUnload({ ...NOTHING, attachments: true }), true);
});

Deno.test("consequences distinguish kept history content from deleted temporary content", () => {
    assertEquals(
        lossDescriptions({ ...NOTHING, streaming: true }, "close"),
        [
            "正在生成的回答将被中断；已生成的内容保留在历史会话中，标记为已中断。",
        ],
    );
    assertEquals(
        lossDescriptions(
            { ...NOTHING, streaming: true, temporary: true, draft: true },
            "close",
        ),
        [
            "正在生成的回答将被终止，且不会保留。",
            "临时会话及其消息、附件和未发送的输入将被删除，无法恢复。",
        ],
    );
    assertEquals(lossDescriptions({ ...NOTHING, draft: true }, "switch"), []);
});
