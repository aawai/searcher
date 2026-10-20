import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
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
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Sparkles
                            size="1em"
                            className="icon-md text-accent"
                        />
                        <span>会话系统指令 (System Instruction)</span>
                    </DialogTitle>
                    <DialogDescription>
                        为当前会话设定专属的系统提示词，定制 AI
                        回复的身份、语调或专属上下文。
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                    <Textarea
                        rows={6}
                        placeholder="例如：你是一位资深前端架构师，回答时言简意赅，只给出最核心的代码实现与必要的关键点说明..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="resize-none text-sm"
                    />
                    <div className="mt-2 text-xs text-muted">
                        注：指令仅对当前对话生效，不影响全局和其他会话。
                    </div>
                </div>

                <DialogFooter className="gap-2">
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
