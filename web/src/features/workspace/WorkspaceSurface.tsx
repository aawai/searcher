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
import {
    useEscapeLayer,
    useEscapeLayerStack,
} from "../../components/ui/escape-layer-stack.tsx";
import { Sheet, SheetContent, SheetTitle } from "../../components/ui/sheet.tsx";

export type WorkspacePresentation = "panel" | "sheet";

export function WorkspaceSurface(
    {
        presentation,
        title,
        routeKey,
        nested,
        onBack,
        onClose,
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
        presentation: WorkspacePresentation;
        title: string;
        routeKey: string;
        nested: boolean;
        onBack: () => void;
        onClose: () => void;
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
    const escapeStack = useEscapeLayerStack();
    useEscapeLayer(!escapeManaged, onEscape, "host");
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
                        <ArrowLeft size="1em" className="icon-lg" />
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
    return mobile
        ? (
            <Sheet
                open
                escapeLayer={false}
                onOpenChange={(open, details) => {
                    if (!open && details.reason === "escape-key") {
                        details.cancel();
                        if (details.event instanceof KeyboardEvent) {
                            escapeStack.dispatch(details.event);
                        }
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
                style={{
                    "--workspace-chrome-bottom": `${chromeBottom}px`,
                } as CSSProperties}
                aria-label={title + "工作区"}
            >
                {content}
            </aside>
        );
}
