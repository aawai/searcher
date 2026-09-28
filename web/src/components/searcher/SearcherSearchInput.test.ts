import { assertEquals } from "@std/assert";
import {
    parseCommandPrefix,
    splitSuggestionLabel,
} from "./SearcherSearchInput.tsx";

Deno.test("SearcherSearchInput: parseCommandPrefix accurately extracts command, target engine, and rest query without pollution", () => {
    // 1. Regular query without command
    assertEquals(parseCommandPrefix("rust 教程"), null);
    assertEquals(parseCommandPrefix("https://example.com"), null);

    // 2. Command prefix without trailing space (user still typing the command itself)
    const cmdOnlyG = parseCommandPrefix("/g");
    assertEquals(cmdOnlyG, {
        command: "g",
        rest: "",
        isAi: false,
        targetEngine: "google",
        hasSpace: false,
        prefix: "/g",
    });

    const cmdOnlyBa = parseCommandPrefix("/ba");
    assertEquals(cmdOnlyBa, {
        command: "ba",
        rest: "",
        isAi: false,
        targetEngine: "baidu",
        hasSpace: false,
        prefix: "/ba",
    });

    // 3. Command prefix followed by space but no keywords yet
    const cmdSpaceEmpty = parseCommandPrefix("/b ");
    assertEquals(cmdSpaceEmpty, {
        command: "b",
        rest: "",
        isAi: false,
        targetEngine: "bing",
        hasSpace: true,
        prefix: "/b ",
    });

    // 4. Command prefix with actual keyword: rest must be stripped of command prefix
    const cmdWithQuery = parseCommandPrefix("/g rust language");
    assertEquals(cmdWithQuery, {
        command: "g",
        rest: "rust language",
        isAi: false,
        targetEngine: "google",
        hasSpace: true,
        prefix: "/g ",
    });
    // The query used for suggestion / engine search must be the rest, never polluted by /g
    assertEquals(cmdWithQuery?.rest.includes("/g"), false);

    // 5. DuckDuckGo command
    const ddg = parseCommandPrefix("/d deno 2.0");
    assertEquals(ddg, {
        command: "d",
        rest: "deno 2.0",
        isAi: false,
        targetEngine: "duckduckgo",
        hasSpace: true,
        prefix: "/d ",
    });

    // 6. AI command
    const aiCmd = parseCommandPrefix("/ai 今天天气怎么样");
    assertEquals(aiCmd, {
        command: "ai",
        rest: "今天天气怎么样",
        isAi: true,
        targetEngine: undefined,
        hasSpace: true,
        prefix: "/ai ",
    });
});

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
