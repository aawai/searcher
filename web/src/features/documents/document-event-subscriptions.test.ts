import { assertEquals } from "@std/assert";
import {
    createDocumentEventSubscriptions,
    type DocumentEventSource,
} from "./document-event-subscriptions.ts";

class FakeEventSource implements DocumentEventSource {
    readonly listeners = new Map<string, Set<EventListener>>();
    closed = false;

    addEventListener(type: string, listener: EventListener): void {
        let listeners = this.listeners.get(type);
        if (!listeners) {
            listeners = new Set();
            this.listeners.set(type, listeners);
        }
        listeners.add(listener);
    }

    close(): void {
        this.closed = true;
    }

    emit(data: unknown): void {
        const event = { data } as MessageEvent<unknown>;
        for (const listener of this.listeners.get("document.updated") ?? []) {
            listener(event);
        }
    }
}

function sourceFactory(sources: FakeEventSource[]) {
    return (_url: string): FakeEventSource => {
        const source = new FakeEventSource();
        sources.push(source);
        return source;
    };
}

Deno.test("documents/document-event-subscriptions: one source routes updates by document id", () => {
    const sources: FakeEventSource[] = [];
    const subscriptions = createDocumentEventSubscriptions(
        sourceFactory(sources),
    );
    const firstDocumentVersions: number[] = [];
    const secondDocumentVersions: number[] = [];
    const anotherDocumentVersions: number[] = [];

    subscriptions.subscribe("doc-1", (version) => {
        firstDocumentVersions.push(version);
    });
    subscriptions.subscribe("doc-1", (version) => {
        secondDocumentVersions.push(version);
    });
    subscriptions.subscribe("doc-2", (version) => {
        anotherDocumentVersions.push(version);
    });

    assertEquals(sources.length, 1);
    sources[0].emit(
        JSON.stringify({ documentId: "doc-1", version: 2, updatedAt: 1 }),
    );
    sources[0].emit(
        JSON.stringify({ documentId: "doc-2", version: 7, updatedAt: 1 }),
    );

    assertEquals(firstDocumentVersions, [2]);
    assertEquals(secondDocumentVersions, [2]);
    assertEquals(anotherDocumentVersions, [7]);
    subscriptions.dispose();
});

Deno.test("documents/document-event-subscriptions: only the final unsubscribe closes the source", () => {
    const sources: FakeEventSource[] = [];
    const subscriptions = createDocumentEventSubscriptions(
        sourceFactory(sources),
    );
    const received: number[] = [];
    const unsubscribeFirst = subscriptions.subscribe("doc-1", (version) => {
        received.push(version);
    });
    const unsubscribeSecond = subscriptions.subscribe("doc-2", (version) => {
        received.push(version);
    });

    unsubscribeFirst();
    assertEquals(sources.length, 1);
    assertEquals(sources[0].closed, false);
    sources[0].emit(
        JSON.stringify({ documentId: "doc-1", version: 3, updatedAt: 1 }),
    );
    sources[0].emit(
        JSON.stringify({ documentId: "doc-2", version: 4, updatedAt: 1 }),
    );
    assertEquals(received, [4]);

    unsubscribeSecond();
    assertEquals(sources[0].closed, true);
    const unsubscribeAfterRestart = subscriptions.subscribe(
        "doc-1",
        (version) => received.push(version),
    );
    assertEquals(sources.length, 2);
    sources[1].emit(
        JSON.stringify({ documentId: "doc-1", version: 5, updatedAt: 1 }),
    );
    assertEquals(received, [4, 5]);

    unsubscribeAfterRestart();
    subscriptions.dispose();
});

Deno.test("documents/document-event-subscriptions: ignores malformed and invalid updates", () => {
    const sources: FakeEventSource[] = [];
    const subscriptions = createDocumentEventSubscriptions(
        sourceFactory(sources),
    );
    const received: number[] = [];
    subscriptions.subscribe("doc-1", (version) => received.push(version));

    for (
        const payload of [
            "not json",
            "null",
            "[]",
            JSON.stringify({ version: 1, updatedAt: 1 }),
            JSON.stringify({ documentId: 3, version: 1, updatedAt: 1 }),
            JSON.stringify({ documentId: "doc-1", version: "2" }),
            JSON.stringify({ documentId: "doc-1", version: 1.5 }),
            JSON.stringify({ documentId: "doc-1", version: 0, updatedAt: 1 }),
            JSON.stringify({
                documentId: "doc-1",
                version: Number.MAX_SAFE_INTEGER + 1,
            }),
        ]
    ) {
        sources[0].emit(payload);
    }

    assertEquals(received, []);
    subscriptions.dispose();
});

Deno.test("documents/document-event-subscriptions: logout disposal and account switch isolate old events", () => {
    const previousSources: FakeEventSource[] = [];
    const previousSession = createDocumentEventSubscriptions(
        sourceFactory(previousSources),
    );
    const previousVersions: number[] = [];
    previousSession.subscribe("same-note-id", (version) => {
        previousVersions.push(version);
    });
    const previousSource = previousSources[0];
    previousSource.emit(
        JSON.stringify({
            documentId: "same-note-id",
            version: 2,
            updatedAt: 1,
        }),
    );
    previousSession.dispose();

    const nextSources: FakeEventSource[] = [];
    const nextSession = createDocumentEventSubscriptions(
        sourceFactory(nextSources),
    );
    const nextVersions: number[] = [];
    nextSession.subscribe("same-note-id", (version) => {
        nextVersions.push(version);
    });

    previousSource.emit(
        JSON.stringify({
            documentId: "same-note-id",
            version: 3,
            updatedAt: 1,
        }),
    );
    nextSources[0].emit(
        JSON.stringify({
            documentId: "same-note-id",
            version: 8,
            updatedAt: 1,
        }),
    );

    assertEquals(previousSource.closed, true);
    assertEquals(previousVersions, [2]);
    assertEquals(nextVersions, [8]);
    nextSession.dispose();
});
