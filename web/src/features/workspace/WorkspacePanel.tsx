import { type ReactNode, useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Sheet, SheetContent, SheetTitle } from "../../components/ui/sheet.tsx";

export function WorkspacePanel(
    { title, routeKey, nested, onBack, onClose, children, footer }: {
        title: string;
        routeKey: string;
        nested: boolean;
        onBack: () => void;
        onClose: () => void;
        children: ReactNode;
        footer: ReactNode;
    },
) {
    const [mobile, setMobile] = useState(() =>
        globalThis.matchMedia("(max-width: 767px)").matches
    );
    const back = useRef<HTMLButtonElement>(null);
    const close = useRef<HTMLButtonElement>(null);
    const touchY = useRef<number | null>(null);
    useEffect(() => {
        const media = globalThis.matchMedia("(max-width: 767px)");
        const change = () => setMobile(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            if (nested) back.current?.focus();
            else close.current?.focus();
        });
        return () => cancelAnimationFrame(frame);
    }, [routeKey, mobile, nested]);
    useEffect(() => {
        if (mobile) return;
        const escape = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            if (
                document.querySelector(
                    '[role="menu"], [data-slot="popover-content"], [role="dialog"], [role="alertdialog"]',
                )
            ) return;
            event.preventDefault();
            onClose();
        };
        document.addEventListener("keydown", escape);
        return () => document.removeEventListener("keydown", escape);
    }, [mobile, onClose]);
    const content = (
        <>
            <header
                className="workspace-header"
                onTouchStart={(event) => {
                    touchY.current = event.touches[0]?.clientY ?? null;
                }}
                onTouchEnd={(event) => {
                    const end = event.changedTouches[0]?.clientY;
                    if (
                        mobile && touchY.current !== null &&
                        end !== undefined && end - touchY.current > 80
                    ) onClose();
                    touchY.current = null;
                }}
            >
                {mobile && (
                    <span className="workspace-grip" aria-hidden="true" />
                )}
                {nested && (
                    <Button
                        ref={back}
                        variant="ghost"
                        size="icon"
                        aria-label="返回上一级"
                        onClick={onBack}
                    >
                        <ArrowLeft size={18} />
                    </Button>
                )}
                {mobile
                    ? (
                        <SheetTitle className="workspace-title">
                            {title}
                        </SheetTitle>
                    )
                    : <h2 className="workspace-title">{title}</h2>}
                <Button
                    ref={close}
                    variant="ghost"
                    size="icon"
                    aria-label="收起工作区"
                    onClick={onClose}
                >
                    <X size={18} />
                </Button>
            </header>
            <div className="workspace-body">{children}</div>
            {footer}
        </>
    );
    return mobile
        ? (
            <Sheet
                open
                onOpenChange={(open) => {
                    if (!open) onClose();
                }}
            >
                <SheetContent
                    className="workspace-panel workspace-panel--mobile"
                    aria-describedby={undefined}
                    initialFocus={() => nested ? back.current : close.current}
                    finalFocus={false}
                >
                    {content}
                </SheetContent>
            </Sheet>
        )
        : (
            <aside className="workspace-panel" aria-label={title + "工作区"}>
                {content}
            </aside>
        );
}
