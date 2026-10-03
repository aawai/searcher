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
    type WorkspaceKind,
    type WorkspaceState,
} from "./workspace-state.ts";
import "./workspace.css";

export function WorkspaceShell(
    {
        state,
        title,
        style,
        navigate,
        onBack,
        onClose,
        onCreate,
        appsArranging,
        children,
    }: {
        state: WorkspaceState;
        title: string;
        style: "zen" | "widgets";
        navigate: (state: WorkspaceState) => void;
        onBack: () => void;
        onClose: () => void;
        onCreate: () => void;
        appsArranging: boolean;
        children: ReactNode;
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
    const presentation: WorkspacePresentation = mobile
        ? "sheet"
        : style === "zen"
        ? "panel"
        : "window";
    const dock = style === "widgets";
    const open = state.view !== "closed";
    const workspace: WorkspaceKind = isAppsWorkspaceView(state)
        ? "apps"
        : "notes";
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
    const select = (kind: WorkspaceKind) =>
        navigate({ view: kind === "apps" ? "apps/root" : "notes/root" });
    if (!open) {
        return dock ? <WorkspaceNavigation dock onSelect={select} /> : null;
    }
    const root = state.view === "apps/root" || state.view === "notes/root";
    const editing = state.view === "apps/create" ||
        state.view === "apps/edit" || state.view === "notes/edit";
    return (
        <WorkspaceSurface
            presentation={presentation}
            title={title}
            routeKey={JSON.stringify(state)}
            nested={!root}
            onBack={onBack}
            onClose={onClose}
            footer={
                <footer className="workspace-footer">
                    {root && !(workspace === "apps" && appsArranging) && (
                        <Button
                            className="workspace-primary"
                            variant="default"
                            onClick={onCreate}
                        >
                            {workspace === "apps" ? "添加应用" : "新建便签"}
                        </Button>
                    )}
                    {!editing && (
                        <WorkspaceNavigation
                            selected={workspace}
                            onSelect={select}
                        />
                    )}
                </footer>
            }
        >
            {children}
        </WorkspaceSurface>
    );
}
