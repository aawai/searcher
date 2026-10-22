/**
 * Document Paper & Print Settings Dialog
 *
 * Provides physical paper size, orientation, and margin configuration
 * conforming to:
 * - A4 and US Letter physical specifications
 * - Portrait / Landscape orientation switching
 * - 5mm to 50mm margins per side with server-backed persistence
 * - Client-side validation and graceful API error/retry handling
 * - Controlled onSaved callback invoked strictly upon verified server persistence
 */

import { type FormEvent, useEffect, useState } from "react";
import type { DocumentSettingsDto } from "@shared/documents.ts";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../../components/ui/native-select.tsx";
import { api, json } from "../../lib/api.ts";
import { StatusBanner } from "../../components/searcher/semantic.tsx";
import { DEFAULT_PAPER_SETTINGS } from "./paper.ts";

export interface DocumentPaperSettingsDialogProps {
    documentId: string;
    settings: DocumentSettingsDto | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: (settings: DocumentSettingsDto) => void;
}

interface DocumentPaperSettingsFormProps {
    documentId: string;
    settings: DocumentSettingsDto | null;
    onClose: () => void;
    onSaved: (settings: DocumentSettingsDto) => void;
}

const MARGIN_PRESETS = {
    standard: 20,
    narrow: 12.7,
    wide: 25.4,
} as const;

function validatePaperMargins(margins: {
    marginTopMm: number;
    marginRightMm: number;
    marginBottomMm: number;
    marginLeftMm: number;
}): string | null {
    const vals = [
        margins.marginTopMm,
        margins.marginRightMm,
        margins.marginBottomMm,
        margins.marginLeftMm,
    ];
    for (const val of vals) {
        if (
            typeof val !== "number" ||
            !Number.isFinite(val) ||
            val < 5 ||
            val > 50
        ) {
            return "页边距必须在 5mm 至 50mm 之间";
        }
    }
    return null;
}

function DocumentPaperSettingsForm({
    documentId,
    settings,
    onClose,
    onSaved,
}: DocumentPaperSettingsFormProps) {
    const [paperSize, setPaperSize] = useState<"a4" | "letter">(
        settings?.paperSize ?? DEFAULT_PAPER_SETTINGS.paperSize,
    );
    const [orientation, setOrientation] = useState<"portrait" | "landscape">(
        settings?.orientation ?? DEFAULT_PAPER_SETTINGS.orientation,
    );
    const [marginTopMm, setMarginTopMm] = useState<number>(
        settings?.marginTopMm ?? DEFAULT_PAPER_SETTINGS.marginTopMm,
    );
    const [marginRightMm, setMarginRightMm] = useState<number>(
        settings?.marginRightMm ?? DEFAULT_PAPER_SETTINGS.marginRightMm,
    );
    const [marginBottomMm, setMarginBottomMm] = useState<number>(
        settings?.marginBottomMm ?? DEFAULT_PAPER_SETTINGS.marginBottomMm,
    );
    const [marginLeftMm, setMarginLeftMm] = useState<number>(
        settings?.marginLeftMm ?? DEFAULT_PAPER_SETTINGS.marginLeftMm,
    );

    const [submitting, setSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Sync form state when server settings prop updates
    useEffect(() => {
        setPaperSize(settings?.paperSize ?? DEFAULT_PAPER_SETTINGS.paperSize);
        setOrientation(
            settings?.orientation ?? DEFAULT_PAPER_SETTINGS.orientation,
        );
        setMarginTopMm(
            settings?.marginTopMm ?? DEFAULT_PAPER_SETTINGS.marginTopMm,
        );
        setMarginRightMm(
            settings?.marginRightMm ?? DEFAULT_PAPER_SETTINGS.marginRightMm,
        );
        setMarginBottomMm(
            settings?.marginBottomMm ?? DEFAULT_PAPER_SETTINGS.marginBottomMm,
        );
        setMarginLeftMm(
            settings?.marginLeftMm ?? DEFAULT_PAPER_SETTINGS.marginLeftMm,
        );
        setError(null);
    }, [settings]);

    const applyPreset = (presetMm: number) => {
        setMarginTopMm(presetMm);
        setMarginRightMm(presetMm);
        setMarginBottomMm(presetMm);
        setMarginLeftMm(presetMm);
        setError(null);
    };

    const handleSubmit = async (e?: FormEvent) => {
        e?.preventDefault();
        const validationError = validatePaperMargins({
            marginTopMm,
            marginRightMm,
            marginBottomMm,
            marginLeftMm,
        });

        if (validationError) {
            setError(validationError);
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const payload = {
                paperSize,
                orientation,
                marginTopMm: Number(marginTopMm),
                marginRightMm: Number(marginRightMm),
                marginBottomMm: Number(marginBottomMm),
                marginLeftMm: Number(marginLeftMm),
            };

            const saved = await api<DocumentSettingsDto>(
                `/api/documents/${encodeURIComponent(documentId)}/settings`,
                json("PUT", payload),
            );

            // Controlled server-saved invocation; no fake persisted success
            onSaved(saved);
            onClose();
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "保存设置失败，请重试",
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="document-paper-settings">
            {error && (
                <StatusBanner tone="error" density="compact">
                    {error}
                </StatusBanner>
            )}

            <form
                noValidate
                onSubmit={handleSubmit}
                className="document-paper-form"
            >
                {/* Paper Specification & Orientation */}
                <div className="document-paper-fields">
                    <div className="document-paper-field">
                        <label
                            htmlFor="paper-size-select"
                            className="document-paper-label"
                        >
                            纸张规格
                        </label>
                        <NativeSelect
                            id="paper-size-select"
                            value={paperSize}
                            disabled={submitting}
                            onChange={(e) =>
                                setPaperSize(
                                    e.target.value as "a4" | "letter",
                                )}
                        >
                            <NativeSelectOption value="a4">
                                A4 (210 × 297 mm)
                            </NativeSelectOption>
                            <NativeSelectOption value="letter">
                                US Letter (215.9 × 279.4 mm)
                            </NativeSelectOption>
                        </NativeSelect>
                    </div>

                    <div className="document-paper-field">
                        <label
                            htmlFor="paper-orientation-select"
                            className="document-paper-label"
                        >
                            版面方向
                        </label>
                        <NativeSelect
                            id="paper-orientation-select"
                            value={orientation}
                            disabled={submitting}
                            onChange={(e) =>
                                setOrientation(
                                    e.target.value as
                                        | "portrait"
                                        | "landscape",
                                )}
                        >
                            <NativeSelectOption value="portrait">
                                纵向
                            </NativeSelectOption>
                            <NativeSelectOption value="landscape">
                                横向
                            </NativeSelectOption>
                        </NativeSelect>
                    </div>
                </div>

                {/* Margin Presets & Numeric Controls */}
                <div className="document-paper-section">
                    <div className="document-paper-section-head">
                        <span className="document-paper-label">
                            页边距 (5–50 mm)
                        </span>
                        <div className="document-paper-presets">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={submitting}
                                onClick={() =>
                                    applyPreset(MARGIN_PRESETS.standard)}
                            >
                                标准 20mm
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={submitting}
                                onClick={() =>
                                    applyPreset(MARGIN_PRESETS.narrow)}
                            >
                                窄边距 12.7mm
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={submitting}
                                onClick={() => applyPreset(MARGIN_PRESETS.wide)}
                            >
                                宽边距 25.4mm
                            </Button>
                        </div>
                    </div>

                    <div className="document-paper-margins">
                        <div className="document-paper-field">
                            <label
                                htmlFor="margin-top-input"
                                className="document-paper-sublabel"
                            >
                                上边距 (mm)
                            </label>
                            <Input
                                id="margin-top-input"
                                type="number"
                                min={5}
                                max={50}
                                step="any"
                                disabled={submitting}
                                value={Number.isFinite(marginTopMm)
                                    ? marginTopMm
                                    : ""}
                                onChange={(e) => {
                                    const parsed = parseFloat(e.target.value);
                                    setMarginTopMm(
                                        Number.isFinite(parsed) ? parsed : 0,
                                    );
                                    setError(null);
                                }}
                            />
                        </div>

                        <div className="document-paper-field">
                            <label
                                htmlFor="margin-right-input"
                                className="document-paper-sublabel"
                            >
                                右边距 (mm)
                            </label>
                            <Input
                                id="margin-right-input"
                                type="number"
                                min={5}
                                max={50}
                                step="any"
                                disabled={submitting}
                                value={Number.isFinite(marginRightMm)
                                    ? marginRightMm
                                    : ""}
                                onChange={(e) => {
                                    const parsed = parseFloat(e.target.value);
                                    setMarginRightMm(
                                        Number.isFinite(parsed) ? parsed : 0,
                                    );
                                    setError(null);
                                }}
                            />
                        </div>

                        <div className="document-paper-field">
                            <label
                                htmlFor="margin-bottom-input"
                                className="document-paper-sublabel"
                            >
                                下边距 (mm)
                            </label>
                            <Input
                                id="margin-bottom-input"
                                type="number"
                                min={5}
                                max={50}
                                step="any"
                                disabled={submitting}
                                value={Number.isFinite(marginBottomMm)
                                    ? marginBottomMm
                                    : ""}
                                onChange={(e) => {
                                    const parsed = parseFloat(e.target.value);
                                    setMarginBottomMm(
                                        Number.isFinite(parsed) ? parsed : 0,
                                    );
                                    setError(null);
                                }}
                            />
                        </div>

                        <div className="document-paper-field">
                            <label
                                htmlFor="margin-left-input"
                                className="document-paper-sublabel"
                            >
                                左边距 (mm)
                            </label>
                            <Input
                                id="margin-left-input"
                                type="number"
                                min={5}
                                max={50}
                                step="any"
                                disabled={submitting}
                                value={Number.isFinite(marginLeftMm)
                                    ? marginLeftMm
                                    : ""}
                                onChange={(e) => {
                                    const parsed = parseFloat(e.target.value);
                                    setMarginLeftMm(
                                        Number.isFinite(parsed) ? parsed : 0,
                                    );
                                    setError(null);
                                }}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={submitting}
                        onClick={onClose}
                    >
                        取消
                    </Button>
                    <Button
                        type="submit"
                        variant="default"
                        disabled={submitting}
                    >
                        {submitting ? "保存中…" : "保存设置"}
                    </Button>
                </DialogFooter>
            </form>
        </div>
    );
}

export function DocumentPaperSettingsDialog({
    documentId,
    settings,
    open,
    onOpenChange,
    onSaved,
}: DocumentPaperSettingsDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="document-paper-dialog">
                <DialogHeader>
                    <DialogTitle>纸张与打印设置</DialogTitle>
                    <DialogDescription>
                        仅影响此笔记的分页与打印。
                    </DialogDescription>
                </DialogHeader>

                <DocumentPaperSettingsForm
                    documentId={documentId}
                    settings={settings}
                    onClose={() => onOpenChange(false)}
                    onSaved={onSaved}
                />
            </DialogContent>
        </Dialog>
    );
}
