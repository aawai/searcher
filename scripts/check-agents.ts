#!/usr/bin/env -S deno run -A
// Fails when AGENTS.md names paths, tasks, env variables, a Deno version or
// anchors that the repository no longer has, so drift surfaces in the same PR.

import { parse as parseJsonc } from "@std/jsonc";
import { expandGlob } from "@std/fs/expand-glob";
import { join } from "@std/path/join";
import {
    checkGuide,
    checkLinks,
    parseMarkdown,
    pinnedDenoVersions,
    type Problem,
    type RepoFacts,
    resolveRelative,
} from "./agents-guard/guard.ts";

const GUIDE = "AGENTS.md";

async function listFiles(root: string, patterns: string[]): Promise<string[]> {
    const output = await new Deno.Command("git", {
        args: [
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "--",
            ...patterns,
        ],
        cwd: root,
        stdout: "piped",
    }).output();
    if (!output.success) throw new Error("git ls-files failed");
    return new TextDecoder().decode(output.stdout).split("\n").filter(Boolean);
}

async function readOrNull(path: string): Promise<string | null> {
    try {
        return await Deno.readTextFile(path);
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return null;
        throw error;
    }
}

async function exists(root: string, pattern: string): Promise<boolean> {
    if (pattern.includes("*")) {
        for await (const _ of expandGlob(pattern, { root })) return true;
        return false;
    }
    try {
        await Deno.stat(join(root, pattern));
        return true;
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return false;
        if (error instanceof Deno.errors.NotADirectory) return false;
        throw error;
    }
}

async function loadFacts(root: string): Promise<RepoFacts> {
    const config = parseJsonc(
        await Deno.readTextFile(join(root, "deno.jsonc")),
    );
    const tasks = new Set<string>();
    if (config && typeof config === "object" && !Array.isArray(config)) {
        const declared = config.tasks;
        if (declared && typeof declared === "object") {
            Object.keys(declared).forEach((task) => tasks.add(task));
        }
    }

    const envNames = new Set<string>();
    const example = await readOrNull(join(root, ".env.example")) ?? "";
    for (const m of example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)) {
        envNames.add(m[1]);
    }
    const sources = (await listFiles(root, ["*.ts", "*.tsx"]))
        .filter((file) => !file.startsWith("scripts/agents-guard/"));
    for (const file of sources) {
        const text = await readOrNull(join(root, file)) ?? "";
        for (const m of text.matchAll(/["'`]([A-Z][A-Z0-9_]+)["'`]/g)) {
            envNames.add(m[1]);
        }
    }

    const pinnedDeno = [];
    for (
        const file of await listFiles(root, [
            "Dockerfile*",
            ".github/workflows/*",
        ])
    ) {
        const text = await readOrNull(join(root, file)) ?? "";
        pinnedDeno.push(...pinnedDenoVersions(file, text));
    }

    return {
        exists: (pattern) => exists(root, pattern),
        tasks,
        envNames,
        pinnedDeno,
        anchorsOf: async (path) => {
            const text = await readOrNull(join(root, path));
            return text === null ? null : parseMarkdown(text).anchors;
        },
    };
}

/** Links from other Markdown files into the guide must keep resolving. */
async function checkInboundLinks(
    root: string,
    facts: RepoFacts,
): Promise<Problem[]> {
    const problems: Problem[] = [];
    for (const file of await listFiles(root, ["*.md"])) {
        if (file === GUIDE) continue;
        const text = await readOrNull(join(root, file));
        if (text === null) continue;
        const refs = parseMarkdown(text);
        const inbound = refs.links.filter(({ value }) => {
            const path = value.split("#", 1)[0];
            return path !== "" && resolveRelative(file, path) === GUIDE;
        });
        problems.push(
            ...await checkLinks(file, inbound, refs.anchors, facts),
        );
    }
    return problems;
}

if (import.meta.main) {
    const root = Deno.cwd();
    const facts = await loadFacts(root);
    const guide = await Deno.readTextFile(join(root, GUIDE));
    const problems = [
        ...await checkGuide(GUIDE, guide, facts),
        ...await checkInboundLinks(root, facts),
    ];
    for (const { file, line, message } of problems) {
        console.error(`${file}:${line}: ${message}`);
    }
    if (problems.length > 0) {
        console.error(
            `\n${problems.length} stale reference(s). Update ${GUIDE} (see “AGENTS.md 自身维护”) or the referencing file.`,
        );
        Deno.exit(1);
    }
    console.log(`${GUIDE} references match the repository.`);
}
