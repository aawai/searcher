import {
    Dialog,
    DialogContent,
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
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>消息详情</DialogTitle>
                </DialogHeader>

                <dl className="ask-message-details">
                    <div className="ask-message-details__row">
                        <dt>角色</dt>
                        <dd>{message.role === "user" ? "用户" : "AI"}</dd>
                    </div>

                    <div className="ask-message-details__row">
                        <dt>状态</dt>
                        <dd>
                            {message.status === "complete"
                                ? "完成"
                                : message.status === "streaming"
                                ? "正在生成"
                                : message.status === "interrupted"
                                ? "已中断"
                                : "失败"}
                        </dd>
                    </div>

                    {message.modelId && (
                        <div className="ask-message-details__row">
                            <dt>模型</dt>
                            <dd className="ask-message-details__code">
                                {message.modelId}
                            </dd>
                        </div>
                    )}

                    <div className="ask-message-details__row">
                        <dt>生成时间</dt>
                        <dd>{new Date(message.createdAt).toLocaleString()}</dd>
                    </div>
                </dl>

                <div className="ask-message-details__usage">
                    <div className="ask-message-details__usage-title">
                        Token 统计
                    </div>
                    {hasUsage
                        ? (
                            <dl className="ask-message-details__metrics">
                                <div className="ask-message-details__metric">
                                    <dt>输入</dt>
                                    <dd>{message.inputTokens ?? 0}</dd>
                                </div>
                                <div className="ask-message-details__metric">
                                    <dt>输出</dt>
                                    <dd>{message.outputTokens ?? 0}</dd>
                                </div>
                                <div className="ask-message-details__metric">
                                    <dt>总计</dt>
                                    <dd>{totalTokens}</dd>
                                </div>
                            </dl>
                        )
                        : (
                            <p className="ask-message-details__note">
                                Provider 未返回 Token 使用量统计
                            </p>
                        )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
