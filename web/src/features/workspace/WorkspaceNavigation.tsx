import { AppWindow, NotebookPen, StickyNote } from "lucide-react";
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
            {(["apps", "notes", "documents"] as const).map((workspace) => (
                <Button
                    key={workspace}
                    variant="ghost"
                    data-workspace={workspace}
                    aria-label={workspace === "apps"
                        ? "应用工作区"
                        : workspace === "notes"
                        ? "便签工作区"
                        : "笔记工作区"}
                    aria-pressed={selected === workspace}
                    onClick={() => onSelect(workspace)}
                >
                    {workspace === "apps"
                        ? <AppWindow size={16} />
                        : workspace === "notes"
                        ? <StickyNote size={18} />
                        : <NotebookPen size={18} />}
                    <span>
                        {workspace === "apps"
                            ? "应用"
                            : workspace === "notes"
                            ? "便签"
                            : "笔记"}
                    </span>
                </Button>
            ))}
        </nav>
    );
}
