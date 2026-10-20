import { assertEquals } from "@std/assert";
import {
    createNoteEventSubscriptions,
    type NoteEventSource,
} from "./note-event-subscriptions.ts";

class FakeEventSource implements NoteEventSource {
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
        for (const listener of this.listeners.get("note.updated") ?? []) {
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

Deno.test("notes/note-event-subscriptions: one source routes updates by note id", () => {
    const sources: FakeEventSource[] = [];
    const subscriptions = createNoteEventSubscriptions(
        sourceFactory(sources),
    );
    const firstNoteVersions: number[] = [];
    const secondNoteVersions: number[] = [];
    const anotherNoteVersions: number[] = [];

    subscriptions.subscribe("note-1", (version) => {
        firstNoteVersions.push(version);
    });
    subscriptions.subscribe("note-1", (version) => {
        secondNoteVersions.push(version);
    });
    subscriptions.subscribe("note-2", (version) => {
        anotherNoteVersions.push(version);
    });

    assertEquals(sources.length, 1);
    sources[0].emit(JSON.stringify({ noteId: "note-1", version: 2 }));
    sources[0].emit(JSON.stringify({ noteId: "note-2", version: 7 }));

    assertEquals(firstNoteVersions, [2]);
    assertEquals(secondNoteVersions, [2]);
    assertEquals(anotherNoteVersions, [7]);
    subscriptions.dispose();
});

Deno.test("notes/note-event-subscriptions: only the final unsubscribe closes the source", () => {
    const sources: FakeEventSource[] = [];
    const subscriptions = createNoteEventSubscriptions(
        sourceFactory(sources),
    );
    const received: number[] = [];
    const unsubscribeFirst = subscriptions.subscribe("note-1", (version) => {
        received.push(version);
    });
    const unsubscribeSecond = subscriptions.subscribe("note-2", (version) => {
        received.push(version);
    });

    unsubscribeFirst();
    assertEquals(sources.length, 1);
    assertEquals(sources[0].closed, false);
    sources[0].emit(JSON.stringify({ noteId: "note-1", version: 3 }));
    sources[0].emit(JSON.stringify({ noteId: "note-2", version: 4 }));
    assertEquals(received, [4]);

    unsubscribeSecond();
    assertEquals(sources[0].closed, true);
    const unsubscribeAfterRestart = subscriptions.subscribe(
        "note-1",
        (version) => received.push(version),
    );
    assertEquals(sources.length, 2);
    sources[1].emit(JSON.stringify({ noteId: "note-1", version: 5 }));
    assertEquals(received, [4, 5]);

    unsubscribeAfterRestart();
    subscriptions.dispose();
});

Deno.test("notes/note-event-subscriptions: ignores malformed and invalid updates", () => {
    const sources: FakeEventSource[] = [];
    const subscriptions = createNoteEventSubscriptions(
        sourceFactory(sources),
    );
    const received: number[] = [];
    subscriptions.subscribe("note-1", (version) => received.push(version));

    for (
        const payload of [
            "not json",
            "null",
            "[]",
            JSON.stringify({ version: 1 }),
            JSON.stringify({ noteId: 3, version: 1 }),
            JSON.stringify({ noteId: "note-1", version: "2" }),
            JSON.stringify({ noteId: "note-1", version: 1.5 }),
            JSON.stringify({ noteId: "note-1", version: 0 }),
            JSON.stringify({
                noteId: "note-1",
                version: Number.MAX_SAFE_INTEGER + 1,
            }),
        ]
    ) {
        sources[0].emit(payload);
    }

    assertEquals(received, []);
    subscriptions.dispose();
});

Deno.test("notes/note-event-subscriptions: logout disposal and account switch isolate old events", () => {
    const previousSources: FakeEventSource[] = [];
    const previousSession = createNoteEventSubscriptions(
        sourceFactory(previousSources),
    );
    const previousVersions: number[] = [];
    previousSession.subscribe("same-note-id", (version) => {
        previousVersions.push(version);
    });
    const previousSource = previousSources[0];
    previousSource.emit(JSON.stringify({ noteId: "same-note-id", version: 2 }));
    previousSession.dispose();

    const nextSources: FakeEventSource[] = [];
    const nextSession = createNoteEventSubscriptions(
        sourceFactory(nextSources),
    );
    const nextVersions: number[] = [];
    nextSession.subscribe("same-note-id", (version) => {
        nextVersions.push(version);
    });

    previousSource.emit(JSON.stringify({ noteId: "same-note-id", version: 3 }));
    nextSources[0].emit(JSON.stringify({ noteId: "same-note-id", version: 8 }));

    assertEquals(previousSource.closed, true);
    assertEquals(previousVersions, [2]);
    assertEquals(nextVersions, [8]);
    nextSession.dispose();
});
