import { Folder, StickyNote } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import type { WorkspaceKind } from "./workspace-state.ts";

export function WorkspaceNavigation({ selected, onSelect, dock = false }: {
    selected?: WorkspaceKind;
    onSelect: (workspace: WorkspaceKind) => void;
    dock?: boolean;
}) {
    return (
        <nav
            className={dock ? "workspace-dock" : "workspace-switcher"}
            aria-label="工作区导航"
        >
            {(["apps", "notes"] as const).map((workspace) => (
                <Button
                    key={workspace}
                    variant="ghost"
                    data-workspace={dock ? workspace : undefined}
                    aria-label={workspace === "apps"
                        ? "应用工作区"
                        : "便签工作区"}
                    aria-pressed={selected === workspace}
                    onClick={() => onSelect(workspace)}
                >
                    {workspace === "apps"
                        ? <Folder size={18} />
                        : <StickyNote size={18} />}
                    <span>{workspace === "apps" ? "应用" : "便签"}</span>
                </Button>
            ))}
        </nav>
    );
}
