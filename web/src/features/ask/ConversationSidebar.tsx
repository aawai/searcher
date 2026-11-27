import { useState } from "react";
import {
    MoreHorizontal,
    PanelLeftClose,
    Pencil,
    Plus,
    Trash2,
    X,
} from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { SearchField } from "../../components/searcher/semantic.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "../../components/ui/sheet.tsx";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "../../components/ui/tooltip.tsx";
import type { AiConversationDto } from "./types.ts";
import { RenameConversationDialog } from "./RenameConversationDialog.tsx";
import { splitHighlightSegments } from "./ask-ui-helpers.ts";

interface ConversationSidebarProps {
    history: AiConversationDto[];
    activeId: string | null;
    drawerOpen: boolean;
    onDrawerOpenChange: (open: boolean) => void;
    onCollapse?: () => void;
    onSelectConversation: (id: string) => void;
    onNewConversation: () => void;
    onRenameConversation: (id: string, newTitle: string) => Promise<void>;
    onDeleteConversation: (id: string, title: string) => Promise<void>;
}

function bucket(time: number) {
    const today = new Date();
    const date = new Date(time);
    const days = Math.floor(
        (new Date(today.getFullYear(), today.getMonth(), today.getDate())
            .getTime() -
            new Date(date.getFullYear(), date.getMonth(), date.getDate())
                .getTime()) /
            86400000,
    );
    return days <= 0
        ? "今天"
        : days === 1
        ? "昨天"
        : days < 7
        ? "最近 7 天"
        : "更早";
}

export function ConversationSidebar({
    history,
    activeId,
    drawerOpen,
    onDrawerOpenChange,
    onCollapse,
    onSelectConversation,
    onNewConversation,
    onRenameConversation,
    onDeleteConversation,
}: ConversationSidebarProps) {
    const [filter, setFilter] = useState("");
    const [renamingTarget, setRenamingTarget] = useState<
        AiConversationDto | null
    >(null);

    // Filter out temporary conversations (historyEnabled === false) from history list
    const visibleHistory = history.filter((item) =>
        item.historyEnabled !== false
    );

    const filtered = visibleHistory.filter((item) =>
        item.title.toLowerCase().includes(filter.toLowerCase())
    );

    const grouped = Object.groupBy(
        filtered,
        (item) => bucket(item.updatedAt),
    );

    const renderContent = (isSheet: boolean) => (
        <div className="ask-sidebar__content">
            <div className="ask-sidebar__top">
                <div className="ask-sidebar__top-row">
                    <Button
                        variant="outline"
                        className="ask-sidebar__new-btn"
                        onClick={() => {
                            onNewConversation();
                            onDrawerOpenChange(false);
                        }}
                    >
                        <Plus size="1em" className="icon-md" />
                        <span>新建对话</span>
                    </Button>
                    {!isSheet && onCollapse && (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="ask-sidebar__collapse-btn"
                                        onClick={onCollapse}
                                        aria-label="收起历史侧栏"
                                    />
                                }
                            >
                                <PanelLeftClose
                                    size="1em"
                                    className="icon-md"
                                    aria-hidden="true"
                                />
                            </TooltipTrigger>
                            <TooltipContent>收起历史侧栏</TooltipContent>
                        </Tooltip>
                    )}
                </div>

                <SearchField
                    wrapperClassName="ask-sidebar__search"
                    value={filter}
                    onValueChange={setFilter}
                    clearLabel="清空搜索"
                    placeholder="搜索"
                    aria-label="搜索历史对话"
                />
            </div>

            <div
                className="ask-sidebar__list"
                role="navigation"
                aria-label="历史对话列表"
            >
                {(["今天", "昨天", "最近 7 天", "更早"] as const).map(
                    (group) => {
                        const items = grouped[group];
                        if (!items?.length) return null;
                        return (
                            <div key={group} className="ask-sidebar__group">
                                <h3 className="ask-sidebar__group-title">
                                    {group}
                                </h3>
                                <div className="ask-sidebar__group-items">
                                    {items.map((item) => {
                                        const isSelected = item.id === activeId;
                                        const titleSegments =
                                            splitHighlightSegments(
                                                item.title,
                                                filter,
                                            );
                                        return (
                                            <div
                                                key={item.id}
                                                className={`ask-sidebar__item ${
                                                    isSelected
                                                        ? "is-active"
                                                        : ""
                                                }`}
                                            >
                                                <Button
                                                    type="button"
                                                    variant="content"
                                                    className="ask-sidebar__item-title"
                                                    onClick={() => {
                                                        onSelectConversation(
                                                            item.id,
                                                        );
                                                        onDrawerOpenChange(
                                                            false,
                                                        );
                                                    }}
                                                    aria-current={isSelected
                                                        ? "page"
                                                        : undefined}
                                                    title={item.title}
                                                >
                                                    <span className="ask-sidebar__item-text">
                                                        {titleSegments.map(
                                                            (segment, idx) =>
                                                                segment.match
                                                                    ? (
                                                                        <mark
                                                                            key={idx}
                                                                            className="ask-sidebar__highlight"
                                                                        >
                                                                            {segment
                                                                                .text}
                                                                        </mark>
                                                                    )
                                                                    : segment
                                                                        .text,
                                                        )}
                                                    </span>
                                                </Button>

                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        render={
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="ask-sidebar__item-menu-btn"
                                                                aria-label={`操作 ${item.title}`}
                                                            />
                                                        }
                                                    >
                                                        <MoreHorizontal
                                                            size="1em"
                                                            className="icon-sm"
                                                        />
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent
                                                        sideOffset={4}
                                                    >
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                setRenamingTarget(
                                                                    item,
                                                                )}
                                                        >
                                                            <Pencil
                                                                size="1em"
                                                                className="icon-sm"
                                                                aria-hidden="true"
                                                            />
                                                            <span>重命名</span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            variant="destructive"
                                                            onClick={() =>
                                                                void onDeleteConversation(
                                                                    item.id,
                                                                    item.title,
                                                                )}
                                                        >
                                                            <Trash2
                                                                size="1em"
                                                                className="icon-sm"
                                                                aria-hidden="true"
                                                            />
                                                            <span>删除</span>
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    },
                )}

                {filtered.length === 0 && (
                    <div className="ask-sidebar__empty">
                        {filter ? "无匹配的历史对话" : "暂无历史对话"}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <>
            <aside className="ask-sidebar" aria-label="对话历史">
                {renderContent(false)}
            </aside>

            <Sheet open={drawerOpen} onOpenChange={onDrawerOpenChange}>
                <SheetContent className="ask-history-sheet">
                    <SheetHeader>
                        <SheetTitle>历史对话</SheetTitle>
                        <SheetClose
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="关闭"
                                />
                            }
                        >
                            <X size="1em" className="icon-md" />
                        </SheetClose>
                    </SheetHeader>
                    <div className="ask-history-sheet__inner">
                        {renderContent(true)}
                    </div>
                </SheetContent>
            </Sheet>

            {renamingTarget && (
                <RenameConversationDialog
                    open={Boolean(renamingTarget)}
                    onOpenChange={(open) => !open && setRenamingTarget(null)}
                    currentTitle={renamingTarget.title}
                    onRename={async (newTitle) => {
                        await onRenameConversation(renamingTarget.id, newTitle);
                        setRenamingTarget(null);
                    }}
                />
            )}
        </>
    );
}
