import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
    globalThis.addEventListener("online", onChange);
    globalThis.addEventListener("offline", onChange);
    return () => {
        globalThis.removeEventListener("online", onChange);
        globalThis.removeEventListener("offline", onChange);
    };
}

/** The browser's connectivity; server rendering assumes online. */
export function useOnline(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => navigator.onLine,
        () => true,
    );
}
