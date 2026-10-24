import { assertEquals } from "@std/assert";
import { continueEntries } from "./continue-line.ts";

const document = { id: "d1", displayTitle: "周报", updatedAt: 100 };
const conversation = { id: "c1", title: "旅行计划", updatedAt: 200 };

Deno.test("继续 leads with the more recent of the note and the unfinished conversation", () => {
    assertEquals(
        continueEntries({ document, conversation, homeTasks: null }),
        [{ kind: "conversation", id: "c1", title: "旅行计划" }],
    );
    assertEquals(
        continueEntries({
            document: { ...document, updatedAt: 300 },
            conversation,
            homeTasks: null,
        }),
        [{ kind: "document", id: "d1", title: "周报" }],
    );
    // A tie keeps the note.
    assertEquals(
        continueEntries({
            document: { ...document, updatedAt: 200 },
            conversation,
            homeTasks: null,
        })[0].kind,
        "document",
    );
});

Deno.test("open home to-dos follow the lead entry and stand alone without one", () => {
    const homeTasks = { open: 3, documentId: "p1" };
    assertEquals(
        continueEntries({ document, conversation: null, homeTasks }),
        [
            { kind: "document", id: "d1", title: "周报" },
            { kind: "tasks", documentId: "p1", open: 3 },
        ],
    );
    assertEquals(
        continueEntries({ document: null, conversation: null, homeTasks }),
        [{ kind: "tasks", documentId: "p1", open: 3 }],
    );
});

Deno.test("no candidates or no data renders no 继续 line", () => {
    assertEquals(continueEntries(null), []);
    assertEquals(
        continueEntries({
            document: null,
            conversation: null,
            homeTasks: null,
        }),
        [],
    );
});
