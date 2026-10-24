import { ContextMenuItem, ContextMenuSeparator } from "../ui/context-menu.tsx";
import {
    DropdownMenuItem,
    DropdownMenuSeparator,
} from "../ui/dropdown-menu.tsx";
import type { LauncherApp, LauncherGroup } from "./launcherTiles.ts";

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

export function AppMenuItems({ app, groups, managing = false, actions, Item }: {
    app: LauncherApp;
    groups: LauncherGroup[];
    managing?: boolean;
    actions: AppMenuActions;
    Item: typeof ContextMenuItem | typeof DropdownMenuItem;
}) {
    const Separator = Item === ContextMenuItem
        ? ContextMenuSeparator
        : DropdownMenuSeparator;
    return (
        <>
            <div className="launcher-menu-title">{app.name}</div>
            <Item onClick={() => actions.onOpen(app)}>
                打开
            </Item>
            {actions.onSetHomeFixed && !app.groupId &&
                (actions.homeSurface !== "home" || app.isHomeFixed) && (
                <Item
                    onClick={() =>
                        actions.onSetHomeFixed!(app, !app.isHomeFixed)}
                >
                    {app.isHomeFixed ? "取消固定" : "固定到首页"}
                </Item>
            )}
            {actions.onToggleManaging && (
                <Item onClick={actions.onToggleManaging}>
                    {managing ? "完成整理" : "整理布局"}
                </Item>
            )}
            <Item onClick={() => actions.onEdit(app)}>
                编辑
            </Item>
            {app.groupId && (
                <Item onClick={() => actions.onMove(app, null)}>
                    移出文件夹
                </Item>
            )}
            {groups.filter((group) => group.id !== app.groupId).map((
                group,
            ) => (
                <Item
                    key={group.id}
                    onClick={() => actions.onMove(app, group.id)}
                >
                    移至文件夹 {group.name}
                </Item>
            ))}
            <Item onClick={() => (actions.onChangeIcon ?? actions.onEdit)(app)}>
                更换图标
            </Item>
            <Separator />
            <Item variant="destructive" onClick={() => actions.onDelete(app)}>
                移至回收站
            </Item>
        </>
    );
}
