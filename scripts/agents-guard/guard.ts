import { remark } from "remark";
import remarkGfm from "remark-gfm";

/**
 * Repository paths created at runtime or by builds (gitignored or beside the
 * database). AGENTS.md may name them although a clean checkout lacks them.
 */
export const RUNTIME_PATHS: readonly string[] = [
    "data",
    "node_modules",
    "web/dist",
    "wallpapers",
    "icons",
];

interface MdNode {
    type: string;
    value?: unknown;
    url?: unknown;
    depth?: unknown;
    children?: MdNode[];
    position?: { start: { line: number } };
}

export interface CodeRef {
    value: string;
    line: number;
}

export interface MarkdownRefs {
    /** Inline code spans. */
    spans: CodeRef[];
    /** Inline code spans and fenced code block contents. */
    code: CodeRef[];
    links: CodeRef[];
    /** GitHub-style anchors of every heading, in document order. */
    anchors: string[];
}

export function parseMarkdown(markdown: string): MarkdownRefs {
    const root: MdNode = remark().use(remarkGfm).parse(markdown);
    const refs: MarkdownRefs = { spans: [], code: [], links: [], anchors: [] };
    const seen = new Map<string, number>();
    const walk = (node: MdNode) => {
        const line = node.position?.start.line ?? 0;
        const value = typeof node.value === "string" ? node.value : "";
        if (node.type === "inlineCode") {
            refs.spans.push({ value, line });
            refs.code.push({ value, line });
        } else if (node.type === "code") {
            refs.code.push({ value, line });
        } else if (node.type === "link" && typeof node.url === "string") {
            refs.links.push({ value: node.url, line });
        } else if (node.type === "heading") {
            const slug = slugify(textOf(node));
            const count = seen.get(slug) ?? 0;
            seen.set(slug, count + 1);
            refs.anchors.push(count === 0 ? slug : `${slug}-${count}`);
        }
        node.children?.forEach(walk);
    };
    walk(root);
    return refs;
}

function textOf(node: MdNode): string {
    if (typeof node.value === "string") return node.value;
    return (node.children ?? []).map(textOf).join("");
}

/** GitHub heading anchor: lowercase, drop punctuation and symbols, spaces to hyphens. */
export function slugify(heading: string): string {
    return heading.trim().toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
        .replace(/ /g, "-");
}

/** Code spans that name repository paths: relative, containing `/`, no spaces or schemes. */
export function repoPathPatterns(spans: readonly CodeRef[]): CodeRef[] {
    return spans.flatMap(({ value, line }) => {
        if (!/^[\w.@{}*,\-/]+$/.test(value)) return [];
        if (!value.includes("/") || value.startsWith("/")) return [];
        if (value.startsWith("@")) return [];
        const path = value.replace(/^\.\//, "").replace(/\/$/, "");
        const runtime = RUNTIME_PATHS.some((dir) =>
            path === dir || path.startsWith(`${dir}/`)
        );
        if (runtime) return [];
        return expandBraces(value.replace(/^\.\//, "")).map((pattern) => ({
            value: pattern,
            line,
        }));
    });
}

/** Expands `{a,b}` groups (non-nested), e.g. `src/{a,b}.ts` to two paths. */
export function expandBraces(pattern: string): string[] {
    const match = /\{([^{}]*)\}/.exec(pattern);
    if (!match) return [pattern];
    const head = pattern.slice(0, match.index);
    const tail = pattern.slice(match.index + match[0].length);
    return match[1].split(",").flatMap((option) =>
        expandBraces(`${head}${option}${tail}`)
    );
}

/** `deno task <name>` references; a trailing `*` means "some task with this prefix". */
export function taskRefs(code: readonly CodeRef[]): CodeRef[] {
    return code.flatMap(({ value, line }) =>
        [...value.matchAll(/\bdeno task ([\w:.\-*]+)/g)].map((m) => ({
            value: m[1],
            line,
        }))
    );
}

/** Environment variable names: `NAME=` assignments and bare `UPPER_SNAKE` spans. */
export function envRefs(spans: readonly CodeRef[]): CodeRef[] {
    return spans.flatMap(({ value, line }) => {
        const names = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(value)
            ? [value]
            : [...value.matchAll(/(?:^|\s)([A-Z][A-Z0-9_]*)=/g)].map((m) =>
                m[1]
            );
        return names.map((name) => ({ value: name, line }));
    });
}

/** `Deno X.Y.Z+` minimum version statements. */
export function denoVersionRefs(markdown: string): CodeRef[] {
    return markdown.split("\n").flatMap((text, index) =>
        [...text.matchAll(/\bDeno (\d+\.\d+\.\d+)\+/g)].map((m) => ({
            value: m[1],
            line: index + 1,
        }))
    );
}

export interface PinnedVersion {
    source: string;
    version: string;
}

/** Deno versions pinned by Docker base images and `setup-deno` steps. */
export function pinnedDenoVersions(
    source: string,
    content: string,
): PinnedVersion[] {
    const patterns = [
        /denoland\/deno:(?:[a-z]+-)?(\d+\.\d+\.\d+)/g,
        /deno-version:\s*v?(\d+\.\d+\.\d+)/g,
    ];
    return patterns.flatMap((pattern) =>
        [...content.matchAll(pattern)].map((m) => ({ source, version: m[1] }))
    );
}

export interface RepoFacts {
    /** Resolves a repo-relative path or glob; true when at least one entry matches. */
    exists(pattern: string): Promise<boolean>;
    tasks: ReadonlySet<string>;
    envNames: ReadonlySet<string>;
    pinnedDeno: readonly PinnedVersion[];
    /** Anchors of a repo-relative Markdown file, or null when it does not exist. */
    anchorsOf(path: string): Promise<readonly string[] | null>;
}

export interface Problem {
    file: string;
    line: number;
    message: string;
}

/** Checks the guide's own references: paths, tasks, env names, Deno version and links. */
export async function checkGuide(
    file: string,
    markdown: string,
    facts: RepoFacts,
): Promise<Problem[]> {
    const refs = parseMarkdown(markdown);
    const problems: Problem[] = [];
    const report = (line: number, message: string) =>
        problems.push({ file, line, message });

    for (const { value, line } of repoPathPatterns(refs.spans)) {
        if (!await facts.exists(value)) {
            report(line, `path not found: ${value}`);
        }
    }
    for (const { value, line } of taskRefs(refs.code)) {
        const known = value.endsWith("*")
            ? [...facts.tasks].some((task) =>
                task.startsWith(value.slice(0, -1))
            )
            : facts.tasks.has(value);
        if (!known) {
            report(line, `deno task not defined in deno.jsonc: ${value}`);
        }
    }
    for (const { value, line } of envRefs(refs.spans)) {
        if (!facts.envNames.has(value)) {
            report(line, `environment variable not used by the repo: ${value}`);
        }
    }
    for (const { value, line } of denoVersionRefs(markdown)) {
        for (const pinned of facts.pinnedDeno) {
            if (pinned.version !== value) {
                report(
                    line,
                    `Deno ${value}+ disagrees with ${pinned.source} (${pinned.version})`,
                );
            }
        }
    }
    problems.push(...await checkLinks(file, refs.links, refs.anchors, facts));
    return problems;
}

/**
 * Checks relative links of `file`; `ownAnchors` resolves same-file `#anchor`
 * links without another read.
 */
export async function checkLinks(
    file: string,
    links: readonly CodeRef[],
    ownAnchors: readonly string[],
    facts: RepoFacts,
): Promise<Problem[]> {
    const problems: Problem[] = [];
    for (const { value, line } of links) {
        if (/^[a-z][a-z+.-]*:/i.test(value)) continue;
        const [rawPath, rawAnchor] = value.split("#", 2);
        const path = rawPath ? resolveRelative(file, decodeURI(rawPath)) : file;
        const anchor = rawAnchor === undefined
            ? undefined
            : decodeURIComponent(rawAnchor);
        if (anchor === undefined || !path.endsWith(".md")) {
            if (rawPath && !await facts.exists(path)) {
                problems.push({
                    file,
                    line,
                    message: `link target not found: ${value}`,
                });
            }
            continue;
        }
        const anchors = path === file
            ? ownAnchors
            : await facts.anchorsOf(path);
        if (anchors === null) {
            problems.push({
                file,
                line,
                message: `link target not found: ${value}`,
            });
        } else if (!anchors.includes(anchor)) {
            problems.push({
                file,
                line,
                message: `anchor not found: ${value}`,
            });
        }
    }
    return problems;
}

/** Repo-relative path of `target` as linked from repo-relative `from`. */
export function resolveRelative(from: string, target: string): string {
    if (target.startsWith("/")) return target.replace(/^\/+/, "");
    const parts = from.split("/").slice(0, -1);
    for (const segment of target.split("/")) {
        if (segment === "" || segment === ".") continue;
        if (segment === "..") parts.pop();
        else parts.push(segment);
    }
    return parts.join("/");
}
