import React from "react";
import { Check } from "lucide-react";
import type { StylePreset } from "@shared/contracts.ts";

interface LayoutModeSelectorProps {
    value: StylePreset;
    onChange: (mode: StylePreset) => void;
}

export function LayoutModeSelector(
    { value, onChange }: LayoutModeSelectorProps,
) {
    const modes: Array<{
        id: StylePreset;
        name: string;
        desc: string;
        renderPreview: () => React.ReactNode;
    }> = [
        {
            id: "zen",
            name: "极简呼吸",
            desc:
                "Arc / Notion 质感 · 去除标题 · 极致纯净 · 边缘轻抽屉 · 随心便签",
            renderPreview: () => (
                <div className="layout-mode-preview">
                    {/* Pure Breathing Space with minimal Search */}
                    <div className="layout-preview-zen-search">
                        <div className="layout-preview-zen-dot" />
                    </div>
                    {/* Monogram Icons */}
                    <div className="layout-preview-zen-icons">
                        <div className="layout-preview-zen-icon" />
                        <div className="layout-preview-zen-icon" />
                    </div>
                    {/* Floating corner edge pill */}
                    <div className="layout-preview-zen-pill" />
                </div>
            ),
        },
        {
            id: "widgets",
            name: "空间轻桌面",
            desc:
                "macOS / iPadOS 质感 · Bento 毛玻璃卡片 · 便签看板 · 流光 Dock",
            renderPreview: () => (
                <div className="layout-mode-preview">
                    {/* Search Bar */}
                    <div className="layout-preview-widgets-search" />
                    {/* Bento Cards Side-by-side */}
                    <div className="layout-preview-widgets-bento">
                        <div className="layout-preview-widgets-card">
                            <div className="layout-preview-widgets-line layout-preview-widgets-line--accent" />
                        </div>
                        <div className="layout-preview-widgets-card">
                            <div className="layout-preview-widgets-line layout-preview-widgets-line--muted" />
                        </div>
                    </div>
                    {/* Mini Dock */}
                    <div className="layout-preview-widgets-dock" />
                </div>
            ),
        },
    ];

    return (
        <div
            className="layout-mode-grid"
            role="radiogroup"
            aria-label="选择主页工作区风格"
        >
            {modes.map((mode) => {
                const isSelected = value === mode.id;
                return (
                    <button
                        key={mode.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        data-active={isSelected}
                        className="layout-mode-card"
                        onClick={() => onChange(mode.id)}
                    >
                        {mode.renderPreview()}
                        <div className="layout-mode-name">
                            <span>{mode.name}</span>
                            {isSelected && (
                                <span className="layout-mode-check">
                                    <Check size="1em" className="icon-md" />
                                </span>
                            )}
                        </div>
                        <div className="layout-mode-desc">{mode.desc}</div>
                    </button>
                );
            })}
        </div>
    );
}
