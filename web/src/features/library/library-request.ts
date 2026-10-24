export type LibraryRequest = "root" | "notes" | "apps";

export function libraryRequestState(
    request: LibraryRequest,
): { library: LibraryRequest } {
    return { library: request };
}
export function readLibraryRequest(state: unknown): LibraryRequest | null {
    if (!state || typeof state !== "object" || !("library" in state)) {
        return null;
    }
    return state.library === "root" || state.library === "notes" ||
            state.library === "apps"
        ? state.library
        : null;
}
