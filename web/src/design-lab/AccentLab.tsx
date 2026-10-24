import {
    type ChangeEvent,
    type KeyboardEvent,
    type PointerEvent,
    useEffect,
    useRef,
    useState,
} from "react";
import { Link } from "react-router-dom";
import { type AccentId, ACCENTS } from "@shared/contracts.ts";
import type { WallpaperComposition } from "@shared/wallpaper.ts";
import { DEFAULT_WALLPAPER_PRESENTATION } from "@shared/wallpaper-presentation.ts";
import { type Appearance, useAppState } from "../app/state.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { Section } from "../components/searcher/semantic.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { WallpaperSurface } from "../components/wallpaper/WallpaperSurface.tsx";
import {
    applyWallpaperAccent,
    useWallpaperAccent,
} from "../components/wallpaper/wallpaper-accent-source.ts";
import {
    accentContrast,
    type AccentPalette,
} from "../design-system/wallpaper-accent.ts";
import "./design-lab.css";
import "./accent-lab.css";

type Rgb = readonly [number, number, number];
type Band = { readonly until: number; readonly color: Rgb };

/** Procedural "photos": horizontal bands with per-pixel jitter, plus point lights. */
const PAINTED: readonly {
    id: string;
    label: string;
    bands: readonly Band[];
    jitter: number;
    lights?: Rgb;
    split?: Rgb;
}[] = [
    {
        id: "dawn",
        label: "晨曦海岸",
        bands: [
            { until: 0.35, color: [244, 170, 120] },
            { until: 0.55, color: [236, 196, 170] },
            { until: 1, color: [44, 92, 150] },
        ],
        jitter: 30,
    },
    {
        id: "forest",
        label: "森林",
        bands: [
            { until: 0.25, color: [190, 210, 200] },
            { until: 1, color: [46, 104, 54] },
        ],
        jitter: 50,
    },
    {
        id: "night",
        label: "城市夜景",
        bands: [{ until: 1, color: [12, 18, 40] }],
        jitter: 12,
        lights: [255, 196, 90],
    },
    {
        id: "neon",
        label: "霓虹",
        bands: [
            { until: 0.5, color: [236, 20, 190] },
            { until: 1, color: [20, 220, 240] },
        ],
        jitter: 10,
    },
    {
        id: "split",
        label: "红蓝对开",
        bands: [{ until: 1, color: [214, 40, 40] }],
        jitter: 8,
        split: [36, 70, 214],
    },
    {
        id: "black",
        label: "纯黑",
        bands: [{ until: 1, color: [0, 0, 0] }],
        jitter: 0,
    },
    {
        id: "white",
        label: "纯白",
        bands: [{ until: 1, color: [255, 255, 255] }],
        jitter: 0,
    },
];

const GRADIENT_SAMPLE =
    "linear-gradient(135deg, rgb(246 211 101), rgb(253 160 133))";

function paint(sample: (typeof PAINTED)[number]): string {
    const width = 320;
    const height = 180;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return "";
    const image = context.createImageData(width, height);
    let state = 7;
    const random = () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
    for (let y = 0; y < height; y++) {
        const band = sample.bands.find((b) => y / height <= b.until) ??
            sample.bands[sample.bands.length - 1];
        for (let x = 0; x < width; x++) {
            let color = sample.split && x >= width / 2
                ? sample.split
                : band.color;
            if (sample.lights && random() < 0.03) color = sample.lights;
            const jitter = (random() - 0.5) * sample.jitter;
            image.data.set(
                [...color.map((v) => v + jitter), 255],
                (y * width + x) * 4,
            );
        }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
}

function resolveTheme(theme: Appearance["theme"]): "light" | "dark" {
    if (theme !== "system") return theme;
    return matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function PaletteTable(
    { theme, palette }: { theme: "light" | "dark"; palette: AccentPalette },
) {
    return (
        <table className="accent-lab-table" data-testid={`accent-lab-${theme}`}>
            <caption>
                {`${
                    theme === "light"
                        ? "浅色"
                        : "深色"
                } · 强调色 ${palette.accent} · 前景 ${palette.foreground}`}
            </caption>
            <tbody>
                {accentContrast(theme, palette).map((check) => (
                    <tr
                        key={check.label}
                        data-pass={check.ratio >= check.minimum}
                    >
                        <th scope="row">{check.label}</th>
                        <td>{check.ratio.toFixed(2)}:1</td>
                        <td>≥ {check.minimum}:1</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/** Prototype for #241 S: the accent follows the wallpaper's focal region. */
export default function AccentLab() {
    const { appearance: saved } = useAppState();
    const [theme, setTheme] = useState<Appearance["theme"]>(saved.theme);
    const [samples, setSamples] = useState<
        { id: string; label: string; source: string }[]
    >([]);
    const [source, setSource] = useState("");
    const [remote, setRemote] = useState("");
    const [point, setPoint] = useState<WallpaperComposition>(
        DEFAULT_WALLPAPER_PRESENTATION.composition,
    );
    const [choice, setChoice] = useState<"wallpaper" | AccentId>("wallpaper");
    const [checked, setChecked] = useState(true);
    const fileInput = useRef<HTMLInputElement>(null);
    const derived = useWallpaperAccent(source, point);

    useEffect(() => {
        const painted = PAINTED.map((sample) => ({
            id: sample.id,
            label: sample.label,
            source: paint(sample),
        }));
        const all = [
            ...painted,
            { id: "gradient", label: "渐变", source: GRADIENT_SAMPLE },
        ];
        setSamples(all);
        setSource(all[0].source);
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        const original = {
            theme: root.dataset.theme,
            accent: root.dataset.accent,
        };
        return () => {
            applyWallpaperAccent(root, null);
            for (const [key, value] of Object.entries(original)) {
                if (value === undefined) delete root.dataset[key];
                else root.dataset[key] = value;
            }
        };
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = resolveTheme(theme);
        root.dataset.accent = choice;
        applyWallpaperAccent(root, derived);
    }, [theme, choice, derived]);

    const moveFocal = (event: PointerEvent<HTMLDivElement>) => {
        const box = event.currentTarget.getBoundingClientRect();
        setPoint({
            focalX: Math.min(
                1,
                Math.max(0, (event.clientX - box.left) / box.width),
            ),
            focalY: Math.min(
                1,
                Math.max(0, (event.clientY - box.top) / box.height),
            ),
        });
    };
    const nudgeFocal = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = {
            ArrowLeft: [-0.05, 0],
            ArrowRight: [0.05, 0],
            ArrowUp: [0, -0.05],
            ArrowDown: [0, 0.05],
        }[event.key];
        if (!step) return;
        event.preventDefault();
        setPoint((current) => ({
            focalX: Math.min(1, Math.max(0, current.focalX + step[0])),
            focalY: Math.min(1, Math.max(0, current.focalY + step[1])),
        }));
    };
    const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") setSource(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const status = !source
        ? "无壁纸：跟随壁纸时使用默认经典蓝"
        : !derived
        ? "无法读取壁纸像素（如远程图片未开放 CORS）：使用默认经典蓝"
        : derived.seed.chroma === 0
        ? "壁纸为中性色：派生中性强调色"
        : `色相 ${derived.seed.hue}° · 彩度 ${derived.seed.chroma}`;

    return (
        <PageShell archetype="workbench" className="design-lab-page accent-lab">
            <PageHeader title="壁纸取色" />
            <p>
                原型：强调色取自壁纸焦点区域的主色，按浅色 /
                深色分别校正对比度；手选强调色作为覆盖。
                <Link to="/design-lab">返回设计实验室</Link>
            </p>

            <Section title="壁纸">
                <RadioGroup
                    variant="segmented"
                    aria-label="示例壁纸"
                    value={samples.find((s) =>
                        s.source === source
                    )?.id ?? ""}
                    onValueChange={(id) => {
                        const next = samples.find((s) => s.id === id);
                        if (next) setSource(next.source);
                    }}
                >
                    {samples.map((sample) => (
                        <RadioGroupItem key={sample.id} value={sample.id}>
                            {sample.label}
                        </RadioGroupItem>
                    ))}
                </RadioGroup>
                <div className="design-lab-row">
                    <Input
                        className="accent-lab-remote"
                        placeholder="https:// 图片地址"
                        aria-label="图片地址"
                        value={remote}
                        onChange={(event) =>
                            setRemote(event.currentTarget.value)}
                    />
                    <Button
                        variant="outline"
                        onClick={() => setSource(remote.trim())}
                    >
                        使用地址
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => fileInput.current?.click()}
                    >
                        选择本地图片
                    </Button>
                    <input
                        ref={fileInput}
                        type="file"
                        hidden
                        accept="image/png,image/jpeg,image/webp,image/avif"
                        aria-label="本地图片"
                        onChange={pickFile}
                    />
                    <Button variant="ghost" onClick={() => setSource("")}>
                        移除壁纸
                    </Button>
                </div>
                <div
                    className="accent-lab-stage"
                    role="slider"
                    tabIndex={0}
                    aria-label="取色焦点"
                    aria-valuetext={`横向 ${
                        Math.round(point.focalX * 100)
                    }%，纵向 ${Math.round(point.focalY * 100)}%`}
                    onPointerDown={moveFocal}
                    onKeyDown={nudgeFocal}
                >
                    <WallpaperSurface
                        embedded
                        source={source}
                        presentation={{
                            ...DEFAULT_WALLPAPER_PRESENTATION,
                            composition: point,
                            readability: "none",
                        }}
                    />
                    <span
                        className="accent-lab-focal"
                        aria-hidden="true"
                        style={{
                            left: `${point.focalX * 100}%`,
                            top: `${point.focalY * 100}%`,
                        }}
                    />
                </div>
                <p
                    className="accent-lab-status"
                    data-testid="accent-lab-status"
                >
                    {status}
                </p>
            </Section>

            <Section title="强调色来源">
                <div className="design-lab-row">
                    <RadioGroup
                        variant="swatch"
                        aria-label="强调色"
                        value={choice}
                        onValueChange={(next) =>
                            setChoice(next as typeof choice)}
                    >
                        <RadioGroupItem
                            value="wallpaper"
                            aria-label="跟随壁纸"
                            title="跟随壁纸"
                        >
                            <span
                                className="design-lab-swatch-dot"
                                data-accent="wallpaper"
                                aria-hidden="true"
                            />
                        </RadioGroupItem>
                        {ACCENTS.map((item) => (
                            <RadioGroupItem
                                key={item.id}
                                value={item.id}
                                aria-label={item.label}
                                title={item.label}
                            >
                                <span
                                    className="design-lab-swatch-dot"
                                    data-accent={item.id}
                                    aria-hidden="true"
                                />
                            </RadioGroupItem>
                        ))}
                    </RadioGroup>
                    <RadioGroup
                        variant="segmented"
                        aria-label="主题"
                        value={theme}
                        onValueChange={(next) =>
                            setTheme(next as Appearance["theme"])}
                    >
                        <RadioGroupItem value="system">跟随系统</RadioGroupItem>
                        <RadioGroupItem value="light">浅色</RadioGroupItem>
                        <RadioGroupItem value="dark">深色</RadioGroupItem>
                    </RadioGroup>
                </div>
                <div className="design-lab-row">
                    <Button variant="default">主要操作</Button>
                    <Button variant="outline">次要操作</Button>
                    <Switch
                        checked={checked}
                        onCheckedChange={setChecked}
                        aria-label="示例开关"
                    />
                    <span className="accent-lab-ring">焦点环</span>
                </div>
            </Section>

            <Section title="派生结果" id="accent-lab-palettes">
                {derived
                    ? (
                        <div className="accent-lab-palettes">
                            <PaletteTable
                                theme="light"
                                palette={derived.light}
                            />
                            <PaletteTable theme="dark" palette={derived.dark} />
                        </div>
                    )
                    : <p>没有可读取的壁纸像素。</p>}
            </Section>
        </PageShell>
    );
}
