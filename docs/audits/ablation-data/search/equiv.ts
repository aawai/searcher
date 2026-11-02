// Differential test for ablations A2/B1: instr(lower(x), lower(t)) > 0  vs  x LIKE esc(t) ESCAPE '\'.
// Uses the same node:sqlite build as the real server (via real openDatabase). Random strings over an
// alphabet with ASCII case pairs, LIKE metacharacters, backslash, quotes, non-ASCII case pairs, CJK,
// whitespace, NUL-free. Prints counts of disagreements (expected 0 if equivalent on this build).
import { sql } from "drizzle-orm";
import { openDatabase } from "file:///home/aawei/searcher/src/db/database.ts";

const ALPHA = ["a", "A", "b", "B", "z", "Z", "%", "_", "\\", "'", '"', "é", "É", "ß", "İ", "ı", "橘", "猫", " ", "-", "0", "\n", "\t", "\u00a0", "Σ", "σ", "ς", "🙂"];
let seed = 7;
const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
};
const rs = (min: number, max: number) => {
    const n = min + Math.floor(rnd() * (max - min + 1));
    let s = "";
    for (let i = 0; i < n; i++) s += ALPHA[Math.floor(rnd() * ALPHA.length)];
    return s;
};
const esc = (t: string) => `%${t.replace(/[\\%_]/g, "\\$&")}%`;
const store = openDatabase(":memory:");
const N = Number(Deno.env.get("PAIRS") ?? 300000);
let disagree = 0, hits = 0;
const examples: unknown[] = [];
await store.run(async (db) => {
    for (let i = 0; i < N; i++) {
        const text = rs(0, 24);
        let term = rnd() < 0.5 && text.length > 1 ? [...text].slice(0, 1 + Math.floor(rnd() * 3)).join("") : rs(1, 3);
        // randomly flip case of a substring to exercise lower()
        if (rnd() < 0.3) term = term.toUpperCase();
        const r = await db.all<[number, number]>(
            sql`SELECT instr(lower(${text}), lower(${term})) > 0, ${text} LIKE ${esc(term)} ESCAPE '\\'`,
        );
        const a = Number(r[0][0]), b = Number(r[0][1]);
        if (a) hits++;
        if (a !== b) {
            disagree++;
            if (examples.length < 10) examples.push({ text, term, instrLower: a, like: b });
        }
    }
});
const ver = await store.run((db) => db.all<[string]>(sql`select sqlite_version()`));
console.log(JSON.stringify({ sqlite: ver[0][0], pairs: N, positives: hits, disagreements: disagree, examples }, null, 1));
await store.close();
