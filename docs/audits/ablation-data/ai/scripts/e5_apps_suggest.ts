// E5: lookup_apps (listWebApps + in-memory includes, as in tools.ts) vs BookmarksService.searchWebApps (SQL, per-term AND, ranked);
//     SearchService.getSuggestions history window (listHistory(userId, 20)).
import { executeToolCall } from "/home/aawei/searcher/.worktrees/ablation-study-20261102/src/features/ai/tools.ts";
import { BookmarksService } from "/home/aawei/searcher/.worktrees/ablation-study-20261102/src/features/bookmarks/service.ts";
import { SearchService } from "/home/aawei/searcher/.worktrees/ablation-study-20261102/src/features/search/service.ts";
import { addUser, makeStore, rng, saveRaw, summarize } from "./lib.ts";

const r = rng(7);
const words = ["github", "issues", "tracker", "mail", "docs", "wiki", "board", "calendar", "drive", "music", "video", "news", "shop", "maps", "notes", "chat"];
const pick = () => words[Math.floor(r() * words.length)];
const out: any = { apps: [] };
for (const n of [100, 1000, 10000]) {
    const { store, cleanup } = await makeStore(`e5-${n}`);
    await addUser(store, "u1");
    const svc = new BookmarksService(store);
    await store.nativeTransaction((nat) => {
        const ins = nat.prepare("INSERT INTO webapps (id,user_id,name,url,icon_source,sort_order,is_home_fixed,open_mode,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
        for (let i = 0; i < n; i++) ins.run(crypto.randomUUID(), "u1", `${pick()} ${pick()} ${i}`, `https://${pick()}${i}.example.com/${pick()}`, "default", i, 0, "global", 1, 1);
        ins.run("needle1", "u1", "Alpha Tracker Issues", "https://zz.example.com/", "default", n + 1, 0, "global", 1, 1);
    });
    const qs = { single_name_word: "alpha", multi_in_order: "tracker issues", multi_reversed: "issues tracker", nl_with_filler: "my alpha tracker app" };
    const row: any = { n, queries: {} };
    for (const [qn, q] of Object.entries(qs)) {
        const t1: number[] = [], t2: number[] = []; let a: any, b: any;
        for (let k = 0; k < 20; k++) {
            let t = performance.now();
            const res = await executeToolCall("lookup_apps", { query: q }, { userId: "u1", store, allowedTools: { documents: false, apps: true, webSearch: false } });
            t1.push(performance.now() - t); a = res.result;
            t = performance.now(); b = await svc.searchWebApps("u1", q, 20); t2.push(performance.now() - t);
        }
        row.queries[qn] = { q, toolFoundNeedle: (a as any[]).some((x) => x.id === "needle1"), toolCount: (a as any[]).length, sqlFoundNeedle: b.some((x: any) => x.id === "needle1"), sqlCount: b.length, toolMs: summarize(t1), sqlMs: summarize(t2) };
        console.log(n, qn, JSON.stringify({ tool: row.queries[qn].toolFoundNeedle, sql: row.queries[qn].sqlFoundNeedle, toolP50: t1.length && summarize(t1).p50.toFixed(2), sqlP50: summarize(t2).p50.toFixed(2) }));
    }
    out.apps.push(row);
    await cleanup();
}
// suggestions history window
{
    const { store, cleanup } = await makeStore("e5-hist");
    await addUser(store, "u1");
    await store.nativeTransaction((nat) => {
        nat.prepare("INSERT INTO preferences (user_id) VALUES (?)").run("u1");
    }).catch(() => {});
    await store.nativeTransaction((nat) => {
        const ins = nat.prepare("INSERT INTO search_history (id,user_id,query,engine_id,created_at) VALUES (?,?,?,?,?)");
        for (let i = 0; i < 500; i++) ins.run(crypto.randomUUID(), "u1", i === 0 ? "kubernetes operator guide" : `filler query ${i}`, "google", 1000 + i);
    });
    const empty = { fetchSuggestions: () => Promise.resolve([] as string[]) };
    const s = new SearchService(store, { googleAdapter: empty, bingAdapter: empty });
    const old = await s.getSuggestions("kubernetes", "google", "u1");
    const recentMatch = await s.getSuggestions("filler query 4", "google", "u1");
    out.suggestions = { historyRows: 500, oldestEntryMatchedBy_kubernetes: old.map((x) => x.text), recentFillerMatches: recentMatch.length };
    console.log(JSON.stringify(out.suggestions));
    await cleanup();
}
await saveRaw("e5_apps_suggest", out);
