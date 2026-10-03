import type { DatabaseSync } from "node:sqlite";
import type { BackupManifest } from "./types.ts";
import {
    MAX_USER_WALLPAPERS,
    validateRasterMagicBytes,
    validateWallpaperRecord,
    type WallpaperRecord,
} from "../wallpaper/service.ts";

export class BackupValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BackupValidationError";
    }
}

export type ValidatedWallpaperRecord = WallpaperRecord;

export interface BackupValidationContext {
    files: Record<string, Uint8Array>;
    manifest: BackupManifest;
    db: DatabaseSync;
}

export interface BackupValidationResult {
    valid: true;
    wallpapers: ValidatedWallpaperRecord[];
}

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * - Root manifest schema & asset counts
 * - Wallpaper manifest schema & record fields
 * - Support old manifest missing focal center (default 0.5, 0.5)
 * - Validate new focal coordinates 0..1
 * - Every record has a corresponding payload file
 * - No extra/unmanifested payload files in assets/wallpapers
 * - Payload file size matches record.size
 * - Payload magic bytes match record.contentType
 * - Per-user quota does not exceed limit (MAX_USER_WALLPAPERS)
 * - User preferences local wallpaper references (/api/wallpaper/:id) exist in manifest AND are owned by that user
 */
export function validateBackupConsistency(
    ctx: BackupValidationContext,
): BackupValidationResult {
    const { files, manifest, db } = ctx;

    // 1. Root manifest basic schema check
    if (manifest.version !== "1.0.0" || manifest.appName !== "Searcher") {
        throw new BackupValidationError("备份文件版本或应用标识不兼容");
    }
    if (
        typeof manifest.createdAt !== "number" ||
        !Number.isSafeInteger(manifest.createdAt) ||
        manifest.createdAt <= 0
    ) {
        throw new BackupValidationError("备份元数据创建时间无效");
    }
    if (!manifest.counts || typeof manifest.counts !== "object") {
        throw new BackupValidationError("备份元数据统计信息缺失或无效");
    }
    if (!manifest.assets || typeof manifest.assets !== "object") {
        throw new BackupValidationError("备份元数据资源统计信息缺失或无效");
    }

    // 2. Wallpaper manifest and records validation
    const wallpaperManifestPath = "assets/wallpapers/manifest.json";
    const wallpaperFiles = Object.keys(files).filter((k) =>
        k.startsWith("assets/wallpapers/")
    );
    const wallpaperMap = new Map<string, ValidatedWallpaperRecord>();

    if (files[wallpaperManifestPath]) {
        let parsed: unknown;
        try {
            const text = new TextDecoder("utf-8", { fatal: true }).decode(
                files[wallpaperManifestPath],
            );
            parsed = JSON.parse(text);
        } catch {
            throw new BackupValidationError("壁纸清单文件损坏或格式无效");
        }

        if (!Array.isArray(parsed)) {
            throw new BackupValidationError("壁纸清单格式非法：预期为数组");
        }

        for (const item of parsed) {
            const record = validateWallpaperRecord(item);
            if (!record) {
                throw new BackupValidationError(
                    "壁纸清单包含非法记录或字段缺失",
                );
            }

            if (wallpaperMap.has(record.id)) {
                throw new BackupValidationError(
                    `壁纸清单包含重复的壁纸 ID: ${record.id}`,
                );
            }

            wallpaperMap.set(record.id, record);
        }
    } else {
        if (wallpaperFiles.length > 0) {
            throw new BackupValidationError(
                "壁纸目录包含资源文件但缺少 manifest.json 清单",
            );
        }
    }

    // 3. Payload presence check
    for (const [id] of wallpaperMap) {
        const payloadPath = `assets/wallpapers/${id}.bin`;
        if (!files[payloadPath]) {
            throw new BackupValidationError(
                `壁纸记录 ${id} 对应的资源文件不存在: ${payloadPath}`,
            );
        }
    }

    // 4. No extra payload files
    for (const path of wallpaperFiles) {
        if (path === wallpaperManifestPath) continue;
        const match = /^assets\/wallpapers\/([0-9a-fA-F-]+)\.bin$/.exec(path);
        if (!match || !wallpaperMap.has(match[1])) {
            throw new BackupValidationError(
                `备份壁纸目录包含清单外的多余文件: ${path}`,
            );
        }
    }

    // 5. Payload size and magic bytes consistency
    for (const record of wallpaperMap.values()) {
        const payloadPath = `assets/wallpapers/${record.id}.bin`;
        const bytes = files[payloadPath];
        if (bytes.length !== record.size) {
            throw new BackupValidationError(
                `壁纸 ${record.id} 实际大小 (${bytes.length}) 与清单声明大小 (${record.size}) 不一致`,
            );
        }

        const raster = validateRasterMagicBytes(bytes);
        if (!raster.valid) {
            throw new BackupValidationError(
                `壁纸 ${record.id} 文件内容不是合法的栅格图片: ${raster.reason}`,
            );
        }
        if (raster.contentType !== record.contentType) {
            throw new BackupValidationError(
                `壁纸 ${record.id} 实际内容类型 (${raster.contentType}) 与清单声明 (${record.contentType}) 不一致`,
            );
        }
    }

    // 6. Per-user quota check
    const userCounts = new Map<string, number>();
    for (const record of wallpaperMap.values()) {
        const count = (userCounts.get(record.userId) ?? 0) + 1;
        userCounts.set(record.userId, count);
        if (count > MAX_USER_WALLPAPERS) {
            throw new BackupValidationError(
                `用户 ${record.userId} 的壁纸数量 (${count}) 超过配额限制 (${MAX_USER_WALLPAPERS})`,
            );
        }
    }

    // 7. Preference local references exist AND owned check
    const tableExists = db
        .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='preferences'",
        )
        .all();
    if (tableExists.length > 0) {
        // Check background_image column
        const prefRows = db
            .prepare(
                "SELECT user_id AS userId, background_image AS backgroundImage FROM preferences WHERE background_image IS NOT NULL",
            )
            .all() as Array<{ userId: string; backgroundImage: string | null }>;

        for (const row of prefRows) {
            if (!row.backgroundImage) continue;
            if (row.backgroundImage.startsWith("/api/wallpaper/")) {
                const refId = row.backgroundImage.slice(
                    "/api/wallpaper/".length,
                );
                if (!UUID_REGEX.test(refId)) {
                    throw new BackupValidationError(
                        `用户偏好引用的壁纸 ID 格式非法: ${refId}`,
                    );
                }
                const wallpaper = wallpaperMap.get(refId);
                if (!wallpaper) {
                    throw new BackupValidationError(
                        `用户偏好引用的本地壁纸不存在: ${refId}`,
                    );
                }
                if (wallpaper.userId !== row.userId) {
                    throw new BackupValidationError(
                        `用户偏好引用的本地壁纸不属于该用户: ${refId}`,
                    );
                }
            }
        }

        // Check wallpaper_compositions column if present
        const colCheck = db
            .prepare("PRAGMA table_info(preferences)")
            .all() as Array<{ name: string }>;
        const hasCompositionsCol = colCheck.some(
            (c) => c.name === "wallpaper_compositions",
        );
        if (hasCompositionsCol) {
            const compRows = db
                .prepare(
                    "SELECT user_id AS userId, wallpaper_compositions AS compositions FROM preferences WHERE wallpaper_compositions IS NOT NULL",
                )
                .all() as Array<
                    { userId: string; compositions: string | null }
                >;

            for (const r of compRows) {
                if (!r.compositions) continue;
                try {
                    const parsed = JSON.parse(r.compositions);
                    if (typeof parsed === "object" && parsed !== null) {
                        for (const key of Object.keys(parsed)) {
                            if (key.startsWith("/api/wallpaper/")) {
                                const refId = key.slice(
                                    "/api/wallpaper/".length,
                                );
                                if (!UUID_REGEX.test(refId)) {
                                    throw new BackupValidationError(
                                        `偏好构图引用的壁纸 ID 格式非法: ${refId}`,
                                    );
                                }
                                const wallpaper = wallpaperMap.get(refId);
                                if (!wallpaper) {
                                    throw new BackupValidationError(
                                        `偏好构图引用的本地壁纸不存在: ${refId}`,
                                    );
                                }
                                if (wallpaper.userId !== r.userId) {
                                    throw new BackupValidationError(
                                        `偏好构图引用的本地壁纸不属于该用户: ${refId}`,
                                    );
                                }
                            }
                        }
                    }
                } catch (e) {
                    if (e instanceof BackupValidationError) throw e;
                    throw new BackupValidationError(
                        "偏好构图配置不是合法的 JSON",
                    );
                }
            }
        }
    }

    // 8. Root manifest assets.wallpapersCount check
    if (
        manifest.assets &&
        typeof manifest.assets.wallpapersCount === "number" &&
        manifest.assets.wallpapersCount !== wallpaperMap.size
    ) {
        throw new BackupValidationError(
            `备份清单壁纸统计数量 (${manifest.assets.wallpapersCount}) 与实际壁纸记录数量 (${wallpaperMap.size}) 不一致`,
        );
    }

    return {
        valid: true,
        wallpapers: Array.from(wallpaperMap.values()),
    };
}
