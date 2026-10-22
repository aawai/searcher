import { useEffect, useState } from "react";
import { X } from "lucide-react";
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
import {
    formatShortcut,
    type ShortcutPlatform,
    SHORTCUTS,
} from "../shortcuts/shortcut-catalog.ts";

interface ConversationSearchDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    messages: AiMessageDto[];
    onSelectMessage: (messageId: string) => void;
    platform?: ShortcutPlatform;
}

export function ConversationSearchDialog({
    open,
    onOpenChange,
    messages,
    onSelectMessage,
    platform,
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
            <DialogContent className="ask-search-dialog">
                <DialogHeader>
                    <DialogTitle>会话内搜索</DialogTitle>
                    <DialogDescription>
                        快捷键:{" "}
                        {formatShortcut(SHORTCUTS.askFind.binding, platform)}
                    </DialogDescription>
                </DialogHeader>

                <div className="ask-search-dialog__field">
                    <Input
                        placeholder="搜索本会话"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                        className="ask-search-dialog__input"
                    />
                    {query && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setQuery("")}
                            className="ask-search-dialog__clear"
                            aria-label="清空搜索"
                        >
                            <X size="1em" className="icon-sm" />
                        </Button>
                    )}
                </div>

                <p className="ask-search-dialog__status">
                    {trimmed
                        ? `找到 ${results.length} 条匹配消息`
                        : "请输入搜索词"}
                </p>

                <div className="ask-search-dialog__results">
                    {results.map((m) => {
                        const idx = m.content.toLowerCase().indexOf(trimmed);
                        const start = Math.max(0, idx - 40);
                        const end = Math.min(
                            m.content.length,
                            idx + trimmed.length + 60,
                        );
                        const snippet = m.content.slice(start, end);

                        return (
                            <Button
                                type="button"
                                variant="content"
                                key={m.id}
                                onClick={() => {
                                    onSelectMessage(m.id);
                                    onOpenChange(false);
                                }}
                                className="ask-search-result"
                            >
                                <span className="ask-search-result__meta">
                                    <span className="ask-search-result__role">
                                        {m.role === "user" ? "你" : "AI 回复"}
                                    </span>
                                    <span>
                                        {new Date(m.createdAt)
                                            .toLocaleTimeString()}
                                    </span>
                                </span>
                                <span className="ask-search-result__snippet">
                                    {snippet}
                                </span>
                            </Button>
                        );
                    })}
                    {trimmed && results.length === 0 && (
                        <div className="ask-search-dialog__empty">
                            未找到包含 “{query}” 的消息
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
