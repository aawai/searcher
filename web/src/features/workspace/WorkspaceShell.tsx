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
import { WorkspaceNavigation } from "./WorkspaceNavigation.tsx";
import type { WorkspaceRoute } from "./workspace-state.ts";
import "./workspace.css";

/** What the surface displays; frozen at its last open value while it exits. */
type WorkspaceView = {
    state: WorkspaceRoute;
    title: string;
    feedback: ReactNode;
    children: ReactNode;
};

/**
 * The host clears title, route and content as soon as `open` turns false, so the
 * exit motion would play over a blank or wrong workspace. Returns the live view
 * while open and the last committed open view afterwards.
 */
function useLastOpenView(open: boolean, view: WorkspaceView): WorkspaceView {
    const lastOpen = useRef(view);
    useLayoutEffect(() => {
        if (open) lastOpen.current = view;
    });
    return open ? view : lastOpen.current;
}

/** The entry that opens the workspace outside the panel itself (the Dock). */
function workspaceEntry(): HTMLElement | null {
    for (
        const entry of document.querySelectorAll<HTMLElement>(
            '[data-workspace="documents"]',
        )
    ) {
        if (!entry.closest(".workspace-panel")) return entry;
    }
    return null;
}

export function WorkspaceShell(
    {
        open = true,
        state,
        title,
        onBack,
        onClose,
        onEscape,
        feedback,
        onFeedbackHost,
        children,
        chromeBottom,
        onDockedChange,
        onExited,
    }: {
        open?: boolean;
        state: WorkspaceRoute;
        title: string;
        onBack: () => void;
        onClose: () => void;
        onEscape?: () => void;
        feedback?: ReactNode;
        onFeedbackHost?: (host: HTMLElement | null) => void;
        children: ReactNode;
        chromeBottom?: number;
        /** Whether the non-expanded desktop panel is open beside the page content. */
        onDockedChange?: (docked: boolean) => void;
        /** Called after the panel or Sheet has finished closing. */
        onExited?: () => void;
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
    const view = useLastOpenView(open, {
        state,
        title,
        feedback,
        children,
    });
    const route = view.state;
    const presentation: WorkspacePresentation = mobile ? "sheet" : "panel";
    const opener = useRef<HTMLElement | null>(null);
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
                const target = opener.current?.isConnected
                    ? opener.current
                    : workspaceEntry();
                target?.focus({ preventScroll: true });
                opener.current = null;
            });
            wasOpen.current = false;
            return () => cancelAnimationFrame(frame);
        }
        wasOpen.current = open;
    }, [open]);
    const expanded = route.view === "documents/edit";
    const docked = open && presentation === "panel" && !expanded;
    useLayoutEffect(() => {
        onDockedChange?.(docked);
        return () => onDockedChange?.(false);
    }, [docked, onDockedChange]);
    const root = route.view === "documents/root";
    const bodyLayout = route.view === "documents/edit" ? "editor" : undefined;
    return (
        <WorkspaceSurface
            open={open}
            presentation={presentation}
            chromeBottom={chromeBottom}
            title={view.title}
            expanded={expanded}
            headerActions={<WorkspaceNavigation />}
            routeKey={JSON.stringify(route)}
            nested={!root}
            onBack={onBack}
            onClose={onClose}
            onEscape={onEscape}
            onExited={onExited}
            bodyLayout={bodyLayout}
            feedback={mobile ? view.feedback : undefined}
            onFeedbackHost={mobile ? onFeedbackHost : undefined}
        >
            {view.children}
        </WorkspaceSurface>
    );
}
