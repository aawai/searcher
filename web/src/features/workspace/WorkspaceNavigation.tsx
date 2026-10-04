import { Folder, StickyNote } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import type { WorkspaceKind } from "./workspace-state.ts";

export function WorkspaceNavigation(
    { selected, onSelect, variant = "switcher" }: {
        selected?: WorkspaceKind;
        onSelect: (workspace: WorkspaceKind) => void;
        variant?: "switcher" | "mobile";
    },
) {
    return (
        <nav
            className={variant === "mobile"
                ? "workspace-mobile-navigation"
                : "workspace-switcher"}
            aria-label="工作区导航"
        >
            {(["apps", "notes"] as const).map((workspace) => (
                <Button
                    key={workspace}
                    variant="ghost"
                    data-workspace={workspace}
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
