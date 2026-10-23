import { assertEquals } from "@std/assert";
import { splitSuggestionLabel } from "./split-label.ts";

Deno.test("suggestion label highlights every actual match, preserving the visible text", () => {
    assertEquals(splitSuggestionLabel("rust rustdesk", "rust"), [
        { text: "rust", kind: "match" },
        { text: " ", kind: "completion" },
        { text: "rust", kind: "match" },
        { text: "desk", kind: "completion" },
    ]);
    assertEquals(splitSuggestionLabel("Trustworthy search", "RUST"), [
        { text: "T", kind: "plain" },
        { text: "rust", kind: "match" },
        { text: "worthy search", kind: "completion" },
    ]);
    assertEquals(splitSuggestionLabel("/g · Google 搜索", "/g"), [
        { text: "/g", kind: "match" },
        { text: " · Google 搜索", kind: "completion" },
    ]);
    assertEquals(splitSuggestionLabel("İfoo İbar", "İ"), [
        { text: "İ", kind: "match" },
        { text: "foo ", kind: "completion" },
        { text: "İ", kind: "match" },
        { text: "bar", kind: "completion" },
    ]);
    assertEquals(splitSuggestionLabel("a.b a.b", "a.b"), [
        { text: "a.b", kind: "match" },
        { text: " ", kind: "completion" },
        { text: "a.b", kind: "match" },
    ]);
    assertEquals(splitSuggestionLabel("old suggestion", "new"), [
        { text: "old suggestion", kind: "plain" },
    ]);
});
