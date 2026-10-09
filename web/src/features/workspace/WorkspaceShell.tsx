import {
    type ReactNode,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { Button } from "../../components/ui/button.tsx";
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
        style,
        navigate,
        onBack,
        onClose,
        onCreate,
        onEscape,
        onFinishArrange,
        feedback,
        onFeedbackHost,
        appsArranging = false,
        children,
    }: {
        open?: boolean;
        state: WorkspaceRoute;
        title: string;
        style: "zen" | "widgets";
        navigate: (state: WorkspaceRoute) => void;
        onBack: () => void;
        onClose: () => void;
        onCreate?: () => void;
        onEscape?: () => void;
        onFinishArrange?: () => void;
        feedback?: ReactNode;
        onFeedbackHost?: (host: HTMLElement | null) => void;
        appsArranging?: boolean;
        children: ReactNode;
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
    const select = (kind: WorkspaceKind) => navigate({ view: `${kind}/root` });
    if (!open || (style === "widgets" && !mobile)) return null;
    const root = state.view === "apps/root" || state.view === "notes/root" ||
        state.view === "documents/root";
    const editing = state.view === "apps/create" ||
        state.view === "apps/edit" || state.view === "notes/edit" ||
        state.view === "documents/edit" || state.view === "documents/create";
    return (
        <WorkspaceSurface
            presentation={presentation}
            title={title}
            expanded={state.view === "documents/edit" ||
                (state.view === "notes/edit" && notesExpanded)}
            backLabel={state.view === "notes/edit" ? "返回便签列表" : undefined}
            headerActions={state.view === "notes/edit" && !mobile
                ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        aria-pressed={notesExpanded}
                        onClick={() => setNotesExpanded((value) => !value)}
                    >
                        {notesExpanded ? "收起编辑" : "展开编辑"}
                    </Button>
                )
                : undefined}
            routeKey={JSON.stringify(state)}
            nested={!root}
            onBack={onBack}
            onClose={onClose}
            onEscape={onEscape}
            escapeManaged={workspace === "apps"}
            formLayout={state.view === "apps/create" ||
                state.view === "apps/edit"}
            feedback={mobile ? feedback : undefined}
            onFeedbackHost={mobile ? onFeedbackHost : undefined}
            footer={!editing &&
                (
                    <footer className="workspace-footer">
                        {root && onCreate && (
                            <Button
                                className="workspace-primary"
                                variant="default"
                                onClick={workspace === "apps" && appsArranging
                                    ? onFinishArrange
                                    : onCreate}
                            >
                                {workspace === "apps"
                                    ? appsArranging ? "完成整理" : "添加应用"
                                    : workspace === "notes"
                                    ? "新建便签"
                                    : "新建笔记"}
                            </Button>
                        )}
                        {!editing && (
                            <WorkspaceNavigation
                                selected={workspace}
                                onSelect={select}
                            />
                        )}
                    </footer>
                )}
        >
            {children}
        </WorkspaceSurface>
    );
}
