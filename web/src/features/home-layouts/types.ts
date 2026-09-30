import type React from "react";
import type { EngineId } from "@shared/engines.ts";
import type { Reachability } from "../../components/searcher/SearcherSearchInput.tsx";
import type { ExtendedWebApp, WebAppGroup } from "../../app/SearchHome.tsx";
import type { NoteItem } from "../../components/searcher/NoteCard.tsx";
import type { Appearance } from "../../app/state.tsx";
import type { UserDto } from "@shared/contracts.ts";

export interface HomeLayoutProps {
    user: UserDto | null;
    appearance: Appearance;
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
    notes: NoteItem[];
    fixedNotes: NoteItem[];
    isManagingApps: boolean;
    setIsManagingApps: React.Dispatch<React.SetStateAction<boolean>>;
    openApp: (
        app: {
            name: string;
            url: string;
            openMode?: "current" | "new_tab" | "global" | null;
        },
    ) => void;
    openAddModal: () => void;
    openEditModal: (app: ExtendedWebApp) => void;
    reorderPinned: (ids: string[]) => Promise<void>;
    togglePinApp: (app: ExtendedWebApp) => Promise<void>;
    softDeleteApp: (app: ExtendedWebApp) => Promise<void>;
    moveAppGroup: (
        app: ExtendedWebApp,
        groupId: string | null,
    ) => Promise<void>;
    // notes
    createNote: () => Promise<void>;
    editNote: (note: NoteItem) => void;
    deleteNote: (note: NoteItem) => Promise<void>;
    updateNote: (
        note: NoteItem,
        patch: Record<string, unknown>,
    ) => Promise<void>;
    updateNoteLayout: (
        note: NoteItem,
        layout: NonNullable<NoteItem["layout"]>,
    ) => Promise<void>;
    // sheet controls
    openWorkspace: (workspace: "apps" | "notes") => void;
    // error
    error: string;
    setError: (err: string) => void;
}
