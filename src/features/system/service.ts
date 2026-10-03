import { backup, DatabaseSync } from "node:sqlite";
import { dirname, join } from "@std/path";
import * as fflate from "fflate";
import type { DatabaseStore } from "../../db/database.ts";
import { aiModels, aiProviders } from "../../db/ai-schema.ts";
import { auditLogs, notes, users, webapps } from "../../db/schema.ts";
import { and, count, eq, isNull } from "drizzle-orm";
import * as v from "@valibot/valibot";
import { encryptApiKey } from "../ai/crypto.ts";
import type {
    BackupManifest,
    ConfigExportDto,
    ConfigImportResultDto,
    SystemOverviewDto,
    SystemSettingsDto,
} from "./types.ts";
import { SystemSettingsStore } from "./settings-store.ts";
import { validateBackupConsistency } from "./backup-validator.ts";

const ConfigExportImportSchema = v.object({
    version: v.literal("1.0.0", "不兼容的配置文件版本"),
    exportedAt: v.optional(v.number("导出的时间戳必须为数字")),
    settings: v.object({
        auditRetentionDays: v.pipe(
            v.number("审计日志保留天数必须为数字"),
            v.integer("审计日志保留天数必须为整数"),
            v.minValue(1, "审计日志保留天数最少为 1 天"),
            v.maxValue(3650, "审计日志保留天数最多为 3650 天"),
        ),
        allowRegistration: v.boolean("开放注册必须为布尔值"),
        defaultEngine: v.picklist(
            ["google", "bing", "baidu", "duckduckgo"],
            "不支持的默认搜索引擎",
        ),
        defaultTheme: v.picklist(["system", "light", "dark"], "不支持的主题"),
        defaultSearchTarget: v.picklist(
            ["same", "new"],
            "不支持的搜索打开方式",
        ),
    }),
    systemAiProviders: v.optional(
        v.array(
            v.object({
                name: v.pipe(
                    v.string("Provider 名称必须为字符串"),
                    v.trim(),
                    v.minLength(1, "Provider 名称不能为空"),
                ),
                baseUrl: v.pipe(
                    v.string("Base URL 必须为有效网址"),
                    v.trim(),
                    v.url("Base URL 必须是合法的 URL 格式"),
                ),
                enabled: v.optional(v.boolean("enabled 必须为布尔值"), true),
                models: v.optional(
                    v.array(
                        v.object({
                            modelId: v.pipe(
                                v.string("模型 ID 必须为字符串"),
                                v.trim(),
                                v.minLength(1, "模型 ID 不能为空"),
                            ),
                            displayName: v.pipe(
                                v.string("模型显示名称必须为字符串"),
                                v.trim(),
                                v.minLength(1, "模型显示名称不能为空"),
                            ),
                            enabled: v.optional(
                                v.boolean("enabled 必须为布尔值"),
                                true,
                            ),
                            visibleToUsers: v.optional(
                                v.boolean("visibleToUsers 必须为布尔值"),
                                true,
                            ),
                            isDefault: v.optional(
                                v.boolean("isDefault 必须为布尔值"),
                                false,
                            ),
                        }),
                    ),
                    [],
                ),
            }),
        ),
        [],
    ),
});
import type { WallpaperService } from "../wallpaper/service.ts";
import type { WebAppIconService } from "../webapp-icons/service.ts";

export interface SystemServiceDeps {
    store: DatabaseStore;
    settingsStore?: SystemSettingsStore;
    wallpaperService?: WallpaperService;
    iconService?: WebAppIconService;
    now?: () => number;
}

export class SystemService {
    readonly #store: DatabaseStore;
    readonly #settingsStore: SystemSettingsStore;
    readonly #wallpaperService?: WallpaperService;
    readonly #iconService?: WebAppIconService;
    readonly #now: () => number;
    #lockTail: Promise<void> = Promise.resolve();

    constructor(deps: SystemServiceDeps) {
        this.#store = deps.store;
        this.#settingsStore = deps.settingsStore ?? new SystemSettingsStore();
        this.#wallpaperService = deps.wallpaperService;
        this.#iconService = deps.iconService;
        this.#now = deps.now ?? (() => Date.now());
    }

    get settingsStore(): SystemSettingsStore {
        return this.#settingsStore;
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

    async getOverview(): Promise<SystemOverviewDto> {
        const settings = await this.#settingsStore.get();
        return await this.#store.run(async (db) => {
            const [
                usersRows,
                activeUsersRows,
                disabledUsersRows,
                webappsRows,
                notesRows,
                aiProvidersRows,
                aiModelsRows,
                auditRows,
            ] = await Promise.all([
                db.select({ count: count() }).from(users).where(
                    isNull(users.softDeletedAt),
                ).all(),
                db.select({ count: count() }).from(users).where(
                    eq(users.disabled, false),
                ).all(),
                db.select({ count: count() }).from(users).where(
                    eq(users.disabled, true),
                ).all(),
                db.select({ count: count() }).from(webapps).where(
                    isNull(webapps.deletedAt),
                ).all(),
                db.select({ count: count() }).from(notes).where(
                    isNull(notes.deletedAt),
                ).all(),
                db.select({ count: count() }).from(aiProviders).all(),
                db.select({ count: count() }).from(aiModels).all(),
                db.select({ count: count() }).from(auditLogs).all(),
            ]);

            return {
                totalUsers: usersRows[0]?.count ?? 0,
                activeUsers: activeUsersRows[0]?.count ?? 0,
                disabledUsers: disabledUsersRows[0]?.count ?? 0,
                totalWebApps: webappsRows[0]?.count ?? 0,
                totalNotes: notesRows[0]?.count ?? 0,
                totalAiProviders: aiProvidersRows[0]?.count ?? 0,
                totalAiModels: aiModelsRows[0]?.count ?? 0,
                totalAuditLogs: auditRows[0]?.count ?? 0,
                settings,
            };
        });
    }

    async exportConfig(): Promise<ConfigExportDto> {
        const settings = await this.#settingsStore.get();
        return await this.#store.run(async (db) => {
            const providers = await db
                .select()
                .from(aiProviders)
                .where(eq(aiProviders.scope, "system"))
                .all();

            const models = await db.select().from(aiModels).all();

            const systemAiProviders = providers.map((p) => {
                const providerModels = models
                    .filter((m) => m.providerId === p.id)
                    .map((m) => ({
                        modelId: m.modelId,
                        displayName: m.displayName,
                        enabled: Boolean(m.enabled),
                        visibleToUsers: Boolean(m.visibleToUsers),
                        isDefault: Boolean(m.isDefault),
                    }));
                return {
                    name: p.name,
                    baseUrl: p.baseUrl,
                    enabled: Boolean(p.enabled),
                    models: providerModels,
                };
            });

            return {
                version: "1.0.0",
                exportedAt: this.#now(),
                settings,
                systemAiProviders,
            };
        });
    }

    async importConfig(
        config: unknown,
    ): Promise<ConfigImportResultDto> {
        const parseResult = v.safeParse(ConfigExportImportSchema, config);
        if (!parseResult.success) {
            const firstIssue = parseResult.issues[0];
            const issueMsg = firstIssue?.message ?? "配置文件格式错误";
            throw new Error(`配置数据验证失败: ${issueMsg}`);
        }
        const cfg = parseResult.output;
        const providersToImport = cfg.systemAiProviders;
        let createdProvidersCount = 0;
        let updatedProvidersCount = 0;
        let importedModelsCount = 0;

        if (providersToImport && providersToImport.length > 0) {
            // 缺少主加密密钥时严格 Fail Closed，禁止使用伪造字符串
            const emptyKeyCipher = await encryptApiKey("");
            const now = this.#now();

            await this.#store.run(async (db) => {
                for (const p of providersToImport) {
                    const existingRows = await db
                        .select()
                        .from(aiProviders)
                        .where(eq(aiProviders.name, p.name))
                        .limit(1)
                        .all();

                    const existing = existingRows[0];
                    if (existing && existing.scope !== "system") {
                        // 永远不覆盖或冲突同名的用户私有 Provider
                        continue;
                    }

                    let providerId: string;
                    if (existing) {
                        providerId = existing.id;
                        await db
                            .update(aiProviders)
                            .set({
                                baseUrl: p.baseUrl,
                                enabled: p.enabled,
                                updatedAt: now,
                            })
                            .where(eq(aiProviders.id, providerId))
                            .run();
                        updatedProvidersCount++;
                    } else {
                        providerId = crypto.randomUUID();
                        await db
                            .insert(aiProviders)
                            .values({
                                id: providerId,
                                ownerUserId: null,
                                scope: "system",
                                name: p.name,
                                baseUrl: p.baseUrl,
                                encryptedApiKey: emptyKeyCipher,
                                enabled: false, // 强制新导入的 Provider 处于禁用状态，直到管理员配置 API Key 并刷新模型
                                createdAt: now,
                                updatedAt: now,
                            })
                            .run();
                        createdProvidersCount++;
                    }

                    // 同步该 Provider 下的模型定义
                    if (p.models && p.models.length > 0) {
                        for (const m of p.models) {
                            const existingModelRows = await db
                                .select()
                                .from(aiModels)
                                .where(
                                    and(
                                        eq(aiModels.providerId, providerId),
                                        eq(aiModels.modelId, m.modelId),
                                    ),
                                )
                                .limit(1)
                                .all();

                            const existingModel = existingModelRows[0];
                            if (existingModel) {
                                await db
                                    .update(aiModels)
                                    .set({
                                        displayName: m.displayName,
                                        enabled: m.enabled,
                                        visibleToUsers: m.visibleToUsers,
                                        isDefault: m.isDefault,
                                        updatedAt: now,
                                    })
                                    .where(eq(aiModels.id, existingModel.id))
                                    .run();
                            } else {
                                await db
                                    .insert(aiModels)
                                    .values({
                                        id: crypto.randomUUID(),
                                        providerId,
                                        modelId: m.modelId,
                                        displayName: m.displayName,
                                        enabled: m.enabled,
                                        visibleToUsers: m.visibleToUsers,
                                        isDefault: m.isDefault,
                                        supportsText: true,
                                        supportsVision: false,
                                        supportsTools: false,
                                        supportsStreaming: true,
                                        metadataJson: null,
                                        updatedAt: now,
                                    })
                                    .run();
                            }
                            importedModelsCount++;
                        }
                    }
                }
            });
        }

        // 仅在加密密钥检查与数据库持久化全部成功后更新系统设置，杜绝部分应用
        const updatedSettings = await this.#settingsStore.update(cfg.settings);

        return {
            settings: updatedSettings,
            importedProvidersCount: createdProvidersCount +
                updatedProvidersCount,
            createdProvidersCount,
            updatedProvidersCount,
            importedModelsCount,
        };
    }

    async #snapshotNative(native: DatabaseSync): Promise<Uint8Array> {
        const path = await Deno.makeTempFile({
            prefix: "searcher-snapshot-",
            suffix: ".sqlite",
        });
        try {
            await backup(native, path);
            const copy = new DatabaseSync(path);
            try {
                copy.exec("PRAGMA journal_mode=DELETE");
            } finally {
                copy.close();
            }
            return await Deno.readFile(path);
        } finally {
            await Deno.remove(path);
        }
    }

    async #archive(native: DatabaseSync): Promise<Uint8Array> {
        const zipFiles: fflate.AsyncZippable = {
            "database.sqlite": [await this.#snapshotNative(native), {
                level: 6,
            }],
        };
        const assets = { wallpapersCount: 0, iconsCount: 0 };
        for (
            const [kind, dir] of [
                ["wallpapers", this.#wallpaperService?.storageDir],
                ["icons", this.#iconService?.storageDir],
            ] as const
        ) {
            if (!dir) continue;
            try {
                for await (const entry of Deno.readDir(dir)) {
                    if (!entry.isFile) continue;
                    if (kind === "wallpapers") {
                        if (
                            entry.name !== "manifest.json" &&
                            !/^[0-9a-fA-F-]+\.bin$/.test(entry.name)
                        ) {
                            continue;
                        }
                    }
                    zipFiles[`assets/${kind}/${entry.name}`] = [
                        await Deno.readFile(join(dir, entry.name)),
                        { level: 6 },
                    ];
                    if (entry.name !== "manifest.json") {
                        if (kind === "wallpapers") assets.wallpapersCount++;
                        else assets.iconsCount++;
                    }
                }
            } catch (error) {
                if (!(error instanceof Deno.errors.NotFound)) throw error;
            }
        }
        const countTable = (name: string) =>
            Number(
                native.prepare(`SELECT count(*) AS total FROM ${name}`).all()[0]
                    ?.total ?? 0,
            );
        const manifest: BackupManifest = {
            version: "1.0.0",
            createdAt: this.#now(),
            appName: "Searcher",
            counts: {
                users: countTable("users"),
                webapps: countTable("webapps"),
                notes: countTable("notes"),
                auditLogs: countTable("audit_logs"),
                aiProviders: countTable("ai_providers"),
                aiModels: countTable("ai_models"),
            },
            assets,
        };
        zipFiles["manifest.json"] = [
            new TextEncoder().encode(JSON.stringify(manifest)),
            { level: 6 },
        ];
        zipFiles["assets/system-settings.json"] = [
            new TextEncoder().encode(
                JSON.stringify(await this.#settingsStore.get()),
            ),
            { level: 6 },
        ];
        return await new Promise<Uint8Array>((resolve, reject) => {
            fflate.zip(
                zipFiles,
                (error, output) => error ? reject(error) : resolve(output),
            );
        });
    }

    async createFullBackupZip(): Promise<Uint8Array> {
        const runArchive = () =>
            this.#store.exclusiveNative((native) => this.#archive(native));
        return await this.#withLock(() =>
            this.#wallpaperService
                ? this.#wallpaperService.withLock(runArchive)
                : runArchive()
        );
    }

    async #unpack(zipBytes: Uint8Array): Promise<{
        files: fflate.Unzipped;
        manifest: BackupManifest;
        settings: SystemSettingsDto;
    }> {
        if (zipBytes.length > 50 * 1024 * 1024) {
            throw new Error("备份文件超过 50 MiB");
        }
        const files: fflate.Unzipped = {};
        let total = 0;
        let pending = 0;
        const unzip = new fflate.Unzip((file) => {
            const path = file.name;
            const asset = /^assets\/(wallpapers|icons)\/([A-Za-z0-9_.-]+)$/
                .exec(path);
            if (
                ![
                    "database.sqlite",
                    "manifest.json",
                    "assets/system-settings.json",
                ].includes(path) &&
                (!asset || asset[2] === "." || asset[2] === "..")
            ) {
                throw new Error("备份包含无效资源路径");
            }
            if (path in files) throw new Error("备份包含重复路径");
            const limit = path === "database.sqlite"
                ? 100 * 1024 * 1024
                : asset?.[1] === "wallpapers"
                ? 5 * 1024 * 1024
                : asset?.[1] === "icons"
                ? 2 * 1024 * 1024
                : 1024 * 1024;
            if (file.originalSize !== undefined && file.originalSize > limit) {
                throw new Error("备份资源超过大小限制");
            }
            const chunks: Uint8Array[] = [];
            let length = 0;
            pending++;
            file.ondata = (error, chunk, final) => {
                if (error) throw error;
                length += chunk.length;
                total += chunk.length;
                if (length > limit || total > 150 * 1024 * 1024) {
                    throw new Error("备份解压后超过大小限制");
                }
                chunks.push(chunk.slice());
                if (final) {
                    const bytes = new Uint8Array(length);
                    let offset = 0;
                    for (const part of chunks) {
                        bytes.set(part, offset);
                        offset += part.length;
                    }
                    files[path] = bytes;
                    pending--;
                }
            };
            file.start();
        });
        unzip.register(fflate.UnzipInflate);
        for (let offset = 0; offset < zipBytes.length; offset += 64 * 1024) {
            const end = Math.min(zipBytes.length, offset + 64 * 1024);
            unzip.push(zipBytes.subarray(offset, end), end === zipBytes.length);
        }
        if (pending || !Object.keys(files).length) {
            throw new Error("备份 ZIP 未完整解包");
        }
        if (
            !files["manifest.json"] || !files["database.sqlite"] ||
            !files["assets/system-settings.json"]
        ) {
            throw new Error("备份文件缺少 manifest、database 或系统设置");
        }
        const manifest: BackupManifest = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
                files["manifest.json"],
            ),
        );
        if (manifest.version !== "1.0.0" || manifest.appName !== "Searcher") {
            throw new Error("备份文件版本或应用标识不兼容");
        }
        const settings: SystemSettingsDto = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
                files["assets/system-settings.json"],
            ),
        );
        if (
            !Number.isInteger(settings.auditRetentionDays) ||
            settings.auditRetentionDays < 1 ||
            settings.auditRetentionDays > 3650 ||
            typeof settings.allowRegistration !== "boolean" ||
            !["google", "bing", "baidu", "duckduckgo"].includes(
                settings.defaultEngine,
            ) ||
            !["system", "light", "dark"].includes(settings.defaultTheme) ||
            !["same", "new"].includes(settings.defaultSearchTarget)
        ) {
            throw new Error("备份中的系统设置无效");
        }
        const testDb = new DatabaseSync(":memory:");
        try {
            testDb.deserialize(files["database.sqlite"]);
            if (
                testDb.prepare("PRAGMA quick_check").all()[0]?.quick_check !==
                    "ok" ||
                testDb.prepare("PRAGMA foreign_key_check").all().length
            ) {
                throw new Error("备份中的 SQLite 数据库完整性校验失败");
            }
            const backupHash = testDb.prepare(
                "SELECT hash FROM __drizzle_migrations ORDER BY id DESC LIMIT 1",
            ).all()[0]?.hash;
            // deno-lint-ignore require-await
            const currentHash = await this.#store.exclusiveNative(async (
                native,
            ) => native.prepare(
                "SELECT hash FROM __drizzle_migrations ORDER BY id DESC LIMIT 1",
            ).all()[0]?.hash);
            if (!backupHash || backupHash !== currentHash) {
                throw new Error("备份数据库迁移版本与当前服务不兼容");
            }
            validateBackupConsistency({ files, manifest, db: testDb });
        } finally {
            testDb.close();
        }
        return { files, manifest, settings };
    }

    async validateBackupZip(zipBytes: Uint8Array): Promise<{
        valid: boolean;
        manifest?: BackupManifest;
        error?: string;
    }> {
        try {
            const { manifest } = await this.#unpack(zipBytes);
            return { valid: true, manifest };
        } catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    async restoreFromBackupZip(zipBytes: Uint8Array): Promise<{
        manifest: BackupManifest;
        snapshotCreated: boolean;
        snapshotPath: string;
    }> {
        const { files, manifest, settings } = await this.#unpack(zipBytes);
        const runRestore = () =>
            this.#store.exclusiveNative(async (native, replace) => {
                const currentBytes = await this.#snapshotNative(native);
                const previousSettings = await this.#settingsStore.get();
                const snapshot = await this.#archive(native);
                const snapshotPath = await Deno.makeTempFile({
                    ...(this.#store.storagePath === ":memory:"
                        ? {}
                        : { dir: dirname(this.#store.storagePath) }),
                    prefix: "searcher-before-restore-",
                    suffix: ".zip",
                });
                await Deno.writeFile(snapshotPath, snapshot);

                const staged: Array<{
                    dir: string;
                    stage: string;
                    old: string;
                    moved: boolean;
                    installed: boolean;
                }> = [];
                try {
                    for (
                        const [kind, dir] of [
                            [
                                "wallpapers",
                                this.#wallpaperService?.storageDir,
                            ],
                            ["icons", this.#iconService?.storageDir],
                        ] as const
                    ) {
                        if (!dir) continue;
                        await Deno.mkdir(dirname(dir), { recursive: true });
                        const stage = await Deno.makeTempDir({
                            dir: dirname(dir),
                            prefix: ".searcher-assets-",
                        });
                        const old =
                            `${dir}.before-restore-${crypto.randomUUID()}`;
                        const item = {
                            dir,
                            stage,
                            old,
                            moved: false,
                            installed: false,
                        };
                        staged.push(item);
                        for (const [path, bytes] of Object.entries(files)) {
                            const prefix = `assets/${kind}/`;
                            if (path.startsWith(prefix)) {
                                await Deno.writeFile(
                                    join(stage, path.slice(prefix.length)),
                                    bytes,
                                );
                            }
                        }
                    }
                    for (const item of staged) {
                        try {
                            await Deno.rename(item.dir, item.old);
                            item.moved = true;
                        } catch (error) {
                            if (!(error instanceof Deno.errors.NotFound)) {
                                throw error;
                            }
                        }
                        await Deno.rename(item.stage, item.dir);
                        item.installed = true;
                    }
                    await replace(files["database.sqlite"]);
                    await this.#settingsStore.update(settings);
                } catch (error) {
                    const failures: unknown[] = [];
                    try {
                        await replace(currentBytes);
                    } catch (cause) {
                        failures.push(cause);
                    }
                    for (const item of staged.reverse()) {
                        try {
                            if (item.installed) {
                                await Deno.remove(item.dir, {
                                    recursive: true,
                                });
                            }
                            if (item.moved) {
                                await Deno.rename(item.old, item.dir);
                            }
                        } catch (cause) {
                            failures.push(cause);
                        }
                    }
                    try {
                        await this.#settingsStore.update(previousSettings);
                    } catch (cause) {
                        failures.push(cause);
                    }
                    if (failures.length) {
                        throw new AggregateError(
                            [error, ...failures],
                            `恢复失败且自动回滚不完整；原快照位于 ${snapshotPath}`,
                        );
                    }
                    throw new Error(
                        `恢复失败，已回滚；原快照位于 ${snapshotPath}: ${
                            String(error)
                        }`,
                    );
                } finally {
                    for (const item of staged) {
                        await Deno.remove(item.stage, { recursive: true })
                            .catch(() => {});
                    }
                }
                for (const item of staged) {
                    if (item.moved) {
                        await Deno.remove(item.old, { recursive: true });
                    }
                }
                return { manifest, snapshotCreated: true, snapshotPath };
            });
        return await this.#withLock(() =>
            this.#wallpaperService
                ? this.#wallpaperService.withLock(runRestore)
                : runRestore()
        );
    }
}
