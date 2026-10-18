import { ACCENTS } from "@shared/contracts.ts";
import { type EngineId, SEARCH_ENGINES } from "@shared/engines.ts";
import {
    parseWallpaperSource,
    type WallpaperComposition,
} from "@shared/wallpaper.ts";
import {
    CANVAS_MOTION_STAGES,
    type CanvasMotion,
    DEFAULT_CANVAS_MOTION,
    DEFAULT_CANVAS_MOTION_LEVEL,
    DEFAULT_WALLPAPER_PRESENTATION,
    purgeWallpaperPresentation,
    touchWallpaperPresentation,
    WALLPAPER_MOTION_LEVEL_STAGES,
    WALLPAPER_MOTION_STAGES,
    WALLPAPER_READABILITY_STAGES,
    WALLPAPER_SOFTNESS_STAGES,
    WALLPAPER_TONE_STAGES,
    type WallpaperMotion,
    type WallpaperMotionLevel,
    type WallpaperPresentation,
    wallpaperPresentation,
    type WallpaperReadability,
    type WallpaperSoftness,
    type WallpaperTone,
} from "@shared/wallpaper-presentation.ts";
import { SettingsPresetSlider } from "../components/searcher/SettingsPresetSlider.tsx";
import {
    Check,
    Keyboard,
    MoreVertical,
    Palette,
    RefreshCw,
    RotateCcw,
    Search,
    SlidersHorizontal,
    Sparkles,
    Upload,
} from "lucide-react";
import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import {
    SettingsCard,
    SettingsRow,
    StatusBanner,
} from "../components/searcher/semantic.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../components/ui/alert-dialog.tsx";
import { Button } from "../components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { Input } from "../components/ui/input.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../components/ui/native-select.tsx";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.tsx";
import { Slider } from "../components/ui/slider.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs.tsx";
import { WallpaperCompositionDialog } from "../components/wallpaper/WallpaperCompositionDialog.tsx";
import {
    useWallpaperEnvironment,
    WallpaperSurface,
} from "../components/wallpaper/WallpaperSurface.tsx";
import { WallpaperStageContextPreview } from "../components/wallpaper/WallpaperStageContextPreview.tsx";
import { LayoutModeSelector } from "../features/home-layouts/LayoutModeSelector.tsx";
import { SCENE_REGISTRY } from "../features/desktop-scenes/scene-registry.ts";
import { SCENE_PREVIEWS } from "../features/desktop-scenes/scene-previews.tsx";
import {
    DESKTOP_SCENE_IDS,
    type DesktopSceneId,
    normalizeDesktopScene,
} from "@shared/desktop-scenes.ts";
import { api } from "../lib/api.ts";
import { ShortcutsSettings } from "../features/shortcuts/ShortcutsSettings.tsx";
import { AiSettings } from "./AiSettings.tsx";
import { NotFoundPage } from "./NotFoundPage.tsx";
import { routes, type SettingsTab, settingsTab } from "./routes.ts";
import "./settings.css";
import { SettingsActionCard, SettingsSection } from "./SettingsPrimitives.tsx";
import { type Appearance, useAppState } from "./state.tsx";

type Tab = SettingsTab;

const NO_SCENE_OPTION = {
    id: "none",
    label: "关闭",
    description: "不显示桌面场景，保持纯壁纸背景。",
} as const;

/** 选项顺序遵循共享 ID 列表；新场景注册后自动出现，未注册的不可选。 */
const DESKTOP_SCENE_OPTIONS: ReadonlyArray<{
    id: DesktopSceneId;
    label: string;
    description: string;
}> = DESKTOP_SCENE_IDS.map((id) =>
    id === "none" ? NO_SCENE_OPTION : SCENE_REGISTRY[id]
);

const tabs: Record<Tab, { label: string; icon: typeof Search }> = {
    search: { label: "搜索", icon: Search },
    appearance: { label: "外观", icon: Palette },
    ai: { label: "AI 问答", icon: Sparkles },
    data: { label: "数据与同步", icon: RefreshCw },
    shortcuts: { label: "快捷键", icon: Keyboard },
};

function getAccentLight(id: string): string {
    return ACCENTS.find((a) => a.id === id)?.light ?? "var(--accent)";
}

function Choices<T extends string>(
    {
        title,
        description,
        value,
        values,
        control,
        select,
    }: {
        title: string;
        description?: string;
        value: T;
        values: readonly [T, string][];
        control: "select" | "segmented" | "swatches";
        select: (v: T) => void;
    },
) {
    let input: ReactNode;
    if (control === "select") {
        input = (
            <div className="settings-choice-select">
                <NativeSelect
                    value={value}
                    onChange={(e) => select(e.target.value as T)}
                    aria-label={title}
                >
                    {values.map(([id, label]) => (
                        <NativeSelectOption key={id} value={id}>
                            {label}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
            </div>
        );
    } else if (control === "segmented") {
        input = (
            <Tabs value={value} onValueChange={(next) => select(next as T)}>
                <TabsList>
                    {values.map(([id, label]) => (
                        <TabsTrigger key={id} value={id}>{label}</TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        );
    } else {
        input = (
            <RadioGroup
                variant="swatch"
                value={value}
                onValueChange={(next) => select(next as T)}
                aria-label={title}
            >
                {values.map(([id, label]) => (
                    <RadioGroupItem
                        key={id}
                        value={id}
                        aria-label={label}
                    >
                        <span
                            className="settings-swatch-color"
                            style={{ background: getAccentLight(id) }}
                            aria-hidden="true"
                        />
                        <span>{label}</span>
                        {value === id && (
                            <span
                                className="settings-swatch-selected"
                                aria-hidden="true"
                            >
                                ✓
                            </span>
                        )}
                    </RadioGroupItem>
                ))}
            </RadioGroup>
        );
    }
    return (
        <SettingsRow
            title={title}
            description={description}
            className={control === "swatches"
                ? "settings-row--stack-mobile"
                : undefined}
        >
            {input}
        </SettingsRow>
    );
}

export interface WallpaperHistoryRecord {
    id: string;
    url: string;
    focalX?: number;
    focalY?: number;
}

export function SettingsPage() {
    const { appearance, setAppearance, user, settleAppearanceSync } =
        useAppState();
    const { reducedMotion } = useWallpaperEnvironment();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [wallpaperHistory, setWallpaperHistory] = useState<
        WallpaperHistoryRecord[]
    >([]);
    const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
    const currentWallpaperSource = parseWallpaperSource(appearance.wallpaper);
    const [wallpaperDraft, setWallpaperDraft] = useState<string>(
        currentWallpaperSource?.type === "uploaded" ||
            appearance.wallpaper.startsWith("data:")
            ? ""
            : appearance.wallpaper,
    );
    const [draftError, setDraftError] = useState<string | null>(null);
    const [isApplyingDraft, setIsApplyingDraft] = useState(false);
    const [compositionTarget, setCompositionTarget] = useState<
        WallpaperHistoryRecord | null
    >(null);
    const [deleteTarget, setDeleteTarget] = useState<
        WallpaperHistoryRecord | null
    >(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );

    const showToast = (msg: string) => {
        clearTimeout(toastTimerRef.current);
        setToastMessage(msg);
        toastTimerRef.current = setTimeout(() => {
            setToastMessage(null);
            toastTimerRef.current = undefined;
        }, 3000);
    };

    useEffect(() => {
        return () => {
            clearTimeout(toastTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (
            !appearance.wallpaper.startsWith("data:") &&
            parseWallpaperSource(appearance.wallpaper)?.type !== "uploaded"
        ) {
            setWallpaperDraft(appearance.wallpaper);
        } else {
            setWallpaperDraft("");
        }
        setDraftError(null);
    }, [appearance.wallpaper]);

    const hasWallpaper = Boolean(appearance.wallpaper);
    const currentPresentation = useMemo<WallpaperPresentation>(() => {
        if (hasWallpaper) {
            return wallpaperPresentation(
                appearance.wallpaper,
                appearance.wallpaperPresentations,
            );
        }
        return {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: appearance.canvasMotion,
            motionLevel: appearance.canvasMotionLevel,
        };
    }, [
        hasWallpaper,
        appearance.wallpaper,
        appearance.wallpaperPresentations,
        appearance.canvasMotion,
        appearance.canvasMotionLevel,
    ]);

    const updatePresentation = useCallback(
        (
            diff: Partial<WallpaperPresentation>,
            options?: { sync?: boolean; persist?: boolean },
        ) => {
            if (appearance.wallpaper) {
                const current = wallpaperPresentation(
                    appearance.wallpaper,
                    appearance.wallpaperPresentations,
                );
                const nextPres: WallpaperPresentation = {
                    ...current,
                    ...diff,
                };
                const nextRecords = touchWallpaperPresentation(
                    appearance.wallpaperPresentations,
                    appearance.wallpaper,
                    nextPres,
                );
                void setAppearance(
                    { wallpaperPresentations: nextRecords },
                    options,
                );
            }
        },
        [
            appearance.wallpaper,
            appearance.wallpaperPresentations,
            setAppearance,
        ],
    );

    const [draftPresentation, setDraftPresentation] = useState<
        WallpaperPresentation | null
    >(null);
    const [draftCanvasMotion, setDraftCanvasMotion] = useState<
        CanvasMotion | null
    >(null);
    const [draftCanvasMotionLevel, setDraftCanvasMotionLevel] = useState<
        WallpaperMotionLevel | null
    >(null);

    const effectiveCanvasMotion = draftCanvasMotion ?? appearance.canvasMotion;
    const effectiveCanvasMotionLevel = draftCanvasMotionLevel ??
        appearance.canvasMotionLevel;

    const effectivePresentation = useMemo<WallpaperPresentation>(() => {
        if (hasWallpaper) {
            return draftPresentation ?? currentPresentation;
        }
        return {
            ...currentPresentation,
            motion: effectiveCanvasMotion,
            motionLevel: effectiveCanvasMotionLevel,
        };
    }, [
        hasWallpaper,
        draftPresentation,
        currentPresentation,
        effectiveCanvasMotion,
        effectiveCanvasMotionLevel,
    ]);

    useEffect(() => {
        setDraftPresentation(null);
        setDraftCanvasMotion(null);
        setDraftCanvasMotionLevel(null);
    }, [
        appearance.wallpaper,
        appearance.wallpaperPresentations,
        appearance.canvasMotion,
        appearance.canvasMotionLevel,
    ]);

    const readabilityStage = WALLPAPER_READABILITY_STAGES.find(
        (s) => s.id === effectivePresentation.readability,
    );
    const readabilityText = readabilityStage
        ? `${readabilityStage.label} · ${readabilityStage.detail}`
        : "";

    const softnessStage = WALLPAPER_SOFTNESS_STAGES.find(
        (s) => s.id === effectivePresentation.softness,
    );
    const softnessText = softnessStage
        ? `${softnessStage.label} · ${softnessStage.detail}`
        : "";

    const activeMotion = hasWallpaper
        ? effectivePresentation.motion
        : effectiveCanvasMotion;
    const activeMotionLevel = hasWallpaper
        ? effectivePresentation.motionLevel
        : effectiveCanvasMotionLevel;

    const motionLevelStage = WALLPAPER_MOTION_LEVEL_STAGES.find(
        (s) => s.id === activeMotionLevel,
    );
    const motionLevelText = motionLevelStage?.label ?? "";

    const isMotionActive = activeMotion !== "off";

    useEffect(() => {
        setWallpaperHistory([]);
        if (!user) return;
        let cancelled = false;
        void api<WallpaperHistoryRecord[]>("/api/wallpaper").then((records) => {
            if (!cancelled) {
                setWallpaperHistory(records.slice(0, 5));
            }
        }).catch(() => {
            // Gracefully tolerate network failure
        });
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    async function handleWallpaperUpload(file: File) {
        if (file.size > 5 * 1024 * 1024) {
            showToast("壁纸文件大小不能超过 5 MiB");
            return;
        }
        setUploadingWallpaper(true);
        try {
            let url: string;
            let id: string;
            if (user) {
                await settleAppearanceSync();
                const form = new FormData();
                form.append("image", file);
                const res = await api<{ url: string; id?: string }>(
                    "/api/wallpaper",
                    {
                        method: "POST",
                        body: form,
                    },
                );
                url = res.url;
                id = res.id ?? res.url.replace("/api/wallpaper/", "");
            } else {
                url = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () =>
                        typeof reader.result === "string"
                            ? resolve(reader.result)
                            : reject(new Error("读取本地壁纸文件失败"));
                    reader.onerror = () =>
                        reject(new Error("读取本地壁纸文件失败"));
                    reader.readAsDataURL(file);
                });
                id = "guest-" + Date.now();
            }
            const newRecord: WallpaperHistoryRecord = {
                id,
                url,
                focalX: 0.5,
                focalY: 0.5,
            };
            const existingPres = wallpaperPresentation(
                url,
                appearance.wallpaperPresentations,
            );
            const nextPres: WallpaperPresentation = {
                ...existingPres,
                composition: { focalX: 0.5, focalY: 0.5 },
            };
            const nextRecords = touchWallpaperPresentation(
                appearance.wallpaperPresentations,
                url,
                nextPres,
            );
            await setAppearance({
                wallpaper: url,
                wallpaperPresentations: nextRecords,
            });
            setWallpaperHistory((current) =>
                [
                    newRecord,
                    ...current.filter((item) =>
                        item.id !== id && item.url !== url
                    ),
                ].slice(0, 5)
            );
            showToast("壁纸已上传并设为当前背景");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "上传壁纸失败");
        } finally {
            setUploadingWallpaper(false);
        }
    }

    async function handleApplyDraft() {
        const trimmed = wallpaperDraft.trim();
        if (!trimmed || trimmed === appearance.wallpaper || isApplyingDraft) {
            return;
        }
        const parsed = parseWallpaperSource(trimmed);
        if (!parsed) {
            setDraftError(
                "请输入有效的 HTTPS 图片地址（不支持认证凭据）或合法的 CSS 渐变",
            );
            return;
        }
        setDraftError(null);
        setIsApplyingDraft(true);
        try {
            const nextRecords = touchWallpaperPresentation(
                appearance.wallpaperPresentations,
                parsed.value,
            );
            await setAppearance({
                wallpaper: parsed.value,
                wallpaperPresentations: nextRecords,
            });
            showToast("壁纸已更新");
        } catch {
            setDraftError("同步壁纸失败，请重试");
        } finally {
            setIsApplyingDraft(false);
        }
    }

    async function handleClearCurrentWallpaper() {
        try {
            await setAppearance({ wallpaper: "" });
            showToast("已停止使用当前壁纸，恢复默认背景");
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : "清除壁纸失败，请重试",
            );
        }
    }

    async function handleSetCurrentFromHistory(record: WallpaperHistoryRecord) {
        try {
            const existingPres = wallpaperPresentation(
                record.url,
                appearance.wallpaperPresentations,
            );
            const focal = {
                focalX: record.focalX ?? existingPres.composition.focalX ?? 0.5,
                focalY: record.focalY ?? existingPres.composition.focalY ?? 0.5,
            };
            const nextPres: WallpaperPresentation = {
                ...existingPres,
                composition: focal,
            };
            const nextRecords = touchWallpaperPresentation(
                appearance.wallpaperPresentations,
                record.url,
                nextPres,
            );
            await setAppearance({
                wallpaper: record.url,
                wallpaperPresentations: nextRecords,
            });
            showToast("已设为当前壁纸");
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : "切换壁纸失败，请重试",
            );
        }
    }

    async function handleSaveComposition(focal: WallpaperComposition) {
        if (!compositionTarget) return;
        const target = compositionTarget;
        try {
            const parsed = parseWallpaperSource(target.url);
            const isUploadedAsset = user && parsed?.type === "uploaded";
            const targetPres = wallpaperPresentation(
                target.url,
                appearance.wallpaperPresentations,
            );
            const nextPres: WallpaperPresentation = {
                ...targetPres,
                composition: focal,
            };
            const nextRecords = touchWallpaperPresentation(
                appearance.wallpaperPresentations,
                target.url,
                nextPres,
            );
            if (isUploadedAsset) {
                await settleAppearanceSync();
                const uuid = parsed.value.replace("/api/wallpaper/", "");
                await api(`/api/wallpaper/${uuid}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        focalX: focal.focalX,
                        focalY: focal.focalY,
                    }),
                    headers: { "Content-Type": "application/json" },
                });
                await setAppearance(
                    { wallpaperPresentations: nextRecords },
                    { sync: false },
                );
            } else {
                const isCurrent = appearance.wallpaper === target.url;
                await setAppearance(
                    { wallpaperPresentations: nextRecords },
                    { sync: isCurrent },
                );
            }
            setWallpaperHistory((prev) =>
                prev.map((item) =>
                    item.id === target.id
                        ? {
                            ...item,
                            focalX: focal.focalX,
                            focalY: focal.focalY,
                        }
                        : item
                )
            );
            showToast("构图已保存");
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : "保存构图失败，请重试",
            );
            throw error; // Rethrow so composition dialog stays open
        }
    }

    async function handleSetCurrentWithFocal(focal: WallpaperComposition) {
        if (!compositionTarget) return;
        const target = compositionTarget;
        try {
            const parsed = parseWallpaperSource(target.url);
            const isUploadedAsset = user && parsed?.type === "uploaded";
            if (isUploadedAsset) {
                await settleAppearanceSync();
                const uuid = parsed.value.replace("/api/wallpaper/", "");
                await api(`/api/wallpaper/${uuid}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        focalX: focal.focalX,
                        focalY: focal.focalY,
                    }),
                    headers: { "Content-Type": "application/json" },
                });
            }
            const targetPres = wallpaperPresentation(
                target.url,
                appearance.wallpaperPresentations,
            );
            const nextPres: WallpaperPresentation = {
                ...targetPres,
                composition: focal,
            };
            const nextRecords = touchWallpaperPresentation(
                appearance.wallpaperPresentations,
                target.url,
                nextPres,
            );
            await setAppearance({
                wallpaper: target.url,
                wallpaperPresentations: nextRecords,
            });
            setWallpaperHistory((prev) =>
                prev.map((item) =>
                    item.id === target.id
                        ? {
                            ...item,
                            focalX: focal.focalX,
                            focalY: focal.focalY,
                        }
                        : item
                )
            );
            showToast("已设为当前壁纸并保存构图");
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : "设置壁纸失败，请重试",
            );
            throw error; // Rethrow so dialog stays open
        }
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return;
        const target = deleteTarget;
        setIsDeleting(true);
        try {
            const isCurrent = appearance.wallpaper === target.url;
            const parsed = parseWallpaperSource(target.url);
            if (user && parsed?.type === "uploaded") {
                await settleAppearanceSync();
                const uuid = parsed.value.replace("/api/wallpaper/", "");
                await api(`/api/wallpaper/${uuid}`, { method: "DELETE" });
            }
            const nextRecords = purgeWallpaperPresentation(
                appearance.wallpaperPresentations,
                target.url,
            );
            if (isCurrent) {
                await setAppearance(
                    { wallpaper: "", wallpaperPresentations: nextRecords },
                    { sync: false },
                );
                showToast("壁纸已删除，已恢复默认背景");
            } else {
                await setAppearance(
                    { wallpaperPresentations: nextRecords },
                    { sync: false },
                );
                showToast("壁纸已删除");
            }
            setWallpaperHistory((prev) =>
                prev.filter((item) => item.id !== target.id)
            );
            setDeleteTarget(null);
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : "删除壁纸失败，请重试",
            );
        } finally {
            setIsDeleting(false);
        }
    }
    const location = useLocation();
    const tab = settingsTab(location.pathname);
    const activeNavButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (activeNavButtonRef.current) {
            activeNavButtonRef.current.scrollIntoView({
                behavior: "auto",
                block: "nearest",
                inline: "nearest",
            });
        }
    }, [tab]);

    function set<K extends keyof Appearance>(key: K, value: Appearance[K]) {
        void setAppearance({ [key]: value });
    }

    if (location.pathname === "/settings/search") {
        return <Navigate to={routes.settings()} replace />;
    }

    if (!tab) {
        return (
            <NotFoundPage parent={{ label: "设置", to: routes.settings() }} />
        );
    }

    return (
        <>
            <PageShell archetype="utility">
                <PageHeader
                    items={[
                        { label: "首页", to: routes.home },
                        { label: "设置", to: routes.settings() },
                        { label: tabs[tab].label },
                    ]}
                    title="设置"
                />

                <div className="settings-layout">
                    <nav className="settings-nav" aria-label="设置分类">
                        {(Object.keys(tabs) as Tab[]).map((id) => {
                            const Icon = tabs[id].icon;
                            return (
                                <button
                                    type="button"
                                    key={id}
                                    ref={tab === id ? activeNavButtonRef : null}
                                    onClick={() =>
                                        navigate(
                                            routes.settings(id),
                                            { replace: true },
                                        )}
                                    className={`flex items-center gap-2.5 ${
                                        tab === id ? "active" : ""
                                    }`}
                                    aria-current={tab === id
                                        ? "page"
                                        : undefined}
                                >
                                    <Icon size={18} />
                                    <span>{tabs[id].label}</span>
                                </button>
                            );
                        })}
                    </nav>
                    <section className="settings-panel">
                        <h2>{tabs[tab].label}</h2>
                        {tab === "search" && (
                            <div className="settings-content">
                                <SettingsSection title="搜索引擎与打开方式">
                                    <SettingsCard>
                                        <Choices
                                            title="默认搜索引擎"
                                            description="选择在搜索框内直接回车时使用的搜索引擎"
                                            control="select"
                                            value={appearance.engine}
                                            values={SEARCH_ENGINES.map((e) =>
                                                [e.id, e.label] as const
                                            )}
                                            select={(v) =>
                                                set("engine", v as EngineId)}
                                        />
                                        <Choices
                                            title="搜索结果打开方式"
                                            description="在当前页面跳转或在新标签页中打开搜索结果"
                                            control="segmented"
                                            value={appearance.target}
                                            values={[
                                                ["current", "当前标签页打开"],
                                                ["new_tab", "新标签页打开"],
                                            ] as const}
                                            select={(v) => set("target", v)}
                                        />
                                        <Choices
                                            title="首页快捷方式数量"
                                            description="在搜索主页固定的常用网站展示上限"
                                            control="select"
                                            value={String(
                                                appearance.webAppHomeLimit,
                                            )}
                                            values={[
                                                ["8", "8 个"],
                                                ["12", "12 个"],
                                                ["16", "16 个"],
                                                ["all", "全部"],
                                            ] as const}
                                            select={(v) =>
                                                set(
                                                    "webAppHomeLimit",
                                                    v === "all"
                                                        ? "all"
                                                        : (Number(v) as
                                                            | 8
                                                            | 12
                                                            | 16),
                                                )}
                                        />
                                    </SettingsCard>
                                </SettingsSection>
                            </div>
                        )}
                        {tab === "appearance" && (
                            <div className="settings-content">
                                <SettingsSection title="主题与配色">
                                    <SettingsCard>
                                        <Choices
                                            title="主题模式"
                                            description="切换浅色、深色模式或跟随系统"
                                            control="segmented"
                                            value={appearance.theme}
                                            values={[
                                                ["system", "跟随系统"],
                                                ["light", "浅色"],
                                                ["dark", "深色"],
                                            ] as const}
                                            select={(v) => set("theme", v)}
                                        />
                                        <Choices
                                            title="强调色"
                                            description="设置按钮、焦点环与激活标签的主题强调色"
                                            control="swatches"
                                            value={appearance.accent}
                                            values={ACCENTS.map((a) => [
                                                a.id,
                                                a.label,
                                            ])}
                                            select={(v) => set("accent", v)}
                                        />
                                        <div className="settings-row settings-row--vertical">
                                            <div className="settings-row-label">
                                                <span className="settings-row-title">
                                                    主页工作区风格
                                                </span>
                                                <p className="settings-row-desc">
                                                    切换主页的信息架构、排版密度与交互模式
                                                </p>
                                            </div>
                                            <LayoutModeSelector
                                                value={appearance.style}
                                                onChange={(newStyle) =>
                                                    set("style", newStyle)}
                                            />
                                        </div>
                                    </SettingsCard>
                                </SettingsSection>

                                <SettingsSection title="主页与快捷入口">
                                    <SettingsCard>
                                        <Choices
                                            title="控件形状"
                                            description="搜索框及主要操作按钮切换胶囊外观；表单输入框与卡片保持矩形圆角"
                                            control="segmented"
                                            value={appearance.shape ??
                                                "rounded"}
                                            values={[
                                                ["rounded", "默认"],
                                                ["pill", "胶囊"],
                                            ] as const}
                                            select={(v) => set("shape", v)}
                                        />
                                        <div className="settings-row settings-row--stack-mobile">
                                            <div className="settings-row-label">
                                                <div className="flex justify-between items-center sm:block">
                                                    <span className="settings-row-title">
                                                        搜索框透明度
                                                    </span>
                                                    <span className="sm:hidden text-xs text-[var(--muted)] font-medium">
                                                        {Math.round(
                                                            (appearance
                                                                .searchOpacity ??
                                                                1) * 100,
                                                        )}%
                                                    </span>
                                                </div>
                                                <p className="settings-row-desc">
                                                    调整搜索框背景的不透明度
                                                </p>
                                            </div>
                                            <div className="settings-row-control flex flex-col gap-1 w-full sm:w-60">
                                                <div className="hidden sm:flex justify-end text-xs text-[var(--muted)] font-medium mb-1">
                                                    {Math.round(
                                                        (appearance
                                                            .searchOpacity ??
                                                            1) * 100,
                                                    )}%
                                                </div>
                                                <Slider
                                                    min={0.1}
                                                    max={1}
                                                    step={0.05}
                                                    value={appearance
                                                        .searchOpacity ?? 1}
                                                    onValueChange={(v) =>
                                                        set(
                                                            "searchOpacity",
                                                            typeof v ===
                                                                    "number"
                                                                ? v
                                                                : v[0],
                                                        )}
                                                    aria-label="搜索框透明度"
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>
                                        <div className="settings-row settings-row--inline-mobile">
                                            <div className="settings-row-label">
                                                <span className="settings-row-title">
                                                    显示 Searcher 标题
                                                </span>
                                                <p className="settings-row-desc">
                                                    在 Widgets
                                                    搜索框上方展示品牌大标题；Zen
                                                    始终保持极简
                                                </p>
                                            </div>
                                            <div className="settings-row-control">
                                                <Switch
                                                    checked={appearance
                                                        .showTitle !== false}
                                                    onCheckedChange={(
                                                        checked,
                                                    ) => set(
                                                        "showTitle",
                                                        checked,
                                                    )}
                                                    aria-label="显示 Searcher 标题"
                                                />
                                            </div>
                                        </div>
                                        <Choices
                                            title="网站图标大小"
                                            description="调整工作区与首页快捷方式的图标尺度"
                                            control="select"
                                            value={appearance.webAppIconSize}
                                            values={[
                                                ["compact", "紧凑"],
                                                ["default", "标准"],
                                                ["large", "大图标"],
                                            ] as const}
                                            select={(v) =>
                                                set("webAppIconSize", v)}
                                        />
                                        <div className="settings-row settings-row--inline-mobile">
                                            <div className="settings-row-label">
                                                <span className="settings-row-title">
                                                    显示应用名称
                                                </span>
                                                <p className="settings-row-desc">
                                                    在桌面或快捷列表中展示应用文字标签
                                                </p>
                                            </div>
                                            <div className="settings-row-control">
                                                <Switch
                                                    checked={appearance
                                                        .showAppLabels}
                                                    onCheckedChange={(
                                                        checked,
                                                    ) => set(
                                                        "showAppLabels",
                                                        checked,
                                                    )}
                                                    aria-label="显示 APP 名称"
                                                />
                                            </div>
                                        </div>
                                    </SettingsCard>
                                </SettingsSection>

                                <SettingsSection
                                    title="壁纸与背景效果"
                                    actions={
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                void setAppearance({
                                                    wallpaper: "",
                                                    canvasMotion:
                                                        DEFAULT_CANVAS_MOTION,
                                                    canvasMotionLevel:
                                                        DEFAULT_CANVAS_MOTION_LEVEL,
                                                });
                                            }}
                                            title="恢复壁纸与效果默认值"
                                        >
                                            <RotateCcw size={13} />
                                            <span>恢复默认</span>
                                        </Button>
                                    }
                                >
                                    <SettingsCard>
                                        <div className="wallpaper-settings-block">
                                            <div className="wallpaper-settings-block__intro">
                                                <span className="settings-row-title">
                                                    壁纸背景
                                                </span>
                                                <p className="settings-row-desc">
                                                    上传本地图片或输入 HTTPS
                                                    图像地址、CSS 渐变
                                                </p>
                                                {!user && (
                                                    <p
                                                        className="wallpaper-guest-notice"
                                                        data-testid="wallpaper-guest-notice"
                                                    >
                                                        设置保存在当前设备/浏览器；仅登录后新上传的壁纸可同步至云端（壁纸最大
                                                        5 MiB）
                                                    </p>
                                                )}
                                            </div>
                                            <div className="wallpaper-source-editor">
                                                <input
                                                    type="file"
                                                    ref={fileInputRef}
                                                    className="hidden"
                                                    accept="image/png,image/jpeg,image/webp,image/avif"
                                                    data-testid="wallpaper-file-input"
                                                    onChange={(e) => {
                                                        const file = e.target
                                                            .files?.[0];
                                                        if (file) {
                                                            void handleWallpaperUpload(
                                                                file,
                                                            );
                                                        }
                                                        e.target.value = "";
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    onClick={() =>
                                                        fileInputRef.current
                                                            ?.click()}
                                                    disabled={uploadingWallpaper}
                                                    title="上传本地图片"
                                                    aria-label="上传本地图片"
                                                    data-testid="wallpaper-upload-btn"
                                                >
                                                    <Upload size={16} />
                                                </Button>
                                                <Input
                                                    id="wallpaper-input"
                                                    data-testid="wallpaper-input"
                                                    aria-label="壁纸来源"
                                                    aria-invalid={!!draftError}
                                                    aria-describedby={draftError
                                                        ? "wallpaper-source-error"
                                                        : undefined}
                                                    placeholder={currentWallpaperSource
                                                                    ?.type ===
                                                                "uploaded" ||
                                                            appearance.wallpaper
                                                                .startsWith(
                                                                    "data:",
                                                                )
                                                        ? "输入 HTTPS 地址或 CSS 渐变以替换当前壁纸"
                                                        : "输入 HTTPS 地址或 CSS 渐变"}
                                                    value={wallpaperDraft}
                                                    onChange={(e) => {
                                                        setWallpaperDraft(
                                                            e.target.value,
                                                        );
                                                        setDraftError(null);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault();
                                                            void handleApplyDraft();
                                                        }
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() =>
                                                        void handleApplyDraft()}
                                                    disabled={isApplyingDraft ||
                                                        !wallpaperDraft
                                                            .trim() ||
                                                        wallpaperDraft
                                                                .trim() ===
                                                            appearance
                                                                .wallpaper}
                                                    data-testid="wallpaper-apply-btn"
                                                >
                                                    应用
                                                </Button>
                                                {draftError && (
                                                    <p
                                                        id="wallpaper-source-error"
                                                        className="wallpaper-input-error"
                                                        role="alert"
                                                    >
                                                        {draftError}
                                                    </p>
                                                )}
                                            </div>
                                            {appearance.wallpaper && (
                                                <section
                                                    className="wallpaper-current"
                                                    aria-label="当前壁纸"
                                                >
                                                    <div
                                                        className="wallpaper-stage wallpaper-current__preview"
                                                        data-testid="wallpaper-stage"
                                                    >
                                                        <WallpaperSurface
                                                            source={appearance
                                                                .wallpaper}
                                                            presentation={effectivePresentation}
                                                            embedded
                                                            testId="wallpaper-current-preview"
                                                        />
                                                        <WallpaperStageContextPreview />
                                                    </div>
                                                    <div className="wallpaper-current__details">
                                                        <span className="settings-row-title">
                                                            当前壁纸
                                                        </span>
                                                        <p className="settings-row-desc">
                                                            {currentWallpaperSource
                                                                            ?.type ===
                                                                        "uploaded" ||
                                                                    appearance
                                                                        .wallpaper
                                                                        .startsWith(
                                                                            "data:",
                                                                        )
                                                                ? "已上传图片"
                                                                : currentWallpaperSource
                                                                        ?.type ===
                                                                        "gradient"
                                                                ? "CSS 渐变"
                                                                : "HTTPS 图片"}
                                                        </p>
                                                        <div className="wallpaper-current__actions">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                onClick={() => {
                                                                    const focal =
                                                                        currentPresentation
                                                                            .composition;
                                                                    setCompositionTarget(
                                                                        {
                                                                            id: "current",
                                                                            url: appearance
                                                                                .wallpaper,
                                                                            ...focal,
                                                                        },
                                                                    );
                                                                }}
                                                                data-testid="wallpaper-current-adjust-focal-btn"
                                                            >
                                                                <SlidersHorizontal
                                                                    size={14}
                                                                />
                                                                <span>
                                                                    调整当前壁纸构图
                                                                </span>
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                onClick={() =>
                                                                    void handleClearCurrentWallpaper()}
                                                                aria-label="停止使用当前壁纸"
                                                                data-testid="wallpaper-clear-btn"
                                                            >
                                                                <RotateCcw
                                                                    size={14}
                                                                />
                                                                <span>
                                                                    停止使用
                                                                </span>
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </section>
                                            )}
                                            {wallpaperHistory.length > 0 &&
                                                (
                                                    <div
                                                        className="wallpaper-history"
                                                        data-testid="wallpaper-history"
                                                        aria-label="最近上传的图片"
                                                    >
                                                        <span className="settings-row-desc">
                                                            最近上传 · 保留 5 张
                                                        </span>
                                                        <div className="wallpaper-history__grid">
                                                            {wallpaperHistory
                                                                .map((
                                                                    record,
                                                                    index,
                                                                ) => {
                                                                    const isCurrent =
                                                                        appearance
                                                                            .wallpaper ===
                                                                            record
                                                                                .url;
                                                                    return (
                                                                        <div
                                                                            key={record
                                                                                .id}
                                                                            className="wallpaper-card"
                                                                            data-current={isCurrent
                                                                                ? "true"
                                                                                : undefined}
                                                                            data-testid={`wallpaper-history-item-${record.id}`}
                                                                        >
                                                                            <button
                                                                                type="button"
                                                                                className="wallpaper-card__main"
                                                                                onClick={() =>
                                                                                    setCompositionTarget(
                                                                                        record,
                                                                                    )}
                                                                                aria-label={`预览与调整构图：壁纸 ${
                                                                                    index +
                                                                                    1
                                                                                }${
                                                                                    isCurrent
                                                                                        ? "（当前壁纸）"
                                                                                        : ""
                                                                                }`}
                                                                                data-testid={`wallpaper-card-preview-btn-${record.id}`}
                                                                            >
                                                                                <img
                                                                                    src={record
                                                                                        .url}
                                                                                    alt={`壁纸 ${
                                                                                        index +
                                                                                        1
                                                                                    }`}
                                                                                    className="wallpaper-card__thumbnail"
                                                                                    loading="lazy"
                                                                                />
                                                                                {isCurrent &&
                                                                                    (
                                                                                        <div
                                                                                            className="wallpaper-card__current-badge"
                                                                                            data-testid="wallpaper-current-badge"
                                                                                        >
                                                                                            <Check
                                                                                                size={12}
                                                                                                className="shrink-0"
                                                                                            />
                                                                                            <span>
                                                                                                当前壁纸
                                                                                            </span>
                                                                                        </div>
                                                                                    )}
                                                                            </button>
                                                                            <div className="wallpaper-card__actions">
                                                                                <DropdownMenu>
                                                                                    <DropdownMenuTrigger
                                                                                        className="wallpaper-card__menu-trigger"
                                                                                        aria-label={`壁纸操作菜单：壁纸 ${
                                                                                            index +
                                                                                            1
                                                                                        }`}
                                                                                        data-testid={`wallpaper-menu-trigger-${record.id}`}
                                                                                    >
                                                                                        <MoreVertical
                                                                                            size={16}
                                                                                        />
                                                                                    </DropdownMenuTrigger>
                                                                                    <DropdownMenuContent>
                                                                                        {!isCurrent
                                                                                            ? (
                                                                                                <DropdownMenuItem
                                                                                                    onClick={() =>
                                                                                                        void handleSetCurrentFromHistory(
                                                                                                            record,
                                                                                                        )}
                                                                                                    data-testid="wallpaper-menu-set-current"
                                                                                                >
                                                                                                    设为当前壁纸
                                                                                                </DropdownMenuItem>
                                                                                            )
                                                                                            : (
                                                                                                <DropdownMenuItem
                                                                                                    disabled
                                                                                                    className="opacity-50 pointer-events-none"
                                                                                                    data-testid="wallpaper-menu-set-current"
                                                                                                >
                                                                                                    当前正在使用
                                                                                                </DropdownMenuItem>
                                                                                            )}
                                                                                        <DropdownMenuItem
                                                                                            onClick={() =>
                                                                                                setCompositionTarget(
                                                                                                    record,
                                                                                                )}
                                                                                            data-testid="wallpaper-menu-adjust-focal"
                                                                                        >
                                                                                            调整构图
                                                                                        </DropdownMenuItem>
                                                                                        <DropdownMenuItem
                                                                                            className="text-[var(--danger)]"
                                                                                            onClick={() =>
                                                                                                setDeleteTarget(
                                                                                                    record,
                                                                                                )}
                                                                                            data-testid="wallpaper-menu-delete"
                                                                                        >
                                                                                            删除
                                                                                        </DropdownMenuItem>
                                                                                    </DropdownMenuContent>
                                                                                </DropdownMenu>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                        </div>
                                                    </div>
                                                )}
                                        </div>
                                        {/* 1. 可读性 (Readability) */}
                                        <div className="settings-row settings-row--stack-mobile">
                                            <div className="settings-row-label">
                                                <div className="flex justify-between items-center sm:block">
                                                    <span className="settings-row-title">
                                                        可读性
                                                    </span>
                                                    {hasWallpaper && (
                                                        <span className="sm:hidden text-xs text-[var(--muted)] font-medium">
                                                            {readabilityText}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="settings-row-desc">
                                                    覆在壁纸上的背景遮罩浓度，保障内容阅读舒适
                                                </p>
                                            </div>
                                            <div className="settings-row-control flex flex-col gap-1 w-full sm:w-60">
                                                {hasWallpaper && (
                                                    <div className="hidden sm:flex justify-end text-xs text-[var(--muted)] font-medium mb-1">
                                                        {readabilityText}
                                                    </div>
                                                )}
                                                <SettingsPresetSlider
                                                    stages={WALLPAPER_READABILITY_STAGES}
                                                    value={effectivePresentation
                                                        .readability}
                                                    disabled={!hasWallpaper}
                                                    onChange={(v) =>
                                                        setDraftPresentation((
                                                            prev,
                                                        ) => ({
                                                            ...(prev ??
                                                                currentPresentation),
                                                            readability:
                                                                v as WallpaperReadability,
                                                        }))}
                                                    onCommit={(v) => {
                                                        setDraftPresentation(
                                                            null,
                                                        );
                                                        updatePresentation({
                                                            readability:
                                                                v as WallpaperReadability,
                                                        });
                                                    }}
                                                    aria-label="可读性"
                                                    testId="wallpaper-readability-slider"
                                                />
                                            </div>
                                        </div>

                                        {/* 2. 柔化 (Softness) */}
                                        <div className="settings-row settings-row--stack-mobile">
                                            <div className="settings-row-label">
                                                <div className="flex justify-between items-center sm:block">
                                                    <span className="settings-row-title">
                                                        柔化
                                                    </span>
                                                    {hasWallpaper && (
                                                        <span className="sm:hidden text-xs text-[var(--muted)] font-medium">
                                                            {softnessText}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="settings-row-desc">
                                                    背景高斯柔化程度，降低高频纹理干扰
                                                </p>
                                            </div>
                                            <div className="settings-row-control flex flex-col gap-1 w-full sm:w-60">
                                                {hasWallpaper && (
                                                    <div className="hidden sm:flex justify-end text-xs text-[var(--muted)] font-medium mb-1">
                                                        {softnessText}
                                                    </div>
                                                )}
                                                <SettingsPresetSlider
                                                    stages={WALLPAPER_SOFTNESS_STAGES}
                                                    value={effectivePresentation
                                                        .softness}
                                                    disabled={!hasWallpaper}
                                                    onChange={(v) =>
                                                        setDraftPresentation((
                                                            prev,
                                                        ) => ({
                                                            ...(prev ??
                                                                currentPresentation),
                                                            softness:
                                                                v as WallpaperSoftness,
                                                        }))}
                                                    onCommit={(v) => {
                                                        setDraftPresentation(
                                                            null,
                                                        );
                                                        updatePresentation({
                                                            softness:
                                                                v as WallpaperSoftness,
                                                        });
                                                    }}
                                                    aria-label="柔化"
                                                    testId="wallpaper-softness-slider"
                                                />
                                            </div>
                                        </div>

                                        {/* 3. 色调 (Tone) */}
                                        <div className="settings-row settings-row--stack-mobile">
                                            <div className="settings-row-label">
                                                <span className="settings-row-title">
                                                    色调
                                                </span>
                                                <p className="settings-row-desc">
                                                    调整壁纸色彩饱和与对比，融入界面主题
                                                </p>
                                            </div>
                                            <div className="settings-row-control">
                                                <RadioGroup
                                                    value={effectivePresentation
                                                        .tone}
                                                    disabled={!hasWallpaper}
                                                    onValueChange={(v) => {
                                                        setDraftPresentation(
                                                            null,
                                                        );
                                                        updatePresentation({
                                                            tone:
                                                                v as WallpaperTone,
                                                        });
                                                    }}
                                                    aria-label="壁纸色调"
                                                    data-testid="wallpaper-tone-group"
                                                >
                                                    {WALLPAPER_TONE_STAGES.map((
                                                        stage,
                                                    ) => (
                                                        <RadioGroupItem
                                                            key={stage.id}
                                                            value={stage.id}
                                                            aria-label={stage
                                                                .label}
                                                        >
                                                            {stage.label}
                                                        </RadioGroupItem>
                                                    ))}
                                                </RadioGroup>
                                            </div>
                                        </div>

                                        {/* 4. 动态背景 (Motion) */}
                                        <div className="settings-row settings-row--stack-mobile">
                                            <div className="settings-row-label">
                                                <span className="settings-row-title">
                                                    动态背景
                                                </span>
                                                <p className="settings-row-desc">
                                                    {activeMotion === "ambient"
                                                        ? "柔和光影在壁纸上缓慢流动"
                                                        : activeMotion ===
                                                                "drift"
                                                        ? "壁纸沿画面缓慢移动"
                                                        : activeMotion ===
                                                                "zoom"
                                                        ? "壁纸以镜头感缓慢推进"
                                                        : "选择背景动态模式，为桌面增添适度生命力"}
                                                </p>
                                                {reducedMotion &&
                                                    isMotionActive && (
                                                    <p
                                                        className="settings-row-desc settings-row-desc--notice"
                                                        data-testid="wallpaper-reduced-motion-notice"
                                                    >
                                                        系统已启用“减少动态效果”，动态预览已静止。
                                                    </p>
                                                )}
                                            </div>
                                            <div className="settings-row-control">
                                                <RadioGroup
                                                    value={activeMotion}
                                                    onValueChange={(v) => {
                                                        if (hasWallpaper) {
                                                            setDraftPresentation(
                                                                (prev) => ({
                                                                    ...(prev ??
                                                                        currentPresentation),
                                                                    motion:
                                                                        v as WallpaperMotion,
                                                                }),
                                                            );
                                                            updatePresentation({
                                                                motion:
                                                                    v as WallpaperMotion,
                                                            });
                                                        } else {
                                                            setDraftCanvasMotion(
                                                                v as CanvasMotion,
                                                            );
                                                            void setAppearance({
                                                                canvasMotion:
                                                                    v as CanvasMotion,
                                                            });
                                                        }
                                                    }}
                                                    aria-label="动态背景"
                                                    data-testid="wallpaper-motion-group"
                                                >
                                                    {(hasWallpaper
                                                        ? WALLPAPER_MOTION_STAGES
                                                        : CANVAS_MOTION_STAGES)
                                                        .map((stage) => (
                                                            <RadioGroupItem
                                                                key={stage.id}
                                                                value={stage.id}
                                                                aria-label={stage
                                                                    .label}
                                                            >
                                                                {stage.label}
                                                            </RadioGroupItem>
                                                        ))}
                                                </RadioGroup>
                                            </div>
                                        </div>

                                        {/* 5. 动态程度 (Motion level) */}
                                        {isMotionActive && (
                                            <div className="settings-row settings-row--stack-mobile">
                                                <div className="settings-row-label">
                                                    <div className="flex justify-between items-center sm:block">
                                                        <span className="settings-row-title">
                                                            动态程度
                                                        </span>
                                                        <span className="sm:hidden text-xs text-[var(--muted)] font-medium">
                                                            {motionLevelText}
                                                        </span>
                                                    </div>
                                                    <p className="settings-row-desc">
                                                        调整背景运动的视觉幅度
                                                    </p>
                                                </div>
                                                <div className="settings-row-control">
                                                    <RadioGroup
                                                        variant="segmented"
                                                        value={activeMotionLevel}
                                                        onValueChange={(v) => {
                                                            const nextLevel =
                                                                v as WallpaperMotionLevel;
                                                            if (hasWallpaper) {
                                                                setDraftPresentation(
                                                                    null,
                                                                );
                                                                updatePresentation(
                                                                    {
                                                                        motionLevel:
                                                                            nextLevel,
                                                                    },
                                                                );
                                                            } else {
                                                                setDraftCanvasMotionLevel(
                                                                    null,
                                                                );
                                                                void setAppearance(
                                                                    {
                                                                        canvasMotionLevel:
                                                                            nextLevel,
                                                                    },
                                                                );
                                                            }
                                                        }}
                                                        aria-label="动态程度"
                                                        data-testid="wallpaper-motion-level-group"
                                                    >
                                                        {WALLPAPER_MOTION_LEVEL_STAGES
                                                            .map((stage) => (
                                                                <RadioGroupItem
                                                                    key={stage
                                                                        .id}
                                                                    value={stage
                                                                        .id}
                                                                    aria-label={stage
                                                                        .label}
                                                                >
                                                                    {stage
                                                                        .label}
                                                                </RadioGroupItem>
                                                            ))}
                                                    </RadioGroup>
                                                </div>
                                            </div>
                                        )}
                                    </SettingsCard>
                                </SettingsSection>

                                <SettingsSection
                                    title="动态桌面场景"
                                    description="叠加在壁纸之上的底部装饰，仅在首页显示，不影响搜索、应用与窗口布局。"
                                >
                                    <SettingsCard>
                                        <RadioGroup
                                            value={appearance.desktopScene}
                                            onValueChange={(next) => {
                                                void setAppearance({
                                                    desktopScene:
                                                        normalizeDesktopScene(
                                                            next,
                                                        ),
                                                });
                                            }}
                                            aria-label="动态桌面场景"
                                            className="settings-scene-options"
                                            data-testid="desktop-scene-group"
                                        >
                                            {DESKTOP_SCENE_OPTIONS.map(
                                                (option) => {
                                                    const Preview =
                                                        SCENE_PREVIEWS[
                                                            option.id
                                                        ];
                                                    return (
                                                        <RadioGroupItem
                                                            key={option.id}
                                                            value={option.id}
                                                            aria-label={option
                                                                .label}
                                                            className="settings-scene-option"
                                                            data-testid={`desktop-scene-${option.id}`}
                                                        >
                                                            <span className="settings-scene-preview">
                                                                <Preview />
                                                            </span>
                                                            <span className="settings-scene-option__text">
                                                                <span className="settings-row-title">
                                                                    {option
                                                                        .label}
                                                                </span>
                                                                <span className="settings-row-desc">
                                                                    {option
                                                                        .description}
                                                                </span>
                                                            </span>
                                                        </RadioGroupItem>
                                                    );
                                                },
                                            )}
                                        </RadioGroup>
                                    </SettingsCard>
                                </SettingsSection>
                            </div>
                        )}
                        {tab === "ai" && (
                            <div className="settings-content">
                                <SettingsSection
                                    title="AI 问答工作区"
                                    description="智能 AI 问答工作区与偏好设置"
                                >
                                    <SettingsActionCard
                                        title="AI 问答工作区"
                                        description="拥有专属的独立对话空间，只在显式选择后响应，不接管普通搜索。"
                                    >
                                        <Button
                                            variant="outline"
                                            render={<Link to={routes.ask} />}
                                        >
                                            打开 AI 问答
                                        </Button>
                                    </SettingsActionCard>
                                </SettingsSection>
                                <AiSettings />
                            </div>
                        )}
                        {tab === "data" && (
                            <div className="settings-content">
                                <SettingsSection
                                    title="同步"
                                    description="登录后将偏好设置、网站书签与便签实时同步到您的账户"
                                >
                                    <SettingsActionCard
                                        title={user
                                            ? "云端账户"
                                            : "本地访客模式"}
                                        description={user
                                            ? `已连接 ${user.displayName}，数据已双向同步。`
                                            : "访客偏好仅在当前页面有效，登录后个人内容由服务端同步。"}
                                    >
                                        <span
                                            className="settings-action-card__badge"
                                            data-status={user
                                                ? "synced"
                                                : "guest"}
                                        >
                                            {user ? "已同步" : "未登录"}
                                        </span>
                                    </SettingsActionCard>
                                </SettingsSection>
                                <SettingsSection
                                    title="数据管理"
                                    description="管理已删除的项目或实验性特性"
                                >
                                    {user && (
                                        <SettingsActionCard
                                            title="回收站"
                                            description="查看或彻底清理已删除的网站和便签"
                                        >
                                            <Button
                                                variant="outline"
                                                render={
                                                    <Link to={routes.trash} />
                                                }
                                            >
                                                打开回收站
                                            </Button>
                                        </SettingsActionCard>
                                    )}
                                    <SettingsActionCard
                                        title="Design Lab"
                                        description="诊断与测试实验性的界面配置和组件预览"
                                    >
                                        <Button
                                            variant="outline"
                                            render={
                                                <Link to={routes.designLab} />
                                            }
                                        >
                                            打开 Design Lab
                                        </Button>
                                    </SettingsActionCard>
                                </SettingsSection>
                            </div>
                        )}
                        {tab === "shortcuts" && (
                            <div className="settings-content">
                                <ShortcutsSettings />
                            </div>
                        )}
                    </section>
                </div>
            </PageShell>
            {/* Composition & Preview Dialog */}
            <WallpaperCompositionDialog
                open={compositionTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setCompositionTarget(null);
                }}
                source={compositionTarget?.url ?? null}
                initialComposition={compositionTarget
                    ? {
                        focalX: compositionTarget.focalX ?? 0.5,
                        focalY: compositionTarget.focalY ?? 0.5,
                    }
                    : null}
                presentation={compositionTarget
                    ? wallpaperPresentation(
                        compositionTarget.url,
                        appearance.wallpaperPresentations,
                    )
                    : null}
                isCurrent={compositionTarget
                    ? appearance.wallpaper === compositionTarget.url
                    : false}
                onSaveComposition={handleSaveComposition}
                onSetAsCurrent={handleSetCurrentWithFocal}
            />

            {/* Delete Confirmation Alert Dialog */}
            <AlertDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open && !isDeleting) setDeleteTarget(null);
                }}
            >
                <AlertDialogContent data-testid="wallpaper-delete-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {deleteTarget &&
                                    appearance.wallpaper === deleteTarget.url
                                ? "移除当前壁纸？"
                                : "删除壁纸？"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget &&
                                    appearance.wallpaper === deleteTarget.url
                                ? "该图片正在使用中。删除后将同时恢复默认背景，图片也会从最近上传中永久移除。"
                                : "该图片将从最近上传中永久移除。此操作无法撤销。"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            disabled={isDeleting}
                            data-testid="wallpaper-delete-cancel-btn"
                        >
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isDeleting}
                            variant="destructive"
                            onClick={handleConfirmDelete}
                            data-testid="wallpaper-delete-confirm-btn"
                        >
                            {deleteTarget &&
                                    appearance.wallpaper === deleteTarget.url
                                ? "删除并恢复默认背景"
                                : "删除"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Toast feedback */}
            {toastMessage && (
                <StatusBanner
                    tone="success"
                    presentation="floating"
                    data-testid="wallpaper-toast"
                >
                    {toastMessage}
                </StatusBanner>
            )}
        </>
    );
}
