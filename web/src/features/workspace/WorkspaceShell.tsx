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
    isNotesWorkspaceView,
    type WorkspaceKind,
    type WorkspaceRoute,
} from "./workspace-state.ts";
import "./workspace.css";

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
    },
) {
    const [notesExpanded, setNotesExpanded] = useState(false);
    useEffect(() => {
        if (!open || state.view !== "notes/edit") setNotesExpanded(false);
    }, [open, state.view]);
    const [mobile, setMobile] = useState(() =>
        globalThis.matchMedia("(max-width: 767px)").matches
    );
    useEffect(() => {
        const media = globalThis.matchMedia("(max-width: 767px)");
        const change = () => setMobile(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    const presentation: WorkspacePresentation = mobile ? "sheet" : "panel";
    const workspace: WorkspaceKind = isAppsWorkspaceView(state)
        ? "apps"
        : isNotesWorkspaceView(state)
        ? "notes"
        : "documents";
    const opener = useRef<HTMLElement | null>(null);
    const openingWorkspace = useRef<WorkspaceKind>(workspace);
    const wasOpen = useRef(false);
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
                    : document.querySelector<HTMLButtonElement>(
                        '[data-workspace="' + openingWorkspace.current + '"]',
                    );
                target?.focus({ preventScroll: true });
                opener.current = null;
            });
            wasOpen.current = false;
            return () => cancelAnimationFrame(frame);
        }
        wasOpen.current = open;
    }, [open, workspace]);
    if (!open) {
        return null;
    }
    const root = state.view === "apps/root" || state.view === "notes/root" ||
        state.view === "documents/root";
    let bodyLayout: "app-form" | "editor" | undefined;
    if (state.view === "apps/create" || state.view === "apps/edit") {
        bodyLayout = "app-form";
    } else if (state.view === "notes/edit" || state.view === "documents/edit") {
        bodyLayout = "editor";
    }
    const createLabel = workspace === "apps"
        ? appsArranging ? "完成整理" : "添加应用"
        : workspace === "notes"
        ? "新建便签"
        : "新建笔记";
    return (
        <WorkspaceSurface
            presentation={presentation}
            chromeBottom={chromeBottom}
            title={title}
            expanded={state.view === "documents/edit" ||
                (state.view === "notes/edit" && notesExpanded)}
            backLabel={state.view === "notes/edit" ? "返回便签列表" : undefined}
            headerActions={
                <>
                    <WorkspaceNavigation
                        selected={workspace}
                        onSelect={onSwitch}
                    />
                    {root && onCreate && (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Button
                                        className="workspace-primary"
                                        variant="default"
                                        size="icon"
                                        aria-label={createLabel}
                                        onClick={workspace === "apps" &&
                                                appsArranging
                                            ? onFinishArrange
                                            : onCreate}
                                    />
                                }
                            >
                                {workspace === "apps" && appsArranging
                                    ? <Check size="1em" className="icon-lg" />
                                    : <Plus size="1em" className="icon-lg" />}
                            </TooltipTrigger>
                            <TooltipContent>{createLabel}</TooltipContent>
                        </Tooltip>
                    )}
                    {state.view === "notes/edit" && !mobile && (
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-pressed={notesExpanded}
                            onClick={() => setNotesExpanded((value) => !value)}
                        >
                            {notesExpanded ? "收起编辑" : "展开编辑"}
                        </Button>
                    )}
                </>
            }
            routeKey={JSON.stringify(state)}
            nested={!root}
            onBack={onBack}
            onClose={onClose}
            onEscape={onEscape}
            escapeManaged={workspace === "apps"}
            bodyLayout={bodyLayout}
            feedback={mobile ? feedback : undefined}
            onFeedbackHost={mobile ? onFeedbackHost : undefined}
        >
            {children}
        </WorkspaceSurface>
    );
}
