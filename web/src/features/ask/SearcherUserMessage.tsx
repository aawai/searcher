import {
    ActionBarPrimitive,
    BranchPickerPrimitive,
    ComposerPrimitive,
    MessagePrimitive,
    useAuiState,
} from "@assistant-ui/react";
import {
    Check,
    ChevronLeft,
    ChevronRight,
    Copy,
    FileText,
    Pencil,
} from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import type { AiMessageDto } from "./types.ts";

export function SearcherUserMessage() {
    const rawMessage = useAuiState(
        (s) =>
            s.message?.metadata?.custom?.rawMessage as AiMessageDto | undefined,
    );

    const editing = useAuiState((s) => s.message.composer.isEditing);
    const copied = useAuiState((s) => s.message.isCopied);

    // Extract attachments from parts if available
    const attachmentParts = (rawMessage?.parts ?? []).filter(
        (p) => p.type === "attachment",
    );

    return (
        <MessagePrimitive.Root
            className="ask-user-msg-container"
            aria-label="用户提问"
        >
            <div
                className={`ask-user-msg-bubble ${editing ? "is-editing" : ""}`}
            >
                {/* Render attachments preview if present */}
                {attachmentParts.length > 0 && (
                    <div className="ask-user-attachments">
                        {attachmentParts.map((part) => {
                            if (part.type !== "attachment") return null;
                            const isImg = part.mimeType.startsWith("image/");
                            return (
                                <div
                                    key={part.id}
                                    className="ask-user-attachment-chip"
                                >
                                    {isImg && (part.data || part.url)
                                        ? (
                                            <img
                                                src={part.data || part.url}
                                                alt={part.name}
                                                className="ask-user-attachment-img"
                                            />
                                        )
                                        : (
                                            <FileText
                                                size="1em"
                                                className="icon-sm"
                                            />
                                        )}
                                    <span
                                        className="ask-user-attachment-name"
                                        title={part.name}
                                    >
                                        {part.name}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {editing
                    ? (
                        <ComposerPrimitive.Root className="ask-user-edit-wrap">
                            <ComposerPrimitive.Input
                                aria-label="编辑提问内容"
                                className="cn-textarea ask-user-edit-textarea"
                                rows={3}
                                autoFocus
                            />
                            <div className="ask-user-edit-actions">
                                <ComposerPrimitive.Cancel asChild>
                                    <Button variant="outline" size="sm">
                                        取消
                                    </Button>
                                </ComposerPrimitive.Cancel>
                                <ComposerPrimitive.Send asChild>
                                    <Button size="sm">保存并发送</Button>
                                </ComposerPrimitive.Send>
                            </div>
                        </ComposerPrimitive.Root>
                    )
                    : (
                        <div className="ask-user-text">
                            <MessagePrimitive.Content />
                        </div>
                    )}
            </div>

            {/* User message action bar & branch navigation using Assistant-UI primitives */}
            <div className="ask-user-footer">
                <BranchPickerPrimitive.Root
                    className="ask-branch-pager"
                    aria-label="提问分支切换"
                    hideWhenSingleBranch
                >
                    <BranchPickerPrimitive.Previous asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="ask-branch-pager__btn"
                            aria-label="上一个提问版本"
                        >
                            <ChevronLeft size="1em" className="icon-sm" />
                        </Button>
                    </BranchPickerPrimitive.Previous>
                    <span className="ask-branch-pager__indicator">
                        <BranchPickerPrimitive.Number /> /{" "}
                        <BranchPickerPrimitive.Count />
                    </span>
                    <BranchPickerPrimitive.Next asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="ask-branch-pager__btn"
                            aria-label="下一个提问版本"
                        >
                            <ChevronRight size="1em" className="icon-sm" />
                        </Button>
                    </BranchPickerPrimitive.Next>
                </BranchPickerPrimitive.Root>

                <ActionBarPrimitive.Root className="ask-user-actions">
                    <ActionBarPrimitive.Copy asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="ask-action-icon-btn"
                            aria-label={copied ? "已复制" : "复制"}
                            title={copied ? "已复制" : "复制"}
                        >
                            {copied
                                ? (
                                    <Check
                                        size="1em"
                                        className="icon-sm"
                                    />
                                )
                                : <Copy size="1em" className="icon-sm" />}
                        </Button>
                    </ActionBarPrimitive.Copy>

                    {!editing && (
                        <ActionBarPrimitive.Edit asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="ask-action-icon-btn"
                                aria-label="编辑提问"
                                title="编辑提问并从此处分支"
                            >
                                <Pencil size="1em" className="icon-sm" />
                            </Button>
                        </ActionBarPrimitive.Edit>
                    )}
                </ActionBarPrimitive.Root>
            </div>
        </MessagePrimitive.Root>
    );
}
