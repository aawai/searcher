/**
 * Service worker entry, bundled by `web/vite-service-worker.ts` into `/sw.js`
 * with the build version and the shell's asset list. It caches only the HTML
 * shell and fingerprinted `/assets/*`; `/api/*` always goes to the network.
 * A new build installs, then waits until the page asks it to take over.
 */
import {
    isStaleShellCache,
    serviceWorkerRoute,
    SHELL_URL,
    shellAssetPaths,
    shellCacheName,
} from "./sw-policy.ts";
import {
    type ServiceWorkerMessage,
    type ServiceWorkerReply,
} from "./sw-messages.ts";

declare const __SW_VERSION__: string;
declare const __SW_SHELL_ASSETS__: readonly string[];

interface ExtendableEvent extends Event {
    waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
    readonly request: Request;
    respondWith(response: Response | Promise<Response>): void;
}
interface ExtendableMessageEvent extends ExtendableEvent {
    readonly data: unknown;
    readonly ports: readonly MessagePort[];
}
interface ServiceWorkerScope {
    readonly location: Location;
    readonly clients: { claim(): Promise<void> };
    skipWaiting(): Promise<void>;
    addEventListener(
        type: "install" | "activate",
        listener: (event: ExtendableEvent) => void,
    ): void;
    addEventListener(
        type: "fetch",
        listener: (event: FetchEvent) => void,
    ): void;
    addEventListener(
        type: "message",
        listener: (event: ExtendableMessageEvent) => void,
    ): void;
}

const scope = globalThis as unknown as ServiceWorkerScope;
const cacheName = shellCacheName(__SW_VERSION__);

async function precacheShell(): Promise<void> {
    const shell = await fetch(SHELL_URL, { cache: "reload" });
    if (!shell.ok) throw new Error(`Shell responded ${shell.status}`);
    const html = await shell.clone().text();
    // A deploy between fetching sw.js and the shell would pair the wrong build.
    const served = shellAssetPaths(html);
    if (
        served.length !== __SW_SHELL_ASSETS__.length ||
        __SW_SHELL_ASSETS__.some((path) => !served.includes(path))
    ) {
        throw new Error("The served shell belongs to another build");
    }
    const cache = await caches.open(cacheName);
    await cache.addAll([...__SW_SHELL_ASSETS__]);
    await cache.put(SHELL_URL, shell);
}

async function removeStaleCaches(): Promise<void> {
    const names = await caches.keys();
    await Promise.all(
        names.filter((name) => isStaleShellCache(name, __SW_VERSION__))
            .map((name) => caches.delete(name)),
    );
}

async function assetResponse(request: Request): Promise<Response> {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
}

async function pageResponse(request: Request): Promise<Response> {
    try {
        return await fetch(request);
    } catch (error) {
        const shell = await caches.open(cacheName).then((cache) =>
            cache.match(SHELL_URL)
        );
        if (shell) return shell;
        throw error;
    }
}

scope.addEventListener("install", (event) => {
    event.waitUntil(precacheShell());
});

scope.addEventListener("activate", (event) => {
    event.waitUntil(
        removeStaleCaches().then(() => scope.clients.claim()),
    );
});

scope.addEventListener("fetch", (event) => {
    const route = serviceWorkerRoute(event.request, scope.location.origin);
    if (route === "asset") event.respondWith(assetResponse(event.request));
    if (route === "page") event.respondWith(pageResponse(event.request));
});

scope.addEventListener("message", (event) => {
    const message = event.data as ServiceWorkerMessage | null;
    if (message?.type === "activate") {
        event.waitUntil(scope.skipWaiting());
        return;
    }
    if (message?.type === "build") {
        const reply: ServiceWorkerReply = {
            version: __SW_VERSION__,
            shellAssets: __SW_SHELL_ASSETS__,
        };
        event.ports[0]?.postMessage(reply);
    }
});
