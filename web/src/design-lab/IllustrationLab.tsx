import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { type AccentId, ACCENTS } from "@shared/contracts.ts";
import type { BotanicalSpecies } from "@shared/wallpaper.ts";
import {
    Illustration,
    ILLUSTRATION_CATALOG,
} from "../components/illustrations/Illustration.tsx";
import {
    type BotanicalPointerState,
    type BotanicalScene,
    buildBotanicalPalette,
    createBotanicalRuntimeState,
    generateBotanicalScene,
    isBotanicalSceneActive,
    renderBotanicalFrame,
    resolveBotanicalSpecies,
    resolveDiurnalWindScale,
    resolveSolarTerm,
    SOLAR_TERMS_BY_MMDD,
    triggerBotanicalGust,
    triggerBotanicalResonance,
} from "../components/wallpaper/botanical-engine.ts";
import type { BotanicalResonanceKind } from "../components/wallpaper/botanical-resonance.ts";
import { BOTANICAL_SCENE_CHOICES } from "../components/wallpaper/wallpaper-choices.ts";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import {
    EmptyState,
    Section,
    SettingsGroup,
    SettingsRow,
} from "../components/searcher/semantic.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../components/ui/native-select.tsx";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.tsx";
import { Switch } from "../components/ui/switch.tsx";
import "./design-lab.css";

const STAGE_WIDTH = 1440;
const STAGE_HEIGHT = 900;
const GROWTH_DURATION_SEC = 2.55;

function mmddToDateKey(mmdd: number): string {
    const mm = String(Math.floor(mmdd / 100)).padStart(2, "0");
    const dd = String(mmdd % 100).padStart(2, "0");
    return `2026-${mm}-${dd}`;
}

const PHENOLOGY_LABELS = {
    budding: "萌发抽芽",
    lush: "繁茂盛放",
    turning: "秋意初染",
    frost: "霜雪凝枝",
} as const;

function BotanicalCanvasWorkbench({
    previewAccent,
}: {
    previewAccent: AccentId | "inherit";
}) {
    const [species, setSpecies] = useState<BotanicalSpecies>("plum");
    const [termIndex, setTermIndex] = useState(21); // 小雪
    const [localHour, setLocalHour] = useState(12);
    const [surfaceMode, setSurfaceMode] = useState<
        "light" | "dark" | "overPhotoDark"
    >("light");
    const [sceneSide, setSceneSide] = useState<"right" | "left">("right");
    const [showGuides, setShowGuides] = useState(true);
    const [motionLabel, setMotionLabel] = useState<
        "生长绘制中" | "阵风拂动中" | "静息零功耗休眠"
    >("生长绘制中");

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const runtimeRef = useRef(createBotanicalRuntimeState());
    const driftersRef = useRef<
        Parameters<typeof renderBotanicalFrame>[0]["drifters"]
    >([]);
    const sceneRef = useRef<BotanicalScene | null>(null);
    const growthStartRef = useRef(performance.now() / 1000);
    const scheduleRef = useRef<(() => void) | null>(null);

    const dateKey = useMemo(
        () => mmddToDateKey(SOLAR_TERMS_BY_MMDD[termIndex]?.mmdd ?? 1122),
        [termIndex],
    );
    const solarInfo = useMemo(() => resolveSolarTerm(dateKey), [dateKey]);
    const concreteSpecies = useMemo(
        () => resolveBotanicalSpecies(species, dateKey),
        [species, dateKey],
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
        canvas.width = STAGE_WIDTH * dpr;
        canvas.height = STAGE_HEIGHT * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const isDark = surfaceMode !== "light";
        const overPhoto = surfaceMode === "overPhotoDark";
        const root = document.documentElement;
        const stageHost = canvas.parentElement;
        const accentCss =
            (stageHost ? getComputedStyle(stageHost).color : "") ||
            getComputedStyle(root).getPropertyValue("--accent");
        const fgCss = isDark ? "#F5F5F7" : "#1D1D1F";
        const palette = buildBotanicalPalette(
            isDark,
            accentCss,
            fgCss,
            overPhoto,
            localHour,
            concreteSpecies,
        );

        const scene = generateBotanicalScene(
            concreteSpecies,
            STAGE_WIDTH,
            STAGE_HEIGHT,
            dateKey,
            false,
        );
        sceneRef.current = scene;
        runtimeRef.current = createBotanicalRuntimeState();
        driftersRef.current = [];
        const prefersReduced = globalThis.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        growthStartRef.current = prefersReduced
            ? performance.now() / 1000 - GROWTH_DURATION_SEC - 1
            : performance.now() / 1000;

        const pointer: BotanicalPointerState = {
            x: -9999,
            y: -9999,
            vx: 0,
            vy: 0,
            lastT: 0,
            lastRustleSpawn: 0,
        };
        const windCalm = resolveDiurnalWindScale(localHour);
        let frameSeq = 0;
        let prevSec = 0;
        let lastDriftSpawn = growthStartRef.current + GROWTH_DURATION_SEC + 1;
        let rafId: number | null = null;
        let wakeTimer: ReturnType<typeof setTimeout> | null = null;

        const cancel = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            if (wakeTimer !== null) {
                globalThis.clearTimeout(wakeTimer);
                wakeTimer = null;
            }
        };

        const tick = (nowMs: number) => {
            rafId = null;
            const timeSec = nowMs / 1000;
            const dt = prevSec > 0 ? Math.min(timeSec - prevSec, 0.05) : 0.016;
            prevSec = timeSec;
            frameSeq++;
            const rawProgress = Math.max(
                0,
                Math.min(
                    1,
                    (timeSec - growthStartRef.current) / GROWTH_DURATION_SEC,
                ),
            );

            lastDriftSpawn = renderBotanicalFrame({
                ctx,
                scene,
                width: STAGE_WIDTH,
                height: STAGE_HEIGHT,
                timeSec,
                dt,
                rawProgress,
                reducedMotion: false,
                windCalm,
                searchFocused: false,
                embedded: false,
                palette,
                pointer,
                drifters: driftersRef.current,
                lastDriftSpawn,
                frameSeq,
                runtime: runtimeRef.current,
                sceneSide,
                dateKey,
                localHour,
            });

            const active = isBotanicalSceneActive({
                runtime: runtimeRef.current,
                rawProgress,
                timeSec,
                scene,
                drifters: driftersRef.current,
                reducedMotion: false,
                embedded: false,
            });

            if (rawProgress < 1) {
                setMotionLabel("生长绘制中");
            } else if (active) {
                setMotionLabel("阵风拂动中");
            } else {
                setMotionLabel("静息零功耗休眠");
            }

            if (active) {
                rafId = requestAnimationFrame(tick);
            } else {
                prevSec = 0;
                wakeTimer = globalThis.setTimeout(() => {
                    wakeTimer = null;
                    schedule();
                }, 12_000);
            }
        };

        const schedule = () => {
            cancel();
            prevSec = 0;
            rafId = requestAnimationFrame(tick);
        };
        scheduleRef.current = schedule;
        schedule();

        return () => {
            cancel();
            scheduleRef.current = null;
        };
    }, [
        concreteSpecies,
        dateKey,
        localHour,
        surfaceMode,
        sceneSide,
        previewAccent,
    ]);

    const triggerResonance = (kind: BotanicalResonanceKind) => {
        triggerBotanicalResonance(
            runtimeRef.current,
            kind,
            performance.now() / 1000,
            sceneRef.current,
            driftersRef.current,
            resolveDiurnalWindScale(localHour),
            1,
        );
        scheduleRef.current?.();
    };

    return (
        <div
            data-accent={previewAccent === "inherit"
                ? undefined
                : previewAccent}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-4)",
            }}
        >
            <SettingsGroup>
                <SettingsRow
                    title="枝型品种"
                    className="settings-row--vertical"
                >
                    <RadioGroup
                        variant="segmented"
                        value={species}
                        onValueChange={(v) => setSpecies(v as BotanicalSpecies)}
                    >
                        {BOTANICAL_SCENE_CHOICES.map(([id, label]) => (
                            <RadioGroupItem key={id} value={id}>
                                {label}
                            </RadioGroupItem>
                        ))}
                    </RadioGroup>
                </SettingsRow>
                <SettingsRow
                    title="二十四节气与物候"
                    description={`${solarInfo.season.toUpperCase()} · ${
                        PHENOLOGY_LABELS[solarInfo.phenologyStage]
                    } · ${
                        solarInfo.season === "spring" ||
                            solarInfo.season === "summer"
                            ? "朱文阳刻闲章"
                            : "白文阴刻闲章"
                    }${solarInfo.isSnowSeason ? " · 寒梅覆雪" : ""}`}
                >
                    <NativeSelect
                        aria-label="二十四节气"
                        value={String(termIndex)}
                        onChange={(e) => setTermIndex(Number(e.target.value))}
                    >
                        {SOLAR_TERMS_BY_MMDD.map((t, idx) => (
                            <NativeSelectOption
                                key={t.term}
                                value={String(idx)}
                            >
                                {t.term}（{mmddToDateKey(t.mmdd).slice(5)}）
                            </NativeSelectOption>
                        ))}
                    </NativeSelect>
                </SettingsRow>
                <SettingsRow title="画布底色与晨昏">
                    <div className="design-lab-row">
                        <RadioGroup
                            variant="segmented"
                            value={surfaceMode}
                            onValueChange={(v) => setSurfaceMode(
                                v as "light" | "dark" | "overPhotoDark",
                            )}
                        >
                            <RadioGroupItem value="light">
                                浅色宣纸
                            </RadioGroupItem>
                            <RadioGroupItem value="dark">
                                深色曜石
                            </RadioGroupItem>
                            <RadioGroupItem value="overPhotoDark">
                                叠图柔化
                            </RadioGroupItem>
                        </RadioGroup>
                        <RadioGroup
                            variant="segmented"
                            value={String(localHour)}
                            onValueChange={(v) => setLocalHour(Number(v))}
                        >
                            <RadioGroupItem value="6">破晓</RadioGroupItem>
                            <RadioGroupItem value="12">正午</RadioGroupItem>
                            <RadioGroupItem value="18">黄昏</RadioGroupItem>
                            <RadioGroupItem value="23">子夜</RadioGroupItem>
                        </RadioGroup>
                        <RadioGroup
                            variant="segmented"
                            value={sceneSide}
                            onValueChange={(v) =>
                                setSceneSide(v as "right" | "left")}
                        >
                            <RadioGroupItem value="right">
                                右侧生长
                            </RadioGroupItem>
                            <RadioGroupItem value="left">
                                左侧镜像
                            </RadioGroupItem>
                        </RadioGroup>
                    </div>
                </SettingsRow>
                <SettingsRow title="显示首页安全区参考线">
                    <Switch
                        checked={showGuides}
                        onCheckedChange={setShowGuides}
                        aria-label="显示首页安全区参考线"
                    />
                </SettingsRow>
            </SettingsGroup>

            <div
                style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "16 / 10",
                    borderRadius: "var(--radius-sheet)",
                    overflow: "hidden",
                    border: "1px solid var(--border)",
                    background: surfaceMode === "light"
                        ? "#F4F4F5"
                        : surfaceMode === "overPhotoDark"
                        ? "linear-gradient(135deg, #1b2232 0%, #2c2538 52%, #141922 100%)"
                        : "#07080C",
                    color: "var(--accent)",
                }}
            >
                <canvas
                    ref={canvasRef}
                    style={{
                        width: "100%",
                        height: "100%",
                        display: "block",
                    }}
                />
                {showGuides && (
                    <div
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: "none",
                        }}
                    >
                        <div
                            style={{
                                position: "absolute",
                                left: "50%",
                                top: "38%",
                                width: "41%",
                                height: "5.8%",
                                transform: "translate(-50%, -50%)",
                                borderRadius: "var(--radius-lg)",
                                border:
                                    "1px dashed color-mix(in srgb, var(--accent) 55%, transparent)",
                                background:
                                    "color-mix(in srgb, var(--surface) 18%, transparent)",
                            }}
                        />
                        <div
                            style={{
                                position: "absolute",
                                left: sceneSide === "right" ? "3%" : undefined,
                                right: sceneSide === "left" ? "3%" : undefined,
                                top: "14%",
                                width: "21%",
                                height: "42%",
                                borderRadius: "var(--radius)",
                                border:
                                    "1px dashed color-mix(in srgb, var(--muted) 42%, transparent)",
                            }}
                        />
                    </div>
                )}
                <div
                    style={{
                        position: "absolute",
                        top: "var(--space-3)",
                        left: "var(--space-3)",
                        display: "flex",
                        gap: "var(--space-2)",
                        alignItems: "center",
                    }}
                >
                    <Badge variant="secondary">{motionLabel}</Badge>
                    <Badge variant="default">
                        {concreteSpecies} · {solarInfo.term}
                    </Badge>
                </div>
            </div>

            <div className="design-lab-row">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                        growthStartRef.current = performance.now() / 1000;
                        scheduleRef.current?.();
                    }}
                >
                    重播逐笔生长
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                        triggerBotanicalGust(
                            runtimeRef.current,
                            performance.now() / 1000,
                            0.95,
                            4.6,
                        );
                        scheduleRef.current?.();
                    }}
                >
                    拂过阵风
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => triggerResonance("quick-capture")}
                >
                    快速记录落瓣
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => triggerResonance("task-completed")}
                >
                    待办完成
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => triggerResonance("tasks-cleared")}
                >
                    清零开花
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => triggerResonance("search-submit")}
                >
                    搜索惊鸿
                </Button>
            </div>
        </div>
    );
}

export default function IllustrationLab() {
    const [size, setSize] = useState<"sm" | "md" | "lg">("md");
    const [previewAccent, setPreviewAccent] = useState<AccentId | "inherit">(
        "inherit",
    );

    return (
        <PageShell archetype="workbench" className="design-lab-page">
            <PageHeader
                title="系统插画实验室"
                description="预览「博物套色版画」系统插画在当前主题、强调色与三档尺寸下的实际 SVG 渲染与指尖微交互。"
                actions={<Link to="/design-lab">返回设计实验室</Link>}
            />

            <Section title="预览参数">
                <SettingsGroup>
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

            <Section title="首页画布插画工作台（宋元折枝 × 木版水印）">
                <BotanicalCanvasWorkbench previewAccent={previewAccent} />
            </Section>

            <Section title="8 组核心场景（博物套色版画）">
                <div
                    data-accent={previewAccent === "inherit"
                        ? undefined
                        : previewAccent}
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fit, minmax(280px, 1fr))",
                        gap: "var(--space-4)",
                    }}
                >
                    {ILLUSTRATION_CATALOG.map((item) => (
                        <div
                            key={item.name}
                            className="design-lab-illustration-card"
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
                                data-illustration-stage=""
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
                                />
                                {item.name === "not-found" && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        data-compass-target="home"
                                        render={<Link to="/" />}
                                    >
                                        返回首页
                                    </Button>
                                )}
                            </div>
                            <div
                                style={{
                                    fontSize: "var(--font-metadata-size)",
                                    color: "var(--muted)",
                                }}
                            >
                                {item.interactionHint}
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
