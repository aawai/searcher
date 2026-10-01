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
import { Input } from "../../components/ui/input.tsx";

interface RenameConversationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentTitle: string;
    onRename: (newTitle: string) => Promise<void>;
}

export function RenameConversationDialog({
    open,
    onOpenChange,
    currentTitle,
    onRename,
}: RenameConversationDialogProps) {
    const [title, setTitle] = useState(currentTitle);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setTitle(currentTitle);
    }, [currentTitle, open]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed || trimmed === currentTitle) {
            onOpenChange(false);
            return;
        }
        setSubmitting(true);
        try {
            await onRename(trimmed);
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle className="text-base">
                            重命名对话
                        </DialogTitle>
                        <DialogDescription>
                            为当前对话设置一个新的简短标题
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-3">
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="输入对话标题..."
                            autoFocus
                        />
                    </div>

                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            type="button"
                            onClick={() => onOpenChange(false)}
                            disabled={submitting}
                        >
                            取消
                        </Button>
                        <Button
                            variant="default"
                            type="submit"
                            disabled={submitting || !title.trim()}
                        >
                            {submitting ? "保存中..." : "保存"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
