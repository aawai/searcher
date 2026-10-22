import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import type { WorkspaceKind } from "./workspace-state.ts";

export function WorkspaceNavigation(
    { selected, onSelect }: {
        selected?: WorkspaceKind;
        onSelect: (workspace: WorkspaceKind) => void;
    },
) {
    return (
        <Tabs
            className="workspace-switcher"
            value={selected}
            onValueChange={(value) => onSelect(value as WorkspaceKind)}
        >
            <TabsList aria-label="工作区导航">
                {(["apps", "notes", "documents"] as const).map((workspace) => (
                    <TabsTrigger
                        key={workspace}
                        value={workspace}
                        data-workspace={workspace}
                        aria-label={workspace === "apps"
                            ? "应用工作区"
                            : workspace === "notes"
                            ? "便签工作区"
                            : "笔记工作区"}
                    >
                        {workspace === "apps"
                            ? "应用"
                            : workspace === "notes"
                            ? "便签"
                            : "笔记"}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    );
}
