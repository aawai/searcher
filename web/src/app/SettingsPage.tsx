import { ACCENTS, type GlassIntensity } from "@shared/contracts.ts";
import { type EngineId, SEARCH_ENGINES } from "@shared/engines.ts";
import {
    parseWallpaperSource,
    type WallpaperComposition,
} from "@shared/wallpaper.ts";
import {
    DEFAULT_WALLPAPER_PRESENTATION,
    purgeWallpaperPresentation,
    touchWallpaperPresentation,
    WALLPAPER_READABILITY_STAGES,
    type WallpaperPresentation,
    wallpaperPresentation,
    type WallpaperReadability,
} from "@shared/wallpaper-presentation.ts";
import { SettingsPresetSlider } from "../components/searcher/SettingsPresetSlider.tsx";
import { Check, ChevronRight, MoreVertical, Upload } from "lucide-react";
import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import { Link, useLocation } from "react-router-dom";
import {
    ActionGroup,
    SettingsGroup,
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
import { Badge } from "../components/ui/badge.tsx";
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
import { Switch } from "../components/ui/switch.tsx";
import { WallpaperCompositionDialog } from "../components/wallpaper/WallpaperCompositionDialog.tsx";
import { WallpaperSurface } from "../components/wallpaper/WallpaperSurface.tsx";
import { WallpaperStageContextPreview } from "../components/wallpaper/WallpaperStageContextPreview.tsx";
import { api } from "../lib/api.ts";
import { ShortcutsSettings } from "../features/shortcuts/ShortcutsSettings.tsx";
import { AiSettings } from "./AiSettings.tsx";
import { NotFoundPage } from "./NotFoundPage.tsx";
import { routes, settingsTab } from "./routes.ts";
import { SettingsShell } from "./SettingsShell.tsx";
import "./settings.css";
import { type Appearance, useAppState } from "./state.tsx";

const GLASS_CHOICES = [
    ["off", "关闭"],
    ["soft", "柔和"],
    ["regular", "标准"],
    ["clear", "通透"],
] as const satisfies readonly (readonly [GlassIntensity, string])[];

const REDUCED_TRANSPARENCY_QUERY = "(prefers-reduced-transparency: reduce)";

/** OS 的「减少透明度」偏好；它优先于用户选择的玻璃档位。 */
function useReducedTransparency(): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const media = globalThis.matchMedia(REDUCED_TRANSPARENCY_QUERY);
            media.addEventListener("change", onChange);
            return () => media.removeEventListener("change", onChange);
        },
        () => globalThis.matchMedia(REDUCED_TRANSPARENCY_QUERY).matches,
        () => false,
    );
}

function Choices<T extends string>(
    { title, description, value, values, control, select }: {
        title: string;
        description?: ReactNode;
        value: string;
        values: readonly (readonly [T, string])[];
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
            <RadioGroup
                variant="segmented"
                value={value}
                onValueChange={(next) => select(next as T)}
                aria-label={title}
            >
                {values.map(([id, label]) => (
                    <RadioGroupItem key={id} value={id}>
                        {label}
                    </RadioGroupItem>
                ))}
            </RadioGroup>
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
                        title={label}
                    >
                        <span
                            className="settings-swatch-color"
                            data-accent={id}
                            aria-hidden="true"
                        />
                    </RadioGroupItem>
                ))}
            </RadioGroup>
        );
    }
    return (
        <SettingsRow title={title} description={description}>
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
    const isAdmin = user?.role === "admin";
    const reducedTransparency = useReducedTransparency();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [wallpaperHistory, setWallpaperHistory] = useState<
        WallpaperHistoryRecord[]
    >([]);
    const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
    const currentWallpaperSource = parseWallpaperSource(appearance.wallpaper);
    const currentSourceHidden = currentWallpaperSource?.type === "uploaded" ||
        appearance.wallpaper.startsWith("data:");
    const [wallpaperDraft, setWallpaperDraft] = useState<string>(
        currentSourceHidden ? "" : appearance.wallpaper,
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
        return DEFAULT_WALLPAPER_PRESENTATION;
    }, [
        hasWallpaper,
        appearance.wallpaper,
        appearance.wallpaperPresentations,
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

    const effectivePresentation = useMemo<WallpaperPresentation>(() => {
        if (hasWallpaper) {
            return draftPresentation ?? currentPresentation;
        }
        return currentPresentation;
    }, [
        hasWallpaper,
        draftPresentation,
        currentPresentation,
    ]);

    useEffect(() => {
        setDraftPresentation(null);
    }, [
        appearance.wallpaper,
        appearance.wallpaperPresentations,
    ]);

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
                "请输入有效的图片链接（https，不含账号密码）或渐变背景",
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

    function set<K extends keyof Appearance>(key: K, value: Appearance[K]) {
        void setAppearance({ [key]: value });
    }

    if (!tab) {
        return (
            <NotFoundPage parent={{ label: "设置", to: routes.settings() }} />
        );
    }

    return (
        <>
            <SettingsShell current={tab}>
                {tab === "search" && (
                    <SettingsGroup>
                        <Choices
                            title="默认搜索引擎"
                            value={appearance.engine}
                            control="select"
                            values={SEARCH_ENGINES.map((e) =>
                                [e.id, e.label] as const
                            )}
                            select={(v) => set("engine", v as EngineId)}
                        />
                        <Choices
                            title="结果打开方式"
                            value={appearance.target}
                            control="segmented"
                            values={[
                                ["current", "当前标签页"],
                                ["new_tab", "新标签页"],
                            ] as const}
                            select={(v) => set("target", v)}
                        />
                    </SettingsGroup>
                )}
                {tab === "appearance" && (
                    <>
                        <SettingsGroup>
                            <Choices
                                title="主题"
                                value={appearance.theme}
                                control="segmented"
                                values={[
                                    ["system", "跟随系统"],
                                    ["light", "浅色"],
                                    ["dark", "深色"],
                                ] as const}
                                select={(v) => set("theme", v)}
                            />
                            <Choices
                                title="强调色"
                                value={appearance.accent}
                                control="swatches"
                                values={ACCENTS.map((a) =>
                                    [a.id, a.label] as const
                                )}
                                select={(v) => set("accent", v)}
                            />
                        </SettingsGroup>
                        <SettingsGroup title="首页">
                            <Choices
                                title="控件形状"
                                control="segmented"
                                value={appearance.shape}
                                values={[
                                    ["rounded", "圆角"],
                                    ["pill", "胶囊"],
                                ] as const}
                                select={(v) => set("shape", v)}
                            />
                            <Choices
                                title="玻璃效果"
                                description={reducedTransparency
                                    ? "系统已开启「减少透明度」，玻璃效果暂以实色显示"
                                    : undefined}
                                control="segmented"
                                value={appearance.glassIntensity}
                                values={GLASS_CHOICES}
                                select={(v) => set("glassIntensity", v)}
                            />
                            {user && (
                                <SettingsRow title="在首页显示应用">
                                    <Switch
                                        checked={appearance.showHomeApps}
                                        onCheckedChange={(checked) =>
                                            set("showHomeApps", checked)}
                                        aria-label="在首页显示应用"
                                    />
                                </SettingsRow>
                            )}
                            {(!user || appearance.showHomeApps) && (
                                <SettingsRow title="显示应用名称">
                                    <Switch
                                        checked={appearance.showAppLabels}
                                        onCheckedChange={(checked) =>
                                            set("showAppLabels", checked)}
                                        aria-label="显示应用名称"
                                    />
                                </SettingsRow>
                            )}
                        </SettingsGroup>
                        <SettingsGroup
                            title="壁纸"
                            footer={user
                                ? "单张壁纸不超过 5 MiB。"
                                : (
                                    <span data-testid="wallpaper-guest-notice">
                                        设置仅保存在此设备；登录后新上传的壁纸会同步到云端。单张壁纸不超过
                                        5 MiB。
                                    </span>
                                )}
                        >
                            <SettingsRow
                                title="壁纸来源"
                                className="settings-row--vertical"
                            >
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
                                        <Upload
                                            size="1em"
                                            className="icon-md"
                                        />
                                    </Button>
                                    <Input
                                        id="wallpaper-input"
                                        data-testid="wallpaper-input"
                                        aria-label="壁纸来源"
                                        aria-invalid={!!draftError}
                                        aria-describedby={draftError
                                            ? "wallpaper-source-error"
                                            : undefined}
                                        placeholder={currentSourceHidden
                                            ? "替换为图片链接或渐变背景"
                                            : "图片链接（https）或渐变背景"}
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
                                        onClick={() => void handleApplyDraft()}
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
                            </SettingsRow>
                            {hasWallpaper && (
                                <>
                                    <SettingsRow
                                        title="当前壁纸"
                                        className="settings-row--vertical"
                                    >
                                        <div className="wallpaper-current">
                                            <div
                                                className="wallpaper-stage"
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
                                            <ActionGroup>
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
                                                    调整构图
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() =>
                                                        void handleClearCurrentWallpaper()}
                                                    aria-label="移除当前壁纸"
                                                    data-testid="wallpaper-clear-btn"
                                                >
                                                    移除
                                                </Button>
                                            </ActionGroup>
                                        </div>
                                    </SettingsRow>
                                    <SettingsRow
                                        title="可读性"
                                        className="settings-row--vertical"
                                    >
                                        <SettingsPresetSlider
                                            stages={WALLPAPER_READABILITY_STAGES}
                                            value={effectivePresentation
                                                .readability}
                                            aria-label="可读性"
                                            testId="wallpaper-readability-slider"
                                            onChange={(v) => {
                                                setDraftPresentation(
                                                    (prev) => ({
                                                        ...(prev ??
                                                            currentPresentation),
                                                        readability:
                                                            v as WallpaperReadability,
                                                    }),
                                                );
                                            }}
                                            onCommit={(v) => {
                                                setDraftPresentation(
                                                    null,
                                                );
                                                updatePresentation({
                                                    readability:
                                                        v as WallpaperReadability,
                                                });
                                            }}
                                        />
                                    </SettingsRow>
                                </>
                            )}
                        </SettingsGroup>
                        {wallpaperHistory.length > 0 && (
                            <SettingsGroup
                                title="最近上传"
                                footer="最多保留 5 张。"
                                padded
                            >
                                <div
                                    className="wallpaper-history"
                                    data-testid="wallpaper-history"
                                    role="group"
                                    aria-label="最近上传的图片"
                                >
                                    <div className="wallpaper-history__grid">
                                        {wallpaperHistory.map(
                                            (record, index) => {
                                                const isCurrent = appearance
                                                    .wallpaper ===
                                                    record.url;
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
                                                                className="wallpaper-card__thumbnail"
                                                                src={record
                                                                    .url}
                                                                alt={`壁纸 ${
                                                                    index +
                                                                    1
                                                                }`}
                                                                loading="lazy"
                                                            />
                                                        </button>
                                                        {isCurrent &&
                                                            (
                                                                <div
                                                                    className="wallpaper-card__current-badge"
                                                                    data-testid="wallpaper-current-badge"
                                                                >
                                                                    <Check
                                                                        size="1em"
                                                                        className="icon-sm shrink-0"
                                                                    />
                                                                    <span>
                                                                        当前壁纸
                                                                    </span>
                                                                </div>
                                                            )}
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
                                                                        size="1em"
                                                                        className="icon-md"
                                                                    />
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent>
                                                                    {isCurrent
                                                                        ? (
                                                                            <DropdownMenuItem
                                                                                disabled
                                                                                data-testid="wallpaper-menu-set-current"
                                                                            >
                                                                                当前正在使用
                                                                            </DropdownMenuItem>
                                                                        )
                                                                        : (
                                                                            <DropdownMenuItem
                                                                                onClick={() =>
                                                                                    void handleSetCurrentFromHistory(
                                                                                        record,
                                                                                    )}
                                                                                data-testid="wallpaper-menu-set-current"
                                                                            >
                                                                                设为当前壁纸
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
                                                                        variant="destructive"
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
                                            },
                                        )}
                                    </div>
                                </div>
                            </SettingsGroup>
                        )}
                    </>
                )}
                {tab === "ai" && (
                    <>
                        <SettingsGroup footer="AI 仅在你主动提问时响应，不影响普通搜索。">
                            <SettingsRow title="对话页面">
                                <Button
                                    variant="ghost"
                                    aria-label="打开 AI 问答"
                                    render={
                                        <Link
                                            to={routes.ask}
                                            viewTransition
                                        />
                                    }
                                >
                                    打开
                                    <ChevronRight
                                        size="1em"
                                        className="icon-sm"
                                        aria-hidden="true"
                                    />
                                </Button>
                            </SettingsRow>
                        </SettingsGroup>
                        <AiSettings />
                    </>
                )}
                {tab === "data" && (
                    <>
                        <SettingsGroup
                            title="同步"
                            footer={user
                                ? "偏好设置、应用与笔记会在你的账户中双向同步。"
                                : "登录后，偏好设置、应用与笔记会同步到你的账户。"}
                        >
                            <SettingsRow title="账户">
                                {user ? user.displayName : "本地访客模式"}
                            </SettingsRow>
                            <SettingsRow title="状态">
                                <Badge variant="secondary">
                                    {user ? "已同步" : "未登录"}
                                </Badge>
                            </SettingsRow>
                        </SettingsGroup>
                        {user && (
                            <SettingsGroup
                                title="数据管理"
                                footer="已删除的应用和笔记保留在回收站，可恢复或彻底删除。"
                            >
                                <SettingsRow title="回收站">
                                    <Button
                                        variant="ghost"
                                        aria-label="打开回收站"
                                        render={
                                            <Link
                                                to={routes.trash}
                                                viewTransition
                                            />
                                        }
                                    >
                                        打开
                                        <ChevronRight
                                            size="1em"
                                            className="icon-sm"
                                            aria-hidden="true"
                                        />
                                    </Button>
                                </SettingsRow>
                            </SettingsGroup>
                        )}
                        {isAdmin && (
                            <SettingsGroup>
                                <SettingsRow title="设计实验室">
                                    <Button
                                        variant="ghost"
                                        aria-label="打开设计实验室"
                                        render={
                                            <Link
                                                to={routes.designLab}
                                                viewTransition
                                            />
                                        }
                                    >
                                        打开
                                        <ChevronRight
                                            size="1em"
                                            className="icon-sm"
                                            aria-hidden="true"
                                        />
                                    </Button>
                                </SettingsRow>
                            </SettingsGroup>
                        )}
                    </>
                )}
                {tab === "shortcuts" && <ShortcutsSettings />}
            </SettingsShell>
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
                                ? "删除当前壁纸？"
                                : "删除壁纸？"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget &&
                                    appearance.wallpaper === deleteTarget.url
                                ? "该图片正在使用。删除后将恢复默认背景，图片也会从最近上传中永久删除。"
                                : "该图片将从最近上传中永久删除。此操作无法撤销。"}
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
                            variant="destructive"
                            disabled={isDeleting}
                            onClick={handleConfirmDelete}
                            data-testid="wallpaper-delete-confirm-btn"
                        >
                            删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <StatusBanner
                tone="success"
                presentation="floating"
                open={toastMessage !== null}
                data-testid="wallpaper-toast"
            >
                {toastMessage}
            </StatusBanner>
        </>
    );
}
