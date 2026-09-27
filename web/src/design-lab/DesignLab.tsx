import { useEffect, useState } from "react";
import type { EngineId } from "@shared/engines.ts";
import { FloatingNotes } from "../components/searcher/FloatingNotes.tsx";
import { NoteCard, type NoteItem } from "../components/searcher/NoteCard.tsx";
import { SearcherSearchInput } from "../components/searcher/SearcherSearchInput.tsx";
import {
    WebAppIcon,
    type WebAppItem,
} from "../components/searcher/WebAppIcon.tsx";
import { BottomNavigation } from "../components/searcher/BottomNavigation.tsx";
import { ContentSheet } from "../components/searcher/ContentSheet.tsx";
import { type Appearance, useAppState } from "../app/state.tsx";
const apps: WebAppItem[] = [{
    id: "github",
    name: "GitHub",
    url: "https://github.com",
    isPinned: true,
}, {
    id: "figma",
    name: "Figma 设计",
    url: "https://figma.com",
    isPinned: true,
}, {
    id: "mdn",
    name: "MDN Web Docs",
    url: "https://developer.mozilla.org",
    isPinned: true,
}, { id: "mail", name: "邮件", url: "https://example.com", isPinned: true }];
const notes: NoteItem[] = [{
    id: "one",
    title: "今天的灵感",
    body: "让搜索回到简单。\n固定的便签是空间，而不是看板。",
    color: "amber",
    version: 1,
}, {
    id: "two",
    title: "待办",
    body: "- 调整首页节奏\n- 检查深色模式",
    color: "sky",
    version: 1,
}, {
    id: "three",
    title: "无标题",
    body: "随时记下短暂的想法。",
    color: "sage",
    version: 1,
}];
const themes = ["system", "light", "dark"] as const,
    styles = ["quiet", "minimal", "glass", "soft", "classic"] as const,
    accents = ["blue", "cyan", "teal", "violet", "orange", "mono"] as const,
    shapes = ["rounded", "pill"] as const;
export function DesignLab() {
    const { appearance: savedAppearance } = useAppState();
    const [appearance, setAppearance] = useState(savedAppearance);
    useEffect(() => {
        const root = document.documentElement;
        const previous = { ...root.dataset };
        return () => {
            for (const key of ["theme", "style", "accent", "shape"]) {
                if (previous[key] === undefined) delete root.dataset[key];
                else root.dataset[key] = previous[key];
            }
        };
    }, []);
    useEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = appearance.theme === "system"
            ? (matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light")
            : appearance.theme;
        root.dataset.style = appearance.style;
        root.dataset.accent = appearance.accent;
        root.dataset.shape = appearance.shape;
    }, [
        appearance.theme,
        appearance.style,
        appearance.accent,
        appearance.shape,
    ]);
    const [tab, setTab] = useState<
        "screen" | "search" | "webapps" | "notes" | "navigation"
    >("screen");
    const [engine, setEngine] = useState<EngineId>("bing");
    const [mode, setMode] = useState<"search" | "ai">("search");
    const [model, setModel] = useState("fixture-a");
    const [sheet, setSheet] = useState(false);
    const [count, setCount] = useState(3);
    const [message, setMessage] = useState("");
    function change<K extends keyof Appearance>(key: K, value: Appearance[K]) {
        setAppearance((current) => ({ ...current, [key]: value }));
    }
    return (
        <main className="page design-lab">
            <h1>Design Lab</h1>
            <p className="muted">
                正式组件的视觉与交互校验面板。不会提交搜索或修改个人内容。
            </p>
            <div className="lab-controls">
                <label>
                    主题<select
                        value={appearance.theme}
                        onChange={(e) =>
                            change(
                                "theme",
                                e.target.value as Appearance["theme"],
                            )}
                    >
                        {themes.map((v) => <option key={v}>{v}</option>)}
                    </select>
                </label>
                <label>
                    风格<select
                        value={appearance.style}
                        onChange={(e) =>
                            change(
                                "style",
                                e.target.value as Appearance["style"],
                            )}
                    >
                        {styles.map((v) => <option key={v}>{v}</option>)}
                    </select>
                </label>
                <label>
                    强调色<select
                        value={appearance.accent}
                        onChange={(e) =>
                            change(
                                "accent",
                                e.target.value as Appearance["accent"],
                            )}
                    >
                        {accents.map((v) => <option key={v}>{v}</option>)}
                    </select>
                </label>
                <label>
                    形状<select
                        value={appearance.shape}
                        onChange={(e) =>
                            change(
                                "shape",
                                e.target.value as Appearance["shape"],
                            )}
                    >
                        {shapes.map((v) => (
                            <option key={v} value={v}>
                                {v === "rounded" ? "默认" : "胶囊"}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    固定便签数<input
                        type="range"
                        min="0"
                        max="3"
                        value={count}
                        onChange={(e) => setCount(Number(e.target.value))}
                    />
                    {count}
                </label>
                <label>
                    壁纸遮罩<input
                        type="range"
                        min="0"
                        max="0.8"
                        step="0.05"
                        value={appearance.mask}
                        onChange={(e) => change("mask", Number(e.target.value))}
                    />
                </label>
                <label>
                    模糊<input
                        type="range"
                        min="0"
                        max="24"
                        value={appearance.blur}
                        onChange={(e) => change("blur", Number(e.target.value))}
                    />
                </label>
                <label>
                    灰度<input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={appearance.grayscale}
                        onChange={(e) =>
                            change("grayscale", Number(e.target.value))}
                    />
                </label>
                <label>
                    搜索框透明度<input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={appearance.searchOpacity ?? 1}
                        onChange={(e) =>
                            change("searchOpacity", Number(e.target.value))}
                    />
                    {Math.round((appearance.searchOpacity ?? 1) * 100)}%
                </label>
                <label>
                    首页标题<select
                        value={appearance.showTitle !== false ? "show" : "hide"}
                        onChange={(e) =>
                            change("showTitle", e.target.value === "show")}
                    >
                        <option value="show">显示</option>
                        <option value="hide">隐藏</option>
                    </select>
                </label>
            </div>
            <nav className="lab-nav" aria-label="设计实验区">
                {([
                    "screen",
                    "search",
                    "webapps",
                    "notes",
                    "navigation",
                ] as const).map((id) => (
                    <button
                        type="button"
                        key={id}
                        aria-current={tab === id ? "page" : undefined}
                        onClick={() => setTab(id)}
                    >
                        {({
                            screen: "主页",
                            search: "搜索",
                            webapps: "APP",
                            notes: "便签",
                            navigation: "导航与 Sheet",
                        })[id]}
                    </button>
                ))}
            </nav>
            <section
                className="lab-stage"
                aria-label="组件预览"
                style={{
                    "--search-opacity": appearance.searchOpacity ?? 1,
                } as React.CSSProperties}
            >
                {(tab === "screen" || tab === "search") && (
                    <>
                        {appearance.showTitle !== false && (
                            <h2 className="hero-title">
                                Searcher<span
                                    style={{ color: "var(--accent)" }}
                                >
                                    .
                                </span>
                            </h2>
                        )}
                        <SearcherSearchInput
                            engine={engine}
                            onEngineChange={setEngine}
                            mode={mode}
                            onModeChange={setMode}
                            onSubmit={(q) => setMessage("预览输入：" + q)}
                            models={[{
                                id: "fixture-a",
                                label: "模型 A",
                                provider: "示例 Provider",
                            }, {
                                id: "fixture-b",
                                label: "模型 B",
                                provider: "示例 Provider",
                            }]}
                            selectedModel={model}
                            onModelChange={setModel}
                            onCheck={() =>
                                setMessage("仅真实主页会进行浏览器资源检测")}
                            reachability={{
                                google: {
                                    ok: true,
                                    checkedAt: Date.now(),
                                    latency: 84,
                                },
                                bing: {
                                    ok: false,
                                    checkedAt: Date.now(),
                                    latency: 0,
                                },
                            }}
                        />
                        {message && (
                            <p role="status" className="muted">{message}</p>
                        )}
                    </>
                )}
                {(tab === "screen" || tab === "webapps") && (
                    <div className="pinned-apps">
                        {apps.map((app) => (
                            <WebAppIcon
                                key={app.id}
                                app={app}
                                onOpen={() =>
                                    setMessage(
                                        app.name + " — 预览不打开外部网站",
                                    )}
                            />
                        ))}
                    </div>
                )}
                {(tab === "screen" || tab === "notes") && (
                    <FloatingNotes
                        notes={notes.slice(0, count)}
                        onOpen={(note) => setMessage("便签：" + note.title)}
                    />
                )}
                {tab === "notes" && (
                    <div
                        className="pinned-apps"
                        style={{ justifyContent: "center" }}
                    >
                        {(["saved", "saving", "unsynced", "error"] as const)
                            .map((status) => (
                                <NoteCard
                                    key={status}
                                    note={notes[0]}
                                    status={status}
                                />
                            ))}
                    </div>
                )}
                {tab === "navigation" && (
                    <>
                        <BottomNavigation
                            onApps={() => setSheet(true)}
                            onNotes={() => setSheet(true)}
                        />
                        <button
                            type="button"
                            className="button button--primary"
                            onClick={() => setSheet(true)}
                        >
                            打开 Sheet
                        </button>
                    </>
                )}
            </section>
            <ContentSheet open={sheet} onOpenChange={setSheet} title="设计预览">
                <p>Sheet 与正式首页使用同一组件。</p>
            </ContentSheet>
        </main>
    );
}
