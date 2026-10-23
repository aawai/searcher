import { assertEquals } from "@std/assert";
import { undoErrorMessage, undoMessage } from "./undo-feedback.ts";

Deno.test("deletion feedback names one item or lists several", () => {
    assertEquals(
        undoMessage([{ kind: "app", name: "Figma" }]),
        "已将“Figma”移至回收站",
    );
    assertEquals(
        undoMessage([{ kind: "paper", name: "灵感" }, {
            kind: "app",
            name: "Figma",
        }]),
        "已将 2 项移至回收站：灵感、Figma",
    );
});

Deno.test("capture feedback reports the new note and whether it was pinned", () => {
    assertEquals(
        undoMessage([{ kind: "capture", name: "散步路线" }]),
        "已记录笔记“散步路线”",
    );
    assertEquals(
        undoMessage([{ kind: "capture", name: "散步路线", pinned: true }]),
        "已记录笔记“散步路线”并固定到首页",
    );
    assertEquals(
        undoMessage([{ kind: "capture", name: "a" }, {
            kind: "app",
            name: "b",
        }]),
        "2 项操作可撤销：a、b",
    );
});

Deno.test("failed undo names the item and the cause", () => {
    assertEquals(undoErrorMessage([{ kind: "app", name: "Figma" }]), "");
    assertEquals(
        undoErrorMessage([
            { kind: "app", name: "Figma", error: "网络错误" },
            { kind: "capture", name: "灵感", error: "已不存在" },
        ]),
        "恢复“Figma”失败：网络错误，可以重试。 撤销记录“灵感”失败：已不存在，可以重试。",
    );
});
