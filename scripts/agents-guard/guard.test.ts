import { assertEquals } from "@std/assert";
import {
    checkGuide,
    checkLinks,
    parseMarkdown,
    type RepoFacts,
} from "./guard.ts";

function facts(overrides: Partial<RepoFacts> = {}): RepoFacts {
    const files = new Set([
        "src/main.ts",
        "src/db/schema.ts",
        "src/db/database.ts",
        "src/features/auth",
        "docs/testing.md",
    ]);
    return {
        exists: (pattern) => {
            const path = pattern.replace(/\/$/, "");
            if (!path.includes("*")) return Promise.resolve(files.has(path));
            const regex = new RegExp(
                `^${path.replace(/[.]/g, "\\.").replace(/\*/g, "[^/]+")}$`,
            );
            return Promise.resolve([...files].some((file) => regex.test(file)));
        },
        tasks: new Set(["dev", "test", "test:workspace"]),
        envNames: new Set(["APP_ORIGIN", "NODE_ENV"]),
        pinnedDeno: [{ source: "Dockerfile", version: "2.9.7" }],
        anchorsOf: (path) =>
            Promise.resolve(
                path === "docs/testing.md" ? ["测试", "准备"] : null,
            ),
        ...overrides,
    };
}

const messages = async (markdown: string, overrides?: Partial<RepoFacts>) =>
    (await checkGuide("AGENTS.md", markdown, facts(overrides))).map((p) =>
        `${p.line}: ${p.message}`
    );

Deno.test("stale repository paths are reported; braces, globs and non-paths are resolved or skipped", async () => {
    assertEquals(
        await messages(
            [
                "- `src/main.ts`、`src/db/{schema,database,migrate}.ts`、`src/features/*/`",
                "- `web/src/contexts/` holds auth",
                "- `/api/*`、`jsr:@std/assert`、`@std/assert`、`http://localhost:5173`、`a / b`",
                "- runtime `data/`、`./data/searcher.sqlite`、`web/dist`、`wallpapers/`",
            ].join("\n"),
        ),
        [
            "1: path not found: src/db/migrate.ts",
            "2: path not found: web/src/contexts/",
        ],
    );
});

Deno.test("deno task references must exist; a trailing * needs one matching task", async () => {
    assertEquals(
        await messages(
            "`deno task dev` / `deno task test:*` / `deno task bench`\n\n```bash\ndeno task gone -- x\n```\n",
        ),
        [
            "1: deno task not defined in deno.jsonc: bench",
            "3: deno task not defined in deno.jsonc: gone",
        ],
    );
});

Deno.test("environment names from spans and assignments must be used by the repo", async () => {
    assertEquals(
        await messages(
            "`APP_ORIGIN`、`NODE_ENV=production OLD_SECRET=x deno task dev`、`LEGACY_PORT`、`PORT`",
        ),
        [
            "1: environment variable not used by the repo: OLD_SECRET",
            "1: environment variable not used by the repo: LEGACY_PORT",
        ],
    );
});

Deno.test("stated minimum Deno version must equal every pinned version", async () => {
    assertEquals(await messages("使用 Deno 2.9.7+。"), []);
    assertEquals(await messages("使用 Deno 2.9.6+。"), [
        "1: Deno 2.9.6+ disagrees with Dockerfile (2.9.7)",
    ]);
});

Deno.test("heading anchors follow GitHub slugs, including CJK, full-width punctuation and duplicates", () => {
    assertEquals(
        parseMarkdown(
            "# 仓库指南\n## Affected：保守的局部选择\n## `AGENTS.md` 自身维护\n## 示例\n## 示例\n```md\n# not a heading\n```\n",
        ).anchors,
        [
            "仓库指南",
            "affected保守的局部选择",
            "agentsmd-自身维护",
            "示例",
            "示例-1",
        ],
    );
});

Deno.test("links to missing files or anchors are reported; external and valid links pass", async () => {
    assertEquals(
        await messages(
            [
                "[ok](docs/testing.md#准备) [self](#自身) [web](https://example.com/x#y)",
                "[gone](docs/old.md) [anchor](docs/testing.md#验证调度)",
                "## 自身",
            ].join("\n"),
        ),
        [
            "2: link target not found: docs/old.md",
            "2: anchor not found: docs/testing.md#验证调度",
        ],
    );
    const inbound = parseMarkdown("[guide](../AGENTS.md#执行与调度)").links;
    assertEquals(
        await checkLinks(
            "docs/testing.md",
            inbound,
            [],
            facts({ anchorsOf: () => Promise.resolve(["测试与验证"]) }),
        ),
        [{
            file: "docs/testing.md",
            line: 1,
            message: "anchor not found: ../AGENTS.md#执行与调度",
        }],
    );
});
