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
import type { DockSystemId } from "@shared/dock.ts";
import { WebAppGlyph } from "../../components/searcher/WebAppIcon.tsx";
import { Button } from "../../components/ui/button.tsx";
import type { ExtendedWebApp } from "../app-library/library-types.ts";

export const DOCK_SYSTEM_ITEMS: Record<
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

export function moveDockItem<T>(
    items: readonly T[],
    index: number,
    delta: -1 | 1,
): T[] | null {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= items.length) {
        return null;
    }
    const copy = [...items];
    const [moved] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, moved);
    return copy;
}

export function DockSystemOrderList({
    systemOrder,
    onMove,
}: {
    systemOrder: readonly DockSystemId[];
    onMove: (index: number, delta: -1 | 1) => void;
}): ReactNode {
    return (
        <div className="dock-order-list" role="list" aria-label="系统入口顺序">
            {systemOrder.map((systemId, index) => {
                const config = DOCK_SYSTEM_ITEMS[systemId];
                const Icon = config.icon;
                const isFirst = index === 0;
                const isLast = index === systemOrder.length - 1;

                return (
                    <div
                        key={systemId}
                        role="listitem"
                        className="dock-order-row"
                    >
                        <div className="dock-order-row__info">
                            <Icon
                                size="1em"
                                className="icon-md"
                                aria-hidden="true"
                            />
                            <span className="dock-order-row__title">
                                {config.label}
                            </span>
                        </div>
                        <div className="dock-order-row__actions">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={isFirst}
                                onClick={() => onMove(index, -1)}
                                aria-label={`上移 ${config.label}`}
                            >
                                <ArrowUp
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={isLast}
                                onClick={() =>
                                    onMove(index, 1)}
                                aria-label={`下移 ${config.label}`}
                            >
                                <ArrowDown
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function DockPinnedAppsList({
    pinnedApps,
    onMove,
    onUnpin,
    emptyText = "暂无固定应用",
}: {
    pinnedApps: readonly ExtendedWebApp[];
    onMove: (index: number, delta: -1 | 1) => void;
    onUnpin: (appId: string) => void;
    emptyText?: string;
}): ReactNode {
    if (pinnedApps.length === 0) {
        return <p className="dock-order-empty">{emptyText}</p>;
    }

    return (
        <div className="dock-order-list" role="list" aria-label="固定应用">
            {pinnedApps.map((app, index) => {
                const isFirst = index === 0;
                const isLast = index === pinnedApps.length - 1;

                return (
                    <div
                        key={app.id}
                        role="listitem"
                        className="dock-order-row"
                    >
                        <div className="dock-order-row__info">
                            <WebAppGlyph app={app} className="dock-glyph" />
                            <span className="dock-order-row__title">
                                {app.name}
                            </span>
                        </div>
                        <div className="dock-order-row__actions">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={isFirst}
                                onClick={() => onMove(index, -1)}
                                aria-label={`上移 ${app.name}`}
                            >
                                <ArrowUp
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={isLast}
                                onClick={() => onMove(index, 1)}
                                aria-label={`下移 ${app.name}`}
                            >
                                <ArrowDown
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => onUnpin(app.id)}
                                aria-label={`取消固定 ${app.name}`}
                            >
                                <X
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
