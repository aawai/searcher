import { useEffect, useState } from "react";
import { type AccentId, ACCENTS } from "@shared/contracts.ts";
import { type Appearance, useAppState } from "../app/state.tsx";

import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../components/ui/native-select.tsx";
import { Slider } from "../components/ui/slider.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.tsx";
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import {
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverDescription,
    PopoverTitle,
    PopoverTrigger,
} from "../components/ui/popover.tsx";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "../components/ui/tooltip.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import {
    Section,
    SettingsGroup,
    SettingsRow,
    UndoToast,
} from "../components/searcher/semantic.tsx";
import "./design-lab.css";

const GLASS_TIERS = [
    ["off", "关闭"],
    ["soft", "柔和"],
    ["regular", "标准"],
    ["clear", "通透"],
] as const;

const COLOR_ROLES: readonly [label: string, token: string][] = [
    ["背景", "--background"],
    ["表面", "--surface-solid"],
    ["柔和表面", "--surface-soft"],
    ["前景", "--foreground"],
    ["次要", "--muted"],
    ["边框", "--border"],
    ["强调", "--accent"],
    ["危险", "--danger"],
];

const RADII: readonly [label: string, token: string][] = [
    ["控件", "--radius-control"],
    ["输入", "--radius-input"],
    ["便签", "--radius-note-card"],
    ["面板", "--radius-sheet"],
];

function resolveTheme(theme: Appearance["theme"]): "light" | "dark" {
    if (theme !== "system") return theme;
    return matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

export function DesignLab() {
    const { appearance: saved } = useAppState();
    // Local preview only: theme and accent are restored on unmount.
    const [theme, setTheme] = useState<Appearance["theme"]>(saved.theme);
    const [accent, setAccent] = useState<AccentId>(saved.accent);
    const [view, setView] = useState("day");
    const [enabled, setEnabled] = useState(true);
    const [level, setLevel] = useState(40);
    const [engine, setEngine] = useState("bing");
    const [draft, setDraft] = useState("");
    const [toastOpen, setToastOpen] = useState(false);

    useEffect(() => {
        const root = document.documentElement;
        const original = {
            theme: root.dataset.theme,
            accent: root.dataset.accent,
        };
        return () => {
            for (const [key, value] of Object.entries(original)) {
                if (value === undefined) delete root.dataset[key];
                else root.dataset[key] = value;
            }
        };
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = resolveTheme(theme);
        root.dataset.accent = accent;
    }, [theme, accent]);

    return (
        <PageShell archetype="workbench" className="design-lab-page">
            <PageHeader title="设计实验室" />

            <Section title="颜色">
                <div className="design-lab-swatches">
                    {COLOR_ROLES.map(([label, token]) => (
                        <div className="design-lab-swatch" key={token}>
                            <span
                                className="design-lab-swatch-chip"
                                data-token={token}
                                aria-hidden="true"
                            />
                            <span>{label}</span>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="字号">
                <div className="design-lab-type">
                    <p className="design-lab-type-page">页面标题 24</p>
                    <p className="design-lab-type-title">标题 17</p>
                    <p className="design-lab-type-body">正文 14</p>
                    <p className="design-lab-type-metadata">辅助 12</p>
                </div>
            </Section>

            <Section title="圆角">
                <div className="design-lab-radii">
                    {RADII.map(([label, token]) => (
                        <div className="design-lab-radius" key={token}>
                            <span
                                className="design-lab-radius-chip"
                                data-token={token}
                                aria-hidden="true"
                            />
                            <span>{label}</span>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="材质">
                <div
                    className="design-lab-wallpaper"
                    data-testid="design-lab-glass-fixture"
                >
                    {GLASS_TIERS.map(([tier, label]) => (
                        <div
                            className="design-lab-glass-tier"
                            data-glass={tier}
                            key={tier}
                        >
                            <div className="design-lab-material">
                                <span>{label} · 常规</span>
                            </div>
                            <div className="design-lab-material design-lab-material-thick">
                                <span>{label} · 厚</span>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="按钮">
                <div className="design-lab-row">
                    <Button>默认</Button>
                    <Button variant="outline">描边</Button>
                    <Button variant="ghost">幽灵</Button>
                    <Button variant="destructive">删除</Button>
                    <Button variant="link">链接</Button>
                    <Button disabled>禁用</Button>
                </div>
                <div className="design-lab-row">
                    <Button size="sm">小号</Button>
                    <Button size="sm" variant="outline">小号描边</Button>
                    <Button size="icon" variant="ghost" aria-label="更多">
                        ···
                    </Button>
                </div>
            </Section>

            <Section title="输入">
                <div className="design-lab-form">
                    <Input
                        aria-label="搜索"
                        placeholder="搜索"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                    />
                    <NativeSelect
                        aria-label="默认引擎"
                        value={engine}
                        onChange={(e) => setEngine(e.target.value)}
                    >
                        <NativeSelectOption value="bing">
                            必应
                        </NativeSelectOption>
                        <NativeSelectOption value="google">
                            谷歌
                        </NativeSelectOption>
                    </NativeSelect>
                    <Textarea aria-label="备注" placeholder="备注" />
                    <Input aria-label="已禁用" placeholder="禁用" disabled />
                </div>
            </Section>

            <Section title="选择与切换">
                <div className="design-lab-row">
                    <RadioGroup
                        variant="segmented"
                        aria-label="视图"
                        value={view}
                        onValueChange={(next) => setView(String(next))}
                    >
                        <RadioGroupItem value="day">日</RadioGroupItem>
                        <RadioGroupItem value="week">周</RadioGroupItem>
                        <RadioGroupItem value="month">月</RadioGroupItem>
                    </RadioGroup>
                    <Switch
                        aria-label="显示缩略图"
                        checked={enabled}
                        onCheckedChange={setEnabled}
                    />
                    <div className="design-lab-slider">
                        <Slider
                            aria-label="透明度"
                            min={0}
                            max={100}
                            value={level}
                            onValueChange={(next) =>
                                setLevel(Array.isArray(next) ? next[0] : next)}
                        />
                    </div>
                </div>
                <div className="design-lab-row">
                    <RadioGroup
                        variant="swatch"
                        aria-label="强调色"
                        value={accent}
                        onValueChange={(next) => setAccent(next as AccentId)}
                    >
                        {ACCENTS.map((item) => (
                            <RadioGroupItem
                                key={item.id}
                                value={item.id}
                                aria-label={item.label}
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
            </Section>

            <Section title="标签页">
                <Tabs defaultValue="general">
                    <TabsList>
                        <TabsTrigger value="general">通用</TabsTrigger>
                        <TabsTrigger value="sync">同步</TabsTrigger>
                    </TabsList>
                    <TabsContent value="general">
                        <p className="design-lab-type-body">通用内容</p>
                    </TabsContent>
                    <TabsContent value="sync">
                        <p className="design-lab-type-body">同步内容</p>
                    </TabsContent>
                </Tabs>
                <div className="design-lab-row">
                    <Badge>默认</Badge>
                    <Badge variant="secondary">次要</Badge>
                    <Badge variant="outline">描边</Badge>
                    <Badge variant="destructive">危险</Badge>
                </div>
            </Section>

            <Section title="浮层">
                <div className="design-lab-row">
                    <Dialog>
                        <DialogTrigger render={<Button variant="outline" />}>
                            对话框
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>重命名</DialogTitle>
                                <DialogDescription>
                                    输入新的名称。
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <DialogClose
                                    render={<Button variant="ghost" />}
                                >
                                    取消
                                </DialogClose>
                                <Button>保存</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <AlertDialog>
                        <AlertDialogTrigger
                            render={<Button variant="destructive" />}
                        >
                            确认删除
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>删除此项？</AlertDialogTitle>
                                <AlertDialogDescription>
                                    删除后无法恢复。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction>删除</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={<Button variant="outline" />}
                        >
                            更多
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem>重命名</DropdownMenuItem>
                            <DropdownMenuItem>复制链接</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive">
                                删除
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Popover>
                        <PopoverTrigger render={<Button variant="outline" />}>
                            弹出层
                        </PopoverTrigger>
                        <PopoverContent>
                            <PopoverTitle>已保存</PopoverTitle>
                            <PopoverDescription>
                                更改已应用到此设备。
                            </PopoverDescription>
                            <PopoverClose render={<Button size="sm" />}>
                                好
                            </PopoverClose>
                        </PopoverContent>
                    </Popover>

                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="帮助"
                                />
                            }
                        >
                            ?
                        </TooltipTrigger>
                        <TooltipContent>帮助</TooltipContent>
                    </Tooltip>

                    <Button
                        variant="outline"
                        onClick={() => setToastOpen(true)}
                    >
                        提示
                    </Button>
                </div>
                {toastOpen && (
                    <UndoToast
                        placement="inline"
                        message="已移到废纸篓"
                        onUndo={() => setToastOpen(false)}
                        onClose={() => setToastOpen(false)}
                    />
                )}
            </Section>

            <Section title="分组列表">
                <SettingsGroup title="偏好">
                    <SettingsRow title="显示缩略图">
                        <Switch
                            aria-label="显示缩略图（列表）"
                            checked={enabled}
                            onCheckedChange={setEnabled}
                        />
                    </SettingsRow>
                    <SettingsRow title="默认引擎">
                        <NativeSelect
                            size="sm"
                            aria-label="默认引擎（列表）"
                            value={engine}
                            onChange={(e) => setEngine(e.target.value)}
                        >
                            <NativeSelectOption value="bing">
                                必应
                            </NativeSelectOption>
                            <NativeSelectOption value="google">
                                谷歌
                            </NativeSelectOption>
                        </NativeSelect>
                    </SettingsRow>
                    <SettingsRow title="清除缓存">
                        <Button variant="outline" size="sm">清除</Button>
                    </SettingsRow>
                </SettingsGroup>
            </Section>
        </PageShell>
    );
}
