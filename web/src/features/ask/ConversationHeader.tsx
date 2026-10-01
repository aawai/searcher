import { useState } from "react";
import {
    FileCode,
    FileText,
    Menu,
    MoreHorizontal,
    Pencil,
    Search,
    ShieldAlert,
    Sparkles,
    Trash2,
} from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import type { AiConversationDto, AiMessageDto } from "./types.ts";
import { RenameConversationDialog } from "./RenameConversationDialog.tsx";
import { SystemInstructionDialog } from "./SystemInstructionDialog.tsx";

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
}: ConversationHeaderProps) {
    const [renameOpen, setRenameOpen] = useState(false);
    const [instructionOpen, setInstructionOpen] = useState(false);

    const title = conversation?.title || "新对话";
    const isTemporary = conversation
        ? !conversation.historyEnabled
        : isNewConversationTemporary;

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
                    variant="outline"
                    size="icon"
                    className="ask-header__drawer-toggle"
                    onClick={onOpenDrawer}
                    aria-label="打开历史对话"
                >
                    <Menu size={16} />
                </Button>

                <div className="ask-header__title-row">
                    <Button
                        type="button"
                        variant="ghost"
                        className="ask-header__title h-auto p-0 font-semibold"
                        onClick={() => conversation && setRenameOpen(true)}
                        title={conversation ? "点击重命名对话" : "新对话"}
                    >
                        <span>{title}</span>
                        {conversation && (
                            <Pencil
                                size={12}
                                className="ask-header__title-edit-icon"
                            />
                        )}
                    </Button>

                    {isTemporary && (
                        <span
                            className="ask-header__temp-badge"
                            title="临时对话：切换或离开后不会保存"
                        >
                            <ShieldAlert size={12} />
                            <span>临时对话</span>
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
                        aria-label="会话内搜索 (Cmd/Ctrl+F)"
                        title="会话内搜索 (Cmd/Ctrl+F)"
                    >
                        <Search size={16} />
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
                        <MoreHorizontal size={16} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent sideOffset={6} aria-label="对话菜单">
                        {conversation && (
                            <DropdownMenuItem
                                onClick={() => setRenameOpen(true)}
                            >
                                <Pencil size={14} className="mr-2" />
                                <span>重命名</span>
                            </DropdownMenuItem>
                        )}

                        <DropdownMenuItem
                            onClick={() => setInstructionOpen(true)}
                        >
                            <Sparkles size={14} className="mr-2" />
                            <span>系统指令...</span>
                        </DropdownMenuItem>

                        {messages.length > 0 && (
                            <DropdownMenuItem onClick={onOpenSearch}>
                                <Search size={14} className="mr-2" />
                                <span>会话搜索 (Cmd+F)</span>
                            </DropdownMenuItem>
                        )}

                        <DropdownMenuItem
                            onClick={() => void onToggleHistory(isTemporary)}
                        >
                            <ShieldAlert size={14} className="mr-2" />
                            <span>
                                {isTemporary ? "保存此对话" : "转为临时对话"}
                            </span>
                        </DropdownMenuItem>

                        {messages.length > 0 && (
                            <>
                                <DropdownMenuItem
                                    onClick={() => handleExport("markdown")}
                                >
                                    <FileText size={14} className="mr-2" />
                                    <span>导出为 Markdown</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    onClick={() => handleExport("json")}
                                >
                                    <FileCode size={14} className="mr-2" />
                                    <span>导出为 JSON</span>
                                </DropdownMenuItem>
                            </>
                        )}

                        {conversation && (
                            <DropdownMenuItem
                                onClick={() => void onDelete()}
                                className="text-destructive focus:text-destructive"
                            >
                                <Trash2 size={14} className="mr-2" />
                                <span>删除对话</span>
                            </DropdownMenuItem>
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
