// Experiment harness. Imports the REAL production modules at the baseline commit
// (read-only, from /home/aawei/searcher/web/src) and wires them the way
// web/src/features/documents/DocumentEditor.tsx (effect #7/#9) wires them.
// The only emulated part is React: session.subscribe + useMemo(analyzeDocumentMarkdown).
import { TextSelection } from "@milkdown/prose/state";
import "/home/aawei/searcher/web/src/styles/global.css";
import "/home/aawei/searcher/web/src/components/searcher/markdown.css";
import "/home/aawei/searcher/web/src/features/markdown-editor/structural.css";
import "/home/aawei/searcher/web/src/features/documents/document-editor.css";
import "/home/aawei/searcher/web/src/features/documents/document-pagination.css";
import { createMarkdownEditor } from "/home/aawei/searcher/web/src/features/markdown-editor/runtime.ts";
import {
    createDocumentExtensions,
} from "/home/aawei/searcher/web/src/features/documents/editor-extensions.ts";
import { createDocumentPagination } from "/home/aawei/searcher/web/src/features/documents/document-pagination.ts";
import { createDocumentSession } from "/home/aawei/searcher/web/src/features/documents/document-session.ts";
import { analyzeDocumentMarkdown } from "/home/aawei/searcher/web/src/features/documents/editor-content.ts";
import { DEFAULT_PAPER_SETTINGS } from "/home/aawei/searcher/web/src/features/documents/paper.ts";
import { deleteLocal, getLocal, setLocal } from "/home/aawei/searcher/web/src/lib/local.ts";

export interface Cfg {
    chars: number; // target markdown size
    extensions: "none" | "full"; // createDocumentExtensions(...) incl. toolbar-state plugin
    onChange: "none" | "serialize" | "session"; // none => runtime gets no onChange (no per-tx serialize)
    drafts: "idb" | "memory"; // only with session
    analysis: boolean; // analyzeDocumentMarkdown on each body change (emulates useMemo)
    pagination: "none" | "continuous" | "page"; // plugin absent / present+continuous / page
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;

function gen(chars: number): string {
    const out: string[] = [];
    let n = 0;
    let i = 0;
    while (n < chars) {
        const b: string[] = [];
        b.push(`## 第 ${i} 节 Section ${i}`);
        b.push(
            `这是第 ${i} 节的正文，用于测量编辑器在中文与 English words 混排时的真实排版成本。` +
                `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor ${i}. ` +
                `**加粗**与*斜体*以及\`行内代码\`和[链接](https://example.com/${i})。`,
        );
        b.push(
            `第二段 paragraph ${i}：笔记是唯一的 Markdown 实体，编辑、分页和源码三种视图共用一份正文。` +
                `Autosave debounce is 1500ms and drafts live in IndexedDB. 字数按 CJK 字符和英文单词统计。`,
        );
        b.push(`- 列表项 A ${i}\n- 列表项 B ${i}\n- 列表项 C ${i}`);
        if (i % 3 === 0) b.push(`- [ ] 任务 ${i}\n- [x] 完成 ${i}`);
        if (i % 5 === 0) b.push(`> 引用块 ${i}：一段较长的引用文字用于覆盖 blockquote 的测量路径。`);
        if (i % 7 === 0) {
            b.push(`| 列 A | 列 B | 列 C |\n| --- | --- | --- |\n| ${i} | x | y |\n| ${i + 1} | z | w |`);
        }
        if (i % 11 === 0) b.push("```ts\nconst answer = 42;\nconsole.log(answer);\n```");
        if (i % 13 === 0) b.push("<!-- pagebreak -->");
        const s = b.join("\n\n");
        out.push(s);
        n += s.length + 2;
        i++;
    }
    return out.join("\n\n") + "\n";
}

interface Rec {
    dispatchMs: number; // sum of view.dispatchTransaction wall time for docChanged tx (incl. plugin state apply, serialize, session.edit, view update)
    frameMs: number; // keydown(capture) -> macrotask after the first rAF frame
    analysisMs: number;
    layoutMs: number; // sum of pagination durationMs for layouts that ran after the key
    layouts: number;
    measurements: number;
    draftWrites: number;
    draftWriteMsMax: number; // enqueue -> resolve for the slowest write
}

const state: {
    cfg?: Cfg;
    handle?: Awaited<ReturnType<typeof createMarkdownEditor>>;
    pagination?: ReturnType<typeof createDocumentPagination>;
    session?: ReturnType<typeof createDocumentSession>;
    cur: Rec;
    recs: Rec[];
    outstandingDrafts: number;
    lastDraftDoneAt: number;
    saveCalls: number;
    t0: number;
    pendingFrame: Promise<void> | null;
    cold: Record<string, number>;
    body: string;
} = {
    cur: blank(),
    recs: [],
    outstandingDrafts: 0,
    lastDraftDoneAt: 0,
    saveCalls: 0,
    t0: 0,
    pendingFrame: null,
    cold: {},
    body: "",
};

function blank(): Rec {
    return {
        dispatchMs: 0,
        frameMs: 0,
        analysisMs: 0,
        layoutMs: 0,
        layouts: 0,
        measurements: 0,
        draftWrites: 0,
        draftWriteMsMax: 0,
    };
}

const raf2 = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function setup(cfg: Cfg) {
    state.cfg = cfg;
    await new Promise<void>((resolve) => {
        const r = indexedDB.deleteDatabase("searcher-client");
        r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
    const markdown = gen(cfg.chars);
    state.body = markdown;
    const root = $("root");
    const viewport = $("viewport");
    const scroll = $("scroll");

    let onChange: ((e: { markdown: string; origin: string }) => void) | undefined;
    if (cfg.onChange !== "none") {
        onChange = () => {};
    }
    if (cfg.onChange === "session") {
        const idbWrap = {
            read: (key: string) => getLocal<unknown>(key),
            write: async (key: string, value: unknown) => {
                const t = performance.now();
                state.outstandingDrafts++;
                try {
                    await setLocal(key, value);
                } finally {
                    state.outstandingDrafts--;
                    const d = performance.now() - t;
                    state.cur.draftWrites++;
                    state.cur.draftWriteMsMax = Math.max(state.cur.draftWriteMsMax, d);
                    state.lastDraftDoneAt = performance.now();
                }
            },
            delete: (key: string) => deleteLocal(key),
        };
        const mem = new Map<string, unknown>();
        const memWrap = {
            read: (key: string) => Promise.resolve(mem.get(key)),
            write: (key: string, value: unknown) => {
                state.cur.draftWrites++;
                mem.set(key, value);
                return Promise.resolve();
            },
            delete: (key: string) => {
                mem.delete(key);
                return Promise.resolve();
            },
        };
        const doc = {
            id: "doc-1", title: "bench", displayTitle: "bench", body: markdown, version: 1,
            color: "paper", isHomeFixed: false, homeSortOrder: 0, isFavorite: false,
            notebookId: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
        };
        const request = (path: string, init?: RequestInit) => {
            if (init?.method === "PATCH") {
                state.saveCalls++;
                return Promise.resolve({ ...doc, version: doc.version + 1 });
            }
            return Promise.resolve(doc);
        };
        const session = createDocumentSession({
            userId: "user-1",
            documentId: "doc-1",
            request: request as never,
            drafts: (cfg.drafts === "idb" ? idbWrap : memWrap) as never,
        });
        await session.load();
        state.session = session;
        let lastBody = session.getSnapshot().body;
        session.subscribe(() => {
            const snap = session.getSnapshot();
            if (snap.body !== lastBody) {
                lastBody = snap.body;
                if (cfg.analysis) {
                    const t = performance.now();
                    analyzeDocumentMarkdown(snap.body);
                    state.cur.analysisMs += performance.now() - t;
                }
            }
        });
        onChange = (e) => {
            if (e.origin === "user") session.edit({ body: e.markdown });
        };
    }

    const plugins = cfg.extensions === "full"
        ? createDocumentExtensions({
            get documentId() {
                return "doc-1";
            },
            onUpload: async () => "asset",
            onError: () => {},
            onToolbarStateChange: () => {},
        })
        : [];
    if (cfg.pagination !== "none") {
        state.pagination = createDocumentPagination(root, viewport, {
            paper: DEFAULT_PAPER_SETTINGS,
            scrollViewport: scroll,
            onLayout: (s) => {
                state.cur.layouts++;
                state.cur.layoutMs += s.durationMs ?? 0;
                state.cur.measurements += s.measurements;
                (state.cold as Record<string, number>).pages = s.pages;
            },
        });
        plugins.push(state.pagination.plugin);
    }
    await document.fonts.ready;
    const tCreate = performance.now();
    state.handle = await createMarkdownEditor(root, markdown, onChange as never, { plugins });
    state.cold.createMs = performance.now() - tCreate;
    state.pagination?.attach(state.handle);
    if (cfg.pagination === "page") {
        const t = performance.now();
        state.pagination!.setMode("page");
        await raf2();
        await raf2();
        state.cold.firstPageLayoutSettleMs = performance.now() - t;
        state.cold.firstPageLayoutDurationMs = state.pagination!.getSnapshot().durationMs ?? -1;
        state.cold.pages = state.pagination!.getSnapshot().pages;
    } else if (state.pagination) {
        await raf2();
        await raf2();
    }
    state.cold.dom = root.querySelectorAll("*").length;

    // wrap dispatchTransaction to time the synchronous transaction path
    const view = state.handle.view;
    const orig = view.props.dispatchTransaction ?? ((tr) => view.updateState(view.state.apply(tr)));
    view.setProps({
        dispatchTransaction(tr) {
            if (!tr.docChanged) return orig.call(view, tr);
            const t = performance.now();
            orig.call(view, tr);
            state.cur.dispatchMs += performance.now() - t;
        },
    });

    // caret in the middle paragraph
    const d = view.state.doc;
    let pos = 0;
    const mid = Math.floor(d.childCount / 2);
    for (let i = 0; i < d.childCount; i++) {
        if (i === mid) {
            pos += d.child(i).nodeSize - 1;
            break;
        }
        pos += d.child(i).nodeSize;
    }
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos), -1)));
    view.focus();
    state.cur = blank();
    state.recs = [];

    document.addEventListener("keydown", () => {
        state.cur = blank();
        state.t0 = performance.now();
        const rec = state.cur;
        state.pendingFrame = new Promise((resolve) => {
            requestAnimationFrame(() => {
                setTimeout(() => {
                    rec.frameMs = performance.now() - state.t0;
                    resolve();
                }, 0);
            });
        });
    }, true);
    return {
        cold: state.cold,
        mdChars: markdown.length,
        blocks: view.state.doc.childCount,
        pmSize: view.state.doc.content.size,
    };
}

// called after each real key press; waits for frame + trailing reflows + draft queue to drain
async function settle() {
    await state.pendingFrame;
    const rec = state.cur;
    await raf2();
    await raf2();
    while (state.outstandingDrafts > 0) await sleep(1);
    state.recs.push(rec);
    const out = { ...rec };
    return out;
}

// n back-to-back transactions without yielding (fast typing / paste-like burst)
async function burst(n: number) {
    const view = state.handle!.view;
    state.cur = blank();
    const rec = state.cur;
    const t = performance.now();
    for (let i = 0; i < n; i++) {
        const sel = view.state.selection;
        view.dispatch(view.state.tr.insertText("x", sel.from, sel.to).scrollIntoView());
    }
    const loopMs = performance.now() - t;
    const tDrain = performance.now();
    while (state.outstandingDrafts > 0) await sleep(1);
    const drainMs = performance.now() - tDrain;
    await raf2();
    await raf2();
    return { n, loopMs, drainMs, perTxMs: loopMs / n, draftWrites: rec.draftWrites, saveCalls: state.saveCalls };
}

async function teardown() {
    state.pagination?.destroy();
    await state.session?.destroy();
    await state.handle?.destroy();
}

Object.assign(window, { __setup: setup, __settle: settle, __burst: burst, __teardown: teardown, __gen: gen });
(window as unknown as { __ready: boolean }).__ready = true;
