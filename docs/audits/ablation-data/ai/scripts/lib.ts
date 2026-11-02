// Shared helpers. Run with cwd=/home/aawei/searcher (migrations read ./drizzle) and
// --config /home/aawei/searcher/deno.jsonc so repo import maps resolve. Repo is only READ.
import { openDatabase, type DatabaseStore } from "/home/aawei/searcher/.worktrees/ablation-study-20261102/src/db/database.ts";
import { migrateDatabase } from "/home/aawei/searcher/.worktrees/ablation-study-20261102/src/db/migrate.ts";

export const RAW_DIR = Deno.env.get("RAW_DIR") ?? "/home/aawei/searcher-ai-study/raw_worktree";

export async function makeStore(tag: string): Promise<{ store: DatabaseStore; dir: string; cleanup: () => Promise<void> }> {
    const dir = await Deno.makeTempDir({ prefix: `aistudy-${tag}-` });
    const store = openDatabase(`${dir}/db.sqlite`);
    await migrateDatabase(store);
    return { store, dir, cleanup: async () => { await store.close(); await Deno.remove(dir, { recursive: true }); } };
}

export async function addUser(store: DatabaseStore, id: string) {
    await store.nativeTransaction((n) => {
        n.prepare(`INSERT INTO users (id, username, display_name, password_hash, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`)
            .run(id, id, id, "x", "user", 1, 1);
    });
}

export function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function pct(xs: number[], p: number): number {
    const a = [...xs].sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
}

export function summarize(xs: number[]) {
    return { n: xs.length, p50: pct(xs, 50), p95: pct(xs, 95), max: Math.max(...xs), mean: xs.reduce((a, b) => a + b, 0) / xs.length };
}

export async function saveRaw(name: string, data: unknown) {
    await Deno.writeTextFile(`${RAW_DIR}/${name}.json`, JSON.stringify({
        generatedAt: new Date().toISOString(), deno: Deno.version, data,
    }, null, 1));
}
