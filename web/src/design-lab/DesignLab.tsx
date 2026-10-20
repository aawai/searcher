import { useEffect, useRef, useState } from "react";
import type { EngineId } from "@shared/engines.ts";
import { ACCENT_IDS } from "@shared/contracts.ts";
import { type Appearance, useAppState } from "../app/state.tsx";

// UI primitives
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../components/ui/native-select.tsx";
import { Slider } from "../components/ui/slider.tsx";
import { Switch } from "../components/ui/switch.tsx";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "../components/ui/tabs.tsx";
import { Badge } from "../components/ui/badge.tsx";

import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../components/ui/dialog.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "../components/ui/alert-dialog.tsx";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../components/ui/table.tsx";

// Searcher components & semantic layer
import {
    type PageArchetype,
    PageShell,
} from "../components/searcher/PageShell.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import {
    ActionGroup,
    EmptyState,
    LocalNavigation,
    ManagementTable,
    Section,
    SettingsCard,
    SettingsRow,
    StatusBanner,
    WorkspaceToolbar,
} from "../components/searcher/semantic.tsx";
import { SearcherSearchInput } from "../components/searcher/SearcherSearchInput.tsx";
import {
    WebAppIcon,
    type WebAppItem,
} from "../components/searcher/WebAppIcon.tsx";
import { FloatingNotes } from "../components/searcher/FloatingNotes.tsx";
import { NoteCard, type NoteItem } from "../components/searcher/NoteCard.tsx";
import { WorkspaceShell } from "../features/workspace/WorkspaceShell.tsx";
import { WorkspaceNavigation } from "../features/workspace/WorkspaceNavigation.tsx";
import {
    parentWorkspaceRoute,
    type WorkspaceRoute,
} from "../features/workspace/workspace-state.ts";

import "./design-lab.css";

// Fixture Data
const appsFixture: WebAppItem[] = [
    { id: "github", name: "GitHub", url: "https://github.com", isPinned: true },
    {
        id: "docs",
        name: "文档中心",
        url: "https://example.com/docs",
        isPinned: true,
    },
    {
        id: "notes",
        name: "便签空间",
        url: "https://example.com/notes",
        isPinned: true,
    },
    {
        id: "mail",
        name: "邮箱",
        url: "https://example.com/mail",
        isPinned: true,
    },
];

const notesFixture: NoteItem[] = [
    {
        id: "note-1",
        title: "设计系统契约",
        body: "所有表面统一遵循 Archetype、Material Levels 与 Token Taxonomy。",
        color: "paper",
        version: 1,
        isPinned: true,
        isHomeFixed: true,
    },
    {
        id: "note-2",
        title: "交互无漂移",
        body:
            "严禁在业务层引入原生 box-shadow、font-size 与 border-radius 散落样式。",
        color: "amber",
        version: 1,
        isPinned: true,
        isHomeFixed: true,
    },
    {
        id: "note-3",
        title: "多设备响应适配",
        body: "390px、768px、1440px 下严禁产生页面级水平横向滚动溢出。",
        color: "sky",
        version: 1,
        isPinned: true,
        isHomeFixed: true,
    },
];

const themes = ["system", "light", "dark"] as const;
const styles = ["zen", "widgets"] as const;
const accents = ACCENT_IDS;
const shapes = ["rounded", "pill"] as const;

export function DesignLab() {
    // 1. Live appearance state - isolated preview without persistent writes
    const { appearance: savedAppearance } = useAppState();
    const [appearance, setAppearance] = useState<Appearance>(savedAppearance);

    // Dynamic stage controls
    const [noteCount, setNoteCount] = useState(3);
    const [engine, setEngine] = useState<EngineId>("bing");
    const [searchMode, setSearchMode] = useState<"search" | "ai">("search");
    const [model, setModel] = useState("fixture-a");
    const [workspaceOpen, setWorkspaceOpen] = useState(false);
    const [workspace, setWorkspace] = useState<WorkspaceRoute>({
        view: "apps/root",
    });
    const [feedbackMessage, setFeedbackMessage] = useState("");

    // Lab navigation tabs
    const [labTab, setLabTab] = useState<
        | "foundations"
        | "primitives"
        | "semantic"
        | "surfaces"
        | "interaction"
        | "responsive"
    >("foundations");

    // Responsive preview fixture controls
    const [previewWidth, setPreviewWidth] = useState<
        390 | 640 | 768 | 960 | 1440
    >(
        768,
    );
    const [previewArchetype, setPreviewArchetype] = useState<PageArchetype>(
        "utility",
    );
    const [hasOverflow, setHasOverflow] = useState(false);
    const viewportFrameRef = useRef<HTMLDivElement>(null);

    // Reduced motion simulation toggle
    const [simulatedReducedMotion, setSimulatedReducedMotion] = useState(false);

    // Interactive state playground states
    const [interactiveInput, setInteractiveInput] = useState("测试输入值");

    const [isLoadingButton, setIsLoadingButton] = useState(false);
    const [switchChecked, setSwitchChecked] = useState(true);

    // Clean restore on unmount - ensures NO dirty writes to global dataset
    useEffect(() => {
        const root = document.documentElement;
        const previous: Record<string, string | undefined> = {
            theme: root.dataset.theme,
            accent: root.dataset.accent,
            shape: root.dataset.shape,
        };
        return () => {
            for (const [key, val] of Object.entries(previous)) {
                if (val === undefined) {
                    delete root.dataset[key];
                } else {
                    root.dataset[key] = val;
                }
            }
        };
    }, []);

    // Apply preview dataset to documentElement during inspection
    useEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = appearance.theme === "system"
            ? (matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light")
            : appearance.theme;
        root.dataset.accent = appearance.accent;
        root.dataset.shape = appearance.shape;
    }, [
        appearance.theme,
        appearance.style,
        appearance.accent,
        appearance.shape,
    ]);

    // Check viewport container overflow on breakpoint change
    useEffect(() => {
        if (viewportFrameRef.current) {
            const el = viewportFrameRef.current;
            setHasOverflow(el.scrollWidth > el.clientWidth);
        }
    }, [previewWidth, previewArchetype, labTab]);

    function changeAppearance<K extends keyof Appearance>(
        key: K,
        value: Appearance[K],
    ) {
        setAppearance((prev) => ({ ...prev, [key]: value }));
    }

    function resetAppearance() {
        setAppearance(savedAppearance);
        setNoteCount(3);
        setFeedbackMessage("已重置为当前保存的偏好设置");
    }

    return (
        <PageShell archetype="workbench" className="design-lab-page">
            <PageHeader
                items={[{ label: "首页", to: "/" }, { label: "Design Lab" }]}
                title="Design Lab"
                description="正式组件与设计系统验证面板。不持久化偏好设置，不修改真实业务数据。"
                actions={
                    <div className="lab-header-actions">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={resetAppearance}
                        >
                            重置预览
                        </Button>
                    </div>
                }
            />

            {/* Top Inspector & Live Preview Controls */}
            <div className="lab-inspector-card">
                <div className="lab-stage-header">
                    <div>
                        <h2 className="lab-stage-title">环境参数检视器</h2>
                        <p className="lab-stage-desc">
                            使用正式 NativeSelect 与 Slider
                            控件调试，所有改动仅在当前页面有效。
                        </p>
                    </div>
                    <Badge variant="outline">
                        状态隔离：无持久化脏写
                    </Badge>
                </div>

                <div className="lab-inspector-grid">
                    <div className="lab-field">
                        <label
                            className="lab-field-label"
                            htmlFor="lab-theme-select"
                        >
                            主题 (Theme)
                        </label>
                        <NativeSelect
                            id="lab-theme-select"
                            value={appearance.theme}
                            onChange={(e) =>
                                changeAppearance(
                                    "theme",
                                    e.target.value as Appearance["theme"],
                                )}
                        >
                            {themes.map((t) => (
                                <NativeSelectOption key={t} value={t}>
                                    {t === "system"
                                        ? "跟随系统"
                                        : t === "dark"
                                        ? "深色模式"
                                        : "浅色模式"}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </div>

                    <div className="lab-field">
                        <label
                            className="lab-field-label"
                            htmlFor="lab-style-select"
                        >
                            桌面风格 (Style)
                        </label>
                        <NativeSelect
                            id="lab-style-select"
                            value={appearance.style}
                            onChange={(e) =>
                                changeAppearance(
                                    "style",
                                    e.target.value as Appearance["style"],
                                )}
                        >
                            {styles.map((s) => (
                                <NativeSelectOption key={s} value={s}>
                                    {s === "zen"
                                        ? "极简 (Zen)"
                                        : "小部件 (Widgets)"}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </div>

                    <div className="lab-field">
                        <label
                            className="lab-field-label"
                            htmlFor="lab-accent-select"
                        >
                            强调色 (Accent)
                        </label>
                        <NativeSelect
                            id="lab-accent-select"
                            value={appearance.accent}
                            onChange={(e) =>
                                changeAppearance(
                                    "accent",
                                    e.target.value as Appearance["accent"],
                                )}
                        >
                            {accents.map((a) => (
                                <NativeSelectOption key={a} value={a}>
                                    {a}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </div>

                    <div className="lab-field">
                        <label
                            className="lab-field-label"
                            htmlFor="lab-shape-select"
                        >
                            几何形状 (Shape)
                        </label>
                        <NativeSelect
                            id="lab-shape-select"
                            value={appearance.shape}
                            onChange={(e) =>
                                changeAppearance(
                                    "shape",
                                    e.target.value as Appearance["shape"],
                                )}
                        >
                            {shapes.map((s) => (
                                <NativeSelectOption key={s} value={s}>
                                    {s === "rounded"
                                        ? "圆角 (Rounded)"
                                        : "胶囊 (Pill)"}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </div>

                    <div className="lab-field">
                        <div className="lab-field-label">
                            <span>固定便签数</span>
                            <span className="lab-field-value">{noteCount}</span>
                        </div>
                        <div className="lab-field-control">
                            <Slider
                                min={0}
                                max={3}
                                step={1}
                                value={noteCount}
                                onValueChange={(val) =>
                                    setNoteCount(
                                        Array.isArray(val) ? val[0] : val,
                                    )}
                                aria-label="固定便签数量"
                            />
                        </div>
                    </div>

                    <div className="lab-field">
                        <div className="lab-field-label">
                            <span>搜索框透明度</span>
                            <span className="lab-field-value">
                                {Math.round(
                                    (appearance.searchOpacity ?? 1) * 100,
                                )}%
                            </span>
                        </div>
                        <div className="lab-field-control">
                            <Slider
                                min={0.1}
                                max={1}
                                step={0.05}
                                value={appearance.searchOpacity ?? 1}
                                onValueChange={(val) =>
                                    changeAppearance(
                                        "searchOpacity",
                                        Array.isArray(val) ? val[0] : val,
                                    )}
                                aria-label="搜索框透明度"
                            />
                        </div>
                    </div>

                    <div className="lab-field">
                        <div className="lab-field-label">
                            <span>首页主标</span>
                            <span className="lab-field-value">
                                {appearance.showTitle !== false
                                    ? "显示"
                                    : "隐藏"}
                            </span>
                        </div>
                        <div className="lab-field-control">
                            <Switch
                                checked={appearance.showTitle !== false}
                                onCheckedChange={(checked) =>
                                    changeAppearance("showTitle", checked)}
                                aria-label="切换主标题显示"
                            />
                        </div>
                    </div>

                    <div className="lab-field">
                        <div className="lab-field-label">
                            <span>模拟减弱动画</span>
                            <span className="lab-field-value">
                                {simulatedReducedMotion ? "开启" : "默认"}
                            </span>
                        </div>
                        <div className="lab-field-control">
                            <Switch
                                checked={simulatedReducedMotion}
                                onCheckedChange={setSimulatedReducedMotion}
                                aria-label="模拟减弱动画偏好"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Tabs Navigation */}
            <div
                className="lab-tabs lab-reduced-motion-demo"
                data-simulated-reduced-motion={simulatedReducedMotion}
            >
                <Tabs
                    value={labTab}
                    onValueChange={(val) => setLabTab(val as typeof labTab)}
                >
                    <TabsList className="lab-tabs-list">
                        <TabsTrigger value="foundations">
                            1. 基础 Token 与层级
                        </TabsTrigger>
                        <TabsTrigger value="primitives">
                            2. 原子控件与变体
                        </TabsTrigger>
                        <TabsTrigger value="semantic">
                            3. 语义结构组件
                        </TabsTrigger>
                        <TabsTrigger value="surfaces">
                            4. 表面与实页层级
                        </TabsTrigger>
                        <TabsTrigger value="interaction">
                            5. 交互全状态矩阵
                        </TabsTrigger>
                        <TabsTrigger value="responsive">
                            6. 多断点适配治具
                        </TabsTrigger>
                    </TabsList>

                    {
                        /* =========================================================================
                       TAB 1: Foundations
                       ========================================================================= */
                    }
                    <TabsContent value="foundations">
                        <div className="lab-stage-card">
                            <Section
                                title="材质与表面层级 (Material Surface Architecture)"
                                description="Searcher 设计系统定义四级材质表面，自底向上承载视觉深度。"
                            >
                                <div className="lab-swatch-grid">
                                    <div className="lab-swatch-item">
                                        <div className="lab-swatch-preview">
                                            L0 画板层
                                        </div>
                                        <div className="lab-swatch-info">
                                            <span className="lab-swatch-name">
                                                Canvas / Background
                                            </span>
                                            <span className="lab-swatch-token">
                                                --surface-l0 (var(--background))
                                            </span>
                                        </div>
                                    </div>

                                    <div className="lab-swatch-item">
                                        <div className="lab-swatch-preview">
                                            L1 内容层
                                        </div>
                                        <div className="lab-swatch-info">
                                            <span className="lab-swatch-name">
                                                Card / Table / Section
                                            </span>
                                            <span className="lab-swatch-token">
                                                --surface-l1
                                                (var(--surface-solid))
                                            </span>
                                        </div>
                                    </div>

                                    <div className="lab-swatch-item">
                                        <div className="lab-swatch-preview">
                                            L2 主操作层
                                        </div>
                                        <div className="lab-swatch-info">
                                            <span className="lab-swatch-name">
                                                Search / Dock / Primary Action
                                            </span>
                                            <span className="lab-swatch-token">
                                                --surface-l2
                                                (var(--surface-solid))
                                            </span>
                                        </div>
                                    </div>

                                    <div className="lab-swatch-item">
                                        <div className="lab-swatch-preview">
                                            L3 浮层覆盖
                                        </div>
                                        <div className="lab-swatch-info">
                                            <span className="lab-swatch-name">
                                                Dialog / Sheet / Popover
                                            </span>
                                            <span className="lab-swatch-token">
                                                --surface-l3
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Section>

                            <Section
                                title="强调色体系 (Accent Palette)"
                                description="全站支持的无障碍标准强调色，适配深浅双色模式。"
                            >
                                <div className="lab-swatch-grid">
                                    {accents.map((acc) => (
                                        <div
                                            key={acc}
                                            className="lab-swatch-item"
                                        >
                                            <div className="lab-swatch-preview">
                                                {acc}
                                            </div>
                                            <div className="lab-swatch-info">
                                                <span className="lab-swatch-name">
                                                    Accent: {acc}
                                                </span>
                                                <span className="lab-swatch-token">
                                                    data-accent="{acc}"
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Section>

                            <Section
                                title="排版标尺 (Typography Scale)"
                                description="定义标准字阶与行高，严禁使用非标任意 font-size。"
                            >
                                <div className="lab-typography-table">
                                    <div className="lab-typography-row">
                                        <span className="lab-typography-role">
                                            --font-page-title
                                        </span>
                                        <span className="lab-typography-metric">
                                            28px / 36px (600)
                                        </span>
                                        <div className="lab-font-page-sample">
                                            Searcher 页面级主标题
                                        </div>
                                    </div>
                                    <div className="lab-typography-row">
                                        <span className="lab-typography-role">
                                            --font-section-title
                                        </span>
                                        <span className="lab-typography-metric">
                                            20px / 28px (600)
                                        </span>
                                        <div className="lab-font-section-sample">
                                            Section 结构章节标题
                                        </div>
                                    </div>
                                    <div className="lab-typography-row">
                                        <span className="lab-typography-role">
                                            --font-component-title
                                        </span>
                                        <span className="lab-typography-metric">
                                            16px / 24px (600)
                                        </span>
                                        <div className="lab-font-component-sample">
                                            Card 组件区块标题
                                        </div>
                                    </div>
                                    <div className="lab-typography-row">
                                        <span className="lab-typography-role">
                                            --font-body
                                        </span>
                                        <span className="lab-typography-metric">
                                            14px / 1.57 (400)
                                        </span>
                                        <p className="lab-stage-desc">
                                            正文通用段落内容，清晰易读的标准字体呈现。
                                        </p>
                                    </div>
                                    <div className="lab-typography-row">
                                        <span className="lab-typography-role">
                                            --font-caption
                                        </span>
                                        <span className="lab-typography-metric">
                                            13px / 20px (400)
                                        </span>
                                        <span className="lab-field-label">
                                            次级提示与辅助说明文字
                                        </span>
                                    </div>
                                    <div className="lab-typography-row">
                                        <span className="lab-typography-role">
                                            --font-metadata
                                        </span>
                                        <span className="lab-typography-metric">
                                            12px / 18px (400)
                                        </span>
                                        <span className="lab-swatch-token">
                                            元数据与小标签标识
                                        </span>
                                    </div>
                                    <div className="lab-typography-row">
                                        <span className="lab-typography-role">
                                            --font-code
                                        </span>
                                        <span className="lab-typography-metric">
                                            13px / 20px (Mono)
                                        </span>
                                        <code className="lab-field-value">
                                            const contract = "verified";
                                        </code>
                                    </div>
                                </div>
                            </Section>
                        </div>
                    </TabsContent>

                    {
                        /* =========================================================================
                       TAB 2: Primitives
                       ========================================================================= */
                    }
                    <TabsContent value="primitives">
                        <div className="lab-stage-card">
                            <Section
                                title="按钮原子控件 (Button Primitives)"
                                description="涵盖 default、outline、destructive、ghost 与 link 等官方变体。"
                            >
                                <div className="lab-primitive-cluster">
                                    <Button variant="default">
                                        Primary (主要)
                                    </Button>
                                    <Button variant="outline">
                                        Subtle (次要)
                                    </Button>
                                    <Button variant="destructive">
                                        Danger (危险)
                                    </Button>
                                    <Button variant="ghost">
                                        Ghost (幽灵)
                                    </Button>
                                    <Button variant="link">Link (链接)</Button>
                                    <Button variant="default" size="sm">
                                        小尺寸 (sm)
                                    </Button>
                                    <Button variant="default" disabled>
                                        禁用按钮
                                    </Button>
                                </div>
                            </Section>

                            <Section
                                title="输入与表单原子控件 (Form Controls)"
                                description="遵循统一聚焦环、几何圆角与无障碍状态反馈。"
                            >
                                <div className="lab-primitive-cluster">
                                    <div className="lab-primitive-box">
                                        <h4 className="lab-primitive-box-title">
                                            文本输入框 (Input)
                                        </h4>
                                        <Input
                                            value={interactiveInput}
                                            onChange={(e) =>
                                                setInteractiveInput(
                                                    e.target.value,
                                                )}
                                            placeholder="标准文本输入"
                                            aria-label="测试输入框"
                                        />
                                        <Input
                                            disabled
                                            value="已禁用输入框"
                                            aria-label="已禁用输入框"
                                        />
                                        <Input
                                            aria-invalid="true"
                                            value="校验未通过格式"
                                            aria-label="校验未通过输入框"
                                        />
                                    </div>

                                    <div className="lab-primitive-box">
                                        <h4 className="lab-primitive-box-title">
                                            多行输入框 (Textarea)
                                        </h4>
                                        <Textarea
                                            rows={2}
                                            placeholder="多行文本输入组件"
                                            aria-label="多行文本"
                                        />
                                    </div>

                                    <div className="lab-primitive-box">
                                        <h4 className="lab-primitive-box-title">
                                            状态徽章 (Badge)
                                        </h4>
                                        <div className="lab-primitive-cluster">
                                            <Badge variant="default">
                                                Default
                                            </Badge>
                                            <Badge variant="secondary">
                                                Secondary
                                            </Badge>
                                            <Badge variant="destructive">
                                                Destructive
                                            </Badge>
                                            <Badge variant="outline">
                                                Outline
                                            </Badge>
                                            <Badge variant="ghost">Ghost</Badge>
                                        </div>
                                    </div>
                                </div>
                            </Section>

                            <Section
                                title="弹窗与遮罩控件 (Overlays & Dialogs)"
                                description="验证 Dialog、AlertDialog 与 Sheet 的无障碍唤起与焦点管理。"
                            >
                                <div className="lab-primitive-cluster">
                                    {/* Dialog */}
                                    <Dialog>
                                        <DialogTrigger
                                            render={
                                                <Button variant="outline" />
                                            }
                                        >
                                            打开标准 Dialog
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>
                                                    正式标准 Dialog
                                                </DialogTitle>
                                                <DialogDescription>
                                                    此弹窗基于 Base UI 与规范
                                                    Token
                                                    构建，拥有焦点陷阱与无障碍遮罩。
                                                </DialogDescription>
                                            </DialogHeader>
                                            <DialogFooter>
                                                <DialogClose
                                                    render={
                                                        <Button variant="outline" />
                                                    }
                                                >
                                                    关闭
                                                </DialogClose>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>

                                    {/* AlertDialog */}
                                    <AlertDialog>
                                        <AlertDialogTrigger
                                            render={
                                                <Button variant="destructive" />
                                            }
                                        >
                                            打开确认 Dialog
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>
                                                    确认删除此项配置？
                                                </AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    此操作用于检验 AlertDialog
                                                    危险动作变体与遮罩交互。
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>
                                                    取消
                                                </AlertDialogCancel>
                                                <AlertDialogAction>
                                                    确认操作
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>

                                    {/* Sheet trigger */}
                                    <Button
                                        variant="default"
                                        onClick={() => {
                                            setWorkspace({ view: "apps/root" });
                                            setWorkspaceOpen(true);
                                        }}
                                    >
                                        打开 Workspace
                                    </Button>
                                </div>
                            </Section>
                        </div>
                    </TabsContent>

                    {
                        /* =========================================================================
                       TAB 3: Semantic Components
                       ========================================================================= */
                    }
                    <TabsContent value="semantic">
                        <div className="lab-stage-card">
                            <Section
                                title="章节结构与设置卡片 (Section & SettingsCard)"
                                description="检验 SectionHeader、SettingsCard 与 SettingsRow 的规范结构契约。"
                            >
                                <SettingsCard>
                                    <SettingsRow
                                        title="水平排列设置项"
                                        description="标题与描述在左侧，控制项在右侧弹性对齐。"
                                    >
                                        <Switch
                                            checked={switchChecked}
                                            onCheckedChange={setSwitchChecked}
                                            aria-label="开关演示"
                                        />
                                    </SettingsRow>
                                    <SettingsRow
                                        title="下拉选择配置行"
                                        description="嵌入标准 NativeSelect 控件，支持容器自适应换行。"
                                    >
                                        <NativeSelect
                                            size="sm"
                                            defaultValue="opt-1"
                                            aria-label="下拉选择演示"
                                        >
                                            <NativeSelectOption value="opt-1">
                                                预设选项一
                                            </NativeSelectOption>
                                            <NativeSelectOption value="opt-2">
                                                预设选项二
                                            </NativeSelectOption>
                                        </NativeSelect>
                                    </SettingsRow>
                                </SettingsCard>
                            </Section>

                            <Section
                                title="局部导航 (LocalNavigation)"
                                description="当前目标、键盘焦点与 replace history 的正式页面导航。"
                            >
                                <LocalNavigation
                                    label="语义导航示例"
                                    items={[
                                        {
                                            label: "当前工作台",
                                            to: "/design-lab",
                                        },
                                        { label: "搜索设置", to: "/settings" },
                                        {
                                            label: "用户管理",
                                            to: "/admin/users",
                                        },
                                    ]}
                                />
                            </Section>

                            <Section
                                title="状态横幅与空状态 (StatusBanner & EmptyState)"
                                description="语义化的信息、成功、错误状态横幅与缺省提示。"
                            >
                                <div className="lab-tabs">
                                    <StatusBanner tone="info">
                                        提示横幅：用于展示系统通知或状态变更说明。
                                    </StatusBanner>
                                    <StatusBanner tone="success">
                                        成功横幅：操作成功完成并已同步生效。
                                    </StatusBanner>
                                    <StatusBanner tone="error">
                                        错误横幅：输入格式有误或网络服务响应异常。
                                    </StatusBanner>
                                </div>

                                <SettingsCard>
                                    <EmptyState
                                        title="暂无内容数据"
                                        description="当列表或检索结果为空时展现规范空状态。"
                                        action={
                                            <Button variant="default" size="sm">
                                                立即创建
                                            </Button>
                                        }
                                    />
                                </SettingsCard>
                            </Section>

                            <Section
                                title="管理表格与工作区工具栏 (ManagementTable & Toolbar)"
                                description="承载结构化管理业务的容器，自带移动端水平滚动保护。"
                            >
                                <WorkspaceToolbar>
                                    <ActionGroup>
                                        <Button variant="default" size="sm">
                                            批量操作
                                        </Button>
                                        <Button variant="outline" size="sm">
                                            筛选条件
                                        </Button>
                                    </ActionGroup>
                                    <Badge variant="secondary">
                                        共计 3 项记录
                                    </Badge>
                                </WorkspaceToolbar>

                                <ManagementTable caption="系统验证数据集">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>名称</TableHead>
                                            <TableHead>类型</TableHead>
                                            <TableHead>状态</TableHead>
                                            <TableHead>更新时间</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell>设计系统架构</TableCell>
                                            <TableCell>UI Contract</TableCell>
                                            <TableCell>
                                                <Badge variant="default">
                                                    正常
                                                </Badge>
                                            </TableCell>
                                            <TableCell>刚刚</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>页面骨架规约</TableCell>
                                            <TableCell>Archetype</TableCell>
                                            <TableCell>
                                                <Badge variant="secondary">
                                                    已同步
                                                </Badge>
                                            </TableCell>
                                            <TableCell>5分钟前</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>门禁扫描器</TableCell>
                                            <TableCell>Static Guard</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    生效中
                                                </Badge>
                                            </TableCell>
                                            <TableCell>10分钟前</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </ManagementTable>
                            </Section>
                        </div>
                    </TabsContent>

                    {
                        /* =========================================================================
                       TAB 4: Surfaces & Hierarchy
                       ========================================================================= */
                    }
                    <TabsContent value="surfaces">
                        <div className="lab-stage-card">
                            <div className="lab-stage-header">
                                <div>
                                    <h3 className="lab-stage-title">
                                        Search Canvas 实页层级预览
                                    </h3>
                                    <p className="lab-stage-desc">
                                        基于真实
                                        SearcherSearchInput、WebAppIcon、FloatingNotes
                                        与 BottomNavigation 渲染。
                                    </p>
                                </div>
                                <div className="lab-header-actions">
                                    <Badge variant="outline">
                                        当前模式: {appearance.style === "zen"
                                            ? "Zen 极简"
                                            : "Widgets 小部件"}
                                    </Badge>
                                </div>
                            </div>

                            {/* Live Home Canvas Fixture */}
                            <div
                                className="lab-live-canvas"
                                style={{
                                    "--search-opacity":
                                        appearance.searchOpacity ?? 1,
                                } as React.CSSProperties}
                            >
                                {appearance.showTitle !== false && (
                                    <h2 className="lab-live-hero">
                                        Searcher<span className="lab-live-hero-dot">
                                            .
                                        </span>
                                    </h2>
                                )}

                                <div className="lab-live-search-container">
                                    <SearcherSearchInput
                                        engine={engine}
                                        onEngineChange={setEngine}
                                        mode={searchMode}
                                        onModeChange={setSearchMode}
                                        onSubmit={(q) => setFeedbackMessage(
                                            `检索提交确认：${q}`,
                                        )}
                                        models={[
                                            {
                                                id: "fixture-a",
                                                label: "旗舰推理模型",
                                                provider: "示例集群",
                                            },
                                            {
                                                id: "fixture-b",
                                                label: "快速对话模型",
                                                provider: "示例集群",
                                            },
                                        ]}
                                        selectedModel={model}
                                        onModelChange={setModel}
                                        onCheck={() => setFeedbackMessage(
                                            "浏览器网络探针已就绪",
                                        )}
                                        reachability={{
                                            google: {
                                                ok: true,
                                                checkedAt: Date.now(),
                                                latency: 68,
                                            },
                                            bing: {
                                                ok: true,
                                                checkedAt: Date.now(),
                                                latency: 42,
                                            },
                                        }}
                                    />
                                </div>

                                {feedbackMessage && (
                                    <div className="lab-feedback-banner">
                                        {feedbackMessage}
                                    </div>
                                )}

                                {/* Pinned Web Apps (Widgets / Screen) */}
                                <div className="lab-pinned-apps-grid">
                                    {appsFixture.map((app) => (
                                        <WebAppIcon
                                            key={app.id}
                                            app={app}
                                            onOpen={() =>
                                                setFeedbackMessage(
                                                    `点击打开常用应用：${app.name}`,
                                                )}
                                        />
                                    ))}
                                </div>

                                {/* Floating Notes Canvas */}
                                <div className="lab-notes-row">
                                    <FloatingNotes
                                        flow
                                        notes={notesFixture.slice(0, noteCount)}
                                        onOpen={(note) => setFeedbackMessage(
                                            `查看便签：${note.title}`,
                                        )}
                                    />
                                </div>

                                {/* NoteCard State Matrix */}
                                <div className="lab-notes-row">
                                    {([
                                        "saved",
                                        "saving",
                                        "unsynced",
                                        "error",
                                    ] as const).map((status) => (
                                        <NoteCard
                                            key={status}
                                            note={notesFixture[0]}
                                            status={status}
                                            onOpen={() =>
                                                setFeedbackMessage(
                                                    `便签状态：${status}`,
                                                )}
                                        />
                                    ))}
                                </div>

                                <WorkspaceNavigation
                                    onSelect={(kind) => {
                                        setWorkspace({
                                            view: kind === "apps"
                                                ? "apps/root"
                                                : "notes/root",
                                        });
                                        setWorkspaceOpen(true);
                                    }}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    {
                        /* =========================================================================
                       TAB 5: Interaction States Matrix
                       ========================================================================= */
                    }
                    <TabsContent value="interaction">
                        <div className="lab-stage-card">
                            <Section
                                title="交互全状态校验矩阵 (Interaction States Contract)"
                                description="验收规范要求覆盖的所有核心交互状态，确保无布局跳变与焦点丢失。"
                            >
                                <div className="lab-matrix-table-wrapper">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>
                                                    状态 (State)
                                                </TableHead>
                                                <TableHead>
                                                    规范行为要求
                                                </TableHead>
                                                <TableHead>
                                                    实测组件展现
                                                </TableHead>
                                                <TableHead>状态标识</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            <TableRow>
                                                <TableCell>
                                                    Default (默认常态)
                                                </TableCell>
                                                <TableCell>
                                                    静止未悬浮，对比度符合 WCAG
                                                    AA
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                    >
                                                        默认按钮
                                                    </Button>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="lab-matrix-status-pill">
                                                        静止
                                                    </span>
                                                </TableCell>
                                            </TableRow>

                                            <TableRow>
                                                <TableCell>
                                                    Hover (指针悬浮)
                                                </TableCell>
                                                <TableCell>
                                                    微交互过渡，明度提升或底色平滑变换
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                    >
                                                        悬浮体验按钮
                                                    </Button>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="lab-matrix-status-pill">
                                                        可交互
                                                    </span>
                                                </TableCell>
                                            </TableRow>

                                            <TableRow>
                                                <TableCell>
                                                    Focus / Focus-visible
                                                    (键盘聚焦)
                                                </TableCell>
                                                <TableCell>
                                                    严禁消除聚焦环，展示
                                                    var(--ring) 轮廓
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        defaultValue="Tab 键导航至此查看聚焦环"
                                                        aria-label="聚焦状态演示"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <span
                                                        className="lab-matrix-status-pill"
                                                        data-state="active"
                                                    >
                                                        高亮聚焦
                                                    </span>
                                                </TableCell>
                                            </TableRow>

                                            <TableRow>
                                                <TableCell>
                                                    Active / Pressed (按下状态)
                                                </TableCell>
                                                <TableCell>
                                                    触控轻微缩放响应，无布局位移抖动
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                    >
                                                        点击按下体验
                                                    </Button>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="lab-matrix-status-pill">
                                                        微动效
                                                    </span>
                                                </TableCell>
                                            </TableRow>

                                            <TableRow>
                                                <TableCell>
                                                    Selected (选中激活)
                                                </TableCell>
                                                <TableCell>
                                                    容器色变与描边加重，aria-selected
                                                    保持同步
                                                </TableCell>
                                                <TableCell>
                                                    <div className="lab-primitive-cluster">
                                                        <Badge variant="default">
                                                            已选中标签
                                                        </Badge>
                                                        <Switch
                                                            checked
                                                            aria-label="已选中开关"
                                                        />
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span
                                                        className="lab-matrix-status-pill"
                                                        data-state="active"
                                                    >
                                                        已选中
                                                    </span>
                                                </TableCell>
                                            </TableRow>

                                            <TableRow>
                                                <TableCell>
                                                    Disabled (禁用状态)
                                                </TableCell>
                                                <TableCell>
                                                    透明度 0.5，pointer-events:
                                                    none，无指针响应
                                                </TableCell>
                                                <TableCell>
                                                    <div className="lab-primitive-cluster">
                                                        <Button
                                                            disabled
                                                            size="sm"
                                                        >
                                                            禁用动作
                                                        </Button>
                                                        <Input
                                                            disabled
                                                            value="禁止编辑"
                                                            aria-label="已禁用"
                                                        />
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="lab-matrix-status-pill">
                                                        已禁用
                                                    </span>
                                                </TableCell>
                                            </TableRow>

                                            <TableRow>
                                                <TableCell>
                                                    Loading / Saving (加载中)
                                                </TableCell>
                                                <TableCell>
                                                    指示器旋转，状态保存中或异步等待
                                                </TableCell>
                                                <TableCell>
                                                    <div className="lab-primitive-cluster">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => {
                                                                setIsLoadingButton(
                                                                    true,
                                                                );
                                                                setTimeout(
                                                                    () =>
                                                                        setIsLoadingButton(
                                                                            false,
                                                                        ),
                                                                    1200,
                                                                );
                                                            }}
                                                        >
                                                            {isLoadingButton
                                                                ? "保存同步中..."
                                                                : "触发异步状态"}
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span
                                                        className="lab-matrix-status-pill"
                                                        data-state="active"
                                                    >
                                                        加载中
                                                    </span>
                                                </TableCell>
                                            </TableRow>

                                            <TableRow>
                                                <TableCell>
                                                    Error / Invalid (校验异常)
                                                </TableCell>
                                                <TableCell>
                                                    aria-invalid="true"，标红边框与错误状态指示
                                                </TableCell>
                                                <TableCell>
                                                    <div className="lab-primitive-cluster">
                                                        <Input
                                                            aria-invalid="true"
                                                            defaultValue="格式异常输入"
                                                            aria-label="错误状态输入"
                                                        />
                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                        >
                                                            危险报错
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span
                                                        className="lab-matrix-status-pill"
                                                        data-state="error"
                                                    >
                                                        校验错误
                                                    </span>
                                                </TableCell>
                                            </TableRow>

                                            <TableRow>
                                                <TableCell>
                                                    Overlay Open (浮层弹开展现)
                                                </TableCell>
                                                <TableCell>
                                                    桌面非模态侧栏；移动端模态
                                                    Bottom Sheet
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setWorkspace({
                                                                view:
                                                                    "apps/root",
                                                            });
                                                            setWorkspaceOpen(
                                                                true,
                                                            );
                                                        }}
                                                    >
                                                        呼出 Workspace
                                                    </Button>
                                                </TableCell>
                                                <TableCell>
                                                    <span
                                                        className="lab-matrix-status-pill"
                                                        data-state="active"
                                                    >
                                                        浮层展开
                                                    </span>
                                                </TableCell>
                                            </TableRow>

                                            <TableRow>
                                                <TableCell>
                                                    Reduced Motion (减弱动画)
                                                </TableCell>
                                                <TableCell>
                                                    动画时间压缩至
                                                    0.01ms，禁止引起眩晕的连续过渡
                                                </TableCell>
                                                <TableCell>
                                                    <div className="lab-primitive-cluster">
                                                        <Switch
                                                            checked={simulatedReducedMotion}
                                                            onCheckedChange={setSimulatedReducedMotion}
                                                            aria-label="减弱动画"
                                                        />
                                                        <span className="lab-field-value">
                                                            {simulatedReducedMotion
                                                                ? "动画已跳过"
                                                                : "遵循系统设置"}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="lab-matrix-status-pill">
                                                        {simulatedReducedMotion
                                                            ? "强制启用"
                                                            : "标准过渡"}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </div>
                            </Section>
                        </div>
                    </TabsContent>

                    {
                        /* =========================================================================
                       TAB 6: Responsive Fixtures
                       ========================================================================= */
                    }
                    <TabsContent value="responsive">
                        <div className="lab-stage-card">
                            <div className="lab-stage-header">
                                <div>
                                    <h3 className="lab-stage-title">
                                        标准视口断点适配治具
                                    </h3>
                                    <p className="lab-stage-desc">
                                        验证 390px (移动端)、640px、768px
                                        (平板)、960px (中阶) 与 1440px (桌面)
                                        容器下零横向溢出。
                                    </p>
                                </div>

                                <div className="lab-viewport-controls">
                                    {([390, 640, 768, 960, 1440] as const).map((
                                        w,
                                    ) => (
                                        <Button
                                            key={w}
                                            variant={previewWidth === w
                                                ? "default"
                                                : "outline"}
                                            size="sm"
                                            onClick={() => setPreviewWidth(w)}
                                        >
                                            {w}px {w === 390
                                                ? "(手机)"
                                                : w === 768
                                                ? "(平板)"
                                                : w === 1440
                                                ? "(桌面)"
                                                : ""}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <div className="lab-viewport-controls">
                                <span className="lab-field-label">
                                    预览骨架 (Archetype)：
                                </span>
                                {([
                                    "utility",
                                    "management",
                                    "workbench",
                                    "search",
                                ] as const).map((
                                    arch,
                                ) => (
                                    <Button
                                        key={arch}
                                        variant={previewArchetype === arch
                                            ? "default"
                                            : "ghost"}
                                        size="sm"
                                        onClick={() =>
                                            setPreviewArchetype(arch)}
                                    >
                                        {arch}
                                    </Button>
                                ))}
                            </div>

                            <div className="lab-viewport-meta">
                                <span>当前容器宽度：{previewWidth}px</span>
                                <div
                                    className="lab-overflow-indicator"
                                    data-overflow={hasOverflow}
                                >
                                    <span>●</span>
                                    <span>
                                        {hasOverflow
                                            ? "检测到内容横向溢出 (Overflow Detected)"
                                            : "零横向滚动溢出通过 (Zero Overflow Verified)"}
                                    </span>
                                </div>
                            </div>

                            {/* Responsive Simulation Viewport Frame */}
                            <div className="lab-viewport-container">
                                <div
                                    ref={viewportFrameRef}
                                    className={`lab-viewport-frame viewport-frame--${previewWidth}`}
                                >
                                    <PageShell
                                        as="section"
                                        archetype={previewArchetype}
                                    >
                                        <PageHeader
                                            titleLevel={2}
                                            items={[
                                                { label: "根目录", to: "#" },
                                                {
                                                    label:
                                                        `${previewArchetype.toUpperCase()} 视口治具`,
                                                },
                                            ]}
                                            title={`断点治具 (${previewWidth}px)`}
                                            description="验证容器内文字折行、表单换行与表格自适应布局。"
                                        />

                                        {previewArchetype === "utility" && (
                                            <SettingsCard>
                                                <SettingsRow
                                                    title="自适应设置行"
                                                    description="在窄屏下自动切换为垂直换行，避免控件被挤压溢出。"
                                                >
                                                    <Input
                                                        defaultValue="自适应输入内容"
                                                        aria-label="自适应输入内容"
                                                    />
                                                </SettingsRow>
                                                <SettingsRow
                                                    title="开关选项"
                                                    description="保持右侧或整行对齐。"
                                                >
                                                    <Switch
                                                        checked
                                                        aria-label="开关"
                                                    />
                                                </SettingsRow>
                                            </SettingsCard>
                                        )}

                                        {previewArchetype === "management" && (
                                            <ManagementTable caption="自适应结构化表格治具">
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>
                                                            资源标识
                                                        </TableHead>
                                                        <TableHead>
                                                            类别
                                                        </TableHead>
                                                        <TableHead>
                                                            状态
                                                        </TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    <TableRow>
                                                        <TableCell>
                                                            res-alpha-001
                                                        </TableCell>
                                                        <TableCell>
                                                            数据项
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="default">
                                                                可用
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>
                                                            res-beta-002
                                                        </TableCell>
                                                        <TableCell>
                                                            配置文件
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="secondary">
                                                                离线
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </ManagementTable>
                                        )}

                                        {previewArchetype === "workbench" && (
                                            <div className="lab-primitive-box">
                                                <WorkspaceToolbar>
                                                    <ActionGroup>
                                                        <Button
                                                            variant="default"
                                                            size="sm"
                                                        >
                                                            动作一
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                        >
                                                            动作二
                                                        </Button>
                                                    </ActionGroup>
                                                    <Badge variant="outline">
                                                        工作台模式
                                                    </Badge>
                                                </WorkspaceToolbar>
                                                <Textarea
                                                    rows={3}
                                                    defaultValue="工作台沉浸式输入区域。"
                                                    aria-label="工作台输入"
                                                />
                                            </div>
                                        )}

                                        {previewArchetype === "search" && (
                                            <div className="lab-stage-card">
                                                <div className="lab-pinned-apps-grid">
                                                    {appsFixture.slice(0, 2)
                                                        .map((app) => (
                                                            <WebAppIcon
                                                                key={app.id}
                                                                app={app}
                                                                onOpen={() => {}}
                                                            />
                                                        ))}
                                                </div>
                                            </div>
                                        )}
                                    </PageShell>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            <WorkspaceShell
                open={workspaceOpen}
                state={workspace}
                title={workspace.view.startsWith("apps/") ? "应用" : "便签"}
                style="zen"
                appsArranging={false}
                navigate={setWorkspace}
                onBack={() => setWorkspace(parentWorkspaceRoute(workspace))}
                onClose={() => setWorkspaceOpen(false)}
                onCreate={() => setFeedbackMessage("Workspace primary action")}
            >
                <Input
                    data-workspace-search
                    aria-label="搜索 Workspace 示例"
                    placeholder="搜索"
                />
                <p className="lab-stage-desc">
                    桌面使用非模态侧栏，移动端使用 Bottom Sheet；Header
                    与底部导航固定，内容区独立滚动。
                </p>
            </WorkspaceShell>
        </PageShell>
    );
}
