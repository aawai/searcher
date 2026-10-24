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
import type { HomeContinueDto, UserDto } from "@shared/contracts.ts";
import type { WorkspaceKind } from "../workspace/workspace-state.ts";
import type { SearchQuickCommand } from "../shortcuts/shortcut-catalog.ts";
import type { PaperItem } from "./home-papers.ts";
import type { InlineAnswer } from "../inline-ai/useInlineAnswer.ts";
export interface HomeLayoutProps {
    user: UserDto | null;
    engine: EngineId;
    setEngine: (engine: EngineId) => void;
    reachability: Reachability;
    isCheckingConnections: boolean;
    onCheckConnections: () => Promise<void>;
    search: (
        query: string,
        newTab: boolean,
        override?: { engine?: EngineId },
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
    /** Opens a document in the workspace by id (search results). */
    openDocument: (id: string) => void;
    /** An enabled model exists for the signed-in user: AI entry points show. */
    aiAvailable: boolean;
    /** The streamed answer card under the search box. */
    inlineAnswer: InlineAnswer;
    /** Runs a theme, route or workspace command from the search box. */
    onSearchCommand: (command: SearchQuickCommand) => void;
    /** Shift+Enter quick capture; resolves true once the note exists. */
    onCapture: (text: string) => Promise<boolean>;
    // appearance
    showAppLabels: boolean;
    /** 在首页显示应用: the grid, + and 更多 render on home. */
    showHomeApps: boolean;
    /** The calm layer above the search box: date, time and 继续. */
    calm: {
        showDate: boolean;
        showTime: boolean;
        /** Signed in and enabled. */
        showContinue: boolean;
        candidates: HomeContinueDto | null;
    };
    // error
    setError: (err: string) => void;
}
