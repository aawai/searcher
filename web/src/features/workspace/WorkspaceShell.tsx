import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "../../components/ui/button.tsx";
import { WorkspacePanel } from "./WorkspacePanel.tsx";
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
        dock,
        navigate,
        onBack,
        onClose,
        onCreate,
        appsArranging,
        children,
    }: {
        state: WorkspaceState;
        title: string;
        dock: boolean;
        navigate: (state: WorkspaceState) => void;
        onBack: () => void;
        onClose: () => void;
        onCreate: () => void;
        appsArranging: boolean;
        children: ReactNode;
    },
) {
    const open = state.view !== "closed";
    const workspace: WorkspaceKind = isAppsWorkspaceView(state)
        ? "apps"
        : "notes";
    const lastWorkspace = useRef<WorkspaceKind>(workspace);
    const wasOpen = useRef(false);
    useEffect(() => {
        if (open) lastWorkspace.current = workspace;
        if (!open && wasOpen.current) {
            const frame = requestAnimationFrame(() =>
                document.querySelector<HTMLButtonElement>(
                    '[data-workspace="' + lastWorkspace.current + '"]',
                )?.focus()
            );
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
        <WorkspacePanel
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
        </WorkspacePanel>
    );
}
