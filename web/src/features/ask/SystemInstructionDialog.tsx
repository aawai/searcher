import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";

interface SystemInstructionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentInstruction?: string | null;
    onSave: (instruction: string | null) => Promise<void>;
}

export function SystemInstructionDialog({
    open,
    onOpenChange,
    currentInstruction,
    onSave,
}: SystemInstructionDialogProps) {
    const [text, setText] = useState(currentInstruction ?? "");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setText(currentInstruction ?? "");
    }, [currentInstruction, open]);

    async function handleSave() {
        setSaving(true);
        try {
            await onSave(text.trim() ? text.trim() : null);
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>会话系统指令 (System Instruction)</DialogTitle>
                    <DialogDescription>
                        定义 AI 在本对话中的身份与回答方式。
                    </DialogDescription>
                </DialogHeader>

                <Textarea
                    rows={6}
                    placeholder="例如：你是一位资深前端架构师，回答时言简意赅，只给出最核心的代码实现与必要的关键点说明..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="ask-system-dialog__textarea"
                />
                <p className="ask-system-dialog__note">仅对当前对话生效。</p>

                <DialogFooter>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                    >
                        取消
                    </Button>
                    {text.trim() && (
                        <Button
                            variant="outline"
                            type="button"
                            onClick={() => setText("")}
                            disabled={saving}
                        >
                            清空
                        </Button>
                    )}
                    <Button
                        variant="default"
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving}
                    >
                        {saving ? "保存中..." : "保存指令"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
