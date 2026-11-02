// Search ablation benchmark (SearchStudy). Imports REAL modules from the main checkout (read-only,
// HEAD 33e0c1f); every database lives under this directory. Run:
//   cd /home/aawei/experiments/search-study && ./run.sh   (see run.sh for the exact command)
// Variants of the document query are SQL replicas of DocumentsService.search (service.ts:1425-1498);
// every variant is gated against the real service/replica result before its timings are trusted.
import { sql } from "drizzle-orm";
import { openDatabase } from "file:///home/aawei/searcher/src/db/database.ts";
import { migrateDatabase } from "file:///home/aawei/searcher/src/db/migrate.ts";
import { DocumentsService } from "file:///home/aawei/searcher/src/features/documents/service.ts";
import { BookmarksService } from "file:///home/aawei/searcher/src/features/bookmarks/service.ts";
import { PersonalSearchService } from "file:///home/aawei/searcher/src/features/search/personal.ts";
import { SearchService } from "file:///home/aawei/searcher/src/features/search/service.ts";
import type { SuggestionAdapter } from "file:///home/aawei/searcher/src/features/search/adapters.ts";

const ROOT = new URL(".", import.meta.url).pathname;
const ROUNDS = Number(Deno.env.get("ROUNDS") ?? 30);
const WARMUP = 3;
const LIMIT = 5; // PERSONAL_SEARCH_DEFAULT_LIMIT path
const ONLY = Deno.env.get("FIXTURES")?.split(",");

// ---------- deterministic corpus ----------
function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const LETTERS = "abcdefghijklmnoprstuvwy"; // no q/x/z: those only appear in planted terms
const rv = mulberry32(42);
const VOCAB: string[] = [];
{
    const seen = new Set<string>();
    while (VOCAB.length < 3000) {
        const len = 5 + Math.floor(rv() * 4);
        let w = "";
        for (let i = 0; i < len; i++) w += LETTERS[Math.floor(rv() * LETTERS.length)];
        if (!seen.has(w)) {
            seen.add(w);
            VOCAB.push(w);
        }
    }
}
const CJK = Array.from({ length: 400 }, (_, i) => String.fromCodePoint(0x4E00 + i));
function zipf(n: number) {
    const cdf: number[] = [];
    let s = 0;
    for (let i = 0; i < n; i++) cdf.push(s += 1 / (i + 1));
    return (r: number) => {
        const x = r * s;
        let lo = 0, hi = n - 1;
        while (lo < hi) {
            const m = (lo + hi) >> 1;
            if (cdf[m] < x) lo = m + 1;
            else hi = m;
        }
        return lo;
    };
}
const pickWord = zipf(VOCAB.length), pickChar = zipf(CJK.length);

interface FixtureSpec {
    name: string;
    docs: number;
    bodyLen: number;
    apps: number;
}
const FIXTURES: FixtureSpec[] = [
    { name: "s1k", docs: 1000, bodyLen: 1200, apps: 100 },
    { name: "m10k", docs: 10000, bodyLen: 1200, apps: 500 },
    { name: "l50k", docs: 50000, bodyLen: 1200, apps: 500 },
    { name: "xlbody5k", docs: 5000, bodyLen: 8000, apps: 500 },
    { name: "apps5k", docs: 200, bodyLen: 1200, apps: 5000 },
];

function genBody(r: () => number, len: number): string {
    const paras: string[] = [];
    let n = 0;
    while (n < len) {
        let p = "";
        if (r() < 0.6) {
            const k = 8 + Math.floor(r() * 8);
            p = Array.from({ length: k }, () => VOCAB[pickWord(r())]).join(" ");
        } else {
            const k = 20 + Math.floor(r() * 20);
            p = Array.from({ length: k }, () => CJK[pickChar(r())]).join("");
        }
        paras.push(p);
        n += p.length + 2;
    }
    return paras.join("\n\n");
}
function genTitle(r: () => number): string | null {
    const x = r();
    if (x < 0.3) return null;
    if (x < 0.8) return Array.from({ length: 3 }, () => VOCAB[pickWord(r())]).join(" ");
    return Array.from({ length: 6 }, () => CJK[pickChar(r())]).join("");
}
function plant(r: () => number, body: string, title: string | null) {
    const add: string[] = [];
    if (r() < 0.01) {
        add.push("zqxrare");
        if (r() < 0.1) title = (title ?? "") + " zqxrare";
    }
    if (r() < 0.10) add.push("zqxmid");
    if (r() < 0.01) add.push("橘猫咖啡");
    if (r() < 0.02) add.push("橘猫");
    if (add.length) body = body + "\n\n" + add.join(" ");
    return { body, title };
}

async function seedFixture(spec: FixtureSpec, path: string) {
    const store = openDatabase(path);
    await migrateDatabase(store);
    const r = mulberry32(1000 + spec.docs + spec.apps);
    await store.nativeTransaction((native) => {
        const u = native.prepare(
            "INSERT INTO users(id,username,display_name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        );
        u.run("user-1", "user1", "U1", "h", 1, 1);
        u.run("user-2", "user2", "U2", "h", 1, 1);
        const d = native.prepare(
            "INSERT INTO documents(id,user_id,title,current_body,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?)",
        );
        const total = spec.docs + Math.floor(spec.docs / 10);
        for (let i = 0; i < total; i++) {
            const owner = i < spec.docs ? "user-1" : "user-2";
            const t = plant(r, genBody(r, spec.bodyLen), genTitle(r));
            const upd = 1_000_000_000_000 + Math.floor(r() * 1e9);
            const del = r() < 0.03 ? upd + 1 : null; // inserted already soft-deleted: no FTS row
            d.run(`${owner}-d${i}`, owner, t.title, t.body, upd, upd, del);
        }
        // Soft-delete 2% of live docs via UPDATE so documents_au removes the FTS row.
        native.exec(
            "UPDATE documents SET deleted_at=updated_at+2 WHERE deleted_at IS NULL AND abs(random())%100<2",
        );
        const a = native.prepare(
            "INSERT INTO webapps(id,user_id,name,url,sort_order,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?)",
        );
        const totalApps = spec.apps + Math.floor(spec.apps / 10);
        for (let i = 0; i < totalApps; i++) {
            const owner = i < spec.apps ? "user-1" : "user-2";
            let name = r() < 0.7
                ? Array.from({ length: 2 }, () => VOCAB[pickWord(r())]).join(" ")
                : Array.from({ length: 4 }, () => CJK[pickChar(r())]).join("");
            let url = `https://${VOCAB[pickWord(r())]}.example.com/${VOCAB[pickWord(r())]}`;
            if (r() < 0.01) name += " zqxrare";
            else if (r() < 0.02) url += "/zqxrare";
            if (r() < 0.01) name += "橘猫";
            a.run(
                `${owner}-a${i}`,
                owner,
                name,
                url,
                Math.floor(r() * 1000),
                1000 + i,
                1000 + i,
                r() < 0.05 ? 5000 : null,
            );
        }
    });
    await store.exclusiveNative((native) => {
        native.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        return Promise.resolve();
    });
    await store.close();
}

// ---------- document query variants (SQL replicas) ----------
interface Flags {
    userOnD?: boolean; // add d.user_id = ? on the MATCH path (equivalent, redundant defence)
    like?: boolean; // LIKE ... ESCAPE instead of instr(lower(..),lower(..))
    noDeletedOnMatch?: boolean; // invariant-dependent
    noScan?: boolean; // product trade-off: drop short-term scan
    titleWeight?: boolean; // product trade-off: bm25 title weight
    preview300?: boolean; // product trade-off: always substr 300
    leakNoFtsUser?: boolean; // NEGATIVE CONTROL (permission regression, never acceptable)
}
const TITLE_WS =
    "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
// Copy of parseSearchTerms (documents/service.ts:114-129 at HEAD).
function parseTerms(raw: string) {
    const phrases: string[] = [];
    const scan: string[] = [];
    for (const term of raw.split(/\s+/)) {
        if (term.length === 0) continue;
        if ([...term].length >= 3) phrases.push(`"${term.replaceAll('"', '""')}"`);
        else scan.push(term);
    }
    return { match: phrases.length > 0 ? phrases.join(" AND ") : null, scan };
}
const escLike = (t: string) => `%${t.replace(/[\\%_]/g, "\\$&")}%`;

function docSql(userId: string, q: string, limit: number, f: Flags) {
    let terms = parseTerms(q.trim());
    if (f.noScan) {
        terms = { match: terms.match, scan: [] };
        if (terms.match === null) return null;
    }
    const titleHit = (t: string) =>
        f.like
            ? sql`coalesce(d.title, '') LIKE ${escLike(t)} ESCAPE '\\'`
            : sql`instr(lower(coalesce(d.title, '')), lower(${t})) > 0`;
    const scanHit = (t: string) =>
        f.like
            ? sql`(${titleHit(t)} OR d.current_body LIKE ${escLike(t)} ESCAPE '\\')`
            : sql`(${titleHit(t)} OR instr(lower(d.current_body), lower(${t})) > 0)`;
    const bonus = terms.scan.length > 0
        ? sql`CASE WHEN ${sql.join(terms.scan.map(titleHit), sql` AND `)} THEN ${10_000_000_000_000} ELSE 0 END`
        : sql`0`;
    const rank = terms.match !== null
        ? (f.titleWeight ? sql`bm25(documents_fts, 0, 0, 5.0, 1.0)` : sql`documents_fts.rank`)
        : sql`(-d.updated_at - ${bonus})`;
    const scanSql = terms.scan.length > 0
        ? sql` AND ${sql.join(terms.scan.map(scanHit), sql` AND `)}`
        : sql``;
    const userClause = f.leakNoFtsUser ? sql`` : sql` AND documents_fts.user_id = ${userId}`;
    const dUser = f.userOnD ? sql` AND d.user_id = ${userId}` : sql``;
    const source = terms.match !== null
        ? sql`FROM documents_fts
            JOIN documents d ON d.id = documents_fts.document_id
            LEFT JOIN document_notebooks nb ON nb.id = d.notebook_id
            WHERE documents_fts MATCH ${terms.match}${userClause}${dUser}`
        : sql`FROM documents d
            LEFT JOIN document_notebooks nb ON nb.id = d.notebook_id
            WHERE d.user_id = ${userId}`;
    const deleted = terms.match !== null && f.noDeletedOnMatch
        ? sql``
        : sql` AND d.deleted_at IS NULL`;
    const preview = f.preview300
        ? sql`substr(d.current_body, 1, 300)`
        : sql`CASE WHEN length(trim(coalesce(d.title, ''), ${TITLE_WS})) = 0 THEN d.current_body ELSE substr(d.current_body, 1, 300) END`;
    return sql`
        SELECT d.id, d.title, d.notebook_id, d.is_favorite, d.color, d.is_home_fixed, d.home_sort_order,
               d.created_at, d.updated_at, ${preview} AS body_preview, nb.name AS notebook_name, ${rank} AS rank
        ${source}${deleted}${scanSql}
        ORDER BY rank ASC, d.id DESC
        LIMIT ${limit + 1}`;
}

interface Out {
    ids: string[];
    previewChars?: number;
    foreign?: number;
}
// ---------- stats ----------
function stats(xs: number[]) {
    const s = [...xs].sort((a, b) => a - b);
    const q = (p: number) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
    return {
        n: s.length,
        min: s[0],
        median: q(0.5),
        mean: xs.reduce((a, b) => a + b, 0) / xs.length,
        p95: q(0.95),
        max: s[s.length - 1],
    };
}
type Variant = { name: string; kind: string; fn: () => Promise<Out> };

async function measure(
    queryId: string,
    variants: Variant[],
    baselineName: string,
) {
    // gate: single run of each variant, compare to baseline
    const first: Record<string, Out> = {};
    for (const v of variants) first[v.name] = await v.fn();
    const base = JSON.stringify(first[baselineName].ids);
    for (let i = 0; i < WARMUP; i++) for (const v of variants) await v.fn();
    const raw: Record<string, number[]> = Object.fromEntries(variants.map((v) => [v.name, []]));
    for (let r = 0; r < ROUNDS; r++) {
        // rotate order every round: removes systematic first/last position bias
        for (let k = 0; k < variants.length; k++) {
            const v = variants[(k + r) % variants.length];
            const t0 = performance.now();
            await v.fn();
            raw[v.name].push(performance.now() - t0);
        }
    }
    return variants.map((v) => ({
        query: queryId,
        variant: v.name,
        kind: v.kind,
        hits: first[v.name].ids.length,
        sameIdsAsBaseline: JSON.stringify(first[v.name].ids) === base,
        previewChars: first[v.name].previewChars,
        foreignRows: first[v.name].foreign,
        ids: first[v.name].ids,
        ...stats(raw[v.name]),
        rawMs: raw[v.name],
    }));
}

// ---------- main ----------
await Deno.mkdir(`${ROOT}data`, { recursive: true });
await Deno.mkdir(`${ROOT}results`, { recursive: true });
const env = {
    startedAt: new Date().toISOString(),
    deno: Deno.version,
    os: Deno.build,
    cpu: (await Deno.readTextFile("/proc/cpuinfo")).match(/model name\s*:\s*(.*)/)?.[1],
    nproc: navigator.hardwareConcurrency,
    loadavgStart: Deno.loadavg(),
    head: new TextDecoder().decode(
        (await new Deno.Command("git", { args: ["-C", "/home/aawei/searcher", "rev-parse", "HEAD"] }).output()).stdout,
    ).trim(),
    rounds: ROUNDS,
    warmup: WARMUP,
    limit: LIMIT,
};
const results: Record<string, unknown>[] = [];
const fixtureMeta: Record<string, unknown>[] = [];

for (const spec of FIXTURES) {
    if (ONLY && !ONLY.includes(spec.name)) continue;
    const path = `${ROOT}data/${spec.name}.sqlite`;
    try {
        await Deno.stat(path);
    } catch {
        const t0 = performance.now();
        try {
            await seedFixture(spec, path);
        } catch (error) {
            for (const suffix of ["", "-wal", "-shm"]) await Deno.remove(path + suffix).catch(() => {});
            throw error;
        }
        console.log(`seeded ${spec.name} in ${(performance.now() - t0).toFixed(0)} ms`);
    }
    const store = openDatabase(path);
    const docs = new DocumentsService(store);
    const apps = new BookmarksService(store);
    const personal = new PersonalSearchService(docs, apps);
    const info = await store.run(async (db) => {
        const one = async (q: string) => Number((await db.all<[number]>(sql.raw(q)))[0][0]);
        return {
            sqliteVersion: String((await db.all<[string]>(sql`select sqlite_version()`))[0][0]),
            docsUser1Live: await one("select count(*) from documents where user_id='user-1' and deleted_at is null"),
            docsUser2Live: await one("select count(*) from documents where user_id='user-2' and deleted_at is null"),
            docsDeleted: await one("select count(*) from documents where deleted_at is not null"),
            ftsRows: await one("select count(*) from documents_fts"),
            appsUser1Live: await one("select count(*) from webapps where user_id='user-1' and deleted_at is null"),
            bodyBytesAvg: await one("select avg(length(cast(current_body as blob))) from documents"),
        };
    });
    const dbBytes = (await Deno.stat(path)).size;
    fixtureMeta.push({ ...spec, path, dbBytes, ...info });
    console.log(`== ${spec.name}`, JSON.stringify(info), "dbBytes", dbBytes);
    const foreignIds = new Set(
        (await store.run((db) =>
            db.all<[string]>(sql`select id from documents where user_id = 'user-2'`)
        )).map((r) => String(r[0])),
    );

    const runDoc = async (q: string, f: Flags): Promise<Out> => {
        const s = docSql("user-1", q, LIMIT, f);
        if (s === null) return { ids: [], previewChars: 0, foreign: 0 };
        const rows = await store.run((db) => db.all<unknown[]>(s));
        const page = rows.slice(0, LIMIT);
        return {
            ids: page.map((r) => String(r[0])),
            previewChars: page.reduce((a, r) => a + String(r[9] ?? "").length, 0),
            foreign: page.filter((r) => foreignIds.has(String(r[0]))).length,
        };
    };

    const queries: { id: string; q: string }[] = [
        { id: "long-rare", q: "zqxrare" },
        { id: "long-common", q: VOCAB[0] },
        { id: "and2-long", q: "zqxrare zqxmid" },
        { id: "cjk3-rare", q: "橘猫咖" },
        { id: "short2-cjk-rare", q: "橘猫" },
        { id: "short1-cjk-rare", q: "橘" },
        { id: "short2-cjk-common", q: CJK[0] + CJK[1] },
        { id: "short2-latin-planted", q: "zq" },
        { id: "short2-latin-common", q: VOCAB[0].slice(0, 2) },
        { id: "mixed-long+short", q: "zqxrare 橘猫" },
        { id: "miss-long", q: "qqqqqqnotfound" },
        { id: "miss-short", q: "龘" },
    ];
    for (const { id, q } of queries) {
        const variants: Variant[] = [
            { name: "service(real DocumentsService.search)", kind: "baseline-real", fn: async () => ({ ids: (await docs.search("user-1", q, { limit: LIMIT })).items.map((i) => i.id) }) },
            { name: "sql-replica", kind: "baseline-replica", fn: () => runDoc(q, {}) },
            { name: "A1 +d.user_id on MATCH path", kind: "equivalent (redundant authz)", fn: () => runDoc(q, { userOnD: true }) },
            { name: "A2 LIKE ESCAPE instead of instr(lower)", kind: "equivalent iff SQLite lower()/LIKE both ASCII-only", fn: () => runDoc(q, { like: true }) },
            { name: "A3 drop deleted_at on MATCH path", kind: "invariant-dependent (relies on documents_ai/au triggers)", fn: () => runDoc(q, { noDeletedOnMatch: true }) },
            { name: "T1 drop short-term scan", kind: "product trade-off (recall loss)", fn: () => runDoc(q, { noScan: true }) },
            { name: "T2 bm25 title weight 5", kind: "product trade-off (ranking change)", fn: () => runDoc(q, { titleWeight: true }) },
            { name: "T3 preview always substr300", kind: "product trade-off (untitled display title/snippet payload)", fn: () => runDoc(q, { preview300: true }) },
            { name: "N1 NEGATIVE: drop documents_fts.user_id", kind: "FORBIDDEN permission regression (negative control)", fn: () => runDoc(q, { leakNoFtsUser: true }) },
        ];
        const rows = await measure(`docs:${id}`, variants, "sql-replica");
        for (const row of rows) results.push({ fixture: spec.name, ...row, queryText: q });
        console.log(
            `docs:${id}`.padEnd(30),
            rows.map((x) => `${x.variant.split(" ")[0]}=${x.median.toFixed(2)}${x.sameIdsAsBaseline ? "" : "!"}`).join(" "),
        );
    }

    // ---- apps ----
    const runApp = async (q: string, f: { like?: boolean; noUrl?: boolean }): Promise<Out> => {
        const terms = q.split(/\s+/).filter((t) => t.length > 0);
        const nameHas = (t: string) => f.like ? sql`name LIKE ${escLike(t)} ESCAPE '\\'` : sql`instr(lower(name), lower(${t})) > 0`;
        const urlHas = (t: string) => f.like ? sql`url LIKE ${escLike(t)} ESCAPE '\\'` : sql`instr(lower(url), lower(${t})) > 0`;
        const whole = terms.join(" ");
        const cond = terms.map((t) => f.noUrl ? nameHas(t) : sql`(${nameHas(t)} OR ${urlHas(t)})`);
        const rows = await store.run((db) =>
            db.all<unknown[]>(sql`SELECT id FROM webapps WHERE user_id = 'user-1' AND deleted_at IS NULL AND ${sql.join(cond, sql` AND `)}
                ORDER BY CASE WHEN instr(lower(name), lower(${whole})) = 1 THEN 0 WHEN ${sql.join(terms.map(nameHas), sql` AND `)} THEN 1 ELSE 2 END,
                sort_order ASC, created_at ASC, id ASC LIMIT ${LIMIT}`)
        );
        return { ids: rows.map((r) => String(r[0])) };
    };
    const appQueries = [
        { id: "rare", q: "zqxrare" },
        { id: "common", q: VOCAB[0] },
        { id: "short2", q: VOCAB[0].slice(0, 2) },
        { id: "cjk2", q: "橘猫" },
        { id: "two-terms", q: `${VOCAB[0]} example` },
        { id: "miss", q: "qqqqqqnotfound" },
    ];
    for (const { id, q } of appQueries) {
        const variants: Variant[] = [
            { name: "service(real BookmarksService.searchWebApps)", kind: "baseline-real", fn: async () => ({ ids: (await apps.searchWebApps("user-1", q, LIMIT)).map((a) => a.id) }) },
            { name: "sql-replica", kind: "baseline-replica", fn: () => runApp(q, {}) },
            { name: "B1 LIKE ESCAPE", kind: "equivalent iff ASCII-only lower()/LIKE", fn: () => runApp(q, { like: true }) },
            { name: "T4 name-only (drop URL match)", kind: "product trade-off (recall loss)", fn: () => runApp(q, { noUrl: true }) },
        ];
        const rows = await measure(`apps:${id}`, variants, "sql-replica");
        for (const row of rows) results.push({ fixture: spec.name, ...row, queryText: q });
        console.log(
            `apps:${id}`.padEnd(30),
            rows.map((x) => `${x.variant.split(" ")[0]}=${x.median.toFixed(2)}${x.sameIdsAsBaseline ? "" : "!"}`).join(" "),
        );
    }

    // ---- personal search: sequential (HEAD) vs concurrent dispatch (queue still serialises) ----
    for (const { id, q } of [
        { id: "rare", q: "zqxrare" },
        { id: "short-cjk", q: "橘猫" },
        { id: "common", q: VOCAB[0] },
    ]) {
        const concurrent = async (): Promise<Out> => {
            const [d, a] = await Promise.all([docs.search("user-1", q, { limit: LIMIT }), apps.searchWebApps("user-1", q, LIMIT)]);
            return { ids: [...d.items.map((i) => i.id), "|", ...a.map((x) => x.id)] };
        };
        const variants: Variant[] = [
            { name: "P0 PersonalSearchService (sequential)", kind: "baseline-real", fn: async () => {
                const r = await personal.search("user-1", q, LIMIT);
                return { ids: [...r.documents.map((i) => i.id), "|", ...r.apps.map((x) => x.id)] };
            } },
            { name: "P1 Promise.all(docs, apps)", kind: "equivalent output (DatabaseStore FIFO still serialises)", fn: concurrent },
        ];
        const rows = await measure(`personal:${id}`, variants, "P0 PersonalSearchService (sequential)");
        for (const row of rows) results.push({ fixture: spec.name, ...row, queryText: q });
        console.log(`personal:${id}`.padEnd(30), rows.map((x) => `${x.variant.split(" ")[0]}=${x.median.toFixed(2)}${x.sameIdsAsBaseline ? "" : "!"}`).join(" "));
    }

    // ---- suggestions (only on s1k): history lookup then engine fetch vs overlapped ----
    if (spec.name === "s1k") {
        await store.nativeTransaction((native) => {
            native.exec("DELETE FROM search_history");
            const h = native.prepare("INSERT INTO search_history(id,user_id,query,engine_id,created_at) VALUES(?,?,?,?,?)");
            for (let i = 0; i < 100; i++) h.run(`h${i}`, "user-1", `${VOCAB[i % 20]} query ${i}`, "google", 1000 + i);
        });
        for (const delay of [0, 25, 100]) {
            const adapter: SuggestionAdapter = {
                async fetchSuggestions(q) {
                    if (delay > 0) await new Promise((res) => setTimeout(res, delay));
                    return [`${q} one`, `${q} two`, `${q} three`];
                },
            };
            const svc = new SearchService(store, { googleAdapter: adapter, bingAdapter: adapter });
            const overlapped = async (query: string): Promise<Out> => {
                // Same merge order as service.ts:41-111; engine request started before history DB read.
                const trimmed = query.trim();
                const enginePromise = adapter.fetchSuggestions(trimmed, undefined, "zh-CN");
                const out: string[] = [];
                const seen = new Set<string>();
                const hist = await svc.listHistory("user-1", 20);
                const qLower = trimmed.toLowerCase();
                for (const h of hist) {
                    if (h.query.toLowerCase().includes(qLower) && !seen.has(h.query.toLowerCase())) {
                        seen.add(h.query.toLowerCase());
                        out.push(`history:${h.query}`);
                        if (out.length >= 5) break;
                    }
                }
                for (const w of await enginePromise) {
                    if (!seen.has(w.toLowerCase())) {
                        seen.add(w.toLowerCase());
                        out.push(`engine:${w}`);
                    }
                }
                return { ids: out };
            };
            const q = "query";
            const variants: Variant[] = [
                { name: "S0 SearchService.getSuggestions", kind: "baseline-real", fn: async () => ({
                    ids: (await svc.getSuggestions(q, "google", "user-1")).map((s) => `${s.source}:${s.text}`),
                }) },
                { name: "S1 overlap history DB read with engine fetch", kind: "equivalent output", fn: () => overlapped(q) },
            ];
            const rows = await measure(`suggest:adapterDelay=${delay}ms`, variants, "S0 SearchService.getSuggestions");
            for (const row of rows) results.push({ fixture: spec.name, ...row, queryText: q, adapterDelayMs: delay });
            console.log(`suggest:delay${delay}`.padEnd(30), rows.map((x) => `${x.variant.split(" ")[0]}=${x.median.toFixed(3)}${x.sameIdsAsBaseline ? "" : "!"}`).join(" "));
        }
    }
    await store.close();
}

const out = { env: { ...env, loadavgEnd: Deno.loadavg(), finishedAt: new Date().toISOString() }, fixtures: fixtureMeta, results };
const file = `${ROOT}results/results-${Date.now()}.json`;
await Deno.writeTextFile(file, JSON.stringify(out, null, 1));
console.log("wrote", file);
