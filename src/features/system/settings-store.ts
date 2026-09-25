import { dirname, join } from "@std/path";
import type { SystemSettingsDto } from "./types.ts";

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsDto = {
    auditRetentionDays: 90,
    allowRegistration: true,
    defaultEngine: "bing",
    defaultTheme: "system",
    defaultSearchTarget: "same",
};

export class SystemSettingsStore {
    readonly #configPath: string;
    #current: SystemSettingsDto;
    #lockTail: Promise<void> = Promise.resolve();

    constructor(configPath?: string) {
        if (configPath) {
            this.#configPath = configPath;
        } else {
            const dbPath = Deno.env.get("DATABASE_PATH") ??
                "./data/searcher.sqlite";
            if (dbPath === ":memory:" || Deno.env.get("NODE_ENV") === "test") {
                this.#configPath = ":memory:";
            } else {
                this.#configPath = join(
                    dirname(dbPath),
                    "system-settings.json",
                );
            }
        }
        this.#current = { ...DEFAULT_SYSTEM_SETTINGS };
    }

    async #withLock<T>(fn: () => Promise<T>): Promise<T> {
        const prev = this.#lockTail;
        const { promise, resolve } = Promise.withResolvers<void>();
        this.#lockTail = promise;
        await prev;
        try {
            return await fn();
        } finally {
            resolve();
        }
    }

    async get(): Promise<SystemSettingsDto> {
        return await this.#withLock(async () => {
            if (this.#configPath === ":memory:") {
                return { ...this.#current };
            }
            try {
                const text = await Deno.readTextFile(this.#configPath);
                const parsed = JSON.parse(text) as Partial<SystemSettingsDto>;
                this.#current = {
                    auditRetentionDays:
                        typeof parsed.auditRetentionDays === "number" &&
                            parsed.auditRetentionDays >= 1 &&
                            parsed.auditRetentionDays <= 3650
                            ? Math.floor(parsed.auditRetentionDays)
                            : DEFAULT_SYSTEM_SETTINGS.auditRetentionDays,
                    allowRegistration:
                        typeof parsed.allowRegistration === "boolean"
                            ? parsed.allowRegistration
                            : DEFAULT_SYSTEM_SETTINGS.allowRegistration,
                    defaultEngine: parsed.defaultEngine &&
                            ["google", "bing", "baidu", "duckduckgo"].includes(
                                parsed.defaultEngine,
                            )
                        ? parsed.defaultEngine
                        : DEFAULT_SYSTEM_SETTINGS.defaultEngine,
                    defaultTheme: parsed.defaultTheme &&
                            ["system", "light", "dark"].includes(
                                parsed.defaultTheme,
                            )
                        ? parsed.defaultTheme
                        : DEFAULT_SYSTEM_SETTINGS.defaultTheme,
                    defaultSearchTarget: parsed.defaultSearchTarget &&
                            ["same", "new"].includes(parsed.defaultSearchTarget)
                        ? parsed.defaultSearchTarget
                        : DEFAULT_SYSTEM_SETTINGS.defaultSearchTarget,
                };
            } catch {
                // Return default / current in-memory if file does not exist or in memory
            }
            return { ...this.#current };
        });
    }

    async update(
        patch: Partial<SystemSettingsDto>,
    ): Promise<SystemSettingsDto> {
        return await this.#withLock(async () => {
            const current = await this.#readUnsafe();
            const next: SystemSettingsDto = {
                auditRetentionDays:
                    typeof patch.auditRetentionDays === "number" &&
                        patch.auditRetentionDays >= 1 &&
                        patch.auditRetentionDays <= 3650
                        ? Math.floor(patch.auditRetentionDays)
                        : current.auditRetentionDays,
                allowRegistration: typeof patch.allowRegistration === "boolean"
                    ? patch.allowRegistration
                    : current.allowRegistration,
                defaultEngine: patch.defaultEngine &&
                        ["google", "bing", "baidu", "duckduckgo"].includes(
                            patch.defaultEngine,
                        )
                    ? patch.defaultEngine
                    : current.defaultEngine,
                defaultTheme: patch.defaultTheme &&
                        ["system", "light", "dark"].includes(patch.defaultTheme)
                    ? patch.defaultTheme
                    : current.defaultTheme,
                defaultSearchTarget: patch.defaultSearchTarget &&
                        ["same", "new"].includes(patch.defaultSearchTarget)
                    ? patch.defaultSearchTarget
                    : current.defaultSearchTarget,
            };

            await this.#writeUnsafe(next);
            this.#current = next;
            return { ...next };
        });
    }

    async #readUnsafe(): Promise<SystemSettingsDto> {
        if (this.#configPath === ":memory:") {
            return { ...this.#current };
        }
        try {
            const text = await Deno.readTextFile(this.#configPath);
            const parsed = JSON.parse(text) as Partial<SystemSettingsDto>;
            return {
                auditRetentionDays:
                    typeof parsed.auditRetentionDays === "number" &&
                        parsed.auditRetentionDays >= 1 &&
                        parsed.auditRetentionDays <= 3650
                        ? Math.floor(parsed.auditRetentionDays)
                        : DEFAULT_SYSTEM_SETTINGS.auditRetentionDays,
                allowRegistration: typeof parsed.allowRegistration === "boolean"
                    ? parsed.allowRegistration
                    : DEFAULT_SYSTEM_SETTINGS.allowRegistration,
                defaultEngine: parsed.defaultEngine &&
                        ["google", "bing", "baidu", "duckduckgo"].includes(
                            parsed.defaultEngine,
                        )
                    ? parsed.defaultEngine
                    : DEFAULT_SYSTEM_SETTINGS.defaultEngine,
                defaultTheme: parsed.defaultTheme &&
                        ["system", "light", "dark"].includes(
                            parsed.defaultTheme,
                        )
                    ? parsed.defaultTheme
                    : DEFAULT_SYSTEM_SETTINGS.defaultTheme,
                defaultSearchTarget: parsed.defaultSearchTarget &&
                        ["same", "new"].includes(parsed.defaultSearchTarget)
                    ? parsed.defaultSearchTarget
                    : DEFAULT_SYSTEM_SETTINGS.defaultSearchTarget,
            };
        } catch {
            return { ...this.#current };
        }
    }

    async #writeUnsafe(settings: SystemSettingsDto): Promise<void> {
        if (this.#configPath === ":memory:") {
            return;
        }
        await Deno.mkdir(dirname(this.#configPath), { recursive: true });
        const tmp =
            `${this.#configPath}.tmp.${Date.now()}.${crypto.randomUUID()}`;
        try {
            await Deno.writeTextFile(tmp, JSON.stringify(settings, null, 2));
            await Deno.rename(tmp, this.#configPath);
        } catch (error) {
            try {
                await Deno.remove(tmp);
            } catch {
                // Ignore temp file cleanup failure
            }
            throw error;
        }
    }
}
