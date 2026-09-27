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
                    <div
                        style={{
                            width: "85%",
                            height: "16px",
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "10px",
                            marginTop: "12px",
                            display: "flex",
                            alignItems: "center",
                            padding: "0 6px",
                        }}
                    >
                        <div
                            style={{
                                width: "4px",
                                height: "4px",
                                borderRadius: "50%",
                                background: "var(--muted)",
                            }}
                        />
                    </div>
                    {/* Monogram Icons */}
                    <div
                        style={{
                            display: "flex",
                            gap: "6px",
                            marginTop: "8px",
                        }}
                    >
                        <div
                            style={{
                                width: "10px",
                                height: "10px",
                                borderRadius: "50%",
                                background: "var(--surface-soft)",
                            }}
                        />
                        <div
                            style={{
                                width: "10px",
                                height: "10px",
                                borderRadius: "50%",
                                background: "var(--surface-soft)",
                            }}
                        />
                    </div>
                    {/* Floating corner edge pill */}
                    <div
                        style={{
                            position: "absolute",
                            bottom: "6px",
                            right: "6px",
                            width: "24px",
                            height: "8px",
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "4px",
                        }}
                    />
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
                    <div
                        style={{
                            width: "80%",
                            height: "12px",
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                        }}
                    />
                    {/* Bento Cards Side-by-side */}
                    <div
                        style={{
                            display: "flex",
                            gap: "5px",
                            width: "90%",
                            marginTop: "4px",
                        }}
                    >
                        <div
                            style={{
                                flex: 1,
                                height: "30px",
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                                borderRadius: "6px",
                                padding: "3px",
                            }}
                        >
                            <div
                                style={{
                                    width: "14px",
                                    height: "3px",
                                    background: "var(--accent)",
                                    borderRadius: "1px",
                                }}
                            />
                        </div>
                        <div
                            style={{
                                flex: 1,
                                height: "30px",
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                                borderRadius: "6px",
                                padding: "3px",
                            }}
                        >
                            <div
                                style={{
                                    width: "14px",
                                    height: "3px",
                                    background: "var(--muted)",
                                    borderRadius: "1px",
                                }}
                            />
                        </div>
                    </div>
                    {/* Mini Dock */}
                    <div
                        style={{
                            position: "absolute",
                            bottom: "4px",
                            width: "36px",
                            height: "7px",
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                        }}
                    />
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
                                <span style={{ color: "var(--accent)" }}>
                                    <Check size={16} strokeWidth={2.5} />
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
