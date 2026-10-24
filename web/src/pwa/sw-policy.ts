import {
    PWA_ICONS_PATH,
    PWA_MANIFEST_PATH,
    SERVICE_WORKER_PATH,
} from "@shared/pwa.ts";

/**
 * How the service worker answers a request:
 * - `network`: not intercepted; the browser talks to the server directly.
 * - `asset`: a fingerprinted build file, served from cache once fetched.
 * - `page`: a navigation to an app page, network first with the cached shell
 *   as the offline fallback, so an online load always gets the deployed HTML.
 */
export type ServiceWorkerRoute = "network" | "asset" | "page";

export const SHELL_CACHE_PREFIX = "searcher-shell-";
/** The precached HTML shell; the server answers every page path with it. */
export const SHELL_URL = "/";
export const ASSETS_PREFIX = "/assets/";

export function shellCacheName(version: string): string {
    return `${SHELL_CACHE_PREFIX}${version}`;
}

/** Caches of other builds; caches not created by this worker are left alone. */
export function isStaleShellCache(name: string, version: string): boolean {
    return name.startsWith(SHELL_CACHE_PREFIX) &&
        name !== shellCacheName(version);
}

/** Root files the server answers itself; a navigation to them is not a page. */
function isInstallFile(path: string): boolean {
    return path === "/assets" || path === PWA_MANIFEST_PATH ||
        path === SERVICE_WORKER_PATH || path === PWA_ICONS_PATH ||
        path.startsWith(`${PWA_ICONS_PATH}/`);
}

export function serviceWorkerRoute(
    request: { method: string; url: string; mode: string },
    origin: string,
): ServiceWorkerRoute {
    if (request.method !== "GET") return "network";
    const url = new URL(request.url);
    if (url.origin !== origin) return "network";
    // API responses are never cached, so no stale data outlives a session.
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        return "network";
    }
    if (url.pathname.startsWith(ASSETS_PREFIX)) return "asset";
    if (request.mode === "navigate" && !isInstallFile(url.pathname)) {
        return "page";
    }
    return "network";
}

/** `src`/`href` references to build assets in the shell HTML, in order. */
export function shellAssetPaths(html: string): string[] {
    const paths = [...html.matchAll(/\s(?:src|href)="(\/assets\/[^"]+)"/g)]
        .map((match) => match[1]);
    return [...new Set(paths)];
}

/**
 * A page runs the build a worker caches when it loaded every shell asset of
 * that build. Lazy chunks added later only grow the page's set.
 */
export function pageRunsBuild(
    pageAssets: Iterable<string>,
    buildShellAssets: readonly string[],
): boolean {
    const loaded = new Set(pageAssets);
    return buildShellAssets.every((path) => loaded.has(path));
}
