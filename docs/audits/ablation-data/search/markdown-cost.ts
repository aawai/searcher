// Cost of the per-result DTO derivation that follows the SQL in DocumentsService.toSummaryDto
// (documentDisplayTitle + documentSnippet each run a remark parse). Real functions from HEAD.
import { documentDisplayTitle, documentSnippet } from "file:///home/aawei/searcher/src/features/documents/markdown.ts";
const mk = (n: number) => {
    let s = "# Heading\n\n";
    while (s.length < n) s += "Alpha beta gamma delta 灵感来源是散步 text with `code` and **bold** and [link](https://e.com).\n\n";
    return s.slice(0, n);
};
const out: Record<string, unknown> = { deno: Deno.version, runs: {} };
for (const size of [300, 1700, 11000]) {
    const body = mk(size);
    for (let i = 0; i < 20; i++) { documentDisplayTitle(null, body); documentSnippet(body); }
    const t: Record<string, number[]> = { displayTitle: [], snippet: [], both: [] };
    for (let i = 0; i < 200; i++) {
        let a = performance.now(); documentDisplayTitle(null, body); t.displayTitle.push(performance.now() - a);
        a = performance.now(); documentSnippet(body); t.snippet.push(performance.now() - a);
        a = performance.now(); documentDisplayTitle(null, body); documentSnippet(body); t.both.push(performance.now() - a);
    }
    const med = (x: number[]) => [...x].sort((p, q) => p - q)[x.length >> 1];
    (out.runs as Record<string, unknown>)[`${size}chars`] = { medianMs: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, med(v)])), raw: t };
}
await Deno.writeTextFile(new URL("./results/markdown-cost.json", import.meta.url).pathname, JSON.stringify(out));
for (const [k, v] of Object.entries(out.runs as Record<string, { medianMs: unknown }>)) console.log(k, JSON.stringify(v.medianMs));
