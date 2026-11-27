import { flushLogger, logger } from "@logger";
import { createApp } from "./app.ts";
import { openDatabase } from "./db/database.ts";
import { migrateDatabase } from "./db/migrate.ts";
import { AuthService } from "./features/auth/service.ts";
import { AiService } from "./features/ai/service.ts";
import { WebAppIconService } from "./features/webapp-icons/service.ts";

export function isLoopbackOriginHost(hostname: string): boolean {
    return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export function isPrivateLanOriginHost(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase();
    if (!normalized) return false;

    const ipv4Parts = normalized.split(".");
    if (ipv4Parts.length === 4 && ipv4Parts.every((p) => /^\d+$/.test(p))) {
        const nums = ipv4Parts.map(Number);
        if (nums.some((n) => n < 0 || n > 255)) return false;
        const [a, b] = nums;
        if (a === 10) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;
        if (a === 169 && b === 254) return true;
        return false;
    }

    if (normalized.startsWith("[") && normalized.endsWith("]")) {
        const ipv6 = normalized.slice(1, -1);
        return /^f[cd][0-9a-f]{0,2}:/.test(ipv6) ||
            /^fe[89ab][0-9a-f]?:/.test(ipv6);
    }

    return /\.(localhost|local|lan|internal)$/.test(normalized);
}

export function parseAppOrigin(
    rawValue: string | undefined,
    nodeEnv: string | undefined,
): string {
    const isProduction = nodeEnv === "production";
    const value = rawValue ??
        (isProduction ? undefined : "http://localhost:34567");
    if (!value) throw new Error("APP_ORIGIN is required in production");
    const origins = value.split(",").map((entry) => entry.trim());
    for (const entry of origins) {
        let origin: URL;
        try {
            origin = new URL(entry);
        } catch {
            throw new Error("APP_ORIGIN must contain exact HTTP(S) origins");
        }
        if (
            origin.origin !== entry ||
            !["http:", "https:"].includes(origin.protocol)
        ) {
            throw new Error("APP_ORIGIN must contain exact HTTP(S) origins");
        }
        if (
            origin.protocol === "http:" &&
            !isLoopbackOriginHost(origin.hostname)
        ) {
            if (isProduction) {
                throw new Error("APP_ORIGIN requires HTTPS outside loopback");
            }
            if (!isPrivateLanOriginHost(origin.hostname)) {
                throw new Error(
                    "APP_ORIGIN requires HTTPS outside loopback or private LAN in development",
                );
            }
        }
    }
    return origins.join(",");
}

function appOrigin(): string {
    return parseAppOrigin(Deno.env.get("APP_ORIGIN"), Deno.env.get("NODE_ENV"));
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
    let ai: AiService | undefined;
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        await auth.getDummyHash();
        const icons = new WebAppIconService();
        ai = new AiService({ store, icons });
        ai.startTemporaryCleanup();
        const app = createApp({ store, auth, origin, ai, icons });
        server = Deno.serve({ port }, app.fetch);
        logger.info({ port }, "Searcher started");
    } catch (error) {
        await ai?.stopTemporaryCleanup();
        await store.close();
        throw error;
    }

    let stopping: Promise<void> | undefined;
    const shutdown = () => {
        stopping ??= (async () => {
            try {
                await server.shutdown();
                await ai?.stopTemporaryCleanup();
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
