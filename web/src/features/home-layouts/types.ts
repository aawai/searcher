import type React from "react";
import type { EngineId } from "@shared/engines.ts";
import type {
    DocumentLayoutDto,
    UpdateDocumentInput,
} from "@shared/documents.ts";
import type { Reachability } from "../../components/searcher/SearcherSearchInput.tsx";
import type { ExtendedWebApp, WebAppGroup } from "../../app/SearchHome.tsx";
import type { UserDto } from "@shared/contracts.ts";
import type { WorkspaceKind } from "../workspace/workspace-state.ts";
import type { PaperItem } from "./home-papers.ts";
export interface HomeLayoutProps {
    user: UserDto | null;
    engine: EngineId;
    setEngine: (engine: EngineId) => void;
    mode: "search" | "ai";
    setMode: (mode: "search" | "ai") => void;
    reachability: Reachability;
    isCheckingConnections: boolean;
    onCheckConnections: () => Promise<void>;
    search: (
        query: string,
        newTab: boolean,
        override?: { engine?: EngineId; mode?: "search" | "ai" },
    ) => void;
    apps: ExtendedWebApp[];
    pinned: ExtendedWebApp[];
    groups: WebAppGroup[];
    appsStatus: "loading" | "ready" | "offline" | "error";
    appsError: string;
    onReloadApps: () => void;
    papersLoading: boolean;
    papers: PaperItem[];
    isManagingApps: boolean;
    setIsManagingApps: React.Dispatch<React.SetStateAction<boolean>>;
    openApp: (
        app: {
            name: string;
            url: string;
            openMode?: "current" | "new_tab" | "global" | null;
        },
    ) => void;
    openEditModal: (app: ExtendedWebApp) => void;
    reorderPinned: (ids: string[]) => Promise<void>;
    togglePinApp: (app: ExtendedWebApp) => Promise<void>;
    softDeleteApp: (app: ExtendedWebApp) => Promise<void>;
    moveAppGroup: (
        app: ExtendedWebApp,
        groupId: string | null,
    ) => Promise<void>;
    // papers
    openPaper: (paper: PaperItem) => void;
    deletePaper: (paper: PaperItem) => Promise<void>;
    updatePaper: (
        paper: PaperItem,
        patch: Omit<UpdateDocumentInput, "version">,
    ) => Promise<void>;
    updatePaperLayout: (
        paper: PaperItem,
        layout: DocumentLayoutDto,
    ) => Promise<void>;
    // sheet controls
    openWorkspace: (workspace: WorkspaceKind) => void;
    workspaceOpen: boolean;
    // appearance
    showAppLabels: boolean;
    // error
    setError: (err: string) => void;
}
