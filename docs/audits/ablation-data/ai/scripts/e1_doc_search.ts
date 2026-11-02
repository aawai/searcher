// E1: real DocumentsService.search (HEAD) on synthetic corpus: latency vs N, recall by query class,
// E1 NOTE: baseline = DocumentsService.search (builds summary DTOs, rank/cursor, notebook join); orVariant = raw SQL returning ids only. Latencies are NOT comparable and the variant is NOT an equivalent replacement; only recall is compared.
import { DocumentsService } from "/home/aawei/searcher/.worktrees/ablation-study-20261102/src/features/documents/service.ts";
import { sql } from "drizzle-orm";
import { addUser, makeStore, rng, saveRaw, summarize } from "./lib.ts";

const SIZES = (Deno.env.get("SIZES") ?? "500,2000,10000").split(",").map(Number);
const REPS = 15;
const r = rng(42);
const syll = ["ka","lo","mi","ra","tu","ve","so","ni","pa","de","go","hu","fi","bo","ze"];
const mkWord = (len: number) => { let w = ""; for (let i = 0; i < len; i++) w += syll[Math.floor(r() * syll.length)]; return w; };
const vocab = Array.from({ length: 3000 }, () => mkWord(2 + Math.floor(r() * 3)));
const filler = ["about", "notes", "meeting", "project", "plan", "the", "and", "what", "did", "write"];
const zipf = () => vocab[Math.min(vocab.length - 1, Math.floor(Math.pow(r(), 3) * vocab.length))];
const cjk = [..."的一是不了人我在有他这中大来上国个到说们为子和你地出道也时年得就那要下以生会自着去之过家学对可她里后小么心多天而能好都然没日于起还发成事只作当想看文无开手十用主行方又如前所本见经头面公同三已老从动两长知民样现分将外但身些与高意进把法此实回二理美点月明其种声全工已话儿者向情部正名定女问力机给等几很业最间新什写政度"];
const cjkRand = (n: number) => { let s = ""; for (let i = 0; i < n; i++) s += cjk[Math.floor(r() * cjk.length)]; return s; };

interface Needle { id: string; rare: string[]; cn: string; q: Record<string, string> }
const needles: Needle[] = [];

async function build(n: number) {
    const { store, cleanup } = await makeStore(`e1-${n}`);
    await addUser(store, "u1");
    const docs = new DocumentsService(store);
    const NEEDLES = 30;
    const needleAt = new Set<number>();
    while (needleAt.size < NEEDLES) needleAt.add(Math.floor(r() * n));
    needles.length = 0;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
        const words: string[] = [];
        const L = 120 + Math.floor(r() * 60);
        for (let j = 0; j < L; j++) words.push(r() < 0.12 ? filler[Math.floor(r() * filler.length)] : zipf());
        let body = words.join(" ") + "。" + cjkRand(150);
        let title = `${zipf()} ${zipf()} ${zipf()}`;
        if (needleAt.has(i)) {
            const rare = [`zq${mkWord(3)}x`, `qj${mkWord(3)}y`];
            const cn = cjkRand(5) + "甲乙丙丁"[needles.length % 4] + "戊";
            body += ` ${rare[0]} ${rare[1]} ${cn} xk`;
            title = needles.length % 2 === 0 ? `${rare[0]} ${title}` : title;
            const d = await docs.create("u1", { title, body });
            needles.push({ id: d.id, rare, cn, q: {
                A_single_rare: rare[0],
                B_two_rare_AND: `${rare[0]} ${rare[1]}`,
                C_nl_with_filler: `what did I write about ${rare[0]} and ${rare[1]}`,
                D_nl_with_absent_word: `${rare[0]} ${rare[1]} yesterday`,
                E_2char_scan: `xk`,
                F_cjk_exact_substring: cn,
                G_cjk_question_wrapped: `请问我之前记录的${cn}是什么`,
            }});
        } else await docs.create("u1", { title, body });
    }
    const buildMs = performance.now() - t0;
    return { store, docs, cleanup, buildMs };
}

async function orVariant(store: any, userId: string, q: string, limit: number): Promise<string[]> {
    const terms = q.split(/\s+/).filter((t) => [...t].length >= 3).map((t) => `"${t.replaceAll('"', '""')}"`);
    if (terms.length === 0) return [];
    const m = terms.join(" OR ");
    return await store.run(async (db: any) => {
        const rows = await db.all(sql`SELECT d.id FROM documents_fts JOIN documents d ON d.id = documents_fts.document_id
            WHERE documents_fts MATCH ${m} AND documents_fts.user_id = ${userId} AND d.deleted_at IS NULL
            ORDER BY documents_fts.rank LIMIT ${limit}`);
        return rows.map((x: any) => String(x[0]));
    });
}

const out: any[] = [];
for (const n of SIZES) {
    const { store, docs, cleanup, buildMs } = await build(n);
    const classes = Object.keys(needles[0].q);
    const res: any = { n, buildMs, classes: {} };
    for (const c of classes) {
        const lat: number[] = [], latOr: number[] = [];
        let hit = 0, hitOr = 0, empty = 0; const rawHits: any[] = [];
        for (const nd of needles) {
            const q = nd.q[c];
            let ids: string[] = [];
            for (let k = 0; k < REPS; k++) {
                const t = performance.now();
                const page = await docs.search("u1", q, { limit: 5 });
                lat.push(performance.now() - t);
                ids = page.items.map((x) => x.id);
            }
            if (ids.length === 0) empty++;
            const h = ids.includes(nd.id); if (h) hit++;
            let idsOr: string[] = [];
            for (let k = 0; k < REPS; k++) {
                const t = performance.now();
                idsOr = await orVariant(store, "u1", q, 5);
                latOr.push(performance.now() - t);
            }
            const hOr = idsOr.includes(nd.id); if (hOr) hitOr++;
            rawHits.push({ q, hit: h, hitOr: hOr, n: ids.length });
        }
        res.classes[c] = {
            recallAt5_baseline: hit / needles.length, emptyResultRate_baseline: empty / needles.length,
            recallAt5_orVariant: hitOr / needles.length,
            latencyMs_baseline: summarize(lat), latencyMs_orVariant: summarize(latOr), rawHits,
        };
        console.log(n, c, `recall base=${(hit / needles.length).toFixed(2)} or=${(hitOr / needles.length).toFixed(2)} p50=${res.classes[c].latencyMs_baseline.p50.toFixed(2)}ms p95=${res.classes[c].latencyMs_baseline.p95.toFixed(2)}ms`);
    }
    out.push(res);
    await cleanup();
}
await saveRaw("e1_doc_search", out);
