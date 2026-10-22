import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
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
            <DialogContent className="ask-rename-dialog">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>重命名对话</DialogTitle>
                    </DialogHeader>

                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="输入对话标题..."
                        autoFocus
                    />

                    <DialogFooter>
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
