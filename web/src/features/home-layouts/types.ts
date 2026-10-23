import type React from "react";
import type { EngineId } from "@shared/engines.ts";
import type {
    DocumentLayoutDto,
    UpdateDocumentInput,
} from "@shared/documents.ts";
import type { Reachability } from "../../components/searcher/SearcherSearchInput.tsx";
import type {
    ExtendedWebApp,
    WebAppGroup,
} from "../app-library/library-types.ts";
import type { AppLibraryController } from "../app-library/useAppLibraryActions.ts";
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
    groups: WebAppGroup[];
    appsStatus: "loading" | "ready" | "offline" | "error";
    appsError: string;
    onReloadApps: () => void;
    /** Folder CRUD, order writes and icon backfill for the home app library. */
    library: AppLibraryController;
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
    openEditApp: (app: ExtendedWebApp, expandIcon?: boolean) => void;
    openCreateApp: (groupId?: string) => void;
    softDeleteApp: (app: ExtendedWebApp) => Promise<void>;
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
    /** 在首页显示应用: the grid, + and 更多 render on home. */
    showHomeApps: boolean;
    // error
    setError: (err: string) => void;
}
