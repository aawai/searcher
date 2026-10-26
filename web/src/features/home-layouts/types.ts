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
import type { LibraryRequest } from "../library/library-request.ts";
import type { SearchQuickCommand } from "../shortcuts/shortcut-catalog.ts";
import type { HomeNoteItem } from "./home-notes.ts";
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
    notesLoading: boolean;
    homeNotes: HomeNoteItem[];
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
    // home notes
    openNote: (note: HomeNoteItem) => void;
    deleteNote: (note: HomeNoteItem) => Promise<void>;
    updateNote: (
        note: HomeNoteItem,
        patch: Omit<UpdateDocumentInput, "version">,
    ) => Promise<void>;
    /** One atomic home layout write: a move or resize is one change, a swap two. */
    updateNoteLayouts: (
        changes: ReadonlyArray<{
            note: HomeNoteItem;
            layout: DocumentLayoutDto;
        }>,
    ) => Promise<void>;
    /** Toggles one task row in a note's body; optimistic, saved and coalesced. */
    toggleTask: (note: HomeNoteItem, index: number, checked: boolean) => void;
    /** The note open in the editor; its card task boxes are read-only meanwhile. */
    editingNoteId: string | null;
    /** Opens the complete apps or notes management panel directly. */
    openLibrary: (request: LibraryRequest) => void;
    /** Opens a note's detail on the desk by id (search results). */
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
    /** 显示应用底板: paint the Material plate behind the home grid. */
    showHomeAppPlate: boolean;
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
