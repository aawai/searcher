import { assertEquals } from "@std/assert";
import { continueEntries } from "./continue-line.ts";

const document = { id: "d1", displayTitle: "周报", updatedAt: 100 };
const conversation = { id: "c1", title: "旅行计划", updatedAt: 200 };

Deno.test("继续 leads with the more recent of the note and the unfinished conversation", () => {
    assertEquals(
        continueEntries({ document, conversation }),
        [{ kind: "conversation", id: "c1", title: "旅行计划" }],
    );
    assertEquals(
        continueEntries({
            document: { ...document, updatedAt: 300 },
            conversation,
        }),
        [{ kind: "document", id: "d1", title: "周报" }],
    );
    // A tie keeps the note.
    assertEquals(
        continueEntries({
            document: { ...document, updatedAt: 200 },
            conversation,
        })[0].kind,
        "document",
    );
});

Deno.test("no candidates or no data renders no 继续 line", () => {
    assertEquals(continueEntries(null), []);
    assertEquals(
        continueEntries({
            document: null,
            conversation: null,
        }),
        [],
    );
});
