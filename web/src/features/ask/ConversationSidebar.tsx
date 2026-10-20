import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "../../components/ui/sheet.tsx";
import type { AiConversationDto } from "./types.ts";
import { RenameConversationDialog } from "./RenameConversationDialog.tsx";

interface ConversationSidebarProps {
    history: AiConversationDto[];
    activeId: string | null;
    drawerOpen: boolean;
    onDrawerOpenChange: (open: boolean) => void;
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

    const content = (
        <div className="ask-sidebar__content">
            <div className="ask-sidebar__top">
                <Button
                    className="w-full justify-center gap-1.5 ask-sidebar__new-btn"
                    onClick={() => {
                        onNewConversation();
                        onDrawerOpenChange(false);
                    }}
                >
                    <Plus size="1em" className="icon-md" />
                    <span>新建对话</span>
                </Button>

                <div className="ask-sidebar__search-wrap mt-3">
                    <Search
                        size="1em"
                        className="icon-sm ask-sidebar__search-icon"
                    />
                    <Input
                        className="ask-sidebar__search-input"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="搜索历史对话..."
                        aria-label="搜索历史对话"
                    />
                    {filter && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setFilter("")}
                            className="ask-sidebar__search-clear"
                            aria-label="清空搜索"
                        >
                            <X size="1em" className="icon-sm" />
                        </Button>
                    )}
                </div>
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
                                <div className="space-y-0.5">
                                    {items.map((item) => {
                                        const isSelected = item.id === activeId;
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
                                                    variant="ghost"
                                                    className="ask-sidebar__item-title justify-start h-auto text-left font-normal"
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
                                                    <span className="truncate w-full text-left">
                                                        {item.title}
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
                                                                className="icon-sm mr-2"
                                                            />
                                                            <span>重命名</span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                void onDeleteConversation(
                                                                    item.id,
                                                                    item.title,
                                                                )}
                                                            className="text-destructive focus:text-destructive"
                                                        >
                                                            <Trash2
                                                                size="1em"
                                                                className="icon-sm mr-2"
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
        </div>
    );

    return (
        <>
            <aside className="ask-sidebar" aria-label="对话历史">
                {content}
            </aside>

            <Sheet open={drawerOpen} onOpenChange={onDrawerOpenChange}>
                <SheetContent className="ask-history-sheet">
                    <SheetHeader className="pb-2">
                        <SheetTitle>历史对话</SheetTitle>
                        <SheetClose
                            className="ask-history-sheet__close"
                            aria-label="关闭"
                        >
                            <X size="1em" className="icon-lg" />
                        </SheetClose>
                    </SheetHeader>
                    <div className="ask-history-sheet__inner">
                        {content}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
