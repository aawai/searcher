import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "../../components/ui/button.tsx";
import "./workspace.css";

/**
 * The view's own controls, rendered into the window's title bar: a back button
 * for a detail view and the view's actions. The title bar shares one row with
 * the window controls, so the body keeps all of the remaining height.
 */
export function LibraryWindowToolbar(
    { active, routeKey, nested, backLabel, onBack, actions }: {
        /** The window has focus. */
        active: boolean;
        /** Changes whenever the shown view changes; refocuses the back control. */
        routeKey: string;
        /** A detail view that returns to its parent view. */
        nested: boolean;
        backLabel: string;
        onBack: () => void;
        actions?: ReactNode;
    },
) {
    const back = useRef<HTMLButtonElement>(null);
    // Opening a detail view moves focus to its way back; the list restores its
    // own opener when the view closes. Passive, so the desktop owner has already
    // recorded the control that opened the window.
    useEffect(() => {
        if (active && nested) back.current?.focus({ preventScroll: true });
    }, [active, nested, routeKey]);
    return (
        <>
            {nested && (
                <Button
                    ref={back}
                    className="workspace-toolbar-back"
                    variant="ghost"
                    size="icon"
                    aria-label={backLabel}
                    onClick={onBack}
                >
                    <ArrowLeft size="1em" className="icon-lg" />
                </Button>
            )}
            {actions && (
                <div className="workspace-toolbar-actions">{actions}</div>
            )}
        </>
    );
}

/** Body of the apps and notes windows; the window frame supplies the chrome. */
export function LibraryWindowBody(
    {
        fullScreen = false,
        editor = false,
        feedback,
        onFeedbackHost,
        children,
    }: {
        fullScreen?: boolean;
        editor?: boolean;
        /** Rendered inside narrow windows, where there is no room to float. */
        feedback?: ReactNode;
        onFeedbackHost?: (host: HTMLElement | null) => void;
        children: ReactNode;
    },
) {
    return (
        <div
            className="library-window"
            data-window-fullscreen={fullScreen || undefined}
        >
            <div
                className="workspace-body"
                data-layout={editor ? "editor" : undefined}
            >
                {children}
            </div>
            {feedback}
            {onFeedbackHost && <div ref={onFeedbackHost} />}
        </div>
    );
}
