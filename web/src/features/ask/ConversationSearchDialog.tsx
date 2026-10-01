import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import type { AiMessageDto } from "./types.ts";
interface ConversationSearchDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    messages: AiMessageDto[];
    onSelectMessage: (messageId: string) => void;
}

export function ConversationSearchDialog({
    open,
    onOpenChange,
    messages,
    onSelectMessage,
}: ConversationSearchDialogProps) {
    const [query, setQuery] = useState("");

    const trimmed = query.trim().toLowerCase();
    const results = trimmed
        ? messages.filter((m) => m.content.toLowerCase().includes(trimmed))
        : [];

    useEffect(() => {
        if (!open) setQuery("");
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Search size={18} className="text-accent" />
                        <span>会话内搜索</span>
                    </DialogTitle>
                    <DialogDescription>
                        搜索当前对话中的所有历史消息内容 (快捷键: Cmd/Ctrl + F)
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2 space-y-3">
                    <div className="relative">
                        <Input
                            placeholder="输入关键词搜索本会话..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            autoFocus
                            className="pr-8"
                        />
                        {query && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setQuery("")}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground h-6 w-6"
                                aria-label="清空搜索"
                            >
                                <X size={14} />
                            </Button>
                        )}
                    </div>

                    <div className="text-xs text-muted flex justify-between">
                        <span>
                            {trimmed
                                ? `找到 ${results.length} 条匹配消息`
                                : "请输入搜索词"}
                        </span>
                    </div>

                    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                        {results.map((m) => {
                            const idx = m.content.toLowerCase().indexOf(
                                trimmed,
                            );
                            const start = Math.max(0, idx - 40);
                            const end = Math.min(
                                m.content.length,
                                idx + trimmed.length + 60,
                            );
                            const snippet = m.content.slice(start, end);

                            return (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    key={m.id}
                                    onClick={() => {
                                        onSelectMessage(m.id);
                                        onOpenChange(false);
                                    }}
                                    className="w-full text-left p-2.5 rounded-md hover:bg-surface-soft border border-border/40 transition-colors block text-xs space-y-1 h-auto font-normal justify-start items-stretch"
                                >
                                    <div className="flex items-center justify-between text-xs text-muted">
                                        <span className="font-semibold text-foreground">
                                            {m.role === "user"
                                                ? "你"
                                                : "AI 回复"}
                                        </span>
                                        <span>
                                            {new Date(m.createdAt)
                                                .toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <p className="line-clamp-2 text-muted font-normal text-xs leading-relaxed">
                                        {snippet}
                                    </p>
                                </Button>
                            );
                        })}
                        {trimmed && results.length === 0 && (
                            <div className="text-center py-8 text-muted text-xs">
                                未找到包含 “{query}” 的消息
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
