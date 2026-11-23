import {
    type KeyboardEvent,
    type PointerEvent,
    useEffect,
    useRef,
    useState,
    type WheelEvent,
} from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { AvatarCrop } from "@shared/avatar.ts";
import { Button } from "../ui/button.tsx";
import {
    Dialog,
    DialogBackdrop,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPopup,
    DialogPortal,
    DialogTitle,
} from "../ui/dialog.tsx";
import { Slider } from "../ui/slider.tsx";
import { StatusBanner } from "./semantic.tsx";
import {
    AVATAR_CROP_MAX_ZOOM,
    AVATAR_CROP_MIN_ZOOM,
    avatarCropToViewState,
    type AvatarCropViewState,
    clampAvatarPan,
    clampAvatarZoom,
    computeAvatarImageMetrics,
    viewStateToAvatarCrop,
} from "./avatar-crop.ts";
import "./avatar-crop.css";

const DEFAULT_STAGE_SIZE = 280;
const PREVIEW_SIZE = 56;

export interface AvatarCropDialogProps {
    open: boolean;
    mode: "upload" | "recrop";
    imageUrl: string | null;
    initialCrop?: AvatarCrop | null;
    saving: boolean;
    error?: string;
    onOpenChange: (open: boolean) => void;
    onConfirm: (crop: AvatarCrop) => void | Promise<void>;
}

export function AvatarCropDialog({
    open,
    mode,
    imageUrl,
    initialCrop,
    saving,
    error,
    onOpenChange,
    onConfirm,
}: AvatarCropDialogProps) {
    const stageRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<
        {
            pointerId: number;
            startX: number;
            startY: number;
            startOffsetX: number;
            startOffsetY: number;
        } | null
    >(null);

    const [stageSize, setStageSize] = useState(DEFAULT_STAGE_SIZE);
    const [naturalSize, setNaturalSize] = useState<
        { width: number; height: number } | null
    >(null);
    const [viewState, setViewState] = useState<AvatarCropViewState>({
        zoom: AVATAR_CROP_MIN_ZOOM,
        offsetX: 0,
        offsetY: 0,
    });
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        if (!open) {
            setNaturalSize(null);
            setViewState({
                zoom: AVATAR_CROP_MIN_ZOOM,
                offsetX: 0,
                offsetY: 0,
            });
            setDragging(false);
            dragRef.current = null;
        }
    }, [open, imageUrl]);

    useEffect(() => {
        const node = stageRef.current;
        if (!open || !node) return;
        const update = () => {
            const rect = node.getBoundingClientRect();
            if (rect.width > 0) {
                setStageSize(rect.width);
            }
        };
        update();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => observer.disconnect();
    }, [open]);

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (width < 1 || height < 1) return;
        setNaturalSize({ width, height });
        if (initialCrop) {
            setViewState(
                avatarCropToViewState(initialCrop, stageSize, width, height),
            );
        } else {
            setViewState({
                zoom: AVATAR_CROP_MIN_ZOOM,
                offsetX: 0,
                offsetY: 0,
            });
        }
    };

    const applyZoom = (nextZoom: number) => {
        const clampedZoom = clampAvatarZoom(nextZoom);
        if (!naturalSize) {
            setViewState((prev) => ({ ...prev, zoom: clampedZoom }));
            return;
        }
        setViewState((prev) => {
            const ratio = clampedZoom / prev.zoom;
            return clampAvatarPan(
                prev.offsetX * ratio,
                prev.offsetY * ratio,
                clampedZoom,
                stageSize,
                naturalSize.width,
                naturalSize.height,
            );
        });
    };

    const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
        if (!naturalSize || saving || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startOffsetX: viewState.offsetX,
            startOffsetY: viewState.offsetY,
        };
        setDragging(true);
    };

    const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId || !naturalSize) return;
        const nextX = drag.startOffsetX + (e.clientX - drag.startX);
        const nextY = drag.startOffsetY + (e.clientY - drag.startY);
        setViewState(
            clampAvatarPan(
                nextX,
                nextY,
                viewState.zoom,
                stageSize,
                naturalSize.width,
                naturalSize.height,
            ),
        );
    };

    const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerId === e.pointerId) {
            dragRef.current = null;
            setDragging(false);
        }
    };

    const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
        if (!naturalSize || saving) return;
        e.preventDefault();
        applyZoom(viewState.zoom - e.deltaY * 0.002);
    };

    const handleStageKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (!naturalSize || saving) return;
        const step = e.shiftKey ? 24 : 8;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        else if (e.key === "ArrowRight") dx = step;
        else if (e.key === "ArrowUp") dy = -step;
        else if (e.key === "ArrowDown") dy = step;
        else if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            applyZoom(viewState.zoom + 0.2);
            return;
        } else if (e.key === "-" || e.key === "_") {
            e.preventDefault();
            applyZoom(viewState.zoom - 0.2);
            return;
        } else {
            return;
        }
        e.preventDefault();
        setViewState((prev) =>
            clampAvatarPan(
                prev.offsetX + dx,
                prev.offsetY + dy,
                prev.zoom,
                stageSize,
                naturalSize.width,
                naturalSize.height,
            )
        );
    };

    const handleReset = () => {
        setViewState({ zoom: AVATAR_CROP_MIN_ZOOM, offsetX: 0, offsetY: 0 });
    };

    const handleSubmit = () => {
        if (!naturalSize || saving) return;
        const crop = viewStateToAvatarCrop(
            viewState,
            stageSize,
            naturalSize.width,
            naturalSize.height,
        );
        void onConfirm(crop);
    };

    const metrics = naturalSize
        ? computeAvatarImageMetrics(
            viewState.zoom,
            stageSize,
            naturalSize.width,
            naturalSize.height,
        )
        : null;

    const previewScale = PREVIEW_SIZE / stageSize;

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next && saving) return;
                onOpenChange(next);
            }}
        >
            <DialogPortal>
                <DialogBackdrop />
                <DialogPopup className="avatar-crop-dialog">
                    <DialogHeader>
                        <DialogTitle>
                            {mode === "recrop" ? "调整头像裁剪" : "裁剪头像"}
                        </DialogTitle>
                        <DialogDescription>
                            拖动图片或缩放，选择要展示在头像中的区域；原始图片会保留以供后续重新调整。
                        </DialogDescription>
                    </DialogHeader>

                    <div className="avatar-crop-workspace">
                        <div
                            ref={stageRef}
                            className="avatar-crop-stage"
                            data-dragging={dragging ? "true" : undefined}
                            tabIndex={0}
                            role="application"
                            aria-label="头像裁剪区域，支持拖动、滚轮缩放或方向键微调位置"
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            onWheel={handleWheel}
                            onKeyDown={handleStageKeyDown}
                        >
                            {imageUrl && (
                                <img
                                    src={imageUrl}
                                    alt="待裁剪头像"
                                    className="avatar-crop-image"
                                    draggable={false}
                                    onLoad={handleImageLoad}
                                    style={metrics
                                        ? {
                                            width: `${metrics.renderedWidth}px`,
                                            height:
                                                `${metrics.renderedHeight}px`,
                                            transform:
                                                `translate(calc(-50% + ${viewState.offsetX}px), calc(-50% + ${viewState.offsetY}px))`,
                                        }
                                        : { opacity: 0 }}
                                />
                            )}
                            <div
                                className="avatar-crop-mask"
                                aria-hidden="true"
                            />
                        </div>

                        <div className="avatar-crop-controls">
                            <div className="avatar-crop-preview-row">
                                <div
                                    className="avatar-crop-preview"
                                    aria-hidden="true"
                                >
                                    {imageUrl && metrics && (
                                        <img
                                            src={imageUrl}
                                            alt=""
                                            className="avatar-crop-image"
                                            draggable={false}
                                            style={{
                                                width: `${
                                                    metrics.renderedWidth *
                                                    previewScale
                                                }px`,
                                                height: `${
                                                    metrics.renderedHeight *
                                                    previewScale
                                                }px`,
                                                transform:
                                                    `translate(calc(-50% + ${
                                                        viewState.offsetX *
                                                        previewScale
                                                    }px), calc(-50% + ${
                                                        viewState.offsetY *
                                                        previewScale
                                                    }px))`,
                                            }}
                                        />
                                    )}
                                </div>
                                <div className="avatar-crop-preview-text">
                                    <span>头像预览</span>
                                    <span>生成 256×256 清晰头像</span>
                                </div>
                            </div>

                            <div className="avatar-crop-zoom-row">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="缩小"
                                    disabled={!naturalSize || saving ||
                                        viewState.zoom <= AVATAR_CROP_MIN_ZOOM}
                                    onClick={() =>
                                        applyZoom(viewState.zoom - 0.25)}
                                >
                                    <ZoomOut
                                        size="1em"
                                        className="icon-sm"
                                        aria-hidden="true"
                                    />
                                </Button>
                                <Slider
                                    aria-label="缩放比例"
                                    min={AVATAR_CROP_MIN_ZOOM}
                                    max={AVATAR_CROP_MAX_ZOOM}
                                    step={0.01}
                                    value={viewState.zoom}
                                    disabled={!naturalSize || saving}
                                    onValueChange={(value) => {
                                        const next = Array.isArray(value)
                                            ? value[0]
                                            : value;
                                        if (typeof next === "number") {
                                            applyZoom(next);
                                        }
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="放大"
                                    disabled={!naturalSize || saving ||
                                        viewState.zoom >= AVATAR_CROP_MAX_ZOOM}
                                    onClick={() =>
                                        applyZoom(viewState.zoom + 0.25)}
                                >
                                    <ZoomIn
                                        size="1em"
                                        className="icon-sm"
                                        aria-hidden="true"
                                    />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={!naturalSize || saving}
                                    onClick={handleReset}
                                >
                                    <RotateCcw
                                        size="1em"
                                        className="icon-sm"
                                        aria-hidden="true"
                                    />
                                    <span>重置</span>
                                </Button>
                            </div>
                        </div>
                    </div>

                    {error && <StatusBanner tone="error">{error}</StatusBanner>}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={saving}
                            onClick={() => onOpenChange(false)}
                        >
                            取消
                        </Button>
                        <Button
                            type="button"
                            variant="default"
                            disabled={!naturalSize || saving}
                            onClick={handleSubmit}
                        >
                            {saving
                                ? "保存中…"
                                : mode === "recrop"
                                ? "保存裁剪"
                                : "设为头像"}
                        </Button>
                    </DialogFooter>
                </DialogPopup>
            </DialogPortal>
        </Dialog>
    );
}
