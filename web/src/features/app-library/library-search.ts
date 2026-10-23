export interface SearchableApp {
    name: string;
    url: string;
}

export interface SearchableFolder {
    id: string;
    name: string;
}

export type LibraryMatch<A extends SearchableApp, F extends SearchableFolder> =
    | { type: "folder"; folder: F }
    | { type: "app"; app: A };

/** Most local matches the search box lists before history and engine suggestions. */
export const LIBRARY_MATCH_LIMIT = 4;

/**
 * Search-box matches over the app library: folders by name first (selecting one
 * opens it on the home page), then apps by name or URL. Duplicate apps (same
 * name and URL) collapse to the first one.
 */
export function matchLibrary<
    A extends SearchableApp,
    F extends SearchableFolder,
>(
    query: string,
    apps: readonly A[],
    folders: readonly F[],
    limit = LIBRARY_MATCH_LIMIT,
): LibraryMatch<A, F>[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const matches: LibraryMatch<A, F>[] = [];
    for (const folder of folders) {
        if (matches.length >= limit) return matches;
        if (folder.name.toLowerCase().includes(needle)) {
            matches.push({ type: "folder", folder });
        }
    }
    const seen = new Set<string>();
    for (const app of apps) {
        if (matches.length >= limit) return matches;
        if (
            !app.name.toLowerCase().includes(needle) &&
            !app.url.toLowerCase().includes(needle)
        ) continue;
        const key = `${app.name}:${app.url}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({ type: "app", app });
    }
    return matches;
}
