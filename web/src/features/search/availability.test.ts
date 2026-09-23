import { assertEquals } from "@std/assert";
import type { AvailabilityStatus } from "./availability.types.ts";

// Verification of core logic: concurrency, timeout, and generation stale cancellation
class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    referrerPolicy = "";
    private _src = "";

    set src(val: string) {
        this._src = val;
    }
    get src(): string {
        return this._src;
    }
}

function probeEngineWithMockImage(
    probeUrl: string,
    timeoutMs: number,
    ImageCtor: new () => MockImage,
    delayMs?: number,
    shouldSucceed = true,
): { promise: Promise<boolean>; cancel: () => void; img: MockImage } {
    let img: MockImage | null = new ImageCtor();
    const retainedImg = img;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    let resolvePromise: (value: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
        resolvePromise = resolve;
    });

    const cleanup = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        if (img) {
            img.onload = null;
            img.onerror = null;
            img.src = "";
            img = null;
        }
    };

    const cancel = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolvePromise(false);
    };

    img.referrerPolicy = "no-referrer";
    img.onload = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolvePromise(true);
    };
    img.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolvePromise(false);
    };

    timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolvePromise(false);
    }, timeoutMs);

    const separator = probeUrl.includes("?") ? "&" : "?";
    img.src = `${probeUrl}${separator}_t=${Date.now()}`;

    if (delayMs !== undefined) {
        setTimeout(() => {
            if (shouldSucceed) {
                retainedImg.onload?.();
            } else {
                retainedImg.onerror?.();
            }
        }, delayMs);
    }

    return { promise, cancel, img: retainedImg };
}

Deno.test({
    name: "availability probe: timeout triggers and cleans up listeners",
    async fn() {
        const probe = probeEngineWithMockImage(
            "https://example.com/favicon.ico",
            50, // 50ms timeout
            MockImage,
            100, // delay longer than timeout
            true,
        );

        const result = await probe.promise;
        assertEquals(result, false);
        assertEquals(probe.img.onload, null);
        assertEquals(probe.img.onerror, null);
        assertEquals(probe.img.src, "");
    },
});

Deno.test({
    name:
        "availability probe: cancel resolves immediately with false and cleans up",
    async fn() {
        const probe = probeEngineWithMockImage(
            "https://example.com/favicon.ico",
            1000,
            MockImage,
        );

        probe.cancel();
        const result = await probe.promise;
        assertEquals(result, false);
        assertEquals(probe.img.onload, null);
        assertEquals(probe.img.onerror, null);
    },
});

Deno.test({
    name: "availability probe: generation cancels stale callbacks",
    async fn() {
        let generation = 1;
        const finalStatuses: Record<string, AvailabilityStatus> = {};

        const probe = probeEngineWithMockImage(
            "https://example.com/favicon.ico",
            200,
            MockImage,
            50,
            true,
        );

        const currentGen = generation;
        const task = probe.promise.then((reachable) => {
            if (currentGen !== generation) {
                return; // stale update dropped!
            }
            finalStatuses["engine"] = reachable ? "reachable" : "failed";
        });

        // Stale generation increment
        generation += 1;
        probe.cancel();

        await task;
        assertEquals(finalStatuses["engine"], undefined);
    },
});
