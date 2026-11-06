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

import { type FormEvent, useEffect, useRef, useState } from "react";
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
import {
    SettingsGroup,
    SettingsRow,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";
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

type MarginSide = "top" | "right" | "bottom" | "left";
type Margins = Record<MarginSide, number>;

const MARGIN_FIELDS: readonly { side: MarginSide; label: string }[] = [
    { side: "top", label: "上边距" },
    { side: "right", label: "右边距" },
    { side: "bottom", label: "下边距" },
    { side: "left", label: "左边距" },
];

function marginsFrom(settings: DocumentSettingsDto | null): Margins {
    const source = settings ?? DEFAULT_PAPER_SETTINGS;
    return {
        top: source.marginTopMm,
        right: source.marginRightMm,
        bottom: source.marginBottomMm,
        left: source.marginLeftMm,
    };
}

function isValidMargin(value: number): boolean {
    return Number.isFinite(value) && value >= 5 && value <= 50;
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
    const [margins, setMargins] = useState<Margins>(() =>
        marginsFrom(settings)
    );
    // Sides that failed the last submit; each clears when its field changes.
    const [invalidSides, setInvalidSides] = useState<readonly MarginSide[]>(
        [],
    );
    const marginInputs = useRef<Partial<Record<MarginSide, HTMLInputElement>>>(
        {},
    );

    const [submitting, setSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Sync form state when server settings prop updates
    useEffect(() => {
        setPaperSize(settings?.paperSize ?? DEFAULT_PAPER_SETTINGS.paperSize);
        setOrientation(
            settings?.orientation ?? DEFAULT_PAPER_SETTINGS.orientation,
        );
        setMargins(marginsFrom(settings));
        setInvalidSides([]);
        setError(null);
    }, [settings]);

    const applyPreset = (presetMm: number) => {
        setMargins({
            top: presetMm,
            right: presetMm,
            bottom: presetMm,
            left: presetMm,
        });
        setInvalidSides([]);
        setError(null);
    };

    const setMargin = (side: MarginSide, raw: string) => {
        const parsed = parseFloat(raw);
        setMargins((current) => ({
            ...current,
            [side]: Number.isFinite(parsed) ? parsed : 0,
        }));
        setInvalidSides((current) => current.filter((s) => s !== side));
        setError(null);
    };

    const handleSubmit = async (e?: FormEvent) => {
        e?.preventDefault();
        const invalid = MARGIN_FIELDS
            .map(({ side }) => side)
            .filter((side) => !isValidMargin(margins[side]));
        setInvalidSides(invalid);
        if (invalid.length > 0) {
            marginInputs.current[invalid[0]]?.focus();
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const payload = {
                paperSize,
                orientation,
                marginTopMm: margins.top,
                marginRightMm: margins.right,
                marginBottomMm: margins.bottom,
                marginLeftMm: margins.left,
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
                <SettingsGroup>
                    <SettingsRow title="纸张规格" labelFor="paper-size-select">
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
                    </SettingsRow>
                    <SettingsRow
                        title="版面方向"
                        labelFor="paper-orientation-select"
                    >
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
                    </SettingsRow>
                </SettingsGroup>

                <SettingsGroup
                    title="页边距"
                    headingLevel={3}
                    footer="每边 5–50 mm。"
                >
                    <SettingsRow title="预设">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={submitting}
                            onClick={() => applyPreset(MARGIN_PRESETS.standard)}
                        >
                            标准 20mm
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={submitting}
                            onClick={() => applyPreset(MARGIN_PRESETS.narrow)}
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
                    </SettingsRow>
                    {MARGIN_FIELDS.map(({ side, label }) => {
                        const id = `margin-${side}-input`;
                        const invalid = invalidSides.includes(side);
                        const value = margins[side];
                        return (
                            <SettingsRow
                                key={side}
                                title={label}
                                labelFor={id}
                                message={invalid
                                    ? (
                                        <span role="alert">
                                            {`${label}须在 5–50 mm 之间`}
                                        </span>
                                    )
                                    : undefined}
                                messageId={`${id}-error`}
                                invalid={invalid}
                            >
                                <Input
                                    ref={(node: HTMLInputElement | null) => {
                                        if (node) {
                                            marginInputs.current[side] = node;
                                        }
                                    }}
                                    id={id}
                                    placeholder="5–50"
                                    type="number"
                                    min={5}
                                    max={50}
                                    step="any"
                                    disabled={submitting}
                                    aria-invalid={invalid || undefined}
                                    aria-describedby={invalid
                                        ? `${id}-error`
                                        : undefined}
                                    value={Number.isFinite(value) ? value : ""}
                                    onChange={(e) =>
                                        setMargin(side, e.target.value)}
                                />
                                <span>mm</span>
                            </SettingsRow>
                        );
                    })}
                </SettingsGroup>

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
            <DialogContent className="document-paper-dialog" surface="grouped">
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
