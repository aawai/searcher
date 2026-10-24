import { assertEquals, assertRejects } from "@std/assert";
import { collectAffectedPaths } from "./affected.ts";
import { selectAffected, suiteFiles } from "./suites.ts";

Deno.test("affected: empty paths select no tests", () => {
    assertEquals(selectAffected([]), {
        paths: [],
        suites: [],
        files: [],
        reason: "No changed paths",
    });
});

Deno.test("affected: unknown and shared paths override narrow matches", () => {
    for (
        const shared of [
            "unknown.txt",
            "web/src/components/Button.tsx",
            "deno.jsonc",
            "web/e2e/helpers/library.ts",
        ]
    ) {
        const selection = selectAffected([
            "web/src/features/library/Library.tsx",
            shared,
        ]);
        assertEquals(selection.suites, ["full"]);
        assertEquals(selection.files, suiteFiles("full"));
    }
});

Deno.test("affected: library includes documents and other known consumers without duplicate files", () => {
    const paths = [
        "web/src/features/library/model.ts",
        "web/src/features/documents/view.tsx",
    ];
    const selection = selectAffected(paths);
    assertEquals(selection.suites, [
        "workspace",
        "routing",
        "documents",
        "bundle",
        "home-notes",
        "supplemental",
    ]);
    assertEquals(selection.files, [
        ...new Set(selection.suites.flatMap(suiteFiles)),
    ]);
    assertEquals(selection, selectAffected([...paths, paths[0]].reverse()));
});

Deno.test("affected: explicit changed E2E files select containing suites", () => {
    const selection = selectAffected([
        "web/e2e/documents-history.test.ts",
        "web/e2e/auth.test.ts",
    ]);
    assertEquals(selection.suites, ["routing", "documents"]);
    assertEquals(selection.files, [
        ...suiteFiles("routing"),
        ...suiteFiles("documents"),
    ]);
    assertEquals(selectAffected(["web/e2e/new-test.test.ts"]).suites, ["full"]);
});

Deno.test("affected: pagination partitions still select the complete documents domain", () => {
    for (
        const suite of [
            "pagination-short",
            "pagination-manual",
            "pagination-consecutive",
            "pagination-mixed",
        ] as const
    ) {
        const selection = selectAffected(suiteFiles(suite));
        assertEquals(selection.suites, ["documents"]);
        assertEquals(selection.files, suiteFiles("documents"));
    }
});

Deno.test("affected: git intake includes committed, staged, unstaged, renamed, deleted and nonignored untracked paths", async () => {
    const cwd = await Deno.makeTempDir({ prefix: "e2e-affected-" });
    async function git(...args: string[]): Promise<void> {
        const result = await new Deno.Command("git", {
            cwd,
            args,
            stdout: "piped",
            stderr: "piped",
        }).output();
        if (!result.success) {
            throw new Error(new TextDecoder().decode(result.stderr));
        }
    }
    const write = (name: string, content: string) =>
        Deno.writeTextFile(`${cwd}/${name}`, content);
    try {
        await git("init", "--quiet");
        await git("config", "user.email", "fixture@example.invalid");
        await git("config", "user.name", "Affected fixture");
        for (
            const name of [
                "old\tname.txt",
                "deleted.txt",
                "staged.txt",
                "unstaged.txt",
            ]
        ) {
            await write(name, `original ${name}`);
        }
        await write(".gitignore", "ignored.txt\n");
        await git("add", ".");
        await git("commit", "--quiet", "-m", "base");
        await git("branch", "fixture-base");
        assertEquals(
            (await collectAffectedPaths("fixture-base", cwd)).paths,
            [],
        );
        await write("committed.txt", "committed change");
        await git("add", ".");
        await git("commit", "--quiet", "-m", "branch change");
        await git("mv", "old\tname.txt", "new\nname.txt");
        await Deno.remove(`${cwd}/deleted.txt`);
        await write("staged.txt", "staged change");
        await git("add", "staged.txt");
        await write("unstaged.txt", "unstaged change");
        await write("untracked\nname.txt", "untracked");
        await write("ignored.txt", "ignored");
        const result = await collectAffectedPaths("fixture-base", cwd);
        assertEquals(result.base, "fixture-base");
        assertEquals(
            result.paths,
            [
                "committed.txt",
                "deleted.txt",
                "new\nname.txt",
                "old\tname.txt",
                "staged.txt",
                "unstaged.txt",
                "untracked\nname.txt",
            ].sort(),
        );
        await assertRejects(
            () => collectAffectedPaths("missing-ref", cwd),
            Error,
            "--base <git-ref>",
        );
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
});
