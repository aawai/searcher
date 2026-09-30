import { type ReactNode, useEffect, useRef, useState } from "react";
import { PageShell } from "../components/searcher/PageShell.tsx";
import {
    Section,
    SettingsCard,
    SettingsRow,
} from "../components/searcher/semantic.tsx";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { routes, type SettingsTab, settingsTab } from "./routes.ts";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { NotFoundPage } from "./NotFoundPage.tsx";
import {
    Palette,
    RefreshCw,
    RotateCcw,
    Search,
    Sparkles,
    Upload,
} from "lucide-react";
import { type EngineId, SEARCH_ENGINES } from "@shared/engines.ts";
import { ACCENTS } from "@shared/contracts.ts";
import { Button } from "../components/ui/button.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog.tsx";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.tsx";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { Slider } from "../components/ui/slider.tsx";
import { Separator } from "../components/ui/separator.tsx";
import { Input } from "../components/ui/input.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../components/ui/native-select.tsx";
import { api } from "../lib/api.ts";
import { AiSettings } from "./AiSettings.tsx";
import { type Appearance, useAppState } from "./state.tsx";
import { LayoutModeSelector } from "../features/home-layouts/LayoutModeSelector.tsx";
import "./settings.css";

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

export function SettingsPage() {
    const { appearance, setAppearance, user } = useAppState();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [wallpaperHistory, setWallpaperHistory] = useState<string[]>([]);
    const [previewWallpaper, setPreviewWallpaper] = useState<string | null>(
        null,
    );
    const [uploadingWallpaper, setUploadingWallpaper] = useState(false);

    useEffect(() => {
        setWallpaperHistory([]);
        if (!user) return;
        let cancelled = false;
        void api<{ url: string }[]>("/api/wallpaper").then((records) => {
            if (!cancelled) {
                setWallpaperHistory((current) =>
                    [
                        ...current,
                        ...records.map((record) => record.url).filter((url) =>
                            !current.includes(url)
                        ),
                    ].slice(0, 5)
                );
            }
        }).catch(() => {
            if (!cancelled) alert("无法加载已上传的图片");
        });
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    async function handleWallpaperUpload(file: File) {
        if (file.size > 5 * 1024 * 1024) {
            alert("壁纸文件大小不能超过 5MB");
            return;
        }
        setUploadingWallpaper(true);
        try {
            let url: string;
            if (user) {
                const form = new FormData();
                form.append("image", file);
                url = (await api<{ url: string }>("/api/wallpaper", {
                    method: "POST",
                    body: form,
                })).url;
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
            }
            set("wallpaper", url);
            setWallpaperHistory((current) =>
                [url, ...current.filter((item) => item !== url)].slice(0, 5)
            );
        } catch (error) {
            alert(error instanceof Error ? error.message : "上传壁纸失败");
        } finally {
            setUploadingWallpaper(false);
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
                            <div className="settings-section">
                                <Section title="搜索引擎与打开方式">
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
                                </Section>
                            </div>
                        )}
                        {tab === "appearance" && (
                            <div className="settings-section">
                                <Section title="主题与配色">
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
                                </Section>

                                <Section title="主页与快捷入口">
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
                                </Section>

                                <Section
                                    title="壁纸与背景效果"
                                    actions={
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                void setAppearance({
                                                    wallpaper: "",
                                                    mask: 0.75,
                                                    blur: 0,
                                                    grayscale: 0,
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
                                            </div>
                                            <div className="settings-row-control w-full sm:w-auto flex-1 max-w-[380px] flex-col items-stretch">
                                                <div className="flex gap-2 items-center w-full">
                                                    <input
                                                        type="file"
                                                        ref={fileInputRef}
                                                        className="hidden"
                                                        accept="image/png,image/jpeg,image/webp,image/avif"
                                                        onChange={(e) => {
                                                            const file = e
                                                                .target
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
                                                        className="shrink-0"
                                                    >
                                                        <Upload size={16} />
                                                    </Button>
                                                    <Input
                                                        id="wallpaper-input"
                                                        placeholder={appearance
                                                                .wallpaper
                                                                .startsWith(
                                                                    "data:",
                                                                )
                                                            ? "当前已使用本地壁纸图片"
                                                            : "输入图片 HTTPS 地址或 CSS 渐变"}
                                                        value={appearance
                                                                .wallpaper
                                                                .startsWith(
                                                                    "data:",
                                                                )
                                                            ? ""
                                                            : appearance
                                                                .wallpaper}
                                                        onChange={(e) =>
                                                            set(
                                                                "wallpaper",
                                                                e.target.value,
                                                            )}
                                                        className="flex-1 min-w-0"
                                                    />
                                                    {appearance.wallpaper && (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() =>
                                                                set(
                                                                    "wallpaper",
                                                                    "",
                                                                )}
                                                            title="清除壁纸"
                                                            aria-label="清除壁纸"
                                                            className="shrink-0 text-[var(--muted)]"
                                                        >
                                                            <RotateCcw
                                                                size={14}
                                                            />
                                                        </Button>
                                                    )}
                                                </div>
                                                {wallpaperHistory.length > 0 &&
                                                    (
                                                        <div
                                                            className="wallpaper-history"
                                                            aria-label="最近上传的图片"
                                                        >
                                                            <span className="settings-row-desc">
                                                                最近上传 · 保留
                                                                5 张
                                                            </span>
                                                            <div className="wallpaper-history__grid">
                                                                {wallpaperHistory
                                                                    .map((
                                                                        url,
                                                                        index,
                                                                    ) => (
                                                                        <button
                                                                            key={url}
                                                                            type="button"
                                                                            className="wallpaper-history__item"
                                                                            aria-label={`查看第 ${
                                                                                index +
                                                                                1
                                                                            } 张已上传图片`}
                                                                            aria-current={appearance
                                                                                    .wallpaper ===
                                                                                    url
                                                                                ? "true"
                                                                                : undefined}
                                                                            onClick={() =>
                                                                                setPreviewWallpaper(
                                                                                    url,
                                                                                )}
                                                                        >
                                                                            <img
                                                                                src={url}
                                                                                alt=""
                                                                                loading="lazy"
                                                                            />
                                                                        </button>
                                                                    ))}
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
                                    </SettingsCard>
                                </Section>
                            </div>
                        )}
                        {tab === "ai" && (
                            <div className="settings-section">
                                <div className="settings-subgroup">
                                    <div className="settings-section-head">
                                        <p className="muted m-0">
                                            智能 AI 问答工作区与偏好设置
                                        </p>
                                    </div>
                                    <div className="settings-action-card">
                                        <div className="settings-action-card__content">
                                            <strong>
                                                AI 问答工作区
                                            </strong>
                                            <p>
                                                AI
                                                拥有专属的独立对话空间，只在显式选择后响应，不接管普通搜索。
                                            </p>
                                        </div>
                                        <Link
                                            className="button button--outline settings-action-card__action"
                                            to={routes.ask}
                                        >
                                            打开 AI 问答
                                        </Link>
                                    </div>
                                </div>

                                <Separator orientation="horizontal" />

                                <div className="settings-subgroup">
                                    <AiSettings />
                                </div>
                            </div>
                        )}
                        {tab === "data" && (
                            <div className="settings-section">
                                <div className="settings-subgroup">
                                    <div className="settings-section-head">
                                        <h3>同步</h3>
                                        <p>
                                            登录后将偏好设置、网站书签与便签实时同步到您的账户
                                        </p>
                                    </div>
                                    <div className="settings-action-card">
                                        <div className="settings-action-card__content">
                                            <strong>
                                                {user
                                                    ? "已登录账户"
                                                    : "本地访客模式"}
                                            </strong>
                                            <p>
                                                {user
                                                    ? `已连接为 ${user.displayName}，数据已双向同步`
                                                    : "访客偏好仅在当前页面有效，登录后个人内容由服务端同步。"}
                                            </p>
                                        </div>
                                        <span
                                            className="settings-action-card__badge"
                                            style={{
                                                background: user
                                                    ? "color-mix(in srgb, var(--success) 16%, var(--surface))"
                                                    : "var(--surface-soft)",
                                                color: user
                                                    ? "var(--success)"
                                                    : "var(--muted)",
                                            }}
                                        >
                                            {user ? "已同步" : "未登录"}
                                        </span>
                                    </div>
                                </div>

                                <Separator orientation="horizontal" />

                                <div className="settings-subgroup">
                                    <div className="settings-section-head">
                                        <h3>数据管理</h3>
                                        <p>管理已删除的项目或实验性特性</p>
                                    </div>
                                    <div className="grid gap-3">
                                        {user && (
                                            <div className="settings-action-card">
                                                <div className="settings-action-card__content">
                                                    <strong>
                                                        回收站
                                                    </strong>
                                                    <p>
                                                        查看或彻底清理已删除的网站和便签
                                                    </p>
                                                </div>
                                                <Link
                                                    to={routes.trash}
                                                    className="button button--subtle settings-action-card__action"
                                                >
                                                    打开回收站
                                                </Link>
                                            </div>
                                        )}
                                        <div className="settings-action-card">
                                            <div className="settings-action-card__content">
                                                <strong>
                                                    Design Lab
                                                </strong>
                                                <p>
                                                    管理与测试实验性的界面配置和组件预览
                                                </p>
                                            </div>
                                            <Link
                                                to={routes.designLab}
                                                className="button button--subtle settings-action-card__action"
                                            >
                                                打开 Design Lab
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </PageShell>
            <Dialog
                open={previewWallpaper !== null}
                onOpenChange={(open) => {
                    if (!open) setPreviewWallpaper(null);
                }}
            >
                <DialogContent className="wallpaper-preview">
                    <DialogHeader>
                        <DialogTitle>预览已上传图片</DialogTitle>
                        <DialogDescription>
                            确认后将其设为当前壁纸，预览不会修改设置。
                        </DialogDescription>
                    </DialogHeader>
                    {previewWallpaper && (
                        <img
                            src={previewWallpaper}
                            alt="壁纸大图预览"
                            className="wallpaper-preview__image"
                        />
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPreviewWallpaper(null)}
                        >
                            关闭
                        </Button>
                        <Button
                            type="button"
                            disabled={previewWallpaper === appearance.wallpaper}
                            onClick={() => {
                                if (previewWallpaper) {
                                    set("wallpaper", previewWallpaper);
                                }
                                setPreviewWallpaper(null);
                            }}
                        >
                            设为壁纸
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
