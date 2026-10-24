import { type ReactNode, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import {
    Dialog,
    DialogBackdrop,
    DialogClose,
    DialogPopup,
    DialogPortal,
    DialogTitle,
} from "../../components/ui/dialog.tsx";

/**
 * In-place Floating-material popup over the home grid for folder contents.
 * 更多（N） opens the library app view instead of a popup. A Base UI Dialog owns
 * focus containment and Escape.
 */
export function LibraryPopup({
    open,
    onClose,
    title,
    count,
    top,
    headerActions,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    count?: number;
    /** Viewport y of the popup's top edge; centred when unknown. */
    top: number | null;
    headerActions?: ReactNode;
    children: ReactNode;
}) {
    const body = useRef<HTMLDivElement>(null);
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogPortal>
                <DialogBackdrop className="launcher-popup-backdrop" />
                <DialogPopup
                    className="launcher-popup"
                    style={top === null ? undefined : {
                        top,
                        maxHeight: `calc(100dvh - ${top}px - var(--space-4))`,
                    }}
                    data-anchored={top === null ? undefined : ""}
                    // The library returns focus to the opening tile itself.
                    finalFocus={false}
                    // The dialog itself, not an app: an app tile would open its focus tooltip,
                    // and that tooltip would swallow the first Escape.
                    initialFocus={() =>
                        body.current?.closest<HTMLElement>("[role=dialog]") ??
                            true}
                >
                    <div className="launcher-popup-header">
                        <DialogTitle className="launcher-popup-title">
                            {title}
                        </DialogTitle>
                        {count !== undefined && (
                            <span className="launcher-popup-count">
                                {count} 个应用
                            </span>
                        )}
                        <span className="launcher-popup-actions">
                            {headerActions}
                            <DialogClose
                                render={
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="关闭"
                                    />
                                }
                            >
                                <X size="1em" className="icon-md" />
                            </DialogClose>
                        </span>
                    </div>
                    <div ref={body} className="launcher-popup-body">
                        {children}
                    </div>
                </DialogPopup>
            </DialogPortal>
        </Dialog>
    );
}
