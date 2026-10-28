import { assertEquals } from "@std/assert";
import type { PersonalSearchDto } from "@shared/personal-search.ts";
import { SEARCH_QUICK_COMMANDS } from "../shortcuts/shortcut-catalog.ts";
import {
    buildOmniboxGroups,
    defaultSubmitAction,
    flattenOmniboxGroups,
    itemAction,
    type OmniboxData,
    omniboxItemKey,
    resolveOmniboxQuery,
} from "./omnibox-model.ts";

const signedIn = { aiAvailable: true, signedIn: true };
const guest = { aiAvailable: false, signedIn: false };
const resolve = (
    raw: string,
    context = signedIn,
) => resolveOmniboxQuery({
    raw,
    engine: "bing",
    context,
});

const note = (id: string, displayTitle: string) => ({
    id,
    title: displayTitle,
    displayTitle,
    snippet: "",
    notebookId: null,
    isFavorite: false,
    color: "paper" as const,
    isHomeFixed: false,
    homeSortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
});
const personal: PersonalSearchDto = {
    query: "灵感",
    documents: [note("d1", "灵感一"), note("d2", "灵感二")],
    apps: [{
        id: "a1",
        name: "灵感站",
        url: "https://ideas.example",
        groupId: null,
        iconAssetId: null,
        iconSource: "default",
        openMode: "global",
    }],
};
const data = (patch: Partial<OmniboxData> = {}): OmniboxData => ({
    aiAvailable: true,
    personalAllowed: true,
    personal,
    folders: [],
    libraryApps: [],
    history: [],
    online: [],
    ...patch,
});
const groupIds = (
    raw: string,
    patch: Partial<OmniboxData> = {},
    context = signedIn,
) => buildOmniboxGroups(
    resolve(raw, context),
    data({
        aiAvailable: context.aiAvailable,
        ...patch,
    }),
).map((group) => group.id);

Deno.test("query resolution: empty, prefixes and plain text", () => {
    assertEquals(resolve("   "), { kind: "idle" });
    assertEquals(resolve("rust"), {
        kind: "search",
        text: "rust",
        engine: "bing",
        webOnly: false,
    });
    assertEquals(resolve("/g rust lang"), {
        kind: "search",
        text: "rust lang",
        engine: "google",
        webOnly: true,
    });
    assertEquals(resolve("/g "), { kind: "idle" });
    assertEquals(resolve("/ai hello"), { kind: "idle" });
    assertEquals(resolve("/dark foo").kind, "search");
    assertEquals(resolve("/zzz").kind, "search");
    const commands = resolve("/b");
    assertEquals(commands.kind, "commands");
    assertEquals(
        commands.kind === "commands" && commands.commands.map((c) => c.id),
        ["bing", "baidu"],
    );
});

Deno.test("groups follow AI / 我的 / 应用 / 网页 / 命令 order and drop empty ones", () => {
    assertEquals(
        groupIds("灵感", {
            history: ["灵感历史"],
            online: [{ text: "灵感网页" }],
        }),
        ["ai", "mine", "apps", "web"],
    );
    assertEquals(groupIds("灵感", { personal: null }), ["ai"]);
    assertEquals(groupIds("/"), ["commands"]);
});

Deno.test("guests and AI-less accounts: no AI row, guests have no personal groups", () => {
    assertEquals(
        groupIds("灵感", {
            personalAllowed: false,
            personal: null,
            online: [{ text: "灵感网页" }],
        }, guest),
        ["web"],
    );
    assertEquals(
        groupIds("灵感", {
            aiAvailable: false,
            online: [{ text: "灵感网页" }],
        }, { aiAvailable: false, signedIn: true }),
        ["mine", "apps", "web"],
    );
    const guestCommands = buildOmniboxGroups(
        resolve("/", guest),
        data({ aiAvailable: false, personalAllowed: false }),
    );
    const ids = flattenOmniboxGroups(guestCommands).flatMap((item) =>
        item.kind === "command" ? [item.command.id] : []
    );
    assertEquals(ids.includes("ai"), false);
    assertEquals(ids.includes("trash"), false);
    assertEquals(ids.includes("theme-dark"), true);
});

Deno.test("a 401 (personalAllowed false) removes documents, apps and folders together", () => {
    assertEquals(
        groupIds("灵感", {
            personalAllowed: false,
            folders: [{ id: "f", name: "灵感夹" }],
            online: [{ text: "灵感网页" }],
        }),
        ["ai", "web"],
    );
});

Deno.test("应用 group lists matching folders before personal apps; documents keep server order", () => {
    const groups = buildOmniboxGroups(
        resolve("灵感"),
        data({
            folders: [{ id: "f", name: "灵感夹" }, { id: "g", name: "x" }],
        }),
    );
    const mine = groups.find((group) => group.id === "mine")!;
    assertEquals(
        mine.items.map((item) => item.kind === "document" && item.document.id),
        ["d1", "d2"],
    );
    const apps = groups.find((group) => group.id === "apps")!;
    assertEquals(apps.items.map((item) => item.kind), ["folder", "app"]);
});

Deno.test("网页 group: history first (max 3), then online, 6 total, deduplicated", () => {
    const online = Array.from({ length: 8 }, (_, i) => ({ text: `rust ${i}` }));
    const groups = buildOmniboxGroups(
        resolve("rust"),
        data({
            personal: null,
            history: ["rust a", "RUST B", "rust c", "rust d", "unrelated"],
            online: [{ text: "Rust A" }, ...online],
        }),
    );
    const web = groups.find((group) => group.id === "web")!;
    assertEquals(web.items.map((item) => item.kind), [
        "history",
        "history",
        "history",
        "online",
        "online",
        "online",
    ]);
    assertEquals(
        web.items.map((item) => "text" in item ? item.text : ""),
        ["rust a", "RUST B", "rust c", "rust 0", "rust 1", "rust 2"],
    );
});

Deno.test("engine prefix lists only web results for the stripped query", () => {
    const groups = buildOmniboxGroups(
        resolve("/g 灵感"),
        data({ history: ["灵感记录"], online: [{ text: "灵感网" }] }),
    );
    assertEquals(groups.map((group) => group.id), ["web"]);
});

Deno.test("Enter with nothing selected is always a default-engine search (no routing)", () => {
    for (
        const raw of [
            "github",
            "https://example.com",
            "灵感",
            "/settings",
            "/dark",
            "/g",
            "/ai",
            "how to /g",
        ]
    ) {
        assertEquals(defaultSubmitAction(raw, false), {
            type: "search",
            text: raw,
            newTab: false,
        });
    }
    assertEquals(defaultSubmitAction("   ", false), null);
    assertEquals(defaultSubmitAction("  rust  ", true), {
        type: "search",
        text: "rust",
        newTab: true,
    });
});

Deno.test("explicit prefixes with a query: engine prefix searches that engine, /ai asks AI", () => {
    assertEquals(defaultSubmitAction("/g rust", false), {
        type: "search",
        text: "rust",
        engine: "google",
        newTab: false,
    });
    assertEquals(defaultSubmitAction("/AI  hi there", false, true), {
        type: "ask-ai",
        text: "hi there",
    });
});

Deno.test("/ai without a usable model is just text: a literal default-engine search", () => {
    assertEquals(defaultSubmitAction("/AI  hi there", false, false), {
        type: "search",
        text: "/AI  hi there",
        newTab: false,
    });
});

Deno.test("selected items map to their own actions", () => {
    const search = resolve("灵感");
    const groups = buildOmniboxGroups(
        search,
        data({ history: ["灵感历史"], online: [{ text: "灵感网页" }] }),
    );
    const items = flattenOmniboxGroups(groups);
    const actions = items.map((item) => itemAction(item, search, true));
    assertEquals(actions, [
        { type: "ask-ai", text: "灵感" },
        { type: "open-document", id: "d1" },
        { type: "open-document", id: "d2" },
        {
            type: "open-app",
            app: {
                id: "a1",
                name: "灵感站",
                url: "https://ideas.example",
                openMode: "global",
                iconUrl: undefined,
                iconAssetId: null,
            },
        },
        { type: "search", text: "灵感历史", newTab: true },
        { type: "search", text: "灵感网页", newTab: true },
    ]);

    const prefixed = resolve("/g 灵感");
    const web = flattenOmniboxGroups(
        buildOmniboxGroups(prefixed, data({ history: ["灵感历史"] })),
    );
    assertEquals(itemAction(web[0], prefixed, false), {
        type: "search",
        text: "灵感历史",
        engine: "google",
        newTab: false,
    });

    const slash = resolve("/b");
    const commands = flattenOmniboxGroups(buildOmniboxGroups(slash, data()));
    assertEquals(itemAction(commands[0], slash, false), {
        type: "fill",
        text: "/b ",
    });
    const theme = resolve("/dark");
    const dark = flattenOmniboxGroups(buildOmniboxGroups(theme, data()))[0];
    assertEquals(dark.kind, "command");
    assertEquals(itemAction(dark, theme, false), {
        type: "command",
        command: SEARCH_QUICK_COMMANDS.find((c) => c.id === "theme-dark")!,
    });
});

Deno.test("item keys are unique across a result list so selection can follow them", () => {
    const search = resolve("灵感");
    const items = flattenOmniboxGroups(buildOmniboxGroups(
        search,
        data({
            folders: [{ id: "f", name: "灵感夹" }],
            history: ["灵感"],
            online: [{ text: "灵感网页" }],
        }),
    ));
    const keys = items.map(omniboxItemKey);
    assertEquals(new Set(keys).size, keys.length);
    assertEquals(keys[0], "ai");
});
