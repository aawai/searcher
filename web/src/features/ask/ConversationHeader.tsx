import { useState } from "react";
import { ArrowLeft, Menu, MoreHorizontal, Pencil, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { routes } from "../../app/routes.ts";
import { Button } from "../../components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import type { AiConversationDto, AiMessageDto } from "./types.ts";
import { RenameConversationDialog } from "./RenameConversationDialog.tsx";
import { SystemInstructionDialog } from "./SystemInstructionDialog.tsx";
import {
    formatShortcut,
    type ShortcutPlatform,
    SHORTCUTS,
} from "../shortcuts/shortcut-catalog.ts";

interface ConversationHeaderProps {
    conversation: AiConversationDto | null;
    messages: AiMessageDto[];
    onOpenDrawer: () => void;
    onRename: (newTitle: string) => Promise<void>;
    onDelete: () => Promise<void>;
    onToggleHistory: (enabled: boolean) => Promise<void>;
    onSaveSystemInstruction: (instruction: string | null) => Promise<void>;
    onOpenSearch: () => void;
    // New conversation draft options:
    isNewConversationTemporary?: boolean;
    newConversationInstruction?: string | null;
    platform?: ShortcutPlatform;
}

export function ConversationHeader({
    conversation,
    messages,
    onOpenDrawer,
    onRename,
    onDelete,
    onToggleHistory,
    onSaveSystemInstruction,
    onOpenSearch,
    isNewConversationTemporary = false,
    newConversationInstruction = null,
    platform,
}: ConversationHeaderProps) {
    const [renameOpen, setRenameOpen] = useState(false);
    const [instructionOpen, setInstructionOpen] = useState(false);

    const title = conversation?.title || "新对话";
    const isTemporary = conversation
        ? !conversation.historyEnabled
        : isNewConversationTemporary;

    const searchHint = formatShortcut(SHORTCUTS.askFind.binding, platform);
    function handleExport(format: "markdown" | "json") {
        if (!messages.length) return;
        if (format === "markdown") {
            let md = `# ${title}\n\n`;
            for (const m of messages) {
                const roleName = m.role === "user" ? "用户" : "AI";
                const timeStr = new Date(m.createdAt).toLocaleString();
                md += `### ${roleName} (${timeStr})\n\n${m.content}\n\n---\n\n`;
            }
            const blob = new Blob([md], {
                type: "text/markdown;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${title.replace(/[\/\\?%*:|"<>]/g, "_")}.md`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            const data = {
                conversation,
                messages,
                exportedAt: new Date().toISOString(),
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${title.replace(/[\/\\?%*:|"<>]/g, "_")}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    return (
        <header className="ask-header" aria-label="对话标题与操作">
            <div className="ask-header__left">
                <Button
                    variant="ghost"
                    size="icon"
                    className="ask-header__home"
                    nativeButton={false}
                    render={<Link to={routes.home} aria-label="返回首页" />}
                >
                    <ArrowLeft size="1em" className="icon-md" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="ask-header__drawer-toggle"
                    onClick={onOpenDrawer}
                    aria-label="打开历史对话"
                >
                    <Menu size="1em" className="icon-md" />
                </Button>

                <div className="ask-header__title-row">
                    <h1 className="ask-header__heading">
                        <Button
                            type="button"
                            variant="ghost"
                            className="ask-header__title"
                            onClick={() => conversation && setRenameOpen(true)}
                            title={conversation ? "重命名对话" : "新对话"}
                        >
                            <span className="ask-header__title-text">
                                {title}
                            </span>
                            {conversation && (
                                <Pencil
                                    size="1em"
                                    className="icon-sm ask-header__title-edit-icon"
                                />
                            )}
                        </Button>
                    </h1>

                    {isTemporary && (
                        <span
                            className="ask-header__temp-badge"
                            title="临时对话：切换或离开后不会保存"
                        >
                            临时对话
                        </span>
                    )}
                </div>
            </div>

            <div className="ask-header__right">
                {/* Search button (enabled when messages exist) */}
                {messages.length > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ask-header__icon-btn"
                        onClick={onOpenSearch}
                        aria-label={`会话内搜索 (${searchHint})`}
                        title={`会话内搜索 (${searchHint})`}
                    >
                        <Search size="1em" className="icon-md" />
                    </Button>
                )}

                {/* More options menu - ALWAYS available even on new conversations */}
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="ask-header__icon-btn"
                                aria-label="更多操作"
                                title="更多操作"
                            />
                        }
                    >
                        <MoreHorizontal size="1em" className="icon-md" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent sideOffset={6} aria-label="对话菜单">
                        {conversation && (
                            <DropdownMenuItem
                                onClick={() => setRenameOpen(true)}
                            >
                                重命名
                            </DropdownMenuItem>
                        )}

                        <DropdownMenuItem
                            onClick={() => setInstructionOpen(true)}
                        >
                            系统指令...
                        </DropdownMenuItem>

                        {messages.length > 0 && (
                            <DropdownMenuItem onClick={onOpenSearch}>
                                <span>会话内搜索</span>
                                <span className="ask-menu-shortcut">
                                    {searchHint}
                                </span>
                            </DropdownMenuItem>
                        )}

                        <DropdownMenuItem
                            onClick={() => void onToggleHistory(isTemporary)}
                        >
                            {isTemporary ? "保存此对话" : "转为临时对话"}
                        </DropdownMenuItem>

                        {messages.length > 0 && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => handleExport("markdown")}
                                >
                                    导出为 Markdown
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => handleExport("json")}
                                >
                                    导出为 JSON
                                </DropdownMenuItem>
                            </>
                        )}

                        {conversation && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => void onDelete()}
                                >
                                    删除对话
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {conversation && (
                <RenameConversationDialog
                    open={renameOpen}
                    onOpenChange={setRenameOpen}
                    currentTitle={title}
                    onRename={onRename}
                />
            )}

            <SystemInstructionDialog
                open={instructionOpen}
                onOpenChange={setInstructionOpen}
                currentInstruction={conversation
                    ? conversation.systemInstruction
                    : newConversationInstruction}
                onSave={onSaveSystemInstruction}
            />
        </header>
    );
}
