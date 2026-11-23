import { Buffer } from "node:buffer";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import {
    AVATAR_DISPLAY_SIZE,
    AVATAR_MAX_INPUT_PIXELS,
    AVATAR_UPLOAD_MAX_BYTES,
    AVATAR_UPLOAD_MAX_MIB,
    type AvatarCrop,
    avatarDisplayUrl,
    type AvatarMetaDto,
    type AvatarOriginalMimeType,
    avatarOriginalUrl,
    computePixelCropRect,
    normalizeAvatarCrop,
} from "@shared/avatar.ts";
import type { DatabaseStore } from "../../db/database.ts";
import { userAvatars } from "../../db/schema.ts";
import { validateRasterMagicBytes } from "../wallpaper/service.ts";

export class AvatarValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AvatarValidationError";
    }
}

export class AvatarNotFoundError extends Error {
    constructor(message = "头像不存在") {
        super(message);
        this.name = "AvatarNotFoundError";
    }
}

function toNodeBuffer(bytes: Uint8Array): Buffer {
    return Buffer.isBuffer(bytes)
        ? bytes
        : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function toUint8Array(data: Buffer): Uint8Array<ArrayBuffer> {
    if (data.buffer instanceof ArrayBuffer) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return new Uint8Array(data);
}

export interface RenderedAvatarResult {
    originalMimeType: AvatarOriginalMimeType;
    originalWidth: number;
    originalHeight: number;
    displayBuffer: Buffer;
    displayMimeType: "image/webp";
    crop: AvatarCrop;
}

/**
 * Validates raster image bytes, auto-orients EXIF once, extracts the requested
 * square crop, and renders a 256×256 WebP display avatar.
 */
export async function renderAvatarFromOriginal(
    originalBytes: Uint8Array,
    cropInput?: Partial<AvatarCrop> | null,
): Promise<RenderedAvatarResult> {
    if (!(originalBytes instanceof Uint8Array) || originalBytes.length < 1) {
        throw new AvatarValidationError("无效的头像文件内容");
    }
    if (originalBytes.length > AVATAR_UPLOAD_MAX_BYTES) {
        throw new AvatarValidationError(
            `头像图片大小不能超过 ${AVATAR_UPLOAD_MAX_MIB} MiB`,
        );
    }

    const raster = validateRasterMagicBytes(originalBytes);
    if (!raster.valid) {
        throw new AvatarValidationError(raster.reason);
    }

    let oriented: {
        data: Buffer;
        info: { width: number; height: number; channels: 1 | 2 | 3 | 4 };
    };
    try {
        oriented = await sharp(originalBytes, {
            limitInputPixels: AVATAR_MAX_INPUT_PIXELS,
        })
            .rotate()
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
    } catch {
        throw new AvatarValidationError(
            "无法解析图片文件，请上传有效的 PNG、JPEG、WebP 或 AVIF 图片",
        );
    }

    const width = oriented.info.width;
    const height = oriented.info.height;
    if (width < 1 || height < 1) {
        throw new AvatarValidationError("图片尺寸无效");
    }

    const crop = normalizeAvatarCrop(cropInput, width, height);
    const rect = computePixelCropRect(crop, width, height);

    const displayBuffer = await sharp(oriented.data, {
        raw: {
            width,
            height,
            channels: oriented.info.channels,
        },
    })
        .extract(rect)
        .resize(AVATAR_DISPLAY_SIZE, AVATAR_DISPLAY_SIZE, {
            fit: "cover",
            kernel: "lanczos3",
        })
        .webp({ quality: 86 })
        .toBuffer();

    return {
        originalMimeType: raster.contentType,
        originalWidth: width,
        originalHeight: height,
        displayBuffer,
        displayMimeType: "image/webp",
        crop,
    };
}

function toMetaDto(row: {
    avatarId: string;
    originalMimeType: AvatarOriginalMimeType;
    originalWidth: number;
    originalHeight: number;
    displaySize: number;
    cropX: number;
    cropY: number;
    cropSize: number;
    updatedAt: number;
}): AvatarMetaDto {
    return {
        avatarId: row.avatarId,
        avatarUrl: avatarDisplayUrl(row.avatarId),
        originalUrl: avatarOriginalUrl(row.avatarId),
        originalMimeType: row.originalMimeType,
        originalWidth: row.originalWidth,
        originalHeight: row.originalHeight,
        displaySize: row.displaySize,
        crop: {
            x: row.cropX,
            y: row.cropY,
            size: row.cropSize,
        },
        updatedAt: row.updatedAt,
    };
}

export class AvatarService {
    readonly #store: DatabaseStore;
    readonly #now: () => number;

    constructor(
        store: DatabaseStore,
        now: () => number = () => Date.now(),
    ) {
        this.#store = store;
        this.#now = now;
    }

    async getMeta(userId: string): Promise<AvatarMetaDto | null> {
        return await this.#store.run(async (db) => {
            const rows = await db
                .select({
                    avatarId: userAvatars.avatarId,
                    originalMimeType: userAvatars.originalMimeType,
                    originalWidth: userAvatars.originalWidth,
                    originalHeight: userAvatars.originalHeight,
                    displaySize: userAvatars.displaySize,
                    cropX: userAvatars.cropX,
                    cropY: userAvatars.cropY,
                    cropSize: userAvatars.cropSize,
                    updatedAt: userAvatars.updatedAt,
                })
                .from(userAvatars)
                .where(eq(userAvatars.userId, userId))
                .limit(1)
                .all();
            return rows[0] ? toMetaDto(rows[0]) : null;
        });
    }

    async upload(
        userId: string,
        bytes: Uint8Array,
        cropInput?: Partial<AvatarCrop> | null,
    ): Promise<AvatarMetaDto> {
        const rendered = await renderAvatarFromOriginal(bytes, cropInput);
        const avatarId = crypto.randomUUID();
        const updatedAt = this.#now();
        const originalBuffer = toNodeBuffer(bytes);

        await this.#store.run(async (db) => {
            await db
                .insert(userAvatars)
                .values({
                    userId,
                    avatarId,
                    originalMimeType: rendered.originalMimeType,
                    originalByteSize: bytes.length,
                    originalWidth: rendered.originalWidth,
                    originalHeight: rendered.originalHeight,
                    originalData: originalBuffer,
                    displayMimeType: rendered.displayMimeType,
                    displayByteSize: rendered.displayBuffer.length,
                    displaySize: AVATAR_DISPLAY_SIZE,
                    displayData: rendered.displayBuffer,
                    cropX: rendered.crop.x,
                    cropY: rendered.crop.y,
                    cropSize: rendered.crop.size,
                    updatedAt,
                })
                .onConflictDoUpdate({
                    target: userAvatars.userId,
                    set: {
                        avatarId,
                        originalMimeType: rendered.originalMimeType,
                        originalByteSize: bytes.length,
                        originalWidth: rendered.originalWidth,
                        originalHeight: rendered.originalHeight,
                        originalData: originalBuffer,
                        displayMimeType: rendered.displayMimeType,
                        displayByteSize: rendered.displayBuffer.length,
                        displaySize: AVATAR_DISPLAY_SIZE,
                        displayData: rendered.displayBuffer,
                        cropX: rendered.crop.x,
                        cropY: rendered.crop.y,
                        cropSize: rendered.crop.size,
                        updatedAt,
                    },
                });
        });

        return toMetaDto({
            avatarId,
            originalMimeType: rendered.originalMimeType,
            originalWidth: rendered.originalWidth,
            originalHeight: rendered.originalHeight,
            displaySize: AVATAR_DISPLAY_SIZE,
            cropX: rendered.crop.x,
            cropY: rendered.crop.y,
            cropSize: rendered.crop.size,
            updatedAt,
        });
    }

    async recrop(
        userId: string,
        cropInput: AvatarCrop,
    ): Promise<AvatarMetaDto> {
        const existing = await this.#store.run(async (db) => {
            const rows = await db
                .select({
                    originalData: userAvatars.originalData,
                })
                .from(userAvatars)
                .where(eq(userAvatars.userId, userId))
                .limit(1)
                .all();
            return rows[0] ?? null;
        });

        if (!existing) {
            throw new AvatarNotFoundError("尚未上传头像，无法重新裁剪");
        }

        const originalBytes = toUint8Array(existing.originalData);
        const rendered = await renderAvatarFromOriginal(
            originalBytes,
            cropInput,
        );
        const avatarId = crypto.randomUUID();
        const updatedAt = this.#now();

        const updated = await this.#store.run(async (db) => {
            const rows = await db
                .update(userAvatars)
                .set({
                    avatarId,
                    displayMimeType: rendered.displayMimeType,
                    displayByteSize: rendered.displayBuffer.length,
                    displaySize: AVATAR_DISPLAY_SIZE,
                    displayData: rendered.displayBuffer,
                    cropX: rendered.crop.x,
                    cropY: rendered.crop.y,
                    cropSize: rendered.crop.size,
                    updatedAt,
                })
                .where(eq(userAvatars.userId, userId))
                .returning({
                    avatarId: userAvatars.avatarId,
                    originalMimeType: userAvatars.originalMimeType,
                    originalWidth: userAvatars.originalWidth,
                    originalHeight: userAvatars.originalHeight,
                    displaySize: userAvatars.displaySize,
                    cropX: userAvatars.cropX,
                    cropY: userAvatars.cropY,
                    cropSize: userAvatars.cropSize,
                    updatedAt: userAvatars.updatedAt,
                })
                .all();
            return rows[0] ?? null;
        });

        if (!updated) {
            throw new AvatarNotFoundError();
        }
        return toMetaDto(updated);
    }

    async remove(userId: string): Promise<void> {
        await this.#store.run(async (db) => {
            await db
                .delete(userAvatars)
                .where(eq(userAvatars.userId, userId));
        });
    }

    async readDisplay(
        avatarId: string,
        requester: { id: string; role: string },
    ): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string } | null> {
        return await this.#store.run(async (db) => {
            const rows = await db
                .select({
                    userId: userAvatars.userId,
                    displayMimeType: userAvatars.displayMimeType,
                    displayData: userAvatars.displayData,
                })
                .from(userAvatars)
                .where(eq(userAvatars.avatarId, avatarId))
                .limit(1)
                .all();
            const row = rows[0];
            if (!row) return null;
            if (row.userId !== requester.id && requester.role !== "admin") {
                return null;
            }
            return {
                bytes: toUint8Array(row.displayData),
                contentType: row.displayMimeType,
            };
        });
    }

    async readOriginal(
        avatarId: string,
        requesterUserId: string,
    ): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string } | null> {
        return await this.#store.run(async (db) => {
            const rows = await db
                .select({
                    userId: userAvatars.userId,
                    originalMimeType: userAvatars.originalMimeType,
                    originalData: userAvatars.originalData,
                })
                .from(userAvatars)
                .where(eq(userAvatars.avatarId, avatarId))
                .limit(1)
                .all();
            const row = rows[0];
            if (!row || row.userId !== requesterUserId) {
                return null;
            }
            return {
                bytes: toUint8Array(row.originalData),
                contentType: row.originalMimeType,
            };
        });
    }
}
