import { AppForm } from "../../components/searcher/AppForm.tsx";
import {
    Dialog,
    DialogBackdrop,
    DialogPopup,
    DialogPortal,
    DialogTitle,
} from "../../components/ui/dialog.tsx";

/** What the home add/edit dialog is showing; null while it is closed. */
export type AppFormTarget =
    | { mode: "create"; groupId?: string; isHomeFixed?: boolean }
    | { mode: "edit"; id: string; expandIcon?: boolean };

/**
 * Hosts the app form on the home page. The form state lives in the surrounding
 * app session; closing (Escape, backdrop, cancel) is routed through
 * `onRequestClose` so unsaved changes can be confirmed first.
 */
export function AppFormDialog({ target, onRequestClose }: {
    target: AppFormTarget | null;
    onRequestClose: () => void;
}) {
    if (!target) return null;
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onRequestClose();
            }}
        >
            <DialogPortal>
                <DialogBackdrop />
                <DialogPopup className="app-form-dialog">
                    <DialogTitle className="app-form-dialog-title">
                        {target.mode === "create" ? "添加应用" : "编辑应用"}
                    </DialogTitle>
                    <AppForm />
                </DialogPopup>
            </DialogPortal>
        </Dialog>
    );
}
