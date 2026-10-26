import { ArrowLeft, X } from "lucide-react";
import {
    type CSSProperties,
    type ReactNode,
    type RefObject,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { Button } from "../../components/ui/button.tsx";
import {
    useEscapeLayer,
    useEscapeLayerStack,
} from "../../components/ui/escape-layer-stack.tsx";
import { usePresence } from "../../components/ui/presence.ts";
import {
    Sheet,
    SheetPopup,
    SheetPortal,
    SheetTitle,
} from "../../components/ui/sheet.tsx";
import { WorkspaceActivity } from "./WorkspaceActivity.ts";

export type WorkspacePresentation = "panel" | "sheet";

/** Responsive library overlay; exiting surfaces retain content but not input. */
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
        expanded = false,
        headerActions,
        fullScreen = false,
        backLabel = "返回笔记",
        rootFocus,
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
        bodyLayout?: "editor";
        onEscape?: () => void;
        expanded?: boolean;
        fullScreen?: boolean;
        headerActions?: ReactNode;
        backLabel?: string;
        /** Root views focus this instead of the close button when it exists. */
        rootFocus?: () => HTMLElement | null;
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
    useEscapeLayer(open, onEscape, "host");
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
            rootFocus={rootFocus}
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
        // The dock and home remain interactive; outside presses must not add
        // a spurious home entry while a dock click switches workspace views.
        return (
            <Sheet
                open={open}
                modal={false}
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
                    // Non-modal: dock and home interactions move focus outside
                    // the Sheet without closing it; explicit close controls own
                    // dismissal.
                    if (!nextOpen) details.cancel();
                }}
            >
                <SheetPortal>
                    <SheetPopup
                        className="workspace-panel workspace-panel--mobile"
                        data-presentation={presentation}
                        data-library={title === "应用" ? "apps" : "notes"}
                        data-workspace-fullscreen={fullScreen || undefined}
                        inert={open ? undefined : true}
                        style={{
                            "--workspace-visible-height":
                                `${viewport.height}px`,
                            "--workspace-visible-bottom":
                                `${viewport.bottom}px`,
                        } as CSSProperties}
                        aria-describedby={undefined}
                        initialFocus={() =>
                            nested
                                ? back.current
                                : rootFocus?.() ?? close.current}
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
            data-library={title === "应用" ? "apps" : "notes"}
            data-workspace-expanded={expanded || undefined}
            data-workspace-fullscreen={fullScreen || undefined}
            data-ending-style={panel.ending || undefined}
            inert={panel.ending || undefined}
            style={{
                "--workspace-chrome-bottom": `${chromeBottom}px`,
            } as CSSProperties}
            aria-label={title}
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
        rootFocus,
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
        rootFocus?: () => HTMLElement | null;
        bodyLayout?: "editor";
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
            const target = nested
                ? back.current
                : rootFocus?.() ?? close.current;
            target?.focus({ preventScroll: true });
        };
        if (mounted.current) {
            // Move focus before Sheet restores a removed control to its popup.
            focusChrome();
            return;
        }
        mounted.current = true;
        const frame = requestAnimationFrame(focusChrome);
        return () => cancelAnimationFrame(frame);
    }, [open, routeKey, mobile, nested]);
    // The title names the current library view.
    const titleClass = "workspace-title";
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
                    aria-label="返回首页"
                    title="返回首页"
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
