import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { Window } from "happy-dom";

import {
    DEFAULT_PAPER_SETTINGS,
    type UpdateDocumentSettingsInput,
} from "../../features/documents/paper.ts";
import type { PaginationSnapshot } from "../../features/documents/document-pagination.ts";
import { createPaginationEditor } from "./runtime.ts";

interface TestDomEnvironment {
    window: Window;
    root: HTMLElement;
    viewport: HTMLElement;
    cleanup: () => void;
}

function createTestDomEnvironment(): TestDomEnvironment {
    const window = new Window({ url: "https://localhost:3000" });
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalNavigator = globalThis.navigator;
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCaf = globalThis.cancelAnimationFrame;

    Reflect.set(globalThis, "window", window);
    Reflect.set(globalThis, "document", window.document);
    Reflect.set(globalThis, "navigator", window.navigator);
    Reflect.set(
        globalThis,
        "requestAnimationFrame",
        window.requestAnimationFrame.bind(window),
    );
    Reflect.set(
        globalThis,
        "cancelAnimationFrame",
        window.cancelAnimationFrame.bind(window),
    );

    const viewport = window.document.createElement("div");
    const root = window.document.createElement("div");
    viewport.appendChild(root);
    window.document.body.appendChild(viewport);

    const restore = (key: string, value: unknown) => {
        if (value !== undefined) {
            Reflect.set(globalThis, key, value);
        } else {
            Reflect.deleteProperty(globalThis, key);
        }
    };

    return {
        window,
        root: root as unknown as HTMLElement,
        viewport: viewport as unknown as HTMLElement,
        cleanup: () => {
            try {
                window.close();
            } finally {
                restore("window", originalWindow);
                restore("document", originalDocument);
                restore("navigator", originalNavigator);
                restore("requestAnimationFrame", originalRaf);
                restore("cancelAnimationFrame", originalCaf);
            }
        },
    };
}

interface SnapshotWaiter {
    readonly onLayout: (snapshot: PaginationSnapshot) => void;
    waitForNextSnapshot(): Promise<PaginationSnapshot>;
}

function createSnapshotWaiter(): SnapshotWaiter {
    let nextResolver: ((snapshot: PaginationSnapshot) => void) | null = null;

    const onLayout = (snapshot: PaginationSnapshot) => {
        if (nextResolver) {
            const resolve = nextResolver;
            nextResolver = null;
            resolve(snapshot);
        }
    };

    const waitForNextSnapshot = (): Promise<PaginationSnapshot> => {
        const { promise, resolve } = Promise.withResolvers<
            PaginationSnapshot
        >();
        nextResolver = resolve;
        return promise;
    };

    return { onLayout, waitForNextSnapshot };
}

Deno.test("M0B live IME composition queue: defer paper geometry updates until compositionend", async () => {
    const env = createTestDomEnvironment();
    try {
        const waiter = createSnapshotWaiter();
        const pagination = await createPaginationEditor(
            env.root,
            env.viewport,
            DEFAULT_PAPER_SETTINGS,
            () => {},
            waiter.onLayout,
            "中文字符输入测试",
        );

        const initialTop = env.root.style.getPropertyValue(
            "--page-margin-top",
        );
        assertNotEquals(initialTop, "");

        env.root.dispatchEvent(
            new env.window.CompositionEvent(
                "compositionstart",
            ) as unknown as Event,
        );

        const updatedPaper: UpdateDocumentSettingsInput = {
            paperSize: "a4",
            orientation: "portrait",
            marginTopMm: 5,
            marginRightMm: 5,
            marginBottomMm: 5,
            marginLeftMm: 5,
        };
        pagination.setPaper(updatedPaper);

        // rAF callbacks run in FIFO order: a frame queued now runs after any reflow frame scheduled by setPaper.
        const frame = Promise.withResolvers<void>();
        env.window.requestAnimationFrame(() => frame.resolve());
        await frame.promise;
        assertEquals(
            env.root.style.getPropertyValue("--page-margin-top"),
            initialTop,
            "CSS structural geometry must not mutate while IME composition is active",
        );

        const deferredSnapshotPromise = waiter.waitForNextSnapshot();
        env.root.dispatchEvent(
            new env.window.CompositionEvent(
                "compositionend",
            ) as unknown as Event,
        );
        const deferredSnapshot = await deferredSnapshotPromise;

        const expectedNewTop = `${5 * (96 / 25.4)}px`;
        assertEquals(
            env.root.style.getPropertyValue("--page-margin-top"),
            expectedNewTop,
            "CSS structural geometry must update only after compositionend",
        );
        assert(
            typeof deferredSnapshot.durationMs === "number",
            "Snapshot must extend durationMs measurement cost",
        );

        await pagination.destroy();
    } finally {
        env.cleanup();
    }
});
