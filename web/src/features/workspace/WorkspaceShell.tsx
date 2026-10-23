import {
    type ReactNode,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { Button } from "../../components/ui/button.tsx";
import { Check, Plus } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "../../components/ui/tooltip.tsx";
import {
    type WorkspacePresentation,
    WorkspaceSurface,
} from "./WorkspaceSurface.tsx";
import { WorkspaceNavigation } from "./WorkspaceNavigation.tsx";
import {
    isAppsWorkspaceView,
    type WorkspaceKind,
    type WorkspaceRoute,
} from "./workspace-state.ts";
import "./workspace.css";

/** What the surface displays; frozen at its last open value while it exits. */
type WorkspaceView = {
    state: WorkspaceRoute;
    title: string;
    appsArranging: boolean;
    onCreate: (() => void) | undefined;
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

/** The entry that opens `kind` outside the workspace itself (the Dock). */
function workspaceEntry(kind: WorkspaceKind): HTMLElement | null {
    for (
        const entry of document.querySelectorAll<HTMLElement>(
            '[data-workspace="' + kind + '"]',
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
        onSwitch,
        onBack,
        onClose,
        onCreate,
        onEscape,
        onFinishArrange,
        feedback,
        onFeedbackHost,
        appsArranging = false,
        children,
        chromeBottom,
        onDockedChange,
        onExited,
    }: {
        open?: boolean;
        state: WorkspaceRoute;
        title: string;
        /** Switches the visible domain; each domain keeps its own route and draft. */
        onSwitch: (kind: WorkspaceKind) => void;
        onBack: () => void;
        onClose: () => void;
        onCreate?: () => void;
        onEscape?: () => void;
        onFinishArrange?: () => void;
        feedback?: ReactNode;
        onFeedbackHost?: (host: HTMLElement | null) => void;
        appsArranging?: boolean;
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
        appsArranging,
        onCreate,
        feedback,
        children,
    });
    const route = view.state;
    const presentation: WorkspacePresentation = mobile ? "sheet" : "panel";
    const workspace: WorkspaceKind = isAppsWorkspaceView(route)
        ? "apps"
        : "documents";
    const opener = useRef<HTMLElement | null>(null);
    const openingWorkspace = useRef<WorkspaceKind>(workspace);
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
            openingWorkspace.current = workspace;
        }
        if (!open && wasOpen.current) {
            const frame = requestAnimationFrame(() => {
                const target = opener.current?.isConnected
                    ? opener.current
                    : workspaceEntry(openingWorkspace.current);
                target?.focus({ preventScroll: true });
                opener.current = null;
            });
            wasOpen.current = false;
            return () => cancelAnimationFrame(frame);
        }
        wasOpen.current = open;
    }, [open, workspace]);
    const expanded = route.view === "documents/edit";
    const docked = open && presentation === "panel" && !expanded;
    useLayoutEffect(() => {
        onDockedChange?.(docked);
        return () => onDockedChange?.(false);
    }, [docked, onDockedChange]);
    const root = route.view === "apps/root" ||
        route.view === "documents/root";
    let bodyLayout: "app-form" | "editor" | undefined;
    if (route.view === "apps/create" || route.view === "apps/edit") {
        bodyLayout = "app-form";
    } else if (route.view === "documents/edit") {
        bodyLayout = "editor";
    }
    const createLabel = workspace === "apps"
        ? view.appsArranging ? "完成整理" : "添加应用"
        : "新建笔记";
    return (
        <WorkspaceSurface
            open={open}
            presentation={presentation}
            chromeBottom={chromeBottom}
            title={view.title}
            expanded={expanded}
            headerActions={
                <>
                    <WorkspaceNavigation
                        selected={workspace}
                        onSelect={onSwitch}
                    />
                    {root && view.onCreate && (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Button
                                        className="workspace-primary"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={createLabel}
                                        onClick={workspace === "apps" &&
                                                view.appsArranging
                                            ? onFinishArrange
                                            : view.onCreate}
                                    />
                                }
                            >
                                {workspace === "apps" && view.appsArranging
                                    ? <Check size="1em" className="icon-lg" />
                                    : <Plus size="1em" className="icon-lg" />}
                            </TooltipTrigger>
                            <TooltipContent>{createLabel}</TooltipContent>
                        </Tooltip>
                    )}
                </>
            }
            routeKey={JSON.stringify(route)}
            nested={!root}
            onBack={onBack}
            onClose={onClose}
            onEscape={onEscape}
            onExited={onExited}
            escapeManaged={workspace === "apps"}
            bodyLayout={bodyLayout}
            feedback={mobile ? view.feedback : undefined}
            onFeedbackHost={mobile ? onFeedbackHost : undefined}
        >
            {view.children}
        </WorkspaceSurface>
    );
}
