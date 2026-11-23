import { type AvatarCrop, normalizeAvatarCrop } from "@shared/avatar.ts";

export const AVATAR_CROP_MIN_ZOOM = 1;
export const AVATAR_CROP_MAX_ZOOM = 4;

export interface AvatarCropViewState {
    zoom: number;
    offsetX: number;
    offsetY: number;
}

export function clampAvatarZoom(zoom: number): number {
    if (!Number.isFinite(zoom)) return AVATAR_CROP_MIN_ZOOM;
    return Math.min(AVATAR_CROP_MAX_ZOOM, Math.max(AVATAR_CROP_MIN_ZOOM, zoom));
}

export function computeAvatarImageMetrics(
    zoom: number,
    stageSize: number,
    naturalWidth: number,
    naturalHeight: number,
): {
    zoom: number;
    renderedWidth: number;
    renderedHeight: number;
    maxPanX: number;
    maxPanY: number;
} {
    const safeZoom = clampAvatarZoom(zoom);
    const minDim = Math.max(1, Math.min(naturalWidth, naturalHeight));
    const baseScale = stageSize / minDim;
    const scale = baseScale * safeZoom;
    const renderedWidth = naturalWidth * scale;
    const renderedHeight = naturalHeight * scale;
    const maxPanX = Math.max(0, (renderedWidth - stageSize) / 2);
    const maxPanY = Math.max(0, (renderedHeight - stageSize) / 2);
    return {
        zoom: safeZoom,
        renderedWidth,
        renderedHeight,
        maxPanX,
        maxPanY,
    };
}

export function clampAvatarPan(
    offsetX: number,
    offsetY: number,
    zoom: number,
    stageSize: number,
    naturalWidth: number,
    naturalHeight: number,
): AvatarCropViewState {
    const { zoom: safeZoom, maxPanX, maxPanY } = computeAvatarImageMetrics(
        zoom,
        stageSize,
        naturalWidth,
        naturalHeight,
    );
    const safeX = Number.isFinite(offsetX) ? offsetX : 0;
    const safeY = Number.isFinite(offsetY) ? offsetY : 0;
    return {
        zoom: safeZoom,
        offsetX: Math.min(maxPanX, Math.max(-maxPanX, safeX)),
        offsetY: Math.min(maxPanY, Math.max(-maxPanY, safeY)),
    };
}

export function viewStateToAvatarCrop(
    viewState: AvatarCropViewState,
    stageSize: number,
    naturalWidth: number,
    naturalHeight: number,
): AvatarCrop {
    const clamped = clampAvatarPan(
        viewState.offsetX,
        viewState.offsetY,
        viewState.zoom,
        stageSize,
        naturalWidth,
        naturalHeight,
    );
    const { renderedWidth, renderedHeight } = computeAvatarImageMetrics(
        clamped.zoom,
        stageSize,
        naturalWidth,
        naturalHeight,
    );
    const x = ((renderedWidth - stageSize) / 2 - clamped.offsetX) /
        renderedWidth;
    const y = ((renderedHeight - stageSize) / 2 - clamped.offsetY) /
        renderedHeight;
    const size = 1 / clamped.zoom;
    return normalizeAvatarCrop({ x, y, size }, naturalWidth, naturalHeight);
}

export function avatarCropToViewState(
    crop: AvatarCrop | null | undefined,
    stageSize: number,
    naturalWidth: number,
    naturalHeight: number,
): AvatarCropViewState {
    const normalized = normalizeAvatarCrop(crop, naturalWidth, naturalHeight);
    const zoom = clampAvatarZoom(1 / normalized.size);
    const { renderedWidth, renderedHeight } = computeAvatarImageMetrics(
        zoom,
        stageSize,
        naturalWidth,
        naturalHeight,
    );
    const offsetX = (renderedWidth - stageSize) / 2 -
        normalized.x * renderedWidth;
    const offsetY = (renderedHeight - stageSize) / 2 -
        normalized.y * renderedHeight;
    return clampAvatarPan(
        offsetX,
        offsetY,
        zoom,
        stageSize,
        naturalWidth,
        naturalHeight,
    );
}
