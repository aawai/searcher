export const AVATAR_UPLOAD_MAX_MIB = 10;
export const AVATAR_UPLOAD_MAX_BYTES = AVATAR_UPLOAD_MAX_MIB * 1024 * 1024;
export const AVATAR_DISPLAY_SIZE = 256;
export const AVATAR_MAX_INPUT_PIXELS = 8192 * 8192;

export const AVATAR_ALLOWED_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/avif",
] as const;

export type AvatarOriginalMimeType = (typeof AVATAR_ALLOWED_MIME_TYPES)[number];

/**
 * 归一化裁剪框（基于 EXIF 自动校正方向后的图片尺寸 `W × H`）：
 * - `size`: 裁剪正方形边长占 `min(W, H)` 的比例，范围 `(0, 1]`
 * - `x`: 裁剪区域左边缘占 `W` 的比例，范围 `[0, 1]`
 * - `y`: 裁剪区域上边缘占 `H` 的比例，范围 `[0, 1]`
 */
export interface AvatarCrop {
    x: number;
    y: number;
    size: number;
}

export interface AvatarMetaDto {
    avatarId: string;
    avatarUrl: string;
    originalUrl: string;
    originalMimeType: AvatarOriginalMimeType;
    originalWidth: number;
    originalHeight: number;
    displaySize: number;
    crop: AvatarCrop;
    updatedAt: number;
}

export function avatarDisplayUrl(avatarId: string): string {
    return `/api/avatars/${avatarId}`;
}

export function avatarOriginalUrl(avatarId: string): string {
    return `/api/avatars/${avatarId}/original`;
}

function assertValidDimensions(width: number, height: number): void {
    if (
        !Number.isFinite(width) || !Number.isFinite(height) ||
        width < 1 || height < 1
    ) {
        throw new RangeError("图片尺寸必须为正数");
    }
}

export function defaultAvatarCrop(width: number, height: number): AvatarCrop {
    assertValidDimensions(width, height);
    const minDim = Math.min(width, height);
    return {
        x: (width - minDim) / (2 * width),
        y: (height - minDim) / (2 * height),
        size: 1,
    };
}

export function normalizeAvatarCrop(
    crop: Partial<AvatarCrop> | null | undefined,
    width: number,
    height: number,
): AvatarCrop {
    assertValidDimensions(width, height);
    if (!crop || typeof crop !== "object") {
        return defaultAvatarCrop(width, height);
    }
    const minDim = Math.min(width, height);
    const minSize = 1 / minDim;
    const rawSize = typeof crop.size === "number" && Number.isFinite(crop.size)
        ? crop.size
        : 1;
    const size = Math.min(1, Math.max(minSize, rawSize));
    const sidePx = size * minDim;
    const maxX = Math.max(0, (width - sidePx) / width);
    const maxY = Math.max(0, (height - sidePx) / height);
    const fallbackX = (width - sidePx) / (2 * width);
    const fallbackY = (height - sidePx) / (2 * height);
    const rawX = typeof crop.x === "number" && Number.isFinite(crop.x)
        ? crop.x
        : fallbackX;
    const rawY = typeof crop.y === "number" && Number.isFinite(crop.y)
        ? crop.y
        : fallbackY;

    return {
        x: Math.min(maxX, Math.max(0, rawX)),
        y: Math.min(maxY, Math.max(0, rawY)),
        size,
    };
}

export function computePixelCropRect(
    crop: AvatarCrop,
    width: number,
    height: number,
): { left: number; top: number; width: number; height: number } {
    const imgWidth = Math.floor(width);
    const imgHeight = Math.floor(height);
    assertValidDimensions(imgWidth, imgHeight);
    const normalized = normalizeAvatarCrop(crop, imgWidth, imgHeight);
    const minDim = Math.min(imgWidth, imgHeight);
    const side = Math.max(
        1,
        Math.min(minDim, Math.round(normalized.size * minDim)),
    );
    const left = Math.max(
        0,
        Math.min(imgWidth - side, Math.round(normalized.x * imgWidth)),
    );
    const top = Math.max(
        0,
        Math.min(imgHeight - side, Math.round(normalized.y * imgHeight)),
    );
    return { left, top, width: side, height: side };
}
