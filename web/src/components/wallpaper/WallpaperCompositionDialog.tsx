import {
    type KeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog.tsx";
import { Button } from "../ui/button.tsx";
import { WallpaperSurface } from "./WallpaperSurface.tsx";
import {
    DEFAULT_WALLPAPER_PRESENTATION,
    type WallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";
import {
    DEFAULT_WALLPAPER_COMPOSITION,
    type WallpaperComposition,
} from "@shared/wallpaper.ts";
import { Monitor, RotateCcw, Smartphone } from "lucide-react";

export interface WallpaperCompositionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    source: string | null;
    initialComposition?: WallpaperComposition | null;
    presentation?: WallpaperPresentation | null;
    isCurrent?: boolean;
    onSaveComposition: (
        composition: WallpaperComposition,
    ) => Promise<void> | void;
    onSetAsCurrent?: (
        composition: WallpaperComposition,
    ) => Promise<void> | void;
}

export function WallpaperCompositionDialog({
    open,
    onOpenChange,
    source,
    initialComposition,
    presentation,
    isCurrent = false,
    onSaveComposition,
    onSetAsCurrent,
}: WallpaperCompositionDialogProps) {
    const [focal, setFocal] = useState<WallpaperComposition>(
        initialComposition ?? DEFAULT_WALLPAPER_COMPOSITION,
    );
    const [saving, setSaving] = useState(false);
    const [imageAspect, setImageAspect] = useState<number | null>(null);
    const effectivePresentation = useMemo<WallpaperPresentation>(() => {
        const base = presentation ?? DEFAULT_WALLPAPER_PRESENTATION;
        return {
            ...base,
            composition: focal,
        };
    }, [presentation, focal]);

    const isDraggingRef = useRef(false);

    useEffect(() => {
        if (!source) {
            setImageAspect(null);
            return;
        }
        if (
            source.startsWith("/api/wallpaper/") ||
            /^https?:\/\//.test(source) ||
            source.startsWith("data:")
        ) {
            const img = new Image();
            img.onload = () => {
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    setImageAspect(img.naturalWidth / img.naturalHeight);
                }
            };
            img.src = source;
        } else {
            setImageAspect(16 / 9);
        }
    }, [source]);

    useEffect(() => {
        if (open) {
            setFocal(initialComposition ?? DEFAULT_WALLPAPER_COMPOSITION);
            setSaving(false);
        }
    }, [open, initialComposition]);

    const updateFocalFromPointer = useCallback(
        (
            e: ReactPointerEvent<HTMLDivElement> | PointerEvent,
            container: HTMLDivElement,
        ) => {
            const rect = container.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            const containerAspect = rect.width / rect.height;
            const imgAspect = imageAspect ?? (16 / 9);

            let normX = clickX / rect.width;
            let normY = clickY / rect.height;

            if (containerAspect < imgAspect) {
                // Container is narrower/taller than the image (e.g. mobile 9:19.5 with widescreen image)
                // In cover mode: rendered image height = rect.height, rendered width = rect.height * imgAspect
                const renderedW = rect.height * imgAspect;
                const overflowW = renderedW - rect.width;
                const imgX = clickX + focal.focalX * overflowW;
                normX = imgX / renderedW;
                normY = clickY / rect.height;
            } else if (containerAspect > imgAspect) {
                // Container is wider than the image
                const renderedH = rect.width / imgAspect;
                const overflowH = renderedH - rect.height;
                const imgY = clickY + focal.focalY * overflowH;
                normX = clickX / rect.width;
                normY = imgY / renderedH;
            }

            // Allow full 0..1 normalized range per spec
            const clampedX =
                Math.round(Math.max(0, Math.min(1, normX)) * 1000) / 1000;
            const clampedY =
                Math.round(Math.max(0, Math.min(1, normY)) * 1000) / 1000;
            setFocal({ focalX: clampedX, focalY: clampedY });
        },
        [focal.focalX, focal.focalY, imageAspect],
    );

    const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
        container.setPointerCapture(e.pointerId);
        isDraggingRef.current = true;
        updateFocalFromPointer(e, container);
    };

    const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDraggingRef.current) return;
        updateFocalFromPointer(e, e.currentTarget);
    };

    const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // pointer capture may already be lost
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const step = e.shiftKey ? 0.05 : 0.02;
        let deltaX = 0;
        let deltaY = 0;

        if (e.key === "ArrowLeft") deltaX = -step;
        else if (e.key === "ArrowRight") deltaX = step;
        else if (e.key === "ArrowUp") deltaY = -step;
        else if (e.key === "ArrowDown") deltaY = step;
        else if (e.key === "Home") {
            e.preventDefault();
            e.stopPropagation();
            setFocal(DEFAULT_WALLPAPER_COMPOSITION);
            return;
        } else {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        setFocal((prev: WallpaperComposition) => ({
            focalX: Math.round(
                Math.max(0, Math.min(1, prev.focalX + deltaX)) * 1000,
            ) / 1000,
            focalY: Math.round(
                Math.max(0, Math.min(1, prev.focalY + deltaY)) * 1000,
            ) / 1000,
        }));
    };

    const handleReset = () => {
        setFocal(DEFAULT_WALLPAPER_COMPOSITION);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSaveComposition(focal);
            onOpenChange(false);
        } catch {
            // Keep dialog open on failure so user does not lose adjustments
        } finally {
            setSaving(false);
        }
    };

    const handleSetCurrent = async () => {
        if (!onSetAsCurrent) return;
        setSaving(true);
        try {
            await onSetAsCurrent(focal);
            onOpenChange(false);
        } catch {
            // Keep dialog open on failure
        } finally {
            setSaving(false);
        }
    };

    const focalXPercent = `${(focal.focalX * 100).toFixed(1)}%`;
    const focalYPercent = `${(focal.focalY * 100).toFixed(1)}%`;

    const positionMarker = useCallback((element: HTMLDivElement | null) => {
        if (!element) return;
        element.style.left = focalXPercent;
        element.style.top = focalYPercent;
    }, [focalXPercent, focalYPercent]);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="wallpaper-composition-dialog"
                data-testid="wallpaper-preview-dialog"
            >
                <DialogHeader>
                    <DialogTitle>调整壁纸构图与预览</DialogTitle>
                    <DialogDescription>
                        在预览区域点击或拖动焦点，或使用键盘方向键微调，保证宽屏壁纸在移动设备下主体不被裁切。
                    </DialogDescription>
                </DialogHeader>

                <div className="wallpaper-composition-toolbar">
                    <div className="wallpaper-composition-readout">
                        <span>焦点位置：</span>
                        <code>X: {focalXPercent} · Y: {focalYPercent}</code>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleReset}
                        data-testid="wallpaper-focal-reset-btn"
                        className="gap-1.5"
                    >
                        <RotateCcw size={14} />
                        <span>居中重置</span>
                    </Button>
                </div>

                <div className="wallpaper-composition-previews">
                    {/* Desktop 16:9 preview */}
                    <div className="wallpaper-composition-preview-card wallpaper-composition-preview-card--desktop">
                        <div className="wallpaper-composition-preview-card__header">
                            <Monitor size={15} />
                            <span>桌面视图 (16:9)</span>
                        </div>
                        <div
                            className="wallpaper-preview-container wallpaper-preview-container--desktop"
                            data-testid="wallpaper-preview-desktop"
                            tabIndex={0}
                            role="slider"
                            aria-label="桌面 16:9 壁纸预览与构图焦点调整"
                            aria-valuenow={Math.round(focal.focalX * 100)}
                            aria-valuetext={`X: ${focalXPercent}, Y: ${focalYPercent}`}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onKeyDown={handleKeyDown}
                        >
                            <WallpaperSurface
                                source={source}
                                presentation={effectivePresentation}
                                motionOverride="off"
                                embedded
                            />
                            {/* Focal marker */}
                            {/* Focal marker */}
                            <div
                                ref={positionMarker}
                                className="wallpaper-focal-marker"
                                data-testid="wallpaper-focal-marker"
                            >
                                <div className="wallpaper-focal-marker__ring" />
                                <div className="wallpaper-focal-marker__dot" />
                            </div>
                        </div>
                    </div>

                    {/* Mobile 9:19.5 preview */}
                    <div className="wallpaper-composition-preview-card wallpaper-composition-preview-card--mobile">
                        <div className="wallpaper-composition-preview-card__header">
                            <Smartphone size={15} />
                            <span>移动端竖屏 (9:19.5)</span>
                        </div>
                        <div
                            className="wallpaper-preview-container wallpaper-preview-container--mobile"
                            data-testid="wallpaper-preview-mobile"
                            tabIndex={0}
                            role="slider"
                            aria-label="移动端 9:19.5 壁纸预览与构图焦点调整"
                            aria-valuenow={Math.round(focal.focalX * 100)}
                            aria-valuetext={`X: ${focalXPercent}, Y: ${focalYPercent}`}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onKeyDown={handleKeyDown}
                        >
                            <WallpaperSurface
                                source={source}
                                presentation={effectivePresentation}
                                motionOverride="off"
                                embedded
                            />
                            {/* Focal marker */}
                            <div
                                ref={positionMarker}
                                className="wallpaper-focal-marker"
                            >
                                <div className="wallpaper-focal-marker__ring" />
                                <div className="wallpaper-focal-marker__dot" />
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                    >
                        取消
                    </Button>
                    {!isCurrent && onSetAsCurrent && (
                        <Button
                            type="button"
                            variant="default"
                            onClick={handleSetCurrent}
                            disabled={saving}
                            data-testid="wallpaper-preview-apply-btn"
                        >
                            设为当前壁纸
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant={isCurrent ? "default" : "outline"}
                        onClick={handleSave}
                        disabled={saving}
                        data-testid="wallpaper-preview-save-btn"
                    >
                        {isCurrent ? "保存构图" : "仅保存构图"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
