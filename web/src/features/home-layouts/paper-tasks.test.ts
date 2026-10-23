import { assertEquals } from "@std/assert";
import { setTaskChecked } from "./paper-tasks.ts";

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
