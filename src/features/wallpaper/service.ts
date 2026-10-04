import { AsyncLocalStorage } from "node:async_hooks";
import { dirname, join } from "@std/path";
import { eq } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { preferences } from "../../db/schema.ts";
import {
    DEFAULT_WALLPAPER_PRESENTATION,
    type WallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";
import {
    normalizeWallpaperCompositions,
    parseWallpaperSource,
    type WallpaperComposition,
} from "@shared/wallpaper.ts";

export interface WallpaperRecord {
    id: string;
    userId: string;
    contentType: "image/png" | "image/jpeg" | "image/webp" | "image/avif";
    size: number;
    createdAt: number;
    focalX: number;
    focalY: number;
}

export type RasterValidationResult =
    | { valid: true; contentType: WallpaperRecord["contentType"] }
    | { valid: false; reason: string };

/**
 * Validates magic bytes for PNG, JPEG, WebP, AVIF.
 * Explicitly rejects SVG (text-based XML/SVG) and anything else.
 */
export function validateRasterMagicBytes(
    bytes: Uint8Array,
): RasterValidationResult {
    if (bytes.length < 12) {
        return { valid: false, reason: "文件内容过短，不是有效的图片" };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    ) {
        return { valid: true, contentType: "image/png" };
    }

    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return { valid: true, contentType: "image/jpeg" };
    }

    // WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
    if (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return { valid: true, contentType: "image/webp" };
    }

    // AVIF: ISOBMFF box with ftyp compatible brand avif / avis
    // Bytes 4-7 must be 'ftyp' (0x66 0x74 0x79 0x70)
    if (
        bytes[4] === 0x66 &&
        bytes[5] === 0x74 &&
        bytes[6] === 0x79 &&
        bytes[7] === 0x70
    ) {
        const majorBrand = String.fromCharCode(...bytes.slice(8, 12));
        if (majorBrand === "avif" || majorBrand === "avis") {
            return { valid: true, contentType: "image/avif" };
        }
        // Check compatible brands if ftyp box is longer
        const boxLength = (bytes[0] << 24) | (bytes[1] << 16) |
            (bytes[2] << 8) |
            bytes[3];
        const end = Math.min(boxLength, bytes.length, 64);
        for (let i = 16; i + 4 <= end; i += 4) {
            const brand = String.fromCharCode(...bytes.slice(i, i + 4));
            if (brand === "avif" || brand === "avis") {
                return { valid: true, contentType: "image/avif" };
            }
        }
    }

    // Check if it looks like SVG or HTML (reject)
    const headerStr = new TextDecoder().decode(bytes.slice(0, 100)).trim()
        .toLowerCase();
    if (
        headerStr.includes("<svg") ||
        headerStr.includes("<?xml") ||
        headerStr.includes("<!doctype html") ||
        headerStr.includes("<html")
    ) {
        return {
            valid: false,
            reason: "不支持矢量 SVG 格式，仅允许栅格图片 (PNG/JPEG/WebP/AVIF)",
        };
    }

    return {
        valid: false,
        reason: "无效的图片格式，仅允许栅格图片 (PNG/JPEG/WebP/AVIF)",
    };
}

const ALLOWED_CONTENT_TYPES: Record<string, true> = {
    "image/png": true,
    "image/jpeg": true,
    "image/webp": true,
    "image/avif": true,
};

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateWallpaperRecord(raw: unknown): WallpaperRecord | null {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || !UUID_REGEX.test(r.id)) return null;
    if (typeof r.userId !== "string" || r.userId.trim() === "") return null;
    if (
        typeof r.contentType !== "string" ||
        !ALLOWED_CONTENT_TYPES[r.contentType]
    ) return null;
    if (
        typeof r.size !== "number" || !Number.isSafeInteger(r.size) ||
        r.size <= 0
    ) {
        return null;
    }
    if (
        typeof r.createdAt !== "number" ||
        !Number.isSafeInteger(r.createdAt) ||
        r.createdAt <= 0
    ) {
        return null;
    }
    let focalX = 0.5;
    if (r.focalX !== undefined && r.focalX !== null) {
        if (
            typeof r.focalX !== "number" ||
            !Number.isFinite(r.focalX) ||
            r.focalX < 0 ||
            r.focalX > 1
        ) {
            return null;
        }
        focalX = r.focalX;
    }

    let focalY = 0.5;
    if (r.focalY !== undefined && r.focalY !== null) {
        if (
            typeof r.focalY !== "number" ||
            !Number.isFinite(r.focalY) ||
            r.focalY < 0 ||
            r.focalY > 1
        ) {
            return null;
        }
        focalY = r.focalY;
    }

    return {
        id: r.id,
        userId: r.userId,
        contentType: r.contentType as WallpaperRecord["contentType"],
        size: r.size,
        createdAt: r.createdAt,
        focalX,
        focalY,
    };
}

/**
 * Manifest parsing error when manifest.json exists but contains invalid data.
 * Must fail closed rather than wiping existing data.
 */
export class ManifestCorruptionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ManifestCorruptionError";
    }
}

async function removeWallpaperFile(path: string): Promise<void> {
    try {
        await Deno.remove(path);
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
}

async function restoreStagedWallpaper(
    payload: { original: string; staged: string; bytes: Uint8Array },
): Promise<void> {
    try {
        await Deno.rename(payload.staged, payload.original);
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
        await Deno.writeFile(payload.original, payload.bytes);
    }
}

async function rollbackWallpaperMutation(
    error: unknown,
    steps: Array<() => Promise<unknown>>,
): Promise<never> {
    const failures: unknown[] = [];
    for (const step of steps) {
        try {
            await step();
        } catch (failure) {
            failures.push(failure);
        }
    }
    if (failures.length) {
        throw new AggregateError(
            [error, ...failures],
            "Wallpaper mutation failed and rollback was incomplete; staged payloads are retained",
        );
    }
    throw error;
}

export const MAX_USER_WALLPAPERS = 5;

export class WallpaperService {
    readonly #storageDir: string;
    readonly #manifestPath: string;
    readonly #maxUserWallpapers: number;
    readonly #now: () => number;
    #store?: DatabaseStore;
    readonly #lockDepth = new AsyncLocalStorage<boolean>();
    #lockTail: Promise<void> = Promise.resolve();

    constructor(
        storageDir?: string,
        maxUserWallpapers = MAX_USER_WALLPAPERS,
        now: () => number = () => Date.now(),
        store?: DatabaseStore,
    ) {
        this.#store = store;
        if (storageDir) {
            this.#storageDir = storageDir;
        } else {
            const dbPath = Deno.env.get("DATABASE_PATH") ??
                "./data/searcher.sqlite";
            if (dbPath === ":memory:") {
                this.#storageDir = "./data/wallpapers";
            } else {
                this.#storageDir = join(dirname(dbPath), "wallpapers");
            }
        }
        this.#manifestPath = join(this.#storageDir, "manifest.json");
        this.#maxUserWallpapers = maxUserWallpapers;
        this.#now = now;
    }

    get storageDir(): string {
        return this.#storageDir;
    }
    setStore(store: DatabaseStore): void {
        this.#store = store;
    }

    get store(): DatabaseStore | undefined {
        return this.#store;
    }

    /**
     * Internal mutex using Promise.withResolvers to serialize operations on this instance and prevent concurrent races.
     */
    async withLock<T>(fn: () => Promise<T>): Promise<T> {
        if (this.#lockDepth.getStore()) {
            return await fn();
        }
        const prev = this.#lockTail;
        const { promise, resolve } = Promise.withResolvers<void>();
        this.#lockTail = promise;
        await prev;
        try {
            return await this.#lockDepth.run(true, fn);
        } finally {
            resolve();
        }
    }

    /**
     * Reads and parses manifest.json from disk.
     * If not found, initializes empty file.
     * If malformed JSON or invalid schema, throws ManifestCorruptionError (fail closed).
     */
    async #readManifest(): Promise<Map<string, WallpaperRecord>> {
        await Deno.mkdir(this.#storageDir, { recursive: true });

        let content: string;
        try {
            content = await Deno.readTextFile(this.#manifestPath);
        } catch (e) {
            if (e instanceof Deno.errors.NotFound) {
                // Initialize empty manifest safely
                await this.#atomicWriteManifest([]);
                return new Map<string, WallpaperRecord>();
            }
            throw e;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch {
            throw new ManifestCorruptionError(
                "壁纸清单文件损坏或格式无效，拒绝静默覆盖",
            );
        }

        if (!Array.isArray(parsed)) {
            throw new ManifestCorruptionError(
                "壁纸清单格式非法：预期为数组，拒绝静默覆盖",
            );
        }

        const map = new Map<string, WallpaperRecord>();
        for (const item of parsed) {
            const record = validateWallpaperRecord(item);
            if (!record) {
                throw new ManifestCorruptionError(
                    "壁纸清单包含非法记录或字段缺失，拒绝静默覆盖",
                );
            }
            map.set(record.id, record);
        }

        return map;
    }

    async #atomicWriteManifest(records: WallpaperRecord[]): Promise<void> {
        const tmpPath = `${this.#manifestPath}.${crypto.randomUUID()}.tmp`;
        const payload = JSON.stringify(records, null, 2);
        try {
            await Deno.writeTextFile(tmpPath, payload);
            await Deno.rename(tmpPath, this.#manifestPath);
        } catch (err) {
            // Ensure temp file is cleaned up on error
            await Deno.remove(tmpPath).catch(() => {});
            throw err;
        }
    }

    /**
     * Saves wallpaper for a user.
     * - Validates raster format & 5 MiB size limit.
     * - Enforces user quota (max wallpapers), evicting oldest after successful manifest commit.
     * - Cleans up written payload file if manifest commit fails.
     */
    async saveWallpaper(
        userId: string,
        bytes: Uint8Array,
        focal?: { focalX?: number; focalY?: number },
    ): Promise<{ id: string; url: string; record: WallpaperRecord }> {
        const validation = validateRasterMagicBytes(bytes);
        if (!validation.valid) {
            throw new Error(validation.reason);
        }

        if (bytes.length > 5 * 1024 * 1024) {
            throw new Error("壁纸文件大小不能超过 5 MiB");
        }
        const focalX = typeof focal?.focalX === "number" &&
                Number.isFinite(focal.focalX)
            ? Math.max(0, Math.min(1, focal.focalX))
            : 0.5;
        const focalY = typeof focal?.focalY === "number" &&
                Number.isFinite(focal.focalY)
            ? Math.max(0, Math.min(1, focal.focalY))
            : 0.5;

        return await this.withLock(async () => {
            // 1. Read existing manifest
            const manifest = await this.#readManifest();

            // 2. Plan quota eviction strictly keeping the most recent (maxUserWallpapers - 1)
            const userRecords: WallpaperRecord[] = [];
            const otherRecords: WallpaperRecord[] = [];
            for (const r of manifest.values()) {
                if (r.userId === userId) {
                    userRecords.push(r);
                } else {
                    otherRecords.push(r);
                }
            }

            // Sort oldest first for FIFO eviction
            userRecords.sort((a, b) => a.createdAt - b.createdAt);

            const toEvict: WallpaperRecord[] = [];
            while (userRecords.length >= this.#maxUserWallpapers) {
                const evicted = userRecords.shift();
                if (evicted) {
                    toEvict.push(evicted);
                }
            }

            const id = crypto.randomUUID();
            const filePath = join(this.#storageDir, `${id}.bin`);
            const tempFilePath = `${filePath}.tmp`;

            // Step A: Stage write new payload to temp file
            await Deno.writeFile(tempFilePath, bytes);

            // Step B: Read evicted payload bytes into memory for 100% recoverable eviction rollback,
            // then stage rename to .deleting
            const evictedPayloads: Array<{
                id: string;
                original: string;
                staged: string;
                bytes: Uint8Array;
            }> = [];
            try {
                for (const evicted of toEvict) {
                    const original = join(
                        this.#storageDir,
                        `${evicted.id}.bin`,
                    );
                    const staged = `${original}.deleting`;
                    const fileBytes = await Deno.readFile(original);
                    await Deno.rename(original, staged);
                    evictedPayloads.push({
                        id: evicted.id,
                        original,
                        staged,
                        bytes: fileBytes,
                    });
                }
            } catch (stageErr) {
                return await rollbackWallpaperMutation(stageErr, [
                    ...evictedPayloads.map((item) => () =>
                        restoreStagedWallpaper(item)
                    ),
                    () => removeWallpaperFile(tempFilePath),
                ]);
            }

            // Step C: DB operations - clear reference & compositions for evicted items (canonical matching)
            let dbRollbackState: {
                backgroundImage: string | null;
                wallpaperCompositions: string | null;
                wallpaperPresentations: string | null;
            } | null = null;

            if (this.#store && toEvict.length > 0) {
                try {
                    const canonicalEvictedSet = new Set(
                        toEvict.map((e) =>
                            `/api/wallpaper/${e.id.toLowerCase()}`
                        ),
                    );
                    await this.#store.run(async (db) => {
                        const rows = await db.select({
                            backgroundImage: preferences.backgroundImage,
                            wallpaperCompositions:
                                preferences.wallpaperCompositions,
                            wallpaperPresentations:
                                preferences.wallpaperPresentations,
                        })
                            .from(preferences)
                            .where(eq(preferences.userId, userId))
                            .limit(1)
                            .all();

                        if (rows[0]) {
                            const curBg = rows[0].backgroundImage;
                            const curCompsRaw = rows[0].wallpaperCompositions;
                            let needsUpdate = false;
                            let newBg = curBg;

                            if (curBg) {
                                const s = parseWallpaperSource(curBg);
                                if (
                                    s?.type === "uploaded" &&
                                    canonicalEvictedSet.has(s.value)
                                ) {
                                    newBg = null;
                                    needsUpdate = true;
                                } else if (
                                    canonicalEvictedSet.has(
                                        curBg.trim().toLowerCase(),
                                    )
                                ) {
                                    newBg = null;
                                    needsUpdate = true;
                                }
                            }

                            let comps: Record<string, WallpaperComposition> =
                                {};
                            if (curCompsRaw) {
                                try {
                                    comps = normalizeWallpaperCompositions(
                                        JSON.parse(curCompsRaw),
                                    );
                                } catch {
                                    comps = {};
                                }
                            }

                            for (const key of Object.keys(comps)) {
                                const s = parseWallpaperSource(key);
                                if (
                                    s?.type === "uploaded" &&
                                    canonicalEvictedSet.has(s.value)
                                ) {
                                    delete comps[key];
                                    needsUpdate = true;
                                } else if (
                                    canonicalEvictedSet.has(
                                        key.trim().toLowerCase(),
                                    )
                                ) {
                                    delete comps[key];
                                    needsUpdate = true;
                                }
                            }

                            const curPresRaw = rows[0].wallpaperPresentations;
                            let presentations: Record<
                                string,
                                WallpaperPresentation
                            > = {};
                            if (curPresRaw) {
                                try {
                                    presentations = JSON.parse(curPresRaw);
                                } catch {
                                    presentations = {};
                                }
                            }

                            for (const key of Object.keys(presentations)) {
                                const s = parseWallpaperSource(key);
                                if (
                                    s?.type === "uploaded" &&
                                    canonicalEvictedSet.has(s.value)
                                ) {
                                    delete presentations[key];
                                    needsUpdate = true;
                                } else if (
                                    canonicalEvictedSet.has(
                                        key.trim().toLowerCase(),
                                    )
                                ) {
                                    delete presentations[key];
                                    needsUpdate = true;
                                }
                            }

                            if (needsUpdate) {
                                dbRollbackState = {
                                    backgroundImage: curBg,
                                    wallpaperCompositions: curCompsRaw,
                                    wallpaperPresentations: curPresRaw,
                                };
                                await db.update(preferences)
                                    .set({
                                        backgroundImage: newBg,
                                        wallpaperCompositions: JSON.stringify(
                                            comps,
                                        ),
                                        wallpaperPresentations: JSON.stringify(
                                            presentations,
                                        ),
                                    })
                                    .where(eq(preferences.userId, userId))
                                    .run();
                            }
                        }
                    });
                } catch (dbErr) {
                    return await rollbackWallpaperMutation(dbErr, [
                        ...evictedPayloads.map((item) => () =>
                            restoreStagedWallpaper(item)
                        ),
                        () => removeWallpaperFile(tempFilePath),
                    ]);
                }
            }

            const record: WallpaperRecord = {
                id,
                userId,
                contentType: validation.contentType,
                size: bytes.length,
                createdAt: this.#now(),
                focalX,
                focalY,
            };

            userRecords.push(record);
            const newManifestList = [...otherRecords, ...userRecords];

            // Step D: Commit manifest atomically
            try {
                await this.#atomicWriteManifest(newManifestList);
            } catch (manifestError) {
                return await rollbackWallpaperMutation(manifestError, [
                    ...evictedPayloads.map((item) => () =>
                        restoreStagedWallpaper(item)
                    ),
                    async () => {
                        const previous = dbRollbackState;
                        if (!previous || !this.#store) return;
                        await this.#store.run((db) =>
                            db.update(preferences).set(previous).where(
                                eq(preferences.userId, userId),
                            ).run()
                        );
                    },
                    () => removeWallpaperFile(tempFilePath),
                ]);
            }

            // Step E: Commit payload & unlink staged evictions
            try {
                await Deno.rename(tempFilePath, filePath);
            } catch (renameErr) {
                return await rollbackWallpaperMutation(renameErr, [
                    ...evictedPayloads.map((item) => () =>
                        restoreStagedWallpaper(item)
                    ),
                    () =>
                        this.#atomicWriteManifest(
                            Array.from(manifest.values()),
                        ),
                    async () => {
                        const previous = dbRollbackState;
                        if (!previous || !this.#store) return;
                        await this.#store.run((db) =>
                            db.update(preferences).set(previous).where(
                                eq(preferences.userId, userId),
                            ).run()
                        );
                    },
                    () => removeWallpaperFile(tempFilePath),
                ]);
            }

            try {
                for (const item of evictedPayloads) {
                    await Deno.remove(item.staged);
                }
            } catch (unlinkErr) {
                return await rollbackWallpaperMutation(unlinkErr, [
                    ...evictedPayloads.map((item) => () =>
                        restoreStagedWallpaper(item)
                    ),
                    () =>
                        this.#atomicWriteManifest(
                            Array.from(manifest.values()),
                        ),
                    async () => {
                        const previous = dbRollbackState;
                        if (!previous || !this.#store) return;
                        await this.#store.run((db) =>
                            db.update(preferences).set(previous).where(
                                eq(preferences.userId, userId),
                            ).run()
                        );
                    },
                    () => removeWallpaperFile(filePath),
                ]);
            }

            return {
                id,
                url: `/api/wallpaper/${id}`,
                record,
            };
        });
    }

    /**
     * Retrieves wallpaper by ID and verifies owner.
     * Prevents cross-user reads and path traversal.
     */
    async getWallpaper(
        id: string,
        userId: string,
    ): Promise<{ record: WallpaperRecord; bytes: Uint8Array } | null> {
        if (!UUID_REGEX.test(id)) {
            return null;
        }

        return await this.withLock(async () => {
            const manifest = await this.#readManifest();
            const record = manifest.get(id);
            if (!record || record.userId !== userId) {
                return null;
            }

            const filePath = join(this.#storageDir, `${id}.bin`);
            try {
                const bytes = await Deno.readFile(filePath);
                return { record, bytes };
            } catch (e) {
                if (e instanceof Deno.errors.NotFound) {
                    return null;
                }
                throw e;
            }
        });
    }

    /**
     * Deletes a wallpaper explicitly owned by the user.
     */
    async deleteWallpaper(id: string, userId: string): Promise<boolean> {
        if (!UUID_REGEX.test(id)) {
            return false;
        }

        return await this.withLock(async () => {
            const manifest = await this.#readManifest();
            const record = manifest.get(id);
            if (!record || record.userId !== userId) {
                return false;
            }

            const canonicalTarget = `/api/wallpaper/${id.toLowerCase()}`;
            const originalPath = join(this.#storageDir, `${id}.bin`);
            const stagedPath = `${originalPath}.deleting`;

            // Read payload bytes into memory for 100% recoverable rollback
            let payloadBytes: Uint8Array;
            try {
                payloadBytes = await Deno.readFile(originalPath);
            } catch (readErr) {
                throw readErr;
            }

            // Step A: Stage payload by renaming to .deleting
            try {
                await Deno.rename(originalPath, stagedPath);
            } catch (renameErr) {
                throw renameErr;
            }

            // Step B: DB Queue - check if preference references this wallpaper and clear (canonical matching)
            let dbRollbackState: {
                backgroundImage: string | null;
                wallpaperCompositions: string | null;
                wallpaperPresentations: string | null;
            } | null = null;

            if (this.#store) {
                try {
                    await this.#store.run(async (db) => {
                        const rows = await db.select({
                            backgroundImage: preferences.backgroundImage,
                            wallpaperCompositions:
                                preferences.wallpaperCompositions,
                            wallpaperPresentations:
                                preferences.wallpaperPresentations,
                        })
                            .from(preferences)
                            .where(eq(preferences.userId, userId))
                            .limit(1)
                            .all();

                        if (rows[0]) {
                            const curBg = rows[0].backgroundImage;
                            const curCompsRaw = rows[0].wallpaperCompositions;
                            let needsUpdate = false;
                            let newBg = curBg;

                            if (curBg) {
                                const s = parseWallpaperSource(curBg);
                                if (
                                    s?.type === "uploaded" &&
                                    s.value === canonicalTarget
                                ) {
                                    newBg = null;
                                    needsUpdate = true;
                                } else if (
                                    curBg.trim().toLowerCase() ===
                                        canonicalTarget
                                ) {
                                    newBg = null;
                                    needsUpdate = true;
                                }
                            }

                            let comps: Record<string, WallpaperComposition> =
                                {};
                            if (curCompsRaw) {
                                try {
                                    comps = normalizeWallpaperCompositions(
                                        JSON.parse(curCompsRaw),
                                    );
                                } catch {
                                    comps = {};
                                }
                            }

                            for (const key of Object.keys(comps)) {
                                const s = parseWallpaperSource(key);
                                if (
                                    s?.type === "uploaded" &&
                                    s.value === canonicalTarget
                                ) {
                                    delete comps[key];
                                    needsUpdate = true;
                                } else if (
                                    key.trim().toLowerCase() === canonicalTarget
                                ) {
                                    delete comps[key];
                                    needsUpdate = true;
                                }
                            }
                            const curPresRaw = rows[0].wallpaperPresentations;
                            let presentations: Record<
                                string,
                                WallpaperPresentation
                            > = {};
                            if (curPresRaw) {
                                try {
                                    presentations = JSON.parse(curPresRaw);
                                } catch {
                                    presentations = {};
                                }
                            }

                            for (const key of Object.keys(presentations)) {
                                const s = parseWallpaperSource(key);
                                if (
                                    s?.type === "uploaded" &&
                                    s.value === canonicalTarget
                                ) {
                                    delete presentations[key];
                                    needsUpdate = true;
                                } else if (
                                    key.trim().toLowerCase() === canonicalTarget
                                ) {
                                    delete presentations[key];
                                    needsUpdate = true;
                                }
                            }

                            if (needsUpdate) {
                                dbRollbackState = {
                                    backgroundImage: curBg,
                                    wallpaperCompositions: curCompsRaw,
                                    wallpaperPresentations: curPresRaw,
                                };
                                await db.update(preferences)
                                    .set({
                                        backgroundImage: newBg,
                                        wallpaperCompositions: JSON.stringify(
                                            comps,
                                        ),
                                        wallpaperPresentations: JSON.stringify(
                                            presentations,
                                        ),
                                    })
                                    .where(eq(preferences.userId, userId))
                                    .run();
                            }
                        }
                    });
                } catch (dbErr) {
                    return await rollbackWallpaperMutation(dbErr, [
                        () =>
                            restoreStagedWallpaper({
                                original: originalPath,
                                staged: stagedPath,
                                bytes: payloadBytes,
                            }),
                    ]);
                }
            }

            // Step C: Manifest commit
            manifest.delete(id);
            try {
                await this.#atomicWriteManifest(Array.from(manifest.values()));
            } catch (manifestError) {
                return await rollbackWallpaperMutation(manifestError, [
                    () =>
                        restoreStagedWallpaper({
                            original: originalPath,
                            staged: stagedPath,
                            bytes: payloadBytes,
                        }),
                    async () => {
                        const previous = dbRollbackState;
                        if (!previous || !this.#store) return;
                        await this.#store.run((db) =>
                            db.update(preferences).set(previous).where(
                                eq(preferences.userId, userId),
                            ).run()
                        );
                    },
                ]);
            }

            // Step D: Unlink staged payload with full failure rollback
            try {
                await Deno.remove(stagedPath);
            } catch (unlinkErr) {
                manifest.set(id, record);
                return await rollbackWallpaperMutation(unlinkErr, [
                    () =>
                        restoreStagedWallpaper({
                            original: originalPath,
                            staged: stagedPath,
                            bytes: payloadBytes,
                        }),
                    () =>
                        this.#atomicWriteManifest(
                            Array.from(manifest.values()),
                        ),
                    async () => {
                        const previous = dbRollbackState;
                        if (!previous || !this.#store) return;
                        await this.#store.run((db) =>
                            db.update(preferences).set(previous).where(
                                eq(preferences.userId, userId),
                            ).run()
                        );
                    },
                ]);
            }

            return true;
        });
    }

    /**
     * Updates focal point composition of an asset record.
     */
    async updateWallpaperComposition(
        id: string,
        userId: string,
        focal: { focalX?: number; focalY?: number },
    ): Promise<WallpaperRecord | null> {
        if (!UUID_REGEX.test(id)) {
            return null;
        }

        return await this.withLock(async () => {
            const manifest = await this.#readManifest();
            const record = manifest.get(id);
            if (!record || record.userId !== userId) {
                return null;
            }

            const oldFocalX = record.focalX;
            const oldFocalY = record.focalY;
            if (focal.focalX !== undefined) {
                record.focalX = Math.max(0, Math.min(1, focal.focalX));
            }
            if (focal.focalY !== undefined) {
                record.focalY = Math.max(0, Math.min(1, focal.focalY));
            }

            await this.#atomicWriteManifest(Array.from(manifest.values()));

            // Synchronize with preferences.wallpaperCompositions if store is available
            if (this.#store) {
                try {
                    await this.#store.run(async (db) => {
                        const rows = await db.select({
                            wallpaperCompositions:
                                preferences.wallpaperCompositions,
                            wallpaperPresentations:
                                preferences.wallpaperPresentations,
                        })
                            .from(preferences)
                            .where(eq(preferences.userId, userId))
                            .limit(1)
                            .all();
                        if (rows[0]) {
                            let comps: Record<string, WallpaperComposition> =
                                {};
                            if (rows[0].wallpaperCompositions) {
                                try {
                                    comps = normalizeWallpaperCompositions(
                                        JSON.parse(
                                            rows[0].wallpaperCompositions,
                                        ),
                                    );
                                } catch {
                                    comps = {};
                                }
                            }
                            const targetKey =
                                `/api/wallpaper/${id.toLowerCase()}`;
                            comps[targetKey] = {
                                focalX: record.focalX,
                                focalY: record.focalY,
                            };

                            let presentations: Record<
                                string,
                                WallpaperPresentation
                            > = {};
                            if (rows[0].wallpaperPresentations) {
                                try {
                                    presentations = JSON.parse(
                                        rows[0].wallpaperPresentations,
                                    );
                                } catch {
                                    presentations = {};
                                }
                            }
                            if (presentations[targetKey]) {
                                presentations[targetKey].composition = {
                                    focalX: record.focalX,
                                    focalY: record.focalY,
                                };
                            } else {
                                presentations[targetKey] = {
                                    ...DEFAULT_WALLPAPER_PRESENTATION,
                                    composition: {
                                        focalX: record.focalX,
                                        focalY: record.focalY,
                                    },
                                };
                            }

                            await db.update(preferences)
                                .set({
                                    wallpaperCompositions: JSON.stringify(
                                        comps,
                                    ),
                                    wallpaperPresentations: JSON.stringify(
                                        presentations,
                                    ),
                                })
                                .where(eq(preferences.userId, userId))
                                .run();
                        }
                    });
                } catch (dbErr) {
                    // Rollback manifest!
                    record.focalX = oldFocalX;
                    record.focalY = oldFocalY;
                    await this.#atomicWriteManifest(
                        Array.from(manifest.values()),
                    ).catch((rollErr) => {
                        throw new AggregateError(
                            [dbErr, rollErr],
                            "Failed to rollback manifest after DB preferences sync failure",
                        );
                    });
                    throw dbErr;
                }
            }

            return record;
        });
    }

    /**
     * Lists wallpapers belonging to a user (newest first).
     */
    async listUserWallpapers(userId: string): Promise<WallpaperRecord[]> {
        return await this.withLock(async () => {
            const manifest = await this.#readManifest();
            const userList: WallpaperRecord[] = [];
            for (const r of manifest.values()) {
                if (r.userId === userId) {
                    userList.push(r);
                }
            }
            // Manifest insertion order breaks timestamp ties in favor of later uploads.
            return userList.sort((a, b) => a.createdAt - b.createdAt).reverse();
        });
    }
}
