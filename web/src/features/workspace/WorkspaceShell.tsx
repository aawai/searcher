import {
    type ReactNode,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import {
    type WorkspacePresentation,
    WorkspaceSurface,
} from "./WorkspaceSurface.tsx";
import "./workspace.css";

/** What the surface displays; frozen at its last open value while it exits. */
type WorkspaceView = {
    title: string;
    routeKey: string;
    nested: boolean;
    expanded: boolean;
    editor: boolean;
    headerActions: ReactNode;
    feedback: ReactNode;
    children: ReactNode;
};

/**
 * The host clears the selection and content as soon as `open` turns false, so
 * the exit motion would play over a blank or wrong detail. Returns the live
 * view while open and the last committed open view afterwards.
 */
function useLastOpenView(open: boolean, view: WorkspaceView): WorkspaceView {
    const lastOpen = useRef(view);
    useLayoutEffect(() => {
        if (open) lastOpen.current = view;
    });
    return open ? view : lastOpen.current;
}

/**
 * The object detail bar: a non-modal right panel at ≥768px, a modal bottom
 * Sheet below. Focus returns to the control that opened it.
 */
export function WorkspaceShell(
    {
        open,
        title,
        routeKey,
        nested,
        expanded = false,
        editor = false,
        backLabel,
        headerActions,
        rootFocus,
        returnFocus,
        onBack,
        onClose,
        onEscape,
        feedback,
        onFeedbackHost,
        children,
        chromeBottom,
        onMobileChange,
    }: {
        open: boolean;
        title: string;
        /** Changes whenever the shown view changes; refocuses the chrome. */
        routeKey: string;
        nested: boolean;
        expanded?: boolean;
        editor?: boolean;
        backLabel: string;
        headerActions?: ReactNode;
        /** Root views focus this instead of the close button when it exists. */
        rootFocus?: () => HTMLElement | null;
        /** Where focus goes when the control that opened it is gone or inert. */
        returnFocus: () => HTMLElement | null;
        onBack: () => void;
        onClose: () => void;
        onEscape?: () => void;
        feedback?: ReactNode;
        onFeedbackHost?: (host: HTMLElement | null) => void;
        children: ReactNode;
        chromeBottom?: number;
        onMobileChange?: (mobile: boolean) => void;
    },
) {
    const [mobile, setMobile] = useState(() =>
        globalThis.matchMedia("(max-width: 767px)").matches
    );
    useEffect(() => {
        const media = globalThis.matchMedia("(max-width: 767px)");
        const change = () => setMobile(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    useLayoutEffect(() => onMobileChange?.(mobile), [mobile, onMobileChange]);
    const view = useLastOpenView(open, {
        title,
        routeKey,
        nested,
        expanded,
        editor,
        headerActions,
        feedback,
        children,
    });
    const presentation: WorkspacePresentation = mobile ? "sheet" : "panel";
    const opener = useRef<HTMLElement | null>(null);
    const returnFocusRef = useRef(returnFocus);
    returnFocusRef.current = returnFocus;
    const wasOpen = useRef(false);
    // Focus returns when `open` turns false, not when the exit motion ends.
    useLayoutEffect(() => {
        if (open && !wasOpen.current) {
            const active = document.activeElement;
            opener.current = active instanceof HTMLElement &&
                    active !== document.body &&
                    !active.closest(".workspace-panel")
                ? active
                : null;
        }
        if (!open && wasOpen.current) {
            const frame = requestAnimationFrame(() => {
                const target = opener.current?.isConnected &&
                        !opener.current.closest("[inert]")
                    ? opener.current
                    : returnFocusRef.current();
                target?.focus({ preventScroll: true });
                opener.current = null;
            });
            wasOpen.current = false;
            return () => cancelAnimationFrame(frame);
        }
        wasOpen.current = open;
    }, [open]);
    return (
        <WorkspaceSurface
            open={open}
            presentation={presentation}
            chromeBottom={chromeBottom}
            title={view.title}
            expanded={view.expanded}
            headerActions={view.headerActions}
            routeKey={view.routeKey}
            nested={view.nested}
            backLabel={backLabel}
            rootFocus={rootFocus}
            onBack={onBack}
            onClose={onClose}
            onEscape={onEscape}
            bodyLayout={view.editor ? "editor" : undefined}
            feedback={mobile ? view.feedback : undefined}
            onFeedbackHost={mobile ? onFeedbackHost : undefined}
        >
            {view.children}
        </WorkspaceSurface>
    );
}
