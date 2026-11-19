import {
    ArrowDown,
    ArrowUp,
    Check,
    ExternalLink,
    FolderInput,
    FolderOutput,
    Image,
    LayoutGrid,
    Pencil,
    Pin,
    PinOff,
    Trash2,
} from "lucide-react";
import {
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
} from "../ui/context-menu.tsx";
import {
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "../ui/dropdown-menu.tsx";
import type { LauncherApp, LauncherGroup } from "./launcherTiles.ts";
import { useDock } from "../../features/dock/DockProvider.tsx";

export interface AppMenuActions {
    onOpen: (app: LauncherApp) => void;
    onEdit: (app: LauncherApp) => void;
    onChangeIcon?: (app: LauncherApp) => void;
    onMove: (app: LauncherApp, groupId: string | null) => void;
    onDelete: (app: LauncherApp) => void;
    onToggleManaging?: () => void;
    onSetHomeFixed?: (app: LauncherApp, isHomeFixed: boolean) => void;
    onSetGroupHomeFixed?: (
        group: LauncherGroup,
        isHomeFixed: boolean,
    ) => void;
    /** Home only lists pinned tiles; the library offers both directions. */
    homeSurface?: "home" | "library";
}

export function AppMenuItems(
    { app, groups, managing = false, actions, Item, reorder }: {
        app: LauncherApp;
        groups: LauncherGroup[];
        managing?: boolean;
        actions: AppMenuActions;
        Item: typeof ContextMenuItem | typeof DropdownMenuItem;
        reorder?: {
            canMoveUp: boolean;
            canMoveDown: boolean;
            move: (direction: -1 | 1) => void;
        };
    },
) {
    const dock = useDock();
    const dockPinned = dock.preferences.appIds.includes(app.id);
    const Separator = Item === ContextMenuItem
        ? ContextMenuSeparator
        : DropdownMenuSeparator;
    const Label = Item === ContextMenuItem
        ? ContextMenuLabel
        : DropdownMenuLabel;
    return (
        <>
            <Label className="launcher-menu-title">{app.name}</Label>
            <Item onClick={() => actions.onOpen(app)}>
                <ExternalLink
                    size="1em"
                    className="icon-sm"
                    aria-hidden="true"
                />
                <span>打开</span>
            </Item>
            <Item onClick={() => void dock.setPinned(app.id, !dockPinned)}>
                {dockPinned
                    ? (
                        <PinOff
                            size="1em"
                            className="icon-sm"
                            aria-hidden="true"
                        />
                    )
                    : (
                        <Pin
                            size="1em"
                            className="icon-sm"
                            aria-hidden="true"
                        />
                    )}
                <span>{dockPinned ? "取消任务栏固定" : "固定到任务栏"}</span>
            </Item>
            {actions.onSetHomeFixed && !app.groupId &&
                (actions.homeSurface !== "home" || app.isHomeFixed) && (
                <Item
                    onClick={() =>
                        actions.onSetHomeFixed!(app, !app.isHomeFixed)}
                >
                    {app.isHomeFixed
                        ? (
                            <PinOff
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                        )
                        : (
                            <Pin
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                        )}
                    <span>{app.isHomeFixed ? "取消固定" : "固定到首页"}</span>
                </Item>
            )}
            {actions.onToggleManaging && (
                <Item onClick={actions.onToggleManaging}>
                    {managing
                        ? (
                            <Check
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                        )
                        : (
                            <LayoutGrid
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                        )}
                    <span>{managing ? "完成整理" : "整理布局"}</span>
                </Item>
            )}
            {reorder && (
                <>
                    <Item
                        disabled={!reorder.canMoveUp}
                        onClick={() => reorder.move(-1)}
                    >
                        <ArrowUp
                            size="1em"
                            className="icon-sm"
                            aria-hidden="true"
                        />
                        <span>上移</span>
                    </Item>
                    <Item
                        disabled={!reorder.canMoveDown}
                        onClick={() => reorder.move(1)}
                    >
                        <ArrowDown
                            size="1em"
                            className="icon-sm"
                            aria-hidden="true"
                        />
                        <span>下移</span>
                    </Item>
                </>
            )}
            <Item onClick={() => actions.onEdit(app)}>
                <Pencil size="1em" className="icon-sm" aria-hidden="true" />
                <span>编辑</span>
            </Item>
            {app.groupId && (
                <Item onClick={() => actions.onMove(app, null)}>
                    <FolderOutput
                        size="1em"
                        className="icon-sm"
                        aria-hidden="true"
                    />
                    <span>移出文件夹</span>
                </Item>
            )}
            {groups.filter((group) => group.id !== app.groupId).map((
                group,
            ) => (
                <Item
                    key={group.id}
                    onClick={() => actions.onMove(app, group.id)}
                >
                    <FolderInput
                        size="1em"
                        className="icon-sm"
                        aria-hidden="true"
                    />
                    <span>移至文件夹 {group.name}</span>
                </Item>
            ))}
            <Item onClick={() => (actions.onChangeIcon ?? actions.onEdit)(app)}>
                <Image size="1em" className="icon-sm" aria-hidden="true" />
                <span>更换图标</span>
            </Item>
            <Separator />
            <Item variant="destructive" onClick={() => actions.onDelete(app)}>
                <Trash2 size="1em" className="icon-sm" aria-hidden="true" />
                <span>移至回收站</span>
            </Item>
        </>
    );
}
