import { dirname, join } from "@std/path";

export interface WallpaperRecord {
    id: string;
    userId: string;
    contentType: "image/png" | "image/jpeg" | "image/webp" | "image/avif";
    size: number;
    createdAt: number;
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

function validateWallpaperRecord(raw: unknown): WallpaperRecord | null {
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

    return {
        id: r.id,
        userId: r.userId,
        contentType: r.contentType as WallpaperRecord["contentType"],
        size: r.size,
        createdAt: r.createdAt,
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

export const MAX_USER_WALLPAPERS = 5;

export class WallpaperService {
    readonly #storageDir: string;
    readonly #manifestPath: string;
    readonly #maxUserWallpapers: number;
    readonly #now: () => number;
    #lockTail: Promise<void> = Promise.resolve();

    constructor(
        storageDir?: string,
        maxUserWallpapers = MAX_USER_WALLPAPERS,
        now: () => number = () => Date.now(),
    ) {
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

    /**
     * Internal mutex using Promise.withResolvers to serialize operations on this instance and prevent concurrent races.
     */
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
    ): Promise<{ id: string; url: string; record: WallpaperRecord }> {
        const validation = validateRasterMagicBytes(bytes);
        if (!validation.valid) {
            throw new Error(validation.reason);
        }

        if (bytes.length > 5 * 1024 * 1024) {
            throw new Error("壁纸文件大小不能超过 5 MiB");
        }

        return await this.#withLock(async () => {
            // 1. Read existing manifest
            const manifest = await this.#readManifest();

            // 2. Generate opaque ID and write payload file
            const id = crypto.randomUUID();
            const filePath = join(this.#storageDir, `${id}.bin`);
            await Deno.writeFile(filePath, bytes);

            const record: WallpaperRecord = {
                id,
                userId,
                contentType: validation.contentType,
                size: bytes.length,
                createdAt: this.#now(),
            };

            // 3. Plan user quota eviction: keep at most (maxUserWallpapers - 1) prior wallpapers
            const userRecords: WallpaperRecord[] = [];
            const otherRecords: WallpaperRecord[] = [];
            for (const r of manifest.values()) {
                if (r.userId === userId) {
                    userRecords.push(r);
                } else {
                    otherRecords.push(r);
                }
            }

            // Sort existing user wallpapers oldest first
            userRecords.sort((a, b) => a.createdAt - b.createdAt);

            const toEvict: WallpaperRecord[] = [];
            while (userRecords.length >= this.#maxUserWallpapers) {
                const evicted = userRecords.shift();
                if (evicted) {
                    toEvict.push(evicted);
                }
            }

            userRecords.push(record);
            const newManifestList = [...otherRecords, ...userRecords];

            // 4. Commit manifest atomically
            try {
                await this.#atomicWriteManifest(newManifestList);
            } catch (manifestError) {
                // Orphan cleanup: remove newly written binary file so no unreferenced payload lingers
                await Deno.remove(filePath).catch(() => {});
                throw manifestError;
            }

            // 5. Post-commit eviction: cleanup evicted wallpaper files
            for (const evicted of toEvict) {
                const evictedPath = join(this.#storageDir, `${evicted.id}.bin`);
                await Deno.remove(evictedPath).catch(() => {});
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

        return await this.#withLock(async () => {
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

        return await this.#withLock(async () => {
            const manifest = await this.#readManifest();
            const record = manifest.get(id);
            if (!record || record.userId !== userId) {
                return false;
            }

            manifest.delete(id);
            await this.#atomicWriteManifest(Array.from(manifest.values()));

            const filePath = join(this.#storageDir, `${id}.bin`);
            await Deno.remove(filePath).catch(() => {});
            return true;
        });
    }

    /**
     * Lists wallpapers belonging to a user (newest first).
     */
    async listUserWallpapers(userId: string): Promise<WallpaperRecord[]> {
        return await this.#withLock(async () => {
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
