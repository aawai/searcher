import {
    ArrowDown,
    ArrowUp,
    Home,
    LayoutGrid,
    NotebookPen,
    Sparkles,
    X,
} from "lucide-react";
import type { ReactNode } from "react";
import {
    type DockEdge,
    type DockMode,
    type DockSystemId,
} from "@shared/dock.ts";
import {
    SettingsGroup,
    SettingsRow,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";
import { WebAppGlyph } from "../../components/searcher/WebAppIcon.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
    RadioGroup,
    RadioGroupItem,
} from "../../components/ui/radio-group.tsx";
import { useDock } from "./DockProvider.tsx";
import "./dock.css";

const SYSTEM_ITEM_CONFIG: Record<
    DockSystemId,
    {
        label: string;
        icon: typeof Home;
    }
> = {
    home: { label: "首页", icon: Home },
    apps: { label: "应用", icon: LayoutGrid },
    notes: { label: "笔记", icon: NotebookPen },
    ai: { label: "AI 问答", icon: Sparkles },
};

function arrayMoveItem<T>(
    array: readonly T[],
    fromIndex: number,
    toIndex: number,
): T[] {
    const copy = [...array];
    const [moved] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, moved);
    return copy;
}

export function DockSettings(): ReactNode {
    const {
        preferences,
        apps,
        error,
        layout,
        setLayout,
        setSystemOrder,
        setAppOrder,
        setPinned,
        refreshApps,
    } = useDock();

    const pinnedApps = preferences.appIds
        .map((id) => apps.find((a) => a.id === id))
        .filter((app): app is NonNullable<typeof app> => Boolean(app));

    const handleMoveSystem = (index: number, delta: -1 | 1) => {
        const nextIndex = index + delta;
        if (nextIndex < 0 || nextIndex >= preferences.systemOrder.length) {
            return;
        }
        const reordered = arrayMoveItem(
            preferences.systemOrder,
            index,
            nextIndex,
        );
        void setSystemOrder(reordered);
    };

    const handleMoveApp = (index: number, delta: -1 | 1) => {
        const nextIndex = index + delta;
        if (nextIndex < 0 || nextIndex >= preferences.appIds.length) return;
        const reordered = arrayMoveItem(preferences.appIds, index, nextIndex);
        void setAppOrder(reordered);
    };

    const handleUnpin = (appId: string) => {
        void setPinned(appId, false);
    };

    return (
        <SettingsGroup title="任务栏">
            {error && (
                <StatusBanner tone="error">
                    <span>{error}</span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void refreshApps()}
                    >
                        重试
                    </Button>
                </StatusBanner>
            )}

            <SettingsRow title="位置">
                <RadioGroup
                    variant="segmented"
                    value={layout.edge}
                    onValueChange={(val) =>
                        setLayout({ edge: val as DockEdge })}
                    aria-label="任务栏位置"
                >
                    <RadioGroupItem value="bottom">底部</RadioGroupItem>
                    <RadioGroupItem value="top">顶部</RadioGroupItem>
                    <RadioGroupItem value="left">左侧</RadioGroupItem>
                    <RadioGroupItem value="right">右侧</RadioGroupItem>
                </RadioGroup>
            </SettingsRow>

            <SettingsRow title="展示模式">
                <RadioGroup
                    variant="segmented"
                    value={layout.mode}
                    onValueChange={(val) =>
                        setLayout({ mode: val as DockMode })}
                    aria-label="任务栏展示模式"
                >
                    <RadioGroupItem value="fixed">常驻</RadioGroupItem>
                    <RadioGroupItem value="collapsible">可收起</RadioGroupItem>
                </RadioGroup>
            </SettingsRow>

            <SettingsRow title="系统入口顺序">
                <div className="dock-settings-list">
                    {preferences.systemOrder.map((systemId, index) => {
                        const config = SYSTEM_ITEM_CONFIG[systemId];
                        const Icon = config.icon;
                        const isFirst = index === 0;
                        const isLast =
                            index === preferences.systemOrder.length - 1;

                        return (
                            <div key={systemId} className="dock-settings-item">
                                <div className="dock-settings-item__info">
                                    <Icon
                                        size="1em"
                                        className="icon-md"
                                        aria-hidden="true"
                                    />
                                    <span className="dock-settings-item__title">
                                        {config.label}
                                    </span>
                                </div>
                                <div className="dock-settings-item__actions">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={isFirst}
                                        onClick={() =>
                                            handleMoveSystem(index, -1)}
                                        aria-label={`上移 ${config.label}`}
                                    >
                                        <ArrowUp
                                            size="1em"
                                            aria-hidden="true"
                                        />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={isLast}
                                        onClick={() =>
                                            handleMoveSystem(index, 1)}
                                        aria-label={`下移 ${config.label}`}
                                    >
                                        <ArrowDown
                                            size="1em"
                                            aria-hidden="true"
                                        />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </SettingsRow>

            <SettingsRow title="固定应用管理">
                {pinnedApps.length === 0
                    ? <p className="muted">暂无固定应用</p>
                    : (
                        <div className="dock-settings-list">
                            {pinnedApps.map((app, index) => {
                                const isFirst = index === 0;
                                const isLast = index === pinnedApps.length - 1;

                                return (
                                    <div
                                        key={app.id}
                                        className="dock-settings-item"
                                    >
                                        <div className="dock-settings-item__info">
                                            <WebAppGlyph
                                                app={app}
                                                className="dock-glyph"
                                            />
                                            <span className="dock-settings-item__title">
                                                {app.name}
                                            </span>
                                        </div>
                                        <div className="dock-settings-item__actions">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                disabled={isFirst}
                                                onClick={() =>
                                                    handleMoveApp(index, -1)}
                                                aria-label={`上移 ${app.name}`}
                                            >
                                                <ArrowUp
                                                    size="1em"
                                                    aria-hidden="true"
                                                />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                disabled={isLast}
                                                onClick={() =>
                                                    handleMoveApp(index, 1)}
                                                aria-label={`下移 ${app.name}`}
                                            >
                                                <ArrowDown
                                                    size="1em"
                                                    aria-hidden="true"
                                                />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    handleUnpin(app.id)}
                                                aria-label={`取消固定 ${app.name}`}
                                            >
                                                <X
                                                    size="1em"
                                                    aria-hidden="true"
                                                />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
            </SettingsRow>
        </SettingsGroup>
    );
}
