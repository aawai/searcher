import { Info } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import type { AiMessageDto } from "./types.ts";

interface MessageDetailsDialogProps {
    message: AiMessageDto | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function MessageDetailsDialog({
    message,
    open,
    onOpenChange,
}: MessageDetailsDialogProps) {
    if (!message) return null;

    const hasUsage = message.inputTokens !== null ||
        message.outputTokens !== null;
    const totalTokens = (message.inputTokens ?? 0) +
        (message.outputTokens ?? 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Info size="1em" className="icon-md text-accent" />
                        <span>消息详情</span>
                    </DialogTitle>
                    <DialogDescription>
                        该条消息的模型生成参数与运行时元数据
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2 text-sm">
                    <div className="flex justify-between py-1.5 border-b border-border/50">
                        <span className="text-muted">角色</span>
                        <span className="font-medium">
                            {message.role === "user" ? "用户" : "AI"}
                        </span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-border/50">
                        <span className="text-muted">状态</span>
                        <span className="font-medium">
                            {message.status === "complete"
                                ? "完成"
                                : message.status === "streaming"
                                ? "正在生成"
                                : message.status === "interrupted"
                                ? "已中断"
                                : "失败"}
                        </span>
                    </div>

                    {message.modelId && (
                        <div className="flex justify-between py-1.5 border-b border-border/50">
                            <span className="text-muted">模型</span>
                            <span className="font-mono text-xs">
                                {message.modelId}
                            </span>
                        </div>
                    )}

                    <div className="flex justify-between py-1.5 border-b border-border/50">
                        <span className="text-muted">生成时间</span>
                        <span>
                            {new Date(message.createdAt).toLocaleString()}
                        </span>
                    </div>

                    <div className="pt-2">
                        <div className="font-medium text-xs text-muted mb-2">
                            Token 统计
                        </div>
                        {hasUsage
                            ? (
                                <div className="grid grid-cols-3 gap-2 bg-surface-soft p-2.5 rounded-md text-center">
                                    <div>
                                        <div className="text-xs text-muted">
                                            输入
                                        </div>
                                        <div className="font-mono font-medium">
                                            {message.inputTokens ?? 0}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted">
                                            输出
                                        </div>
                                        <div className="font-mono font-medium">
                                            {message.outputTokens ?? 0}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted">
                                            总计
                                        </div>
                                        <div className="font-mono font-medium text-accent">
                                            {totalTokens}
                                        </div>
                                    </div>
                                </div>
                            )
                            : (
                                <div className="text-xs text-muted bg-surface-soft p-2.5 rounded-md text-center">
                                    Provider 未返回 Token 使用量统计
                                </div>
                            )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
