import { useRef } from "react";
import {
    Link,
    useNavigate,
    useParams,
    useSearchParams,
} from "react-router-dom";
import {
    Palette,
    RefreshCw,
    RotateCcw,
    Search,
    Sparkles,
    Upload,
} from "lucide-react";
import { type EngineId, SEARCH_ENGINES } from "@shared/engines.ts";
import { Button } from "../components/ui/button.tsx";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { Slider } from "../components/ui/slider.tsx";
import { Separator } from "../components/ui/separator.tsx";
import { AiSettings } from "./AiSettings.tsx";
import { type Appearance, useAppState } from "./state.tsx";

type Tab = "search" | "appearance" | "ai" | "data";

const tabs: Record<Tab, { label: string; icon: typeof Search }> = {
    search: { label: "搜索", icon: Search },
    appearance: { label: "外观", icon: Palette },
    ai: { label: "AI 问答", icon: Sparkles },
    data: { label: "数据与同步", icon: RefreshCw },
};

const ACCENT_COLORS: Record<string, string> = {
    blue: "#326cae",
    cyan: "#047b92",
    teal: "#117968",
    violet: "#7354b3",
    orange: "#ae602e",
    mono: "#465461",
};

function Choices<T extends string>(
    { title, value, values, select }: {
        title: string;
        value: T;
        values: readonly [T, string][];
        select: (v: T) => void;
    },
) {
    return (
        <div className="setting-group">
            <h3>{title}</h3>
            <RadioGroup
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
                        {id in ACCENT_COLORS && (
                            <span
                                style={{
                                    display: "inline-block",
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    background: ACCENT_COLORS[id],
                                    marginRight: 6,
                                    flexShrink: 0,
                                }}
                            />
                        )}
                        <span>{label}</span>
                    </RadioGroupItem>
                ))}
            </RadioGroup>
        </div>
    );
}

export function SettingsPage() {
    const { appearance, setAppearance, user } = useAppState();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    async function handleWallpaperUpload(file: File) {
        if (file.size > 5 * 1024 * 1024) {
            alert("壁纸文件大小不能超过 5MB");
            return;
        }
        if (!user) {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === "string") {
                    set("wallpaper", reader.result);
                }
            };
            reader.onerror = () => {
                alert("读取本地壁纸文件失败");
            };
            reader.readAsDataURL(file);
            return;
        }
        const fd = new FormData();
        fd.append("image", file);
        try {
            const res = await fetch("/api/wallpaper", {
                method: "POST",
                body: fd,
            });
            const data = await res.json();
            if (data.status && data.data?.url) {
                set("wallpaper", data.data.url);
            } else {
                alert(data.message || "上传壁纸失败");
            }
        } catch (err) {
            alert(
                "上传壁纸出错: " +
                    (err instanceof Error ? err.message : String(err)),
            );
        }
    }
    const { tab: pathTab } = useParams<{ tab?: string }>();
    const [params] = useSearchParams();
    const queryTab = params.get("tab");
    const tab: Tab = (pathTab && pathTab in tabs)
        ? (pathTab as Tab)
        : (queryTab && queryTab in tabs)
        ? (queryTab as Tab)
        : "search";

    function set<K extends keyof Appearance>(key: K, value: Appearance[K]) {
        void setAppearance({ [key]: value });
    }

    return (
        <main className="page">
            <h1>设置</h1>
            <div className="settings-layout">
                <nav className="settings-nav" aria-label="设置分类">
                    {(Object.keys(tabs) as Tab[]).map((id) => {
                        const Icon = tabs[id].icon;
                        return (
                            <button
                                type="button"
                                key={id}
                                onClick={() =>
                                    navigate(
                                        id === "search"
                                            ? "/settings"
                                            : `/settings/${id}`,
                                    )}
                                className={tab === id ? "active" : ""}
                                aria-current={tab === id ? "page" : undefined}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                }}
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
                            <Choices
                                title="默认搜索引擎"
                                value={appearance.engine}
                                values={SEARCH_ENGINES.map((
                                    e,
                                ) => [e.id, e.label] as const)}
                                select={(v) => set("engine", v as EngineId)}
                            />
                            <Choices
                                title="搜索结果打开方式"
                                value={appearance.target}
                                values={[
                                    ["current", "当前标签页打开"],
                                    ["new_tab", "新标签页打开"],
                                ] as const}
                                select={(v) => set("target", v)}
                            />
                            <div className="setting-group">
                                <h3>首页快捷方式数量</h3>
                                <RadioGroup
                                    value={String(appearance.webAppHomeLimit)}
                                    onValueChange={(val) =>
                                        set(
                                            "webAppHomeLimit",
                                            val === "all"
                                                ? "all"
                                                : (Number(val) as 8 | 12 | 16),
                                        )}
                                    aria-label="首页快捷方式数量"
                                >
                                    {([8, 12, 16, "all"] as const).map((
                                        limit,
                                    ) => (
                                        <RadioGroupItem
                                            key={String(limit)}
                                            value={String(limit)}
                                            aria-label={limit === "all"
                                                ? "全部"
                                                : String(limit)}
                                        >
                                            <span>
                                                {limit === "all"
                                                    ? "全部"
                                                    : limit}
                                            </span>
                                        </RadioGroupItem>
                                    ))}
                                </RadioGroup>
                            </div>
                        </div>
                    )}
                    {tab === "appearance" && (
                        <div className="settings-section">
                            <div className="settings-subgroup">
                                <div className="settings-section-head">
                                    <h3>主题</h3>
                                    <p>调整界面的基础视觉样式与配色</p>
                                </div>
                                <Choices
                                    title="主题模式"
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
                                    value={appearance.accent}
                                    values={[
                                        ["blue", "经典蓝"],
                                        ["cyan", "天青蓝"],
                                        ["teal", "鸭翅绿"],
                                        ["violet", "紫罗兰"],
                                        ["orange", "暖晨橙"],
                                        ["mono", "单色黑白"],
                                    ] as const}
                                    select={(v) => set("accent", v)}
                                />
                                <Choices
                                    title="界面风格"
                                    value={appearance.style}
                                    values={[
                                        ["quiet", "默认 (Quiet)"],
                                        ["minimal", "极简 (Minimal)"],
                                        ["glass", "毛玻璃 (Glass)"],
                                        ["soft", "柔和 (Soft)"],
                                        ["classic", "经典 (Classic)"],
                                    ] as const}
                                    select={(v) => set("style", v)}
                                />
                            </div>

                            <Separator orientation="horizontal" />

                            <div className="settings-subgroup">
                                <div className="settings-section-head">
                                    <h3>主页</h3>
                                    <p>调整首页搜索框与快捷入口布局</p>
                                </div>
                                <Choices
                                    title="搜索框样式"
                                    value={appearance.shape ?? "rounded"}
                                    values={[
                                        ["rounded", "Rounded（圆角）"],
                                        ["pill", "Pill（胶囊 Capsule）"],
                                    ] as const}
                                    select={(v) => set("shape", v)}
                                />
                                <div className="setting-group">
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            marginBottom: "10px",
                                        }}
                                    >
                                        <h3 style={{ margin: 0 }}>
                                            搜索框透明度
                                        </h3>
                                        <span
                                            className="muted"
                                            style={{
                                                fontWeight: 600,
                                                fontSize: "13px",
                                            }}
                                        >
                                            {Math.round(
                                                (appearance.searchOpacity ??
                                                    1) * 100,
                                            )}%
                                        </span>
                                    </div>
                                    <Slider
                                        min={0.1}
                                        max={1}
                                        step={0.05}
                                        value={appearance.searchOpacity ?? 1}
                                        onValueChange={(v) =>
                                            set(
                                                "searchOpacity",
                                                typeof v === "number"
                                                    ? v
                                                    : v[0],
                                            )}
                                        aria-label="搜索框透明度"
                                    />
                                </div>
                                <div
                                    className="setting-group"
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                    }}
                                >
                                    <div>
                                        <h3 style={{ margin: 0 }}>
                                            显示 Searcher 标题
                                        </h3>
                                        <p
                                            className="muted"
                                            style={{
                                                margin: "4px 0 0",
                                                fontSize: "13px",
                                            }}
                                        >
                                            在首页搜索框上方展示品牌标题
                                        </p>
                                    </div>
                                    <Switch
                                        checked={appearance.showTitle !== false}
                                        onCheckedChange={(checked) =>
                                            set("showTitle", checked)}
                                        aria-label="显示 Searcher 标题"
                                    />
                                </div>
                                <Choices
                                    title="APP 图标大小"
                                    value={appearance.webAppIconSize}
                                    values={[["compact", "紧凑"], [
                                        "default",
                                        "标准",
                                    ], ["large", "大图标"]] as const}
                                    select={(v) => set("webAppIconSize", v)}
                                />
                                <div
                                    className="setting-group"
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                    }}
                                >
                                    <div>
                                        <h3 style={{ margin: 0 }}>
                                            显示 APP 名称
                                        </h3>
                                        <p
                                            className="muted"
                                            style={{
                                                margin: "4px 0 0",
                                                fontSize: "13px",
                                            }}
                                        >
                                            在桌面或快捷列表中展示网站文字标签
                                        </p>
                                    </div>
                                    <Switch
                                        checked={appearance.showAppLabels}
                                        onCheckedChange={(checked) =>
                                            set("showAppLabels", checked)}
                                        aria-label="显示 APP 名称"
                                    />
                                </div>
                            </div>

                            <Separator orientation="horizontal" />

                            <div className="settings-subgroup">
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                    }}
                                >
                                    <div className="settings-section-head">
                                        <h3>壁纸与背景效果</h3>
                                        <p>
                                            设置首页背景图像及遮罩、模糊与灰度
                                        </p>
                                    </div>
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
                                        <RotateCcw size={14} />
                                        <span>恢复默认</span>
                                    </Button>
                                </div>

                                <div className="field">
                                    <label htmlFor="wallpaper-input">
                                        壁纸背景 (上传本地图片或输入地址/渐变)
                                    </label>
                                    <div
                                        style={{
                                            display: "flex",
                                            gap: "8px",
                                            alignItems: "center",
                                        }}
                                    >
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            style={{ display: "none" }}
                                            accept="image/png,image/jpeg,image/webp,image/avif"
                                            onChange={(e) => {
                                                const file = e.target.files
                                                    ?.[0];
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
                                            onClick={() =>
                                                fileInputRef.current?.click()}
                                            title="上传本地图片 (PNG/JPEG/WebP/AVIF，最大 5MB)"
                                            aria-label="上传本地图片"
                                            style={{
                                                flexShrink: 0,
                                                width: "42px",
                                                height: "42px",
                                                padding: 0,
                                                display: "inline-flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                            }}
                                        >
                                            <Upload size={18} />
                                        </Button>
                                        <input
                                            id="wallpaper-input"
                                            type="text"
                                            placeholder={appearance.wallpaper
                                                    .startsWith("data:")
                                                ? "当前已使用本地壁纸图片（输入新地址或渐变可替换）"
                                                : "输入图片 HTTPS 地址或 CSS 渐变"}
                                            value={appearance.wallpaper
                                                    .startsWith("data:")
                                                ? ""
                                                : appearance.wallpaper}
                                            onChange={(e) =>
                                                set(
                                                    "wallpaper",
                                                    e.target.value,
                                                )}
                                            style={{ flex: 1, margin: 0 }}
                                        />
                                        {appearance.wallpaper && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    set("wallpaper", "")}
                                                title="清除壁纸"
                                                aria-label="清除壁纸"
                                                style={{
                                                    flexShrink: 0,
                                                    height: "42px",
                                                    padding: "0 10px",
                                                }}
                                            >
                                                <RotateCcw size={15} />
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <div className="setting-group">
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            marginBottom: "8px",
                                        }}
                                    >
                                        <span>遮罩</span>
                                        <span
                                            className="muted"
                                            style={{ fontWeight: 600 }}
                                        >
                                            {Math.round(
                                                appearance.mask * 100,
                                            )}%
                                        </span>
                                    </div>
                                    <Slider
                                        min={0}
                                        max={0.8}
                                        step={0.05}
                                        value={appearance.mask}
                                        onValueChange={(v) =>
                                            set(
                                                "mask",
                                                typeof v === "number"
                                                    ? v
                                                    : v[0],
                                            )}
                                        aria-label="遮罩比例"
                                    />
                                </div>

                                <div className="setting-group">
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            marginBottom: "8px",
                                        }}
                                    >
                                        <span>模糊</span>
                                        <span
                                            className="muted"
                                            style={{ fontWeight: 600 }}
                                        >
                                            {appearance.blur}px
                                        </span>
                                    </div>
                                    <Slider
                                        min={0}
                                        max={24}
                                        step={1}
                                        value={appearance.blur}
                                        onValueChange={(v) =>
                                            set(
                                                "blur",
                                                typeof v === "number"
                                                    ? v
                                                    : v[0],
                                            )}
                                        aria-label="模糊半径"
                                    />
                                </div>

                                <div className="setting-group">
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            marginBottom: "8px",
                                        }}
                                    >
                                        <span>灰度</span>
                                        <span
                                            className="muted"
                                            style={{ fontWeight: 600 }}
                                        >
                                            {Math.round(
                                                appearance.grayscale * 100,
                                            )}%
                                        </span>
                                    </div>
                                    <Slider
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={appearance.grayscale}
                                        onValueChange={(v) => set(
                                            "grayscale",
                                            typeof v === "number" ? v : v[0],
                                        )}
                                        aria-label="灰度比例"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    {tab === "ai" && (
                        <div className="settings-section">
                            <div className="settings-subgroup">
                                <div className="settings-section-head">
                                    <h3>AI 问答</h3>
                                    <p>智能 AI 问答工作区与偏好设置</p>
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "16px 20px",
                                        border: "1px solid var(--border)",
                                        borderRadius: "10px",
                                        background: "var(--surface)",
                                    }}
                                >
                                    <div>
                                        <strong style={{ fontSize: "14px" }}>
                                            AI 问答工作区
                                        </strong>
                                        <p
                                            className="muted"
                                            style={{
                                                margin: "4px 0 0",
                                                fontSize: "13px",
                                            }}
                                        >
                                            AI
                                            拥有专属的独立对话空间，只在显式选择后响应，不接管普通搜索。
                                        </p>
                                    </div>
                                    <Link
                                        className="button button--primary"
                                        to="/ask"
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
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "16px 20px",
                                        border: "1px solid var(--border)",
                                        borderRadius: "10px",
                                        background: "var(--surface)",
                                    }}
                                >
                                    <div>
                                        <strong style={{ fontSize: "14px" }}>
                                            {user
                                                ? "已登录账户"
                                                : "本地访客模式"}
                                        </strong>
                                        <p
                                            className="muted"
                                            style={{
                                                margin: "4px 0 0",
                                                fontSize: "13px",
                                            }}
                                        >
                                            {user
                                                ? `已连接为 ${user.displayName}，数据已双向同步`
                                                : "访客偏好仅在当前页面有效，登录后个人内容由服务端同步。"}
                                        </p>
                                    </div>
                                    <span
                                        style={{
                                            display: "inline-flex",
                                            padding: "4px 10px",
                                            borderRadius: "999px",
                                            fontSize: "12px",
                                            fontWeight: 600,
                                            background: user
                                                ? "color-mix(in srgb, var(--success) 16%, var(--surface))"
                                                : "var(--surface-soft)",
                                            color: user
                                                ? "var(--success)"
                                                : "var(--muted)",
                                            border: "1px solid var(--border)",
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
                                <div
                                    style={{
                                        display: "grid",
                                        gap: "12px",
                                    }}
                                >
                                    {user && (
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                padding: "14px 18px",
                                                border:
                                                    "1px solid var(--border)",
                                                borderRadius: "10px",
                                                background: "var(--surface)",
                                            }}
                                        >
                                            <div>
                                                <strong
                                                    style={{ fontSize: "14px" }}
                                                >
                                                    回收站
                                                </strong>
                                                <p
                                                    className="muted"
                                                    style={{
                                                        margin: "4px 0 0",
                                                        fontSize: "13px",
                                                    }}
                                                >
                                                    查看或彻底清理已删除的网站和便签
                                                </p>
                                            </div>
                                            <Link
                                                to="/trash"
                                                className="button button--subtle"
                                            >
                                                打开回收站
                                            </Link>
                                        </div>
                                    )}
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            padding: "14px 18px",
                                            border: "1px solid var(--border)",
                                            borderRadius: "10px",
                                            background: "var(--surface)",
                                        }}
                                    >
                                        <div>
                                            <strong
                                                style={{ fontSize: "14px" }}
                                            >
                                                Design Lab
                                            </strong>
                                            <p
                                                className="muted"
                                                style={{
                                                    margin: "4px 0 0",
                                                    fontSize: "13px",
                                                }}
                                            >
                                                管理与测试实验性的界面配置和组件预览
                                            </p>
                                        </div>
                                        <Link
                                            to="/design-lab"
                                            className="button button--subtle"
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
        </main>
    );
}
