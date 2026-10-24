/// <reference types="vite/client" />
import { useCallback, useEffect, useRef, useState } from "react";
import { SERVICE_WORKER_PATH } from "@shared/pwa.ts";
import { pageRunsBuild } from "./sw-policy.ts";
import type {
    ServiceWorkerMessage,
    ServiceWorkerReply,
} from "./sw-messages.ts";

function send(
    worker: ServiceWorker,
    message: ServiceWorkerMessage,
    transfer: Transferable[] = [],
) {
    worker.postMessage(message, transfer);
}

function workerBuild(worker: ServiceWorker): Promise<ServiceWorkerReply> {
    const channel = new MessageChannel();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error("Service worker did not answer")),
            5000,
        );
        channel.port1.onmessage = (event: MessageEvent<ServiceWorkerReply>) => {
            clearTimeout(timer);
            resolve(event.data);
        };
        send(worker, { type: "build" }, [channel.port2]);
    });
}

/** Same-origin paths of every script and stylesheet this page has loaded. */
function loadedAssetPaths(): string[] {
    return [...document.querySelectorAll("script[src], link[href]")]
        .map((element) =>
            new URL(
                element.getAttribute("src") ?? element.getAttribute("href")!,
                location.href,
            )
        )
        .filter((url) => url.origin === location.origin)
        .map((url) => url.pathname);
}

/**
 * Registers `/sw.js` in production builds. Every online page load already
 * runs the deployed build (pages are network first), so a waiting worker of
 * the same build takes over silently. A worker of another build than this
 * page — deployed while the page stayed open — sets `updateReady` to prompt a
 * reload, so an old page never keeps calling a newer API unnoticed.
 */
export function useServiceWorkerUpdate(): {
    updateReady: boolean;
    reload: () => void;
} {
    const [newer, setNewer] = useState<ServiceWorker | null>(null);
    const reloading = useRef(false);
    useEffect(() => {
        if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
        const container = navigator.serviceWorker;
        let disposed = false;
        let registration: ServiceWorkerRegistration | undefined;
        // A worker of the build this page runs may take over now; any other
        // worker, waiting or already activated by another tab, needs a reload.
        const consider = async (worker: ServiceWorker) => {
            const build = await workerBuild(worker).catch(() => null);
            if (disposed || !build) return;
            if (!pageRunsBuild(loadedAssetPaths(), build.shellAssets)) {
                setNewer(worker);
            } else if (worker.state === "installed") {
                send(worker, { type: "activate" });
            }
        };
        const onUpdateFound = () => {
            const worker = registration?.installing;
            worker?.addEventListener("statechange", () => {
                // The first install has no page to replace and activates itself.
                if (worker.state === "installed" && container.controller) {
                    void consider(worker);
                }
            });
        };
        const onControllerChange = () => {
            if (reloading.current) {
                location.reload();
                return;
            }
            if (container.controller) void consider(container.controller);
        };
        const onVisibilityChange = () => {
            if (document.visibilityState !== "visible") return;
            void registration?.update().catch(() => undefined);
        };
        container.addEventListener("controllerchange", onControllerChange);
        document.addEventListener("visibilitychange", onVisibilityChange);
        container.register(SERVICE_WORKER_PATH, { updateViaCache: "none" })
            .then((registered) => {
                if (disposed) return;
                registration = registered;
                registered.addEventListener("updatefound", onUpdateFound);
                if (registered.waiting && container.controller) {
                    void consider(registered.waiting);
                }
            })
            .catch(() => undefined);
        return () => {
            disposed = true;
            registration?.removeEventListener("updatefound", onUpdateFound);
            container.removeEventListener(
                "controllerchange",
                onControllerChange,
            );
            document.removeEventListener(
                "visibilitychange",
                onVisibilityChange,
            );
        };
    }, []);
    const reload = useCallback(() => {
        if (newer?.state !== "installed") {
            location.reload();
            return;
        }
        reloading.current = true;
        send(newer, { type: "activate" });
    }, [newer]);
    return { updateReady: newer !== null, reload };
}
