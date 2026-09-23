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
    readonly #db: SearchDatabase;

    constructor(private readonly native: DatabaseSync) {
        this.#db = createDrizzle(native);
    }

    run<T>(fn: (db: SearchDatabase) => Promise<T>): Promise<T> {
        if (this.#closed) {
            return Promise.reject(new Error("Database is closed"));
        }
        const operation = this.#tail.then(() => fn(this.#db));
        this.#tail = operation.then(() => {}, () => {});
        return operation;
    }

    migrate(statements: readonly string[]): void {
        // Called only by the migrator while its outer run owns the connection.
        this.native.exec("BEGIN IMMEDIATE");
        try {
            for (const statement of statements) this.native.exec(statement);
            this.native.exec("COMMIT");
        } catch (error) {
            this.native.exec("ROLLBACK");
            throw error;
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
        return new DatabaseStore(native);
    } catch (error) {
        native.close();
        throw error;
    }
}
