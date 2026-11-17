import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { type AccentPreference, ACCENTS } from "@shared/contracts.ts";
import { type Appearance, useAppState } from "../app/state.tsx";
import { ThemeChoices } from "../components/searcher/ThemeChoices.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { Section } from "../components/searcher/semantic.tsx";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.tsx";
import { applyResolvedTheme, resolveTheme } from "../design-system/theme.ts";
import "./design-lab.css";
import "./palette-lab.css";

type Rgb = readonly [number, number, number];
const CANDIDATE_COLORS = {
    "--palette-warm-background": "light-dark(#f5f1ea, #151310)",
    "--palette-warm-surface": "light-dark(#fffcf7, #211e1a)",
    "--palette-warm-soft": "light-dark(#ece7df, #302b25)",
    "--palette-wallpaper": "#8c7463",
};

function candidateColors(node: HTMLDivElement | HTMLElement | null) {
    if (!node) return;
    for (const [name, value] of Object.entries(CANDIDATE_COLORS)) {
        node.style.setProperty(name, value);
    }
}

// Read resolved browser colours, including color-mix() and light-dark(). Canvas
// composites translucent surfaces over the same sample wallpaper as the preview.
function pixel(
    context: CanvasRenderingContext2D,
    color: string,
    base?: string,
): Rgb {
    context.clearRect(0, 0, 1, 1);
    if (base) {
        context.fillStyle = base;
        context.fillRect(0, 0, 1, 1);
    }
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2]];
}

function luminance(rgb: Rgb): number {
    const linear = rgb.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function ratio(a: Rgb, b: Rgb): string {
    const x = luminance(a);
    const y = luminance(b);
    return ((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2);
}

function Surface({ name, kind, revision, children }: {
    name: string;
    kind: string;
    revision: string;
    children?: React.ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [readout, setReadout] = useState("测量中");
    useEffect(() => {
        const node = ref.current;
        const context = document.createElement("canvas").getContext("2d", {
            willReadFrequently: true,
        });
        if (!node || !context) return;
        const style = getComputedStyle(node);
        const background = pixel(
            context,
            style.backgroundColor,
            kind === "derived"
                ? style.getPropertyValue("--palette-wallpaper")
                : undefined,
        );
        const probes = node.querySelectorAll<HTMLElement>("[data-probe]");
        const results = Array.from(probes, (probe) => {
            const foreground = pixel(context, getComputedStyle(probe).color);
            return `${probe.dataset.probe} ${ratio(foreground, background)}:1`;
        });
        setReadout(results.join(" · "));
    }, [revision, kind]);
    return (
        <div className={`palette-surface palette-surface--${kind}`} ref={ref}>
            <strong>{name}</strong>
            <div className="palette-probes">
                <span data-probe="次要">次要文字</span>
                <span data-probe="前景">正文文字</span>
                <span data-probe="强调">强调文字</span>
            </div>
            {children}
            <small>{readout}</small>
        </div>
    );
}

export default function PaletteLab() {
    const { appearance: saved } = useAppState();
    const [theme, setTheme] = useState<Appearance["theme"]>(saved.theme);
    const [accent, setAccent] = useState<AccentPreference>(saved.accent);
    const [mapping, setMapping] = useState("neutral");
    const revision = `${theme}/${accent}/${mapping}`;

    useLayoutEffect(() => {
        const root = document.documentElement;
        const original = {
            theme: root.dataset.theme,
            contrast: root.dataset.contrast,
            accent: root.dataset.accent,
        };
        return () => {
            for (const [key, value] of Object.entries(original)) {
                if (value === undefined) delete root.dataset[key];
                else root.dataset[key] = value;
            }
        };
    }, []);
    // Run before the surface measurements, including on the initial render.
    useLayoutEffect(() => {
        const root = document.documentElement;
        applyResolvedTheme(
            root,
            resolveTheme(
                theme,
                matchMedia("(prefers-color-scheme: dark)").matches,
            ),
        );
        root.dataset.accent = accent;
    }, [theme, accent]);

    return (
        <PageShell
            archetype="workbench"
            className="design-lab-page palette-lab"
        >
            <PageHeader title="色阶与浅染实验" />
            <p>
                仅供比较，不改变生产配色。壁纸示例为固定色块；内容层始终为不透明实色。<Link to="/design-lab">
                    返回设计实验室
                </Link>
            </p>
            <Section title="预览设置">
                <ThemeChoices value={theme} onValueChange={setTheme} />
                <RadioGroup
                    aria-label="强调色"
                    value={accent}
                    onValueChange={(value) =>
                        setAccent(value as AccentPreference)}
                    className="design-lab-row"
                >
                    {ACCENTS.map((item) => (
                        <RadioGroupItem key={item.id} value={item.id}>
                            {item.label}
                        </RadioGroupItem>
                    ))}
                    <RadioGroupItem value="wallpaper">跟随壁纸</RadioGroupItem>
                </RadioGroup>
                <p>
                    跟随壁纸使用当前应用已派生的强调色；没有可读取壁纸时回退经典蓝。高对比主题使用固定高亮色。
                </p>
            </Section>
            <Section title="4.1 中性色色温 · 无壁纸">
                <div className="palette-columns">
                    {[["neutral", "现行纯中性"], ["warm", "暖调纸白候选"]].map((
                        [scale, label],
                    ) => (
                        <article
                            key={scale}
                            className="palette-candidate"
                            data-scale={scale}
                            ref={scale === "warm" ? candidateColors : undefined}
                        >
                            <h3>{label}</h3>
                            <p>
                                {scale === "warm"
                                    ? "浅色：画布 #F5F1EA，内容 #FFFCF7，柔和 #ECE7DF；深色：#151310 / #211E1A / #302B25。高对比保持现行。"
                                    : "使用当前主题的背景、内容与柔和表面。"}
                            </p>
                            <Surface
                                name="默认画布 / --background"
                                kind="canvas"
                                revision={revision}
                            />
                            <Surface
                                name="内容层 / --surface-solid"
                                kind="content"
                                revision={revision}
                            />
                            <Surface
                                name="柔和表面 / --surface-soft"
                                kind="soft"
                                revision={revision}
                            />
                        </article>
                    ))}
                </div>
            </Section>
            <Section title="4.2 壁纸派生范围">
                <p>
                    示例壁纸色 #8C7463；标题栏候选混入 6%，派生画布使用现有
                    --canvas-derived（浅 94% / 深 84%，高对比
                    100%）。下方内容层保持实色。
                </p>
                <div className="palette-columns" ref={candidateColors}>
                    <article className="palette-candidate">
                        <h3>极淡壁纸色标题栏</h3>
                        <Surface
                            name="标题栏"
                            kind="tinted"
                            revision={revision}
                        />
                        <Surface
                            name="内容层"
                            kind="content"
                            revision={revision}
                        />
                    </article>
                    <article className="palette-candidate">
                        <h3>现有派生画布</h3>
                        <Surface
                            name="壁纸上的 --canvas-derived"
                            kind="derived"
                            revision={revision}
                        />
                        <Surface
                            name="内容层"
                            kind="content"
                            revision={revision}
                        />
                    </article>
                </div>
            </Section>
            <Section title="4.4 着色与选中态">
                <p>
                    已有的分节标记、序号、分组标题和空状态文字分别使用浅染；选中项保留文字与勾选线索。浅染候选将
                    --accent-subtle 调为与选中态相同底色上的半强度；描边使用
                    --accent-border。
                </p>
                <RadioGroup
                    aria-label="高对比着色映射"
                    value={mapping}
                    onValueChange={(value) => setMapping(String(value))}
                    className="design-lab-row"
                >
                    <RadioGroupItem value="neutral">
                        高对比：中性
                    </RadioGroupItem>
                    <RadioGroupItem value="highlight">
                        高对比：高亮
                    </RadioGroupItem>
                </RadioGroup>
                <div className="palette-columns" data-mapping={mapping}>
                    <article className="palette-candidate palette-coloring">
                        <h3>非交互着色 / --accent-subtle</h3>
                        <Surface
                            name="浅染色样"
                            kind="subtle"
                            revision={revision}
                        />
                        <p className="palette-marker">
                            分节 · 最近笔记 <span>01</span>
                        </p>
                        <h4 className="palette-marker">工作空间</h4>
                        <p className="palette-marker">暂无内容</p>
                    </article>
                    <article className="palette-candidate">
                        <h3>选中态 / --accent-soft</h3>
                        <Surface
                            name="选中表面"
                            kind="selected"
                            revision={revision}
                        >
                            <p>✓ 当前选中项</p>
                        </Surface>
                    </article>
                </div>
            </Section>
        </PageShell>
    );
}
