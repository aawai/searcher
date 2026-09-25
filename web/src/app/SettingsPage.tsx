import {
    Link,
    useNavigate,
    useParams,
    useSearchParams,
} from "react-router-dom";
import { type EngineId, SEARCH_ENGINES } from "@shared/engines.ts";
import { Button } from "../components/ui/button.tsx";
import { AiSettings } from "./AiSettings.tsx";
import { type Appearance, useAppState } from "./state.tsx";
type Tab = "search" | "appearance" | "ai" | "account" | "data";
const tabs: Record<Tab, string> = {
    search: "搜索",
    appearance: "外观",
    ai: "AI 问答",
    account: "账户",
    data: "数据与同步",
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
            <div className="choice-row">
                {values.map(([id, label]) => (
                    <Button
                        key={id}
                        aria-pressed={id === value}
                        onClick={() => select(id)}
                    >
                        {label}
                    </Button>
                ))}
            </div>
        </div>
    );
}
export function SettingsPage() {
    const { appearance, setAppearance, user } = useAppState();
    const navigate = useNavigate();
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
                    {(Object.keys(tabs) as Tab[]).map((id) => (
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
                        >
                            {tabs[id]}
                        </button>
                    ))}
                </nav>
                <section className="settings-panel">
                    <h2>{tabs[tab]}</h2>
                    {tab === "search" && (
                        <>
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
                                <h3>首页固定图标数量</h3>
                                <div className="choice-row">
                                    {([8, 12, 16, "all"] as const).map((
                                        limit,
                                    ) => (
                                        <Button
                                            key={limit}
                                            variant="outline"
                                            aria-pressed={appearance
                                                .webAppHomeLimit === limit}
                                            onClick={() =>
                                                set("webAppHomeLimit", limit)}
                                        >
                                            {limit === "all" ? "全部" : limit}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                    {tab === "appearance" && (
                        <>
                            <Choices
                                title="主题"
                                value={appearance.theme}
                                values={[
                                    ["system", "跟随系统"],
                                    ["light", "浅色"],
                                    ["dark", "深色"],
                                ] as const}
                                select={(v) => set("theme", v)}
                            />
                            <Choices
                                title="主题配色"
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
                                title="风格"
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
                            <Choices
                                title="搜索框形状"
                                value={appearance.shape ?? "rounded"}
                                values={[
                                    ["rounded", "Rounded（圆角）"],
                                    ["pill", "Pill（胶囊 Capsule）"],
                                ] as const}
                                select={(v) => set("shape", v)}
                            />
                            <div className="setting-group">
                                <h3>搜索框透明度调节</h3>
                                <label
                                    className="field"
                                    style={{ marginTop: "4px" }}
                                >
                                    不透明度 {Math.round(
                                        (appearance.searchOpacity ?? 1) * 100,
                                    )}%
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="1"
                                        step="0.05"
                                        value={appearance.searchOpacity ?? 1}
                                        onChange={(e) =>
                                            set(
                                                "searchOpacity",
                                                Number(e.target.value),
                                            )}
                                    />
                                </label>
                            </div>
                            <Choices
                                title="首页 Searcher 标题（仅本设备有效）"
                                value={appearance.showTitle !== false
                                    ? "show"
                                    : "hide"}
                                values={[
                                    ["show", "显示"],
                                    ["hide", "隐藏"],
                                ] as const}
                                select={(v) => set("showTitle", v === "show")}
                            />
                            <Choices
                                title="Web App 图标大小"
                                value={appearance.webAppIconSize}
                                values={[["compact", "紧凑"], [
                                    "default",
                                    "标准",
                                ], ["large", "大图标"]] as const}
                                select={(v) => set("webAppIconSize", v)}
                            />
                            <Choices
                                title="显示 Web App 名称"
                                value={appearance.showAppLabels
                                    ? "show"
                                    : "hide"}
                                values={[["show", "显示名称"], [
                                    "hide",
                                    "仅显示图标",
                                ]] as const}
                                select={(value) =>
                                    set("showAppLabels", value === "show")}
                            />
                            <div className="setting-group">
                                <h3>壁纸预设与自定义</h3>
                                <div
                                    className="choice-row"
                                    style={{ marginBottom: "12px" }}
                                >
                                    <button
                                        type="button"
                                        aria-pressed={appearance.wallpaper ===
                                            ""}
                                        onClick={() => set("wallpaper", "")}
                                    >
                                        默认纯色
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={appearance.wallpaper ===
                                            "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"}
                                        onClick={() =>
                                            set(
                                                "wallpaper",
                                                "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                            )}
                                    >
                                        紫蓝极光
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={appearance.wallpaper ===
                                            "linear-gradient(120deg, #1f2937 0%, #111827 100%)"}
                                        onClick={() =>
                                            set(
                                                "wallpaper",
                                                "linear-gradient(120deg, #1f2937 0%, #111827 100%)",
                                            )}
                                    >
                                        深邃暗色
                                    </button>
                                </div>

                                <label className="field">
                                    壁纸图片 HTTPS 地址 / CSS 渐变
                                    <input
                                        type="text"
                                        placeholder={appearance.wallpaper
                                                .startsWith("data:")
                                            ? "当前已使用本地壁纸图片（输入新地址或渐变可替换）"
                                            : "https://example.com/wallpaper.jpg 或 linear-gradient(...)"}
                                        value={appearance.wallpaper.startsWith(
                                                "data:",
                                            )
                                            ? ""
                                            : appearance.wallpaper}
                                        onChange={(e) =>
                                            set("wallpaper", e.target.value)}
                                    />
                                </label>

                                <div
                                    className="field"
                                    style={{ marginTop: "10px" }}
                                >
                                    <span>
                                        上传本地壁纸 (PNG/JPEG/WebP/AVIF，最大
                                        5MB)
                                    </span>
                                    <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp,image/avif"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            if (file.size > 5 * 1024 * 1024) {
                                                alert(
                                                    "壁纸文件大小不能超过 5MB",
                                                );
                                                return;
                                            }
                                            // 未登录：背景图片存储在本地
                                            if (!user) {
                                                const reader = new FileReader();
                                                reader.onload = () => {
                                                    if (
                                                        typeof reader.result ===
                                                            "string"
                                                    ) {
                                                        set(
                                                            "wallpaper",
                                                            reader.result,
                                                        );
                                                    }
                                                };
                                                reader.onerror = () => {
                                                    alert(
                                                        "读取本地壁纸文件失败",
                                                    );
                                                };
                                                reader.readAsDataURL(file);
                                                return;
                                            }
                                            // 已登录：上传至服务器
                                            const fd = new FormData();
                                            fd.append("image", file);
                                            try {
                                                const res = await fetch(
                                                    "/api/wallpaper",
                                                    {
                                                        method: "POST",
                                                        body: fd,
                                                    },
                                                );
                                                const data = await res.json();
                                                if (
                                                    data.status &&
                                                    data.data?.url
                                                ) {
                                                    set(
                                                        "wallpaper",
                                                        data.data.url,
                                                    );
                                                } else {
                                                    alert(
                                                        data.message ||
                                                            "上传壁纸失败",
                                                    );
                                                }
                                            } catch (err) {
                                                alert(
                                                    "上传壁纸出错: " +
                                                        (err instanceof Error
                                                            ? err.message
                                                            : String(err)),
                                                );
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                            <label className="field">
                                遮罩 {Math.round(appearance.mask * 100)}%<input
                                    type="range"
                                    min="0"
                                    max="0.8"
                                    step="0.05"
                                    value={appearance.mask}
                                    onChange={(e) =>
                                        set("mask", Number(e.target.value))}
                                />
                            </label>
                            <label className="field">
                                模糊 {appearance.blur}px<input
                                    type="range"
                                    min="0"
                                    max="24"
                                    value={appearance.blur}
                                    onChange={(e) =>
                                        set("blur", Number(e.target.value))}
                                />
                            </label>
                            <label className="field">
                                灰度{" "}
                                {Math.round(appearance.grayscale * 100)}%<input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={appearance.grayscale}
                                    onChange={(e) =>
                                        set(
                                            "grayscale",
                                            Number(e.target.value),
                                        )}
                                />
                            </label>
                        </>
                    )}
                    {tab === "ai" && (
                        <>
                            <p className="muted">
                                AI 必须显式进入问答模式，不会接管普通搜索。
                            </p>
                            <Link className="button button--primary" to="/ask">
                                打开 AI 问答
                            </Link>
                            <AiSettings />
                        </>
                    )}
                    {tab === "account" && (
                        <p>
                            {user
                                ? (
                                    <Link to="/account">
                                        管理个人资料、密码与登录设备
                                    </Link>
                                )
                                : <Link to="/login">登录以管理账户和设备</Link>}
                        </p>
                    )}
                    {tab === "data" && (
                        <>
                            <p className="muted">
                                访客偏好仅在当前页面有效，登录后个人内容由服务端同步。
                            </p>
                            {user && <Link to="/trash">打开回收站</Link>}
                            <p>
                                <Link to="/design-lab">打开 Design Lab</Link>
                            </p>
                        </>
                    )}
                </section>
            </div>
        </main>
    );
}
