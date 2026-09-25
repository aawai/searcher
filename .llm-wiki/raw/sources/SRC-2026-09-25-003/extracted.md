import { flushLogger, logger } from "@logger";
import { createApp } from "./app.ts";
import { openDatabase } from "./db/database.ts";
import { migrateDatabase } from "./db/migrate.ts";
import { AuthService } from "./features/auth/service.ts";

function appOrigin(): string {
    const value = Deno.env.get("APP_ORIGIN") ??
        (Deno.env.get("NODE_ENV") === "production"
            ? undefined
            : "http://localhost:34567");
    if (!value) throw new Error("APP_ORIGIN is required in production");
    const origin = new URL(value);
    if (
        origin.origin !== value ||
        !["http:", "https:"].includes(origin.protocol)
    ) {
        throw new Error("APP_ORIGIN must be an exact HTTP(S) origin");
    }
    if (
        origin.protocol === "http:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
    ) {
        throw new Error("APP_ORIGIN requires HTTPS outside loopback");
    }
    return origin.origin;
}

if (import.meta.main) {
    const origin = appOrigin();
    const port = Number(Deno.env.get("PORT") ?? "34567");
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("Invalid PORT");
    }
    if (Deno.env.get("NODE_ENV") === "production") {
        await Deno.stat(new URL("../web/dist/index.html", import.meta.url));
    }
    const store = openDatabase(
        Deno.env.get("DATABASE_PATH") ?? "./data/searcher.sqlite",
    );
    let server: Deno.HttpServer | undefined;
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        await auth.getDummyHash();
        const app = createApp({ store, auth, origin });
        server = Deno.serve({ port }, app.fetch);
        logger.info({ port }, "Searcher started");
    } catch (error) {
        await store.close();
        throw error;
    }

    let stopping: Promise<void> | undefined;
    const shutdown = () => {
        stopping ??= (async () => {
            try {
                await server.shutdown();
                await store.close();
                await flushLogger();
                Deno.exit(0);
            } catch (error) {
                console.error("Searcher shutdown failed", error);
                Deno.exit(1);
            }
        })();
    };
    Deno.addSignalListener("SIGINT", shutdown);
    Deno.addSignalListener("SIGTERM", shutdown);
}
