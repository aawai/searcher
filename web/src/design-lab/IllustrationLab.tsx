import { useState } from "react";
import { Link } from "react-router-dom";
import {
    type AccentId,
    ACCENTS,
    type IllustrationStyle,
    resolveIllustrationStyle,
} from "@shared/contracts.ts";
import { useAppState } from "../app/state.tsx";
import {
    Illustration,
    ILLUSTRATION_CATALOG,
} from "../components/illustrations/Illustration.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import {
    EmptyState,
    Section,
    SettingsGroup,
    SettingsRow,
} from "../components/searcher/semantic.tsx";
import { Button } from "../components/ui/button.tsx";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.tsx";
import "./design-lab.css";

const STYLE_LABELS: Record<IllustrationStyle, string> = {
    auto: "自动",
    glass: "玻璃光学",
    botanical: "植物蓝图",
};

export default function IllustrationLab() {
    const { appearance, setAppearance } = useAppState();
    const [size, setSize] = useState<"sm" | "md" | "lg">("md");
    const [previewAccent, setPreviewAccent] = useState<AccentId | "inherit">(
        "inherit",
    );

    const effective = resolveIllustrationStyle(
        appearance.illustrationStyle,
        appearance.botanicalScene,
    );

    return (
        <PageShell archetype="workbench" className="design-lab-page">
            <PageHeader
                title="系统插画实验室"
                description="对比「玻璃光学（B）」与「植物蓝图（C）」双风格在当前主题、强调色与三档尺寸下的实际 SVG 渲染效果。"
                actions={<Link to="/design-lab">返回设计实验室</Link>}
            />

            <Section title="偏好与预览参数">
                <SettingsGroup>
                    <SettingsRow
                        title="当前系统插画偏好"
                        description={`当前解析生效风格：${
                            effective === "botanical" ? "植物蓝图" : "玻璃光学"
                        }${
                            appearance.illustrationStyle === "auto"
                                ? `（自动联动内置植物壁纸：${
                                    appearance.botanicalScene ?? "未启用"
                                }）`
                                : ""
                        }`}
                    >
                        <RadioGroup
                            variant="segmented"
                            value={appearance.illustrationStyle}
                            onValueChange={(value) => {
                                if (
                                    value === "auto" ||
                                    value === "glass" ||
                                    value === "botanical"
                                ) {
                                    void setAppearance({
                                        illustrationStyle: value,
                                    });
                                }
                            }}
                        >
                            {(["auto", "glass", "botanical"] as const).map((
                                item,
                            ) => (
                                <RadioGroupItem key={item} value={item}>
                                    {STYLE_LABELS[item]}
                                </RadioGroupItem>
                            ))}
                        </RadioGroup>
                    </SettingsRow>
                    <SettingsRow title="画布尺寸档位">
                        <RadioGroup
                            variant="segmented"
                            value={size}
                            onValueChange={(value) => {
                                if (
                                    value === "sm" || value === "md" ||
                                    value === "lg"
                                ) {
                                    setSize(value);
                                }
                            }}
                        >
                            <RadioGroupItem value="sm">
                                sm (140px)
                            </RadioGroupItem>
                            <RadioGroupItem value="md">
                                md (192px)
                            </RadioGroupItem>
                            <RadioGroupItem value="lg">
                                lg (232px)
                            </RadioGroupItem>
                        </RadioGroup>
                    </SettingsRow>
                    <SettingsRow title="强调色局部预览">
                        <div className="design-lab-row">
                            <Button
                                size="sm"
                                variant={previewAccent === "inherit"
                                    ? "default"
                                    : "outline"}
                                onClick={() => setPreviewAccent("inherit")}
                            >
                                跟随系统
                            </Button>
                            {ACCENTS.map((item) => (
                                <Button
                                    key={item.id}
                                    size="sm"
                                    variant={previewAccent === item.id
                                        ? "default"
                                        : "outline"}
                                    onClick={() => setPreviewAccent(item.id)}
                                >
                                    {item.label}
                                </Button>
                            ))}
                        </div>
                    </SettingsRow>
                </SettingsGroup>
            </Section>

            <Section title="6 组核心场景双风格对照">
                <div
                    data-accent={previewAccent === "inherit"
                        ? undefined
                        : previewAccent}
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fit, minmax(320px, 1fr))",
                        gap: "var(--space-4)",
                    }}
                >
                    {ILLUSTRATION_CATALOG.map((item) => (
                        <div
                            key={item.name}
                            style={{
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius-sheet)",
                                padding: "var(--space-4)",
                                display: "flex",
                                flexDirection: "column",
                                gap: "var(--space-3)",
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontWeight: "var(--font-title-weight)",
                                    }}
                                >
                                    {item.title}
                                </div>
                                <div
                                    style={{
                                        fontSize: "var(--font-metadata-size)",
                                        color: "var(--muted)",
                                    }}
                                >
                                    {item.description}
                                </div>
                            </div>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "var(--space-3)",
                                }}
                            >
                                <div
                                    style={{
                                        background: "var(--background)",
                                        borderRadius: "var(--radius-control)",
                                        padding: "var(--space-3)",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: "var(--space-2)",
                                    }}
                                >
                                    <Illustration
                                        name={item.name}
                                        size={size}
                                        styleOverride="glass"
                                    />
                                    <span
                                        style={{
                                            fontSize:
                                                "var(--font-metadata-size)",
                                            color: "var(--muted)",
                                        }}
                                    >
                                        玻璃光学 (B)
                                    </span>
                                </div>
                                <div
                                    style={{
                                        background: "var(--background)",
                                        borderRadius: "var(--radius-control)",
                                        padding: "var(--space-3)",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: "var(--space-2)",
                                    }}
                                >
                                    <Illustration
                                        name={item.name}
                                        size={size}
                                        styleOverride="botanical"
                                    />
                                    <span
                                        style={{
                                            fontSize:
                                                "var(--font-metadata-size)",
                                            color: "var(--muted)",
                                        }}
                                    >
                                        植物蓝图 (C)
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="EmptyState 密度规范对照">
                <SettingsGroup>
                    <EmptyState
                        illustration="empty-documents"
                        title="default 默认密度（192px 插画）"
                        description="用于独立页面或主工作区空白引导。"
                        action={<Button size="sm">新建笔记</Button>}
                    />
                    <EmptyState
                        density="compact"
                        illustration="empty-apps"
                        title="compact 紧凑密度（140px 插画）"
                        description="用于弹窗、侧边栏或局部容器空状态。"
                        action={<Button size="sm">添加应用</Button>}
                    />
                    <EmptyState
                        density="inline"
                        illustration="no-results"
                        title="inline 行内密度（自动隐藏插画，保持列表对齐）"
                    />
                </SettingsGroup>
            </Section>
        </PageShell>
    );
}
