import type { ReactNode } from "react";
import { type DockEdge, type DockMode } from "@shared/dock.ts";
import {
    SettingsGroup,
    SettingsRow,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
    RadioGroup,
    RadioGroupItem,
} from "../../components/ui/radio-group.tsx";
import {
    DockPinnedAppsList,
    DockSystemOrderList,
    moveDockItem,
} from "./DockOrderList.tsx";
import { useDock } from "./DockProvider.tsx";
import "./dock.css";
export function DockSettings(): ReactNode {
    const {
        preferences,
        apps,
        error,
        layout,
        setLayout,
        setSystemOrder,
        setSystemVisible,
        setAppOrder,
        setPinned,
        refreshApps,
    } = useDock();

    const pinnedApps = preferences.appIds
        .map((id) => apps.find((a) => a.id === id))
        .filter((app): app is NonNullable<typeof app> => Boolean(app));

    const handleMoveSystem = (index: number, delta: -1 | 1) => {
        const reordered = moveDockItem(preferences.systemOrder, index, delta);
        if (reordered) {
            void setSystemOrder(reordered);
        }
    };

    const handleMoveApp = (index: number, delta: -1 | 1) => {
        const reordered = moveDockItem(preferences.appIds, index, delta);
        if (reordered) {
            void setAppOrder(reordered);
        }
    };

    const handlePin = (appId: string) => {
        void setPinned(appId, true);
    };

    const handleUnpin = (appId: string) => {
        void setPinned(appId, false);
    };

    return (
        <SettingsGroup
            title="任务栏"
            footer="手机端展开时固定于底部，不覆盖桌面方向。"
        >
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

            <SettingsRow
                title="系统入口"
                className="settings-row--vertical"
            >
                <DockSystemOrderList
                    systemOrder={preferences.systemOrder}
                    hiddenSystemIds={preferences.hiddenSystemIds}
                    onMove={handleMoveSystem}
                    onReorder={(next) => void setSystemOrder(next)}
                    onToggleVisible={(id, visible) =>
                        void setSystemVisible(id, visible)}
                />
            </SettingsRow>

            <SettingsRow
                title={`固定应用（${pinnedApps.length}）`}
                className="settings-row--vertical"
            >
                <DockPinnedAppsList
                    pinnedApps={pinnedApps}
                    availableApps={apps}
                    onMove={handleMoveApp}
                    onReorder={(next) => void setAppOrder(next)}
                    onPin={handlePin}
                    onUnpin={handleUnpin}
                />
            </SettingsRow>
        </SettingsGroup>
    );
}
