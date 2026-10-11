import {
    type CSSProperties,
    type ReactNode,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Sheet, SheetContent, SheetTitle } from "../../components/ui/sheet.tsx";

export type WorkspacePresentation = "panel" | "window" | "sheet";

export interface WorkspaceViewportInsets {
    top: number;
    bottom: number;
}

export function WorkspaceSurface(
    {
        presentation,
        title,
        routeKey,
        nested,
        onBack,
        onClose,
        children,
        footer,
        feedback,
        onFeedbackHost,
        formLayout = false,
        onEscape = onClose,
        escapeManaged = false,
        expanded = false,
        headerActions,
        backLabel = "返回上一级",
        viewportInsets,
    }: {
        presentation: Exclude<WorkspacePresentation, "window">;
        title: string;
        routeKey: string;
        nested: boolean;
        onBack: () => void;
        onClose: () => void;
        children: ReactNode;
        footer: ReactNode;
        feedback?: ReactNode;
        onFeedbackHost?: (host: HTMLElement | null) => void;
        formLayout?: boolean;
        onEscape?: () => void;
        escapeManaged?: boolean;
        expanded?: boolean;
        headerActions?: ReactNode;
        backLabel?: string;
        viewportInsets?: WorkspaceViewportInsets;
    },
) {
    const mobile = presentation === "sheet";
    const back = useRef<HTMLButtonElement>(null);
    const close = useRef<HTMLButtonElement>(null);
    const touchY = useRef<number | null>(null);
    const mounted = useRef(false);
    const [viewport, setViewport] = useState(() => ({
        height: globalThis.visualViewport?.height ?? globalThis.innerHeight,
        bottom: 0,
    }));
    useEffect(() => {
        const visual = globalThis.visualViewport;
        if (!mobile || !visual) return;
        const update = () =>
            setViewport({
                height: visual.height,
                bottom: Math.max(
                    0,
                    globalThis.innerHeight - visual.height - visual.offsetTop,
                ),
            });
        update();
        visual.addEventListener("resize", update);
        visual.addEventListener("scroll", update);
        return () => {
            visual.removeEventListener("resize", update);
            visual.removeEventListener("scroll", update);
        };
    }, [mobile]);
    useLayoutEffect(() => {
        const focusChrome = () => {
            (nested ? back.current : close.current)?.focus({
                preventScroll: true,
            });
        };
        if (mounted.current && !nested) {
            // Move focus before Sheet restores a removed nested control to its popup.
            focusChrome();
            return;
        }
        mounted.current = true;
        const frame = requestAnimationFrame(focusChrome);
        return () => cancelAnimationFrame(frame);
    }, [routeKey, mobile, nested]);
    useEffect(() => {
        if (mobile || escapeManaged) return;
        const escape = (event: KeyboardEvent) => {
            if (
                event.key !== "Escape" || event.defaultPrevented ||
                event.isComposing
            ) return;
            if (
                (event.target instanceof Element &&
                    event.target.closest(
                        '[role="menu"], [role="alertdialog"]',
                    )) ||
                document.querySelector(
                    '[role="menu"], [data-slot="popover-content"], [role="dialog"], [role="alertdialog"]',
                )
            ) return;
            event.preventDefault();
            onEscape();
        };
        document.addEventListener("keydown", escape);
        return () => document.removeEventListener("keydown", escape);
    }, [mobile, onEscape, escapeManaged]);
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
                        aria-label={backLabel}
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
                {headerActions}
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
            <div
                className="workspace-body"
                data-layout={formLayout ? "app-form" : undefined}
            >
                {children}
            </div>
            {feedback}
            {onFeedbackHost && <div ref={onFeedbackHost} />}
            {footer}
        </>
    );
    return mobile
        ? (
            <Sheet
                open
                onOpenChange={(open, details) => {
                    const target = details.event.target;
                    if (
                        !open && details.reason === "escape-key" &&
                        escapeManaged
                    ) {
                        details.cancel();
                        return;
                    }
                    if (
                        !open && details.reason === "escape-key" &&
                        target instanceof Element &&
                        target.closest(
                            '[role="menu"], [role="alertdialog"], [data-workspace-escape-boundary]',
                        )
                    ) {
                        details.cancel();
                        return;
                    }
                    if (!open && details.reason === "escape-key") {
                        details.cancel();
                        if (
                            details.event instanceof KeyboardEvent &&
                            details.event.isComposing
                        ) return;
                        if (
                            document.querySelector(
                                '[role="menu"], [data-slot="popover-content"], [role="alertdialog"], [role="dialog"]:not(.workspace-panel)',
                            )
                        ) return;
                        onEscape();
                        return;
                    }
                    if (!open) onClose();
                }}
            >
                <SheetContent
                    className="workspace-panel workspace-panel--mobile"
                    data-presentation={presentation}
                    style={{
                        "--workspace-visible-height": `${viewport.height}px`,
                        "--workspace-visible-bottom": `${viewport.bottom}px`,
                    } as CSSProperties}
                    aria-describedby={undefined}
                    initialFocus={() => nested ? back.current : close.current}
                    finalFocus={false}
                >
                    {content}
                </SheetContent>
            </Sheet>
        )
        : (
            <aside
                className="workspace-panel"
                data-presentation={presentation}
                data-workspace-expanded={expanded || undefined}
                data-viewport-constrained={Boolean(viewportInsets) || undefined}
                style={viewportInsets
                    ? { top: viewportInsets.top, bottom: viewportInsets.bottom }
                    : undefined}
                aria-label={title + "工作区"}
            >
                {content}
            </aside>
        );
}
