import type { AppsRoute } from "./workspace-state.ts";

export function appsEscapeIntent(
    route: AppsRoute,
    query: string,
    arranging: boolean,
    folderId: string | null,
): "clear-query" | "finish-arrange" | "leave-folder" | "back" | "close" {
    if (route.view !== "apps/root") return "back";
    if (query !== "") return "clear-query";
    if (arranging) return "finish-arrange";
    if (folderId) return "leave-folder";
    return "close";
}
