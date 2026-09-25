import { DatabaseSync } from "node:sqlite";
import { dirname } from "@std/path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema.ts";

export type SearchDatabase = ReturnType<typeof createDrizzle>;
type SQLiteValue = string | number | bigint | null | Uint8Array;

function isSQLiteValue(value: unknown): value is SQLiteValue {
    return value === null || typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "bigint" || value instanceof Uint8Array;
}

function createDrizzle(native: DatabaseSync) {
    return drizzle((sql, params, method) => {
        if (method === "get") {
            throw new Error("Use all() or limit(1), not get()");
        }
        if (!params.every(isSQLiteValue)) {
            throw new TypeError("Unsupported SQLite parameter");
        }
        const statement = native.prepare(sql);
        if (method === "run") {
            statement.run(...params);
            return Promise.resolve({ rows: [] });
        }
        statement.setReturnArrays(true);
        const rows: unknown = statement.all(...params);
        if (
            !Array.isArray(rows) ||
            !rows.every((row) => Array.isArray(row) && row.every(isSQLiteValue))
        ) {
            throw new TypeError("SQLite returned unexpected rows");
        }
        return Promise.resolve({ rows });
    }, { schema });
}

export class DatabaseStore {
    #tail: Promise<void> = Promise.resolve();
    #closed = false;
    #db: SearchDatabase;

    constructor(
        private native: DatabaseSync,
        private readonly path = ":memory:",
    ) {
        this.#db = createDrizzle(native);
    }

    get storagePath(): string {
        return this.path;
    }

    run<T>(fn: (db: SearchDatabase) => Promise<T>): Promise<T> {
        if (this.#closed) {
            return Promise.reject(new Error("Database is closed"));
        }
        const operation = this.#tail.then(() => fn(this.#db));
        this.#tail = operation.then(() => {}, () => {});
        return operation;
    }
    // Keep SQLite and the asset swap inside the same FIFO maintenance window.
    exclusiveNative<T>(
        fn: (
            native: DatabaseSync,
            replace: (bytes: Uint8Array) => Promise<void>,
        ) => Promise<T>,
    ): Promise<T> {
        return this.run(() => fn(this.native, (bytes) => this.#replace(bytes)));
    }

    async #replace(bytes: Uint8Array): Promise<void> {
        if (this.path === ":memory:") {
            this.native.deserialize(bytes);
            this.native.exec("PRAGMA foreign_keys=ON");
            return;
        }
        const staged = `${this.path}.restore-${crypto.randomUUID()}`;
        const previous = `${this.path}.before-restore-${crypto.randomUUID()}`;
        await Deno.writeFile(staged, bytes, { createNew: true });
        this.native.close();
        let moved = false;
        let reopened = false;
        try {
            // close() checkpoints WAL; never attach stale sidecars to the restored file.
            for (const suffix of ["-wal", "-shm"]) {
                await Deno.remove(this.path + suffix).catch((error) => {
                    if (!(error instanceof Deno.errors.NotFound)) throw error;
                });
            }
            await Deno.rename(this.path, previous);
            moved = true;
            await Deno.rename(staged, this.path);
            this.native = new DatabaseSync(this.path);
            reopened = true;
            this.native.exec(
                "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
            );
            this.#db = createDrizzle(this.native);
        } catch (error) {
            if (reopened) this.native.close();
            for (const suffix of ["-wal", "-shm"]) {
                await Deno.remove(this.path + suffix).catch((cause) => {
                    if (!(cause instanceof Deno.errors.NotFound)) throw cause;
                });
            }
            if (moved) await Deno.rename(previous, this.path);
            this.native = new DatabaseSync(this.path);
            this.native.exec(
                "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
            );
            this.#db = createDrizzle(this.native);
            throw error;
        } finally {
            await Deno.remove(staged).catch((error) => {
                if (!(error instanceof Deno.errors.NotFound)) throw error;
            });
        }
        await Deno.remove(previous).catch((error) => {
            console.error(
                `Restored SQLite, but could not remove ${previous}`,
                error,
            );
        });
    }

    migrate(statements: readonly string[]): void {
        // SQLite ignores foreign_keys changes inside a transaction. Table rebuilds
        // must disable it before BEGIN, then validate every reference before COMMIT.
        this.native.exec("PRAGMA foreign_keys=OFF");
        try {
            this.native.exec("BEGIN IMMEDIATE");
            try {
                for (const statement of statements) this.native.exec(statement);
                const violations = this.native.prepare(
                    "PRAGMA foreign_key_check",
                ).all();
                if (violations.length) {
                    throw new Error(
                        "Migration leaves invalid foreign key references",
                    );
                }
                this.native.exec("COMMIT");
            } catch (error) {
                this.native.exec("ROLLBACK");
                throw error;
            }
        } finally {
            this.native.exec("PRAGMA foreign_keys=ON");
        }
    }
    async close(): Promise<void> {
        this.#closed = true;
        await this.#tail;
        this.native.close();
    }
}

export function openDatabase(path: string): DatabaseStore {
    if (path !== ":memory:") Deno.mkdirSync(dirname(path), { recursive: true });
    const native = new DatabaseSync(path);
    try {
        native.exec(
            "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
        );
        return new DatabaseStore(native, path);
    } catch (error) {
        native.close();
        throw error;
    }
}
