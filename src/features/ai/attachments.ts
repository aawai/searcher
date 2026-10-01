import type { DatabaseStore } from "../../db/database.ts";
import { aiBlobs } from "../../db/ai-schema.ts";
import type { AttachmentInput, AttachmentPart } from "./types.ts";

export const MAX_ATTACHMENTS = 4;
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MiB
export const MAX_TEXT_SIZE = 1 * 1024 * 1024; // 1 MiB

export const ALLOWED_IMAGE_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
];

export const ALLOWED_TEXT_MIME_TYPES = [
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/html",
    "application/json",
];

export class AttachmentValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AttachmentValidationError";
    }
}

/**
 * Validate incoming attachments against system limits and MIME policies.
 */
export function validateAttachments(attachments?: AttachmentInput[]): void {
    if (!attachments || attachments.length === 0) return;

    if (attachments.length > MAX_ATTACHMENTS) {
        throw new AttachmentValidationError(
            `最多允许上传 ${MAX_ATTACHMENTS} 个附件，当前上传了 ${attachments.length} 个`,
        );
    }

    for (const att of attachments) {
        if (!att.name || !att.mimeType || !att.data) {
            throw new AttachmentValidationError(
                "附件缺少名称、MIME 类型或数据",
            );
        }

        const mimeLower = att.mimeType.toLowerCase();
        const isImage = ALLOWED_IMAGE_MIME_TYPES.includes(mimeLower) ||
            (att.type === "image" && mimeLower.startsWith("image/"));
        const isText = ALLOWED_TEXT_MIME_TYPES.includes(mimeLower) ||
            mimeLower.startsWith("text/");

        if (!isImage && !isText) {
            throw new AttachmentValidationError(
                `不支持的附件文件类型: ${att.mimeType} (${att.name})`,
            );
        }

        if (isImage) {
            if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeLower)) {
                throw new AttachmentValidationError(
                    `不支持的图片格式: ${att.mimeType}，仅支持 PNG、JPEG、WebP`,
                );
            }
            // Verify actual decoded MIME / magic bytes
            const detectedMime = detectImageMimeFromBytes(att.data);
            if (!detectedMime) {
                throw new AttachmentValidationError(
                    `图片附件 ${att.name} 内容损坏或非有效图片数据`,
                );
            }
            const normalizedDeclared = mimeLower === "image/jpg"
                ? "image/jpeg"
                : mimeLower;
            if (detectedMime !== normalizedDeclared) {
                throw new AttachmentValidationError(
                    `图片附件 ${att.name} 实际文件格式 (${detectedMime}) 与声明格式 (${att.mimeType}) 不符`,
                );
            }
            // If data is a base64 data URL, estimate/check size
            const size = estimateBase64Size(att.data);
            if (size > MAX_IMAGE_SIZE) {
                throw new AttachmentValidationError(
                    `图片附件 ${att.name} 大小超过 5 MiB 上限`,
                );
            }
        } else if (isText) {
            // Text size in bytes
            const size = new TextEncoder().encode(att.data).length;
            if (size > MAX_TEXT_SIZE) {
                throw new AttachmentValidationError(
                    `文本附件 ${att.name} 大小超过 1 MiB 上限`,
                );
            }
        }
    }
}

function estimateBase64Size(data: string): number {
    const commaIndex = data.indexOf(",");
    const base64Str = commaIndex >= 0 ? data.slice(commaIndex + 1) : data;
    const padding = base64Str.endsWith("==")
        ? 2
        : base64Str.endsWith("=")
        ? 1
        : 0;
    return Math.floor((base64Str.length * 3) / 4) - padding;
}

export function detectImageMimeFromBytes(base64Data: string): string | null {
    const commaIndex = base64Data.indexOf(",");
    const raw = commaIndex >= 0 ? base64Data.slice(commaIndex + 1) : base64Data;
    let bin: string;
    try {
        bin = atob(raw);
    } catch {
        return null;
    }
    const bytes = new Uint8Array(Math.min(bin.length, 32));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    // PNG full 8-byte signature: 89 50 4E 47 0D 0A 1A 0A
    if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 && bytes[1] === 0x50 &&
        bytes[2] === 0x4E && bytes[3] === 0x47 &&
        bytes[4] === 0x0D && bytes[5] === 0x0A &&
        bytes[6] === 0x1A && bytes[7] === 0x0A
    ) {
        return "image/png";
    }
    // JPEG: FF D8 FF
    if (
        bytes.length >= 3 &&
        bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF
    ) {
        return "image/jpeg";
    }
    // WebP: RIFF (bytes 0..3) and WEBP (bytes 8..11)
    if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return "image/webp";
    }
    return null;
}

/**
 * Persists image attachments to DB blobs table and returns unified AttachmentPart array.
 */
export async function processAndStoreAttachments(
    userId: string,
    conversationId: string,
    attachments: AttachmentInput[] | undefined,
    store: DatabaseStore,
): Promise<AttachmentPart[]> {
    if (!attachments || attachments.length === 0) return [];

    validateAttachments(attachments);

    const parts: AttachmentPart[] = [];
    const now = Date.now();

    for (const att of attachments) {
        const mimeLower = att.mimeType.toLowerCase();
        const isImage = att.type === "image" ||
            ALLOWED_IMAGE_MIME_TYPES.includes(mimeLower);

        if (isImage) {
            const blobId = crypto.randomUUID();
            const size = estimateBase64Size(att.data);

            await store.run(async (db) => {
                await db.insert(aiBlobs).values({
                    id: blobId,
                    userId,
                    conversationId,
                    mimeType: mimeLower,
                    data: att.data,
                    size,
                    createdAt: now,
                }).run();
            });

            parts.push({
                type: "attachment",
                id: blobId,
                name: att.name,
                mimeType: mimeLower,
                size,
                url: `/api/ai/blobs/${blobId}`,
                data: att.data, // retained for immediate LLM vision transport
            });
        } else {
            const size = new TextEncoder().encode(att.data).length;
            parts.push({
                type: "attachment",
                id: att.id || crypto.randomUUID(),
                name: att.name,
                mimeType: mimeLower,
                size,
                data: att.data,
            });
        }
    }

    return parts;
}
