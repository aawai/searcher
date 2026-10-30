import type { DocumentDto, DocumentVersionDto } from "@shared/documents.ts";
import type { DocumentColor } from "@shared/documents.ts";
import type { DocumentEventSubscriptions } from "./document-event-subscriptions.ts";

export interface DocumentLocalDraft {
    userId: string;
    documentId: string;
    title: string;
    body: string;
    version: number;
    updatedAt: number;
}
export type DocumentSaveStatus =
    | "saved"
    | "dirty"
    | "saving"
    | "error"
    | "conflict";
export interface DocumentSessionSnapshot {
    loading: boolean;
    error: string | null;
    document: DocumentDto | null;
    title: string;
    body: string;
    saveStatus: DocumentSaveStatus;
    conflict: DocumentDto | null;
    draft: DocumentLocalDraft | null;
    localDraftError: string | null;
}
export interface DocumentSession {
    getSnapshot(): DocumentSessionSnapshot;
    subscribe(listener: () => void): () => void;
    load(): Promise<void>;
    edit(change: { title?: string; body?: string }): void;
    setComposing(composing: boolean): void;
    save(origin?: "autosave" | "manual"): Promise<boolean>;
    updatePresentation(
        change: { color?: DocumentColor; isHomeFixed?: boolean },
    ): Promise<boolean>;
    applyDraft(): void;
    discardDraft(): Promise<void>;
    resolveConflict(choice: "server" | "local" | "new"): Promise<string | null>;
    listVersions(): Promise<DocumentVersionDto[]>;
    restoreVersion(version: number): Promise<boolean>;
    destroy(): Promise<void>;
}
export interface DocumentSessionOptions {
    userId: string;
    documentId?: string;
    target?: { notebookId: string | null; isHomeFixed: boolean };
    onCreated?: (id: string) => void;
    request?: <T>(path: string, init?: RequestInit) => Promise<T>;
    events?: DocumentEventSubscriptions;
    drafts?: {
        read(key: string): Promise<unknown>;
        write(key: string, value: DocumentLocalDraft): Promise<void>;
        delete(key: string): Promise<void>;
    };
}
