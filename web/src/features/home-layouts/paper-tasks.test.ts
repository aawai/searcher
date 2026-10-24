import { assertEquals } from "@std/assert";
import {
    replayTaskToggles,
    setTaskChecked,
    taskRowText,
} from "./paper-tasks.ts";

Deno.test("setTaskChecked toggles the matching task in document order and ignores code blocks", () => {
    const body =
        "- [ ] a\n  - [x] b\n\n```\n- [ ] not a task\n```\n\n> - [ ] c\n1. [X] d\n";
    assertEquals(
        setTaskChecked(body, 0, true),
        body.replace("- [ ] a", "- [x] a"),
    );
    assertEquals(
        setTaskChecked(body, 1, false),
        body.replace("- [x] b", "- [ ] b"),
    );
    assertEquals(
        setTaskChecked(body, 2, true),
        body.replace("> - [ ] c", "> - [x] c"),
    );
    assertEquals(
        setTaskChecked(body, 3, false),
        body.replace("1. [X] d", "1. [ ] d"),
    );
    assertEquals(setTaskChecked(body, 4, true), null);
});

Deno.test("taskRowText returns the row text of each task without its checkbox state", () => {
    const body = "- [ ] buy milk\r\n  - [x] nested item\n- plain\n";
    assertEquals(taskRowText(body, 0), "buy milk");
    assertEquals(taskRowText(body, 1), "nested item");
    assertEquals(taskRowText(body, 2), null);
});

Deno.test("taskRowText ignores tasks inside code blocks", () => {
    const body = "```\n- [ ] not a task\n```\n- [ ] real";
    assertEquals(taskRowText(body, 0), "real");
});

Deno.test("replayTaskToggles applies toggles to a newer body whose target rows are unchanged", () => {
    const latest = "- [ ] a\n- [ ] b\nnew line\n- [x] c\n";
    assertEquals(
        replayTaskToggles(latest, [{ index: 1, text: "b", checked: true }]),
        "- [ ] a\n- [x] b\nnew line\n- [x] c\n",
    );
});

Deno.test("replayTaskToggles returns null when a target row text or ordinal changed", () => {
    assertEquals(
        replayTaskToggles("- [ ] a\n- [ ] changed\n", [{
            index: 1,
            text: "b",
            checked: true,
        }]),
        null,
    );
    assertEquals(
        replayTaskToggles("- [ ] a\n", [{
            index: 1,
            text: "a",
            checked: true,
        }]),
        null,
    );
});
