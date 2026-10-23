import {
    type CSSProperties,
    type ReactNode,
    type RefObject,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import {
    useEscapeLayer,
    useEscapeLayerStack,
} from "../../components/ui/escape-layer-stack.tsx";
import { usePresence } from "../../components/ui/presence.ts";
import {
    Sheet,
    SheetBackdrop,
    SheetPopup,
    SheetPortal,
    SheetTitle,
} from "../../components/ui/sheet.tsx";
import { WorkspaceActivity } from "./WorkspaceActivity.ts";

export type WorkspacePresentation = "panel" | "sheet";

/**
 * Hosts the workspace as a right-hand panel or a bottom Sheet.
 *
 * `open` becoming false starts the exit motion: the surface keeps rendering its
 * last content, is inert and owns no Escape layer or focus until it unmounts.
 * The panel unmounts through `usePresence`; Base UI unmounts the Sheet.
 */
export function WorkspaceSurface(
    {
        open,
        presentation,
        title,
        routeKey,
        nested,
        onBack,
        onClose,
        onExited,
        children,
        feedback,
        onFeedbackHost,
        bodyLayout,
        onEscape = onClose,
        escapeManaged = false,
        expanded = false,
        headerActions,
        backLabel = "返回上一级",
        chromeBottom = 0,
    }: {
        open: boolean;
        presentation: WorkspacePresentation;
        title: string;
        routeKey: string;
        nested: boolean;
        onBack: () => void;
        onClose: () => void;
        onExited?: () => void;
        children: ReactNode;
        feedback?: ReactNode;
        onFeedbackHost?: (host: HTMLElement | null) => void;
        bodyLayout?: "app-form" | "editor";
        onEscape?: () => void;
        escapeManaged?: boolean;
        expanded?: boolean;
        headerActions?: ReactNode;
        backLabel?: string;
        chromeBottom?: number;
    },
) {
    const mobile = presentation === "sheet";
    const panel = usePresence<HTMLElement>(open && !mobile);
    const exited = useRef(onExited);
    exited.current = onExited;
    useLayoutEffect(() => {
        if (!mobile && !open && !panel.mounted) exited.current?.();
    }, [mobile, open, panel.mounted]);
    const escapeStack = useEscapeLayerStack();
    useEscapeLayer(open && !escapeManaged, onEscape, "host");
    const back = useRef<HTMLButtonElement>(null);
    const close = useRef<HTMLButtonElement>(null);
    const [viewport, setViewport] = useState(() => ({
        height: globalThis.visualViewport?.height ?? globalThis.innerHeight,
        bottom: 0,
    }));
    useEffect(() => {
        const visual = globalThis.visualViewport;
        if (!mobile || !open || !visual) return;
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
    }, [mobile, open]);
    const frame = (
        <WorkspaceFrame
            open={open}
            mobile={mobile}
            title={title}
            routeKey={routeKey}
            nested={nested}
            backLabel={backLabel}
            back={back}
            close={close}
            onBack={onBack}
            onClose={onClose}
            headerActions={headerActions}
            bodyLayout={bodyLayout}
            feedback={feedback}
            onFeedbackHost={onFeedbackHost}
        >
            <WorkspaceActivity.Provider value={open}>
                {children}
            </WorkspaceActivity.Provider>
        </WorkspaceFrame>
    );
    if (mobile) {
        // While closing, "trap-focus" drops Base UI's full-screen pointer
        // blocker (only rendered for modal === true) so the Dock stays usable,
        // yet the focus manager remains modal; a reopen during the exit then
        // regains the full modal Sheet without switching guard semantics.
        return (
            <Sheet
                open={open}
                modal={open ? true : "trap-focus"}
                escapeLayer={false}
                onOpenChangeComplete={(nextOpen) => {
                    if (!nextOpen) exited.current?.();
                }}
                onOpenChange={(nextOpen, details) => {
                    if (!nextOpen && details.reason === "escape-key") {
                        details.cancel();
                        if (details.event instanceof KeyboardEvent) {
                            escapeStack.dispatch(details.event);
                        }
                        return;
                    }
                    if (!nextOpen) onClose();
                }}
            >
                <SheetPortal>
                    <SheetBackdrop inert={open ? undefined : true} />
                    <SheetPopup
                        className="workspace-panel workspace-panel--mobile"
                        data-presentation={presentation}
                        inert={open ? undefined : true}
                        style={{
                            "--workspace-visible-height":
                                `${viewport.height}px`,
                            "--workspace-visible-bottom":
                                `${viewport.bottom}px`,
                        } as CSSProperties}
                        aria-describedby={undefined}
                        initialFocus={() =>
                            nested ? back.current : close.current}
                        finalFocus={false}
                    >
                        {frame}
                    </SheetPopup>
                </SheetPortal>
            </Sheet>
        );
    }
    if (!panel.mounted) return null;
    return (
        <aside
            ref={panel.ref}
            className="workspace-panel"
            data-presentation={presentation}
            data-workspace-expanded={expanded || undefined}
            data-ending-style={panel.ending || undefined}
            inert={panel.ending || undefined}
            style={{
                "--workspace-chrome-bottom": `${chromeBottom}px`,
            } as CSSProperties}
            aria-label={title + "工作区"}
        >
            {frame}
        </aside>
    );
}

/** Header and body; mounts and unmounts together with the panel or Sheet popup. */
function WorkspaceFrame(
    {
        open,
        mobile,
        title,
        routeKey,
        nested,
        backLabel,
        back,
        close,
        onBack,
        onClose,
        headerActions,
        bodyLayout,
        feedback,
        onFeedbackHost,
        children,
    }: {
        open: boolean;
        mobile: boolean;
        title: string;
        routeKey: string;
        nested: boolean;
        backLabel: string;
        back: RefObject<HTMLButtonElement | null>;
        close: RefObject<HTMLButtonElement | null>;
        onBack: () => void;
        onClose: () => void;
        headerActions?: ReactNode;
        bodyLayout?: "app-form" | "editor";
        feedback?: ReactNode;
        onFeedbackHost?: (host: HTMLElement | null) => void;
        children: ReactNode;
    },
) {
    const touchY = useRef<number | null>(null);
    const mounted = useRef(false);
    useLayoutEffect(() => {
        if (!open) return;
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
    }, [open, routeKey, mobile, nested]);
    // Root views name the surface for assistive technology only: the switcher
    // already shows which workspace is selected.
    const titleClass = nested ? "workspace-title" : "workspace-title sr-only";
    return (
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
                        <ArrowLeft size="1em" className="icon-lg" />
                    </Button>
                )}
                {mobile
                    ? <SheetTitle className={titleClass}>{title}</SheetTitle>
                    : <h2 className={titleClass}>{title}</h2>}
                {headerActions}
                <Button
                    ref={close}
                    variant="ghost"
                    size="icon"
                    aria-label="收起工作区"
                    onClick={onClose}
                >
                    <X size="1em" className="icon-lg" />
                </Button>
            </header>
            <div
                className="workspace-body"
                data-layout={bodyLayout}
            >
                {children}
            </div>
            {feedback}
            {onFeedbackHost && <div ref={onFeedbackHost} />}
        </>
    );
}
