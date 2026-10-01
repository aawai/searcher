import type { AttachmentItem } from "./types.ts";

export const ATTACHMENT_LIMITS = {
    maxFiles: 4,
    maxImageSize: 5 * 1024 * 1024, // 5 MiB
    maxTextSize: 1 * 1024 * 1024, // 1 MiB
    allowedImageMimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
    allowedTextMimeTypes: [
        "text/plain",
        "text/markdown",
        "text/csv",
        "application/json",
    ] as const,
};

export function validateAttachmentFile(
    file: File,
    currentCount: number,
    supportsVision: boolean,
): { valid: true; type: "image" | "text" } | { valid: false; reason: string } {
    if (currentCount >= ATTACHMENT_LIMITS.maxFiles) {
        return {
            valid: false,
            reason: `最多只能添加 ${ATTACHMENT_LIMITS.maxFiles} 个附件`,
        };
    }

    const mime = file.type.toLowerCase();
    const isImage =
        (ATTACHMENT_LIMITS.allowedImageMimeTypes as readonly string[]).includes(
            mime,
        );
    const isText =
        (ATTACHMENT_LIMITS.allowedTextMimeTypes as readonly string[]).includes(
            mime,
        ) ||
        file.name.endsWith(".md") ||
        file.name.endsWith(".txt") ||
        file.name.endsWith(".csv") ||
        file.name.endsWith(".json");

    if (isImage) {
        if (!supportsVision) {
            return {
                valid: false,
                reason: "当前模型不支持视觉输入 (Vision)，请选择支持视觉的模型",
            };
        }
        if (file.size > ATTACHMENT_LIMITS.maxImageSize) {
            return {
                valid: false,
                reason: `图片大小不能超过 5 MiB (当前 ${
                    (file.size / 1024 / 1024).toFixed(1)
                } MiB)`,
            };
        }
        return { valid: true, type: "image" };
    }

    if (isText) {
        if (file.size > ATTACHMENT_LIMITS.maxTextSize) {
            return {
                valid: false,
                reason: `文本文件大小不能超过 1 MiB (当前 ${
                    (file.size / 1024 / 1024).toFixed(1)
                } MiB)`,
            };
        }
        return { valid: true, type: "text" };
    }

    return {
        valid: false,
        reason: `不支持的文件类型: ${
            mime || file.name
        }。支持图片 (PNG/JPEG/WebP) 和文本 (TXT/MD/CSV/JSON)`,
    };
}

export function processFileToAttachment(
    file: File,
    type: "image" | "text",
): Promise<AttachmentItem> {
    const id = "att-" + crypto.randomUUID();
    const mimeType = file.type ||
        (type === "image" ? "image/png" : "text/plain");

    if (type === "image") {
        const { promise, resolve, reject } = Promise.withResolvers<
            AttachmentItem
        >();
        const reader = new FileReader();
        reader.onload = () => {
            const data = reader.result as string;
            resolve({
                id,
                name: file.name,
                type: "image",
                mimeType,
                data,
                size: file.size,
                file,
                status: "ready",
            });
        };
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(file);
        return promise;
    }

    const { promise, resolve, reject } = Promise.withResolvers<
        AttachmentItem
    >();
    const reader = new FileReader();
    reader.onload = () => {
        const data = reader.result as string;
        resolve({
            id,
            name: file.name,
            type: "text",
            mimeType,
            data,
            size: file.size,
            file,
            status: "ready",
        });
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsText(file);
    return promise;
}
