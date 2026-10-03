import {
    ACCENTS,
    type AmbientMotionMode,
    DEFAULT_AMBIENT_MOTION_MODE,
    DEFAULT_AMBIENT_MOTION_STRENGTH,
    DEFAULT_WALLPAPER_GLOW_STRENGTH,
    DEFAULT_WALLPAPER_MASK,
} from "@shared/contracts.ts";
import { type EngineId, SEARCH_ENGINES } from "@shared/engines.ts";
import {
    parseWallpaperSource,
    type WallpaperComposition,
} from "@shared/wallpaper.ts";
import {
    Check,
    MoreVertical,
    Palette,
    RefreshCw,
    RotateCcw,
    Search,
    SlidersHorizontal,
    Sparkles,
    Upload,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { SettingsCard, SettingsRow } from "../components/searcher/semantic.tsx";
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
import { LayoutModeSelector } from "../features/home-layouts/LayoutModeSelector.tsx";
import { api } from "../lib/api.ts";
import { AiSettings } from "./AiSettings.tsx";
import { NotFoundPage } from "./NotFoundPage.tsx";
import { routes, type SettingsTab, settingsTab } from "./routes.ts";
import "./settings.css";
import { SettingsActionCard, SettingsSection } from "./SettingsPrimitives.tsx";
import { type Appearance, useAppState } from "./state.tsx";

type Tab = SettingsTab;

const tabs: Record<Tab, { label: string; icon: typeof Search }> = {
    search: { label: "搜索", icon: Search },
    appearance: { label: "外观", icon: Palette },
    ai: { label: "AI 问答", icon: Sparkles },
    data: { label: "数据与同步", icon: RefreshCw },
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
            <NativeSelect
                value={value}
                onChange={(e) => select(e.target.value as T)}
                className="settings-choice-select"
                aria-label={title}
            >
                {values.map(([id, label]) => (
                    <NativeSelectOption key={id} value={id}>
                        {label}
                    </NativeSelectOption>
                ))}
            </NativeSelect>
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
                value={value}
                onValueChange={(next) => select(next as T)}
                className="settings-swatch-grid"
                aria-label={title}
            >
                {values.map(([id, label]) => (
                    <RadioGroupItem
                        key={id}
                        value={id}
                        aria-label={label}
                        className="settings-swatch-option"
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
function getAppearanceCompositions(
    appearance: unknown,
): Record<string, WallpaperComposition> {
    if (
        appearance &&
        typeof appearance === "object" &&
        "wallpaperCompositions" in appearance &&
        typeof appearance.wallpaperCompositions === "object" &&
        appearance.wallpaperCompositions !== null
    ) {
        return appearance.wallpaperCompositions as Record<
            string,
            WallpaperComposition
        >;
    }
    return {};
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
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [wallpaperHistory, setWallpaperHistory] = useState<
        WallpaperHistoryRecord[]
    >([]);
    const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
    const [wallpaperDraft, setWallpaperDraft] = useState<string>(
        appearance.wallpaper.startsWith("data:") ? "" : appearance.wallpaper,
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
        if (!appearance.wallpaper.startsWith("data:")) {
            setWallpaperDraft(appearance.wallpaper);
        } else {
            setWallpaperDraft("");
        }
        setDraftError(null);
    }, [appearance.wallpaper]);

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
            const currentComps = getAppearanceCompositions(appearance);
            const nextComps = {
                ...currentComps,
                [url]: { focalX: 0.5, focalY: 0.5 },
            };
            await setAppearance({
                wallpaper: url,
                wallpaperCompositions: nextComps,
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
        if (!trimmed) {
            if (appearance.wallpaper) {
                try {
                    await setAppearance({ wallpaper: "" });
                    showToast("已停止使用当前壁纸，恢复默认背景");
                } catch {
                    setDraftError("同步壁纸失败，请重试");
                }
            }
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
            await setAppearance({ wallpaper: parsed.value });
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
            const currentComps = getAppearanceCompositions(appearance);
            const focal = currentComps[record.url] ?? {
                focalX: record.focalX ?? 0.5,
                focalY: record.focalY ?? 0.5,
            };
            const nextComps = { ...currentComps, [record.url]: focal };
            await setAppearance({
                wallpaper: record.url,
                wallpaperCompositions: nextComps,
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
                // Backend PATCH updated asset record & preference; adopt locally without duplicate PATCH
                const currentComps = getAppearanceCompositions(appearance);
                const nextComps = { ...currentComps, [target.url]: focal };
                await setAppearance(
                    { wallpaperCompositions: nextComps },
                    { sync: false },
                );
            } else {
                const isCurrent = appearance.wallpaper === target.url;
                const currentComps = getAppearanceCompositions(appearance);
                const nextComps = { ...currentComps, [target.url]: focal };
                await setAppearance(
                    { wallpaperCompositions: nextComps },
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
            const currentComps = getAppearanceCompositions(appearance);
            const nextComps = { ...currentComps, [target.url]: focal };
            await setAppearance({
                wallpaper: target.url,
                wallpaperCompositions: nextComps,
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
            // Purge deleted asset from wallpaperCompositions with sync: false
            const currentComps = getAppearanceCompositions(appearance);
            const nextComps = { ...currentComps };
            delete nextComps[target.url];
            if (isCurrent) {
                await setAppearance(
                    { wallpaper: "", wallpaperCompositions: nextComps },
                    { sync: false },
                );
                showToast("壁纸已删除，已恢复默认背景");
            } else {
                await setAppearance(
                    { wallpaperCompositions: nextComps },
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
            <PageShell archetype="utility" className="page">
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
                                                    显示网站名称
                                                </span>
                                                <p className="settings-row-desc">
                                                    在桌面或快捷列表中展示网站文字标签
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
                                                    mask:
                                                        DEFAULT_WALLPAPER_MASK,
                                                    blur: 0,
                                                    grayscale: 0,
                                                    wallpaperGlowStrength:
                                                        DEFAULT_WALLPAPER_GLOW_STRENGTH,
                                                    ambientMotionMode:
                                                        DEFAULT_AMBIENT_MOTION_MODE,
                                                    ambientMotionStrength:
                                                        DEFAULT_AMBIENT_MOTION_STRENGTH,
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
                                        <div className="settings-row settings-row--stack-mobile wallpaper-settings-row">
                                            <div className="settings-row-label">
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
                                            <div className="settings-row-control w-full sm:w-auto flex-1 max-w-[480px] flex-col items-stretch">
                                                <div className="wallpaper-input-container">
                                                    <div className="wallpaper-input-row">
                                                        <input
                                                            type="file"
                                                            ref={fileInputRef}
                                                            className="hidden"
                                                            accept="image/png,image/jpeg,image/webp,image/avif"
                                                            data-testid="wallpaper-file-input"
                                                            onChange={(e) => {
                                                                const file = e
                                                                    .target
                                                                    .files?.[0];
                                                                if (file) {
                                                                    void handleWallpaperUpload(
                                                                        file,
                                                                    );
                                                                }
                                                                e.target.value =
                                                                    "";
                                                            }}
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="icon"
                                                            onClick={() =>
                                                                fileInputRef
                                                                    .current
                                                                    ?.click()}
                                                            disabled={uploadingWallpaper}
                                                            title="上传本地图片"
                                                            aria-label="上传本地图片"
                                                            className="shrink-0"
                                                            data-testid="wallpaper-upload-btn"
                                                        >
                                                            <Upload size={16} />
                                                        </Button>
                                                        <Input
                                                            id="wallpaper-input"
                                                            data-testid="wallpaper-input"
                                                            placeholder={appearance
                                                                    .wallpaper
                                                                    .startsWith(
                                                                        "data:",
                                                                    )
                                                                ? "当前已使用本地壁纸图片"
                                                                : "输入图片 HTTPS 地址或 CSS 渐变"}
                                                            value={wallpaperDraft}
                                                            onChange={(e) => {
                                                                setWallpaperDraft(
                                                                    e.target
                                                                        .value,
                                                                );
                                                                setDraftError(
                                                                    null,
                                                                );
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (
                                                                    e.key ===
                                                                        "Enter"
                                                                ) {
                                                                    e.preventDefault();
                                                                    void handleApplyDraft();
                                                                }
                                                            }}
                                                            className="flex-1 min-w-0"
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={() =>
                                                                void handleApplyDraft()}
                                                            disabled={isApplyingDraft ||
                                                                wallpaperDraft
                                                                        .trim() ===
                                                                    appearance
                                                                        .wallpaper}
                                                            data-testid="wallpaper-apply-btn"
                                                        >
                                                            应用
                                                        </Button>
                                                        {appearance.wallpaper &&
                                                            (
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        void handleClearCurrentWallpaper()}
                                                                    title="停止使用当前壁纸"
                                                                    aria-label="停止使用当前壁纸"
                                                                    className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)] gap-1"
                                                                    data-testid="wallpaper-clear-btn"
                                                                >
                                                                    <RotateCcw
                                                                        size={14}
                                                                    />
                                                                    <span>
                                                                        停止使用
                                                                    </span>
                                                                </Button>
                                                            )}
                                                    </div>
                                                    {draftError && (
                                                        <p
                                                            className="wallpaper-input-error"
                                                            role="alert"
                                                        >
                                                            {draftError}
                                                        </p>
                                                    )}
                                                    {appearance.wallpaper && (
                                                        <div className="wallpaper-top-actions">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => {
                                                                    const currentComps =
                                                                        getAppearanceCompositions(
                                                                            appearance,
                                                                        );
                                                                    const focal =
                                                                        currentComps[
                                                                            appearance
                                                                                .wallpaper
                                                                        ] ?? {
                                                                            focalX:
                                                                                0.5,
                                                                            focalY:
                                                                                0.5,
                                                                        };
                                                                    setCompositionTarget(
                                                                        {
                                                                            id: "current",
                                                                            url: appearance
                                                                                .wallpaper,
                                                                            focalX:
                                                                                focal
                                                                                    .focalX,
                                                                            focalY:
                                                                                focal
                                                                                    .focalY,
                                                                        },
                                                                    );
                                                                }}
                                                                data-testid="wallpaper-current-adjust-focal-btn"
                                                                className="gap-1.5"
                                                            >
                                                                <SlidersHorizontal
                                                                    size={14}
                                                                />
                                                                <span>
                                                                    调整当前壁纸构图
                                                                </span>
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>

                                                {wallpaperHistory.length > 0 &&
                                                    (
                                                        <div
                                                            className="wallpaper-history"
                                                            data-testid="wallpaper-history"
                                                            aria-label="最近上传的图片"
                                                        >
                                                            <span className="settings-row-desc">
                                                                最近上传 · 保留
                                                                5 张
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
                                        </div>
                                        <div className="settings-row settings-row--stack-mobile">
                                            <div className="settings-row-label">
                                                <div className="flex justify-between items-center sm:block">
                                                    <span className="settings-row-title">
                                                        遮罩不透明度
                                                    </span>
                                                    <span className="sm:hidden text-xs text-[var(--muted)] font-medium">
                                                        {Math.round(
                                                            appearance.mask *
                                                                100,
                                                        )}%
                                                    </span>
                                                </div>
                                                <p className="settings-row-desc">
                                                    覆盖在壁纸上的背景遮罩浓度
                                                </p>
                                            </div>
                                            <div className="settings-row-control flex flex-col gap-1 w-full sm:w-60">
                                                <div className="hidden sm:flex justify-end text-xs text-[var(--muted)] font-medium mb-1">
                                                    {Math.round(
                                                        appearance.mask * 100,
                                                    )}%
                                                </div>
                                                <Slider
                                                    min={0}
                                                    max={0.8}
                                                    step={0.05}
                                                    value={appearance.mask}
                                                    onValueChange={(v) =>
                                                        set(
                                                            "mask",
                                                            typeof v ===
                                                                    "number"
                                                                ? v
                                                                : v[0],
                                                        )}
                                                    aria-label="遮罩不透明度"
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>
                                        <div className="settings-row settings-row--stack-mobile">
                                            <div className="settings-row-label">
                                                <div className="flex justify-between items-center sm:block">
                                                    <span className="settings-row-title">
                                                        模糊半径
                                                    </span>
                                                    <span className="sm:hidden text-xs text-[var(--muted)] font-medium">
                                                        {appearance.blur}px
                                                    </span>
                                                </div>
                                                <p className="settings-row-desc">
                                                    壁纸背景的高斯模糊程度
                                                </p>
                                            </div>
                                            <div className="settings-row-control flex flex-col gap-1 w-full sm:w-60">
                                                <div className="hidden sm:flex justify-end text-xs text-[var(--muted)] font-medium mb-1">
                                                    {appearance.blur}px
                                                </div>
                                                <Slider
                                                    min={0}
                                                    max={24}
                                                    step={1}
                                                    value={appearance.blur}
                                                    onValueChange={(v) =>
                                                        set(
                                                            "blur",
                                                            typeof v ===
                                                                    "number"
                                                                ? v
                                                                : v[0],
                                                        )}
                                                    aria-label="模糊半径"
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>
                                        <div className="settings-row settings-row--stack-mobile">
                                            <div className="settings-row-label">
                                                <div className="flex justify-between items-center sm:block">
                                                    <span className="settings-row-title">
                                                        灰度滤镜
                                                    </span>
                                                    <span className="sm:hidden text-xs text-[var(--muted)] font-medium">
                                                        {Math.round(
                                                            appearance
                                                                .grayscale *
                                                                100,
                                                        )}%
                                                    </span>
                                                </div>
                                                <p className="settings-row-desc">
                                                    将壁纸转换为黑白灰度
                                                </p>
                                            </div>
                                            <div className="settings-row-control flex flex-col gap-1 w-full sm:w-60">
                                                <div className="hidden sm:flex justify-end text-xs text-[var(--muted)] font-medium mb-1">
                                                    {Math.round(
                                                        appearance.grayscale *
                                                            100,
                                                    )}%
                                                </div>
                                                <Slider
                                                    min={0}
                                                    max={1}
                                                    step={0.05}
                                                    value={appearance.grayscale}
                                                    onValueChange={(v) =>
                                                        set(
                                                            "grayscale",
                                                            typeof v ===
                                                                    "number"
                                                                ? v
                                                                : v[0],
                                                        )}
                                                    aria-label="灰度比例"
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>
                                        <div className="settings-row settings-row--stack-mobile">
                                            <div className="settings-row-label">
                                                <div className="flex justify-between items-center sm:block">
                                                    <span className="settings-row-title">
                                                        主题光晕强度
                                                    </span>
                                                    <span className="sm:hidden text-xs text-[var(--muted)] font-medium">
                                                        {Math.round(
                                                            (appearance
                                                                .wallpaperGlowStrength ??
                                                                DEFAULT_WALLPAPER_GLOW_STRENGTH) *
                                                                100,
                                                        )}%
                                                    </span>
                                                </div>
                                                <p className="settings-row-desc">
                                                    控制搜索页主题色环境光的明显程度
                                                </p>
                                            </div>
                                            <div className="settings-row-control flex flex-col gap-1 w-full sm:w-60">
                                                <div className="hidden sm:flex justify-end text-xs text-[var(--muted)] font-medium mb-1">
                                                    {Math.round(
                                                        (appearance
                                                            .wallpaperGlowStrength ??
                                                            DEFAULT_WALLPAPER_GLOW_STRENGTH) *
                                                            100,
                                                    )}%
                                                </div>
                                                <Slider
                                                    min={0}
                                                    max={0.30}
                                                    step={0.01}
                                                    value={appearance
                                                        .wallpaperGlowStrength ??
                                                        DEFAULT_WALLPAPER_GLOW_STRENGTH}
                                                    onValueChange={(v) =>
                                                        set(
                                                            "wallpaperGlowStrength",
                                                            typeof v ===
                                                                    "number"
                                                                ? v
                                                                : v[0],
                                                        )}
                                                    aria-label="主题光晕强度"
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>
                                        <div className="settings-row settings-row--stack-mobile">
                                            <div className="settings-row-label">
                                                <span className="settings-row-title">
                                                    动态氛围
                                                </span>
                                                <p className="settings-row-desc">
                                                    选择背景环境光的动态效果
                                                </p>
                                            </div>
                                            <div className="settings-row-control">
                                                <RadioGroup
                                                    value={appearance
                                                        .ambientMotionMode ??
                                                        DEFAULT_AMBIENT_MOTION_MODE}
                                                    onValueChange={(v) =>
                                                        set(
                                                            "ambientMotionMode",
                                                            v as AmbientMotionMode,
                                                        )}
                                                    aria-label="动态氛围"
                                                >
                                                    <RadioGroupItem
                                                        value="off"
                                                        aria-label="关闭"
                                                    >
                                                        关闭
                                                    </RadioGroupItem>
                                                    <RadioGroupItem
                                                        value="breathe"
                                                        aria-label="呼吸"
                                                    >
                                                        呼吸
                                                    </RadioGroupItem>
                                                    <RadioGroupItem
                                                        value="breathe_ripple"
                                                        aria-label="呼吸 + 涟漪"
                                                    >
                                                        呼吸 + 涟漪
                                                    </RadioGroupItem>
                                                </RadioGroup>
                                            </div>
                                        </div>
                                        <div className="settings-row settings-row--stack-mobile">
                                            <div className="settings-row-label">
                                                <div className="flex justify-between items-center sm:block">
                                                    <span className="settings-row-title">
                                                        动态强度
                                                    </span>
                                                    <span className="sm:hidden text-xs text-[var(--muted)] font-medium">
                                                        {Math.round(
                                                            (appearance
                                                                .ambientMotionStrength ??
                                                                DEFAULT_AMBIENT_MOTION_STRENGTH) *
                                                                100,
                                                        )}%
                                                    </span>
                                                </div>
                                                <p className="settings-row-desc">
                                                    控制呼吸与涟漪的可见程度
                                                </p>
                                            </div>
                                            <div className="settings-row-control flex flex-col gap-1 w-full sm:w-60">
                                                <div className="hidden sm:flex justify-end text-xs text-[var(--muted)] font-medium mb-1">
                                                    {Math.round(
                                                        (appearance
                                                            .ambientMotionStrength ??
                                                            DEFAULT_AMBIENT_MOTION_STRENGTH) *
                                                            100,
                                                    )}%
                                                </div>
                                                <Slider
                                                    min={0}
                                                    max={1}
                                                    step={0.05}
                                                    value={appearance
                                                        .ambientMotionStrength ??
                                                        DEFAULT_AMBIENT_MOTION_STRENGTH}
                                                    disabled={(appearance
                                                        .ambientMotionMode ??
                                                        DEFAULT_AMBIENT_MOTION_MODE) ===
                                                        "off"}
                                                    onValueChange={(v) =>
                                                        set(
                                                            "ambientMotionStrength",
                                                            typeof v ===
                                                                    "number"
                                                                ? v
                                                                : v[0],
                                                        )}
                                                    aria-label="动态强度"
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>
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
                    ? (getAppearanceCompositions(
                        appearance,
                    )[compositionTarget.url] ?? {
                        focalX: compositionTarget.focalX ?? 0.5,
                        focalY: compositionTarget.focalY ?? 0.5,
                    })
                    : null}
                blur={appearance.blur}
                grayscale={appearance.grayscale}
                mask={appearance.mask}
                glowStrength={appearance.wallpaperGlowStrength}
                ambientMotionMode={appearance.ambientMotionMode}
                ambientMotionStrength={appearance.ambientMotionStrength}
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
                <div
                    className="webapp-undo-toast"
                    role="status"
                    data-testid="wallpaper-toast"
                >
                    <span>{toastMessage}</span>
                </div>
            )}
        </>
    );
}
