import {
    ArrowDown,
    ArrowUp,
    GripVertical,
    Home,
    LayoutGrid,
    NotebookPen,
    Plus,
    Sparkles,
    X,
} from "lucide-react";
import { type CSSProperties, type ReactNode } from "react";
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DockSystemId } from "@shared/dock.ts";
import { WebAppGlyph } from "../../components/searcher/WebAppIcon.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import { Switch } from "../../components/ui/switch.tsx";
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

function SortableSystemRow({
    systemId,
    index,
    totalCount,
    isVisible,
    onMove,
    onToggleVisible,
}: {
    systemId: DockSystemId;
    index: number;
    totalCount: number;
    isVisible: boolean;
    onMove: (index: number, delta: -1 | 1) => void;
    onToggleVisible?: (id: DockSystemId, visible: boolean) => void;
}) {
    const config = DOCK_SYSTEM_ITEMS[systemId];
    const Icon = config.icon;
    const isFirst = index === 0;
    const isLast = index === totalCount - 1;
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        isDragging,
    } = useSortable({ id: `order-sys:${systemId}` });

    const style: CSSProperties = {
        transform: CSS.Transform.toString(transform),
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            role="listitem"
            className={`dock-order-row${isDragging ? " is-dragging" : ""}`}
            data-dock-system-row={systemId}
            data-visible={isVisible ? "true" : "false"}
        >
            <div className="dock-order-row__info">
                <span
                    className="dock-order-row__handle"
                    aria-hidden="true"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical size="1em" className="icon-sm" />
                </span>
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
                    onClick={() => onMove(index, 1)}
                    aria-label={`下移 ${config.label}`}
                >
                    <ArrowDown
                        size="1em"
                        className="icon-sm"
                        aria-hidden="true"
                    />
                </Button>
                {onToggleVisible && (
                    <Switch
                        checked={isVisible}
                        onCheckedChange={(checked) =>
                            onToggleVisible(systemId, checked)}
                        aria-label={`显示 ${config.label}`}
                        data-dock-system-toggle={systemId}
                    />
                )}
            </div>
        </div>
    );
}

export function DockSystemOrderList({
    systemOrder,
    hiddenSystemIds = [],
    onMove,
    onReorder,
    onToggleVisible,
}: {
    systemOrder: readonly DockSystemId[];
    hiddenSystemIds?: readonly DockSystemId[];
    onMove: (index: number, delta: -1 | 1) => void;
    onReorder?: (nextOrder: DockSystemId[]) => void;
    onToggleVisible?: (id: DockSystemId, visible: boolean) => void;
}): ReactNode {
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 200, tolerance: 8 },
        }),
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const activeSys = String(active.id).replace(
            "order-sys:",
            "",
        ) as DockSystemId;
        const overSys = String(over.id).replace(
            "order-sys:",
            "",
        ) as DockSystemId;
        const oldIdx = systemOrder.indexOf(activeSys);
        const newIdx = systemOrder.indexOf(overSys);
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
            if (onReorder) {
                onReorder(arrayMove([...systemOrder], oldIdx, newIdx));
            } else {
                onMove(oldIdx, newIdx > oldIdx ? 1 : -1);
            }
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext
                items={systemOrder.map((id) => `order-sys:${id}`)}
                strategy={verticalListSortingStrategy}
            >
                <div
                    className="dock-order-list"
                    role="list"
                    aria-label="系统入口"
                >
                    {systemOrder.map((systemId, index) => (
                        <SortableSystemRow
                            key={systemId}
                            systemId={systemId}
                            index={index}
                            totalCount={systemOrder.length}
                            isVisible={!hiddenSystemIds.includes(systemId)}
                            onMove={onMove}
                            onToggleVisible={onToggleVisible}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}

function SortablePinnedAppRow({
    app,
    index,
    totalCount,
    onMove,
    onUnpin,
}: {
    app: ExtendedWebApp;
    index: number;
    totalCount: number;
    onMove: (index: number, delta: -1 | 1) => void;
    onUnpin: (appId: string) => void;
}) {
    const isFirst = index === 0;
    const isLast = index === totalCount - 1;
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        isDragging,
    } = useSortable({ id: `order-app:${app.id}` });

    const style: CSSProperties = {
        transform: CSS.Transform.toString(transform),
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            role="listitem"
            className={`dock-order-row${isDragging ? " is-dragging" : ""}`}
        >
            <div className="dock-order-row__info">
                <span
                    className="dock-order-row__handle"
                    aria-hidden="true"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical size="1em" className="icon-sm" />
                </span>
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
}

export function DockPinnedAppsList({
    pinnedApps,
    availableApps = [],
    onMove,
    onReorder,
    onPin,
    onUnpin,
    emptyText = "暂无固定应用",
}: {
    pinnedApps: readonly ExtendedWebApp[];
    availableApps?: readonly ExtendedWebApp[];
    onMove: (index: number, delta: -1 | 1) => void;
    onReorder?: (nextAppIds: string[]) => void;
    onPin?: (appId: string) => void;
    onUnpin: (appId: string) => void;
    emptyText?: string;
}): ReactNode {
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 200, tolerance: 8 },
        }),
    );

    const pinnedSet = new Set(pinnedApps.map((a) => a.id));
    const unpinnedApps = availableApps.filter((a) => !pinnedSet.has(a.id));

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const activeAppId = String(active.id).replace("order-app:", "");
        const overAppId = String(over.id).replace("order-app:", "");
        const ids = pinnedApps.map((a) => a.id);
        const oldIdx = ids.indexOf(activeAppId);
        const newIdx = ids.indexOf(overAppId);
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
            if (onReorder) {
                onReorder(arrayMove(ids, oldIdx, newIdx));
            } else {
                onMove(oldIdx, newIdx > oldIdx ? 1 : -1);
            }
        }
    };

    const addTrigger = onPin && unpinnedApps.length > 0 && (
        <div className="dock-order-add">
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-dock-action="add-pinned-app"
                        >
                            <Plus
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                            <span>添加固定应用</span>
                        </Button>
                    }
                />
                <DropdownMenuContent sideOffset={6}>
                    {unpinnedApps.map((app) => (
                        <DropdownMenuItem
                            key={app.id}
                            onClick={() => onPin(app.id)}
                        >
                            <WebAppGlyph app={app} className="dock-glyph" />
                            <span>{app.name}</span>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );

    if (pinnedApps.length === 0) {
        return (
            <div className="dock-order-empty-wrap">
                <p className="dock-order-empty">{emptyText}</p>
                {addTrigger}
            </div>
        );
    }

    return (
        <div className="dock-order-list-wrap">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={pinnedApps.map((a) => `order-app:${a.id}`)}
                    strategy={verticalListSortingStrategy}
                >
                    <div
                        className="dock-order-list"
                        role="list"
                        aria-label="固定应用"
                    >
                        {pinnedApps.map((app, index) => (
                            <SortablePinnedAppRow
                                key={app.id}
                                app={app}
                                index={index}
                                totalCount={pinnedApps.length}
                                onMove={onMove}
                                onUnpin={onUnpin}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
            {addTrigger}
        </div>
    );
}
