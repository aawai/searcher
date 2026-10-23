import type { WebAppItem } from "../../components/searcher/WebAppIcon.tsx";

export interface WebAppGroup {
    id: string;
    userId: string;
    name: string;
    folderSize: "small" | "large";
    sortOrder: number;
    createdAt: number;
    updatedAt: number;
}

export interface ExtendedWebApp extends WebAppItem {
    sortOrder?: number;
    openMode?: "global" | "current" | "new_tab";
    groupId?: string | null;
}
