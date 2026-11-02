// Pure-function microbench in Deno on the REAL modules (no DOM). Run:
//   deno run -A --no-lock --config /home/aawei/searcher/deno.jsonc microbench.ts > results/microbench.json
import { analyzeDocumentMarkdown, countDocumentWords } from "/home/aawei/searcher/web/src/features/documents/editor-content.ts";
import { analyzeNoteBody } from "/home/aawei/searcher/web/src/features/workspace/note-summary.ts";

function gen(chars: number): string {
    const out: string[] = [];
    let n = 0, i = 0;
    while (n < chars) {
        const b: string[] = [];
        b.push(`## 第 ${i} 节 Section ${i}`);
        b.push(`这是第 ${i} 节的正文，用于测量编辑器在中文与 English words 混排时的真实排版成本。Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor ${i}. **加粗**与*斜体*以及\`行内代码\`和[链接](https://example.com/${i})。`);
        b.push(`第二段 paragraph ${i}：笔记是唯一的 Markdown 实体，编辑、分页和源码三种视图共用一份正文。Autosave debounce is 1500ms and drafts live in IndexedDB. 字数按 CJK 字符和英文单词统计。`);
        b.push(`- 列表项 A ${i}\n- 列表项 B ${i}\n- 列表项 C ${i}`);
        if (i % 3 === 0) b.push(`- [ ] 任务 ${i}\n- [x] 完成 ${i}`);
        if (i % 5 === 0) b.push(`> 引用块 ${i}：一段较长的引用文字用于覆盖 blockquote 的测量路径。`);
        if (i % 7 === 0) b.push(`| 列 A | 列 B | 列 C |\n| --- | --- | --- |\n| ${i} | x | y |\n| ${i + 1} | z | w |`);
        if (i % 11 === 0) b.push("```ts\nconst answer = 42;\nconsole.log(answer);\n```");
        if (i % 13 === 0) b.push("<!-- pagebreak -->");
        const s = b.join("\n\n");
        out.push(s); n += s.length + 2; i++;
    }
    return out.join("\n\n") + "\n";
}
function time(fn: () => unknown, iters: number) {
    for (let i = 0; i < 3; i++) fn();
    const t: number[] = [];
    for (let i = 0; i < iters; i++) { const s = performance.now(); fn(); t.push(performance.now() - s); }
    t.sort((a, b) => a - b);
    return { median: t[Math.floor(t.length / 2)], min: t[0], max: t[t.length - 1], raw: t };
}
const res: Record<string, unknown>[] = [];
for (const chars of [5000, 20000, 100000, 300000, 1000000]) {
    const body = gen(chars);
    const iters = chars >= 300000 ? 9 : 25;
    res.push({
        chars: body.length,
        analyzeDocumentMarkdown: time(() => analyzeDocumentMarkdown(body), iters),
        analyzeNoteBody: time(() => analyzeNoteBody(body), iters),
        countDocumentWordsOnPlain: time(() => countDocumentWords(body), iters),
    });
}
console.log(JSON.stringify({ deno: Deno.version, date: new Date().toISOString(), res }));
