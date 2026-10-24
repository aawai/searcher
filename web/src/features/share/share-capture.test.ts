import { assertEquals } from "@std/assert";
import { DOCUMENT_TITLE_MAX_LENGTH } from "@shared/documents.ts";
import {
    isSharedNote,
    sharedNote,
    stashSharedNote,
    takeSharedNote,
} from "./share-capture.ts";

const share = (params: Record<string, string>) =>
    sharedNote(new URLSearchParams(params));

Deno.test("share: the page title is the title, the URL then the text is the body", () => {
    assertEquals(
        share({
            title: " Example Domain ",
            text: "Worth reading",
            url: "https://example.com/a",
        }),
        {
            title: "Example Domain",
            body: "https://example.com/a\n\nWorth reading",
        },
    );
});

Deno.test("share: a link sent as text alone is the URL", () => {
    // Android share sheets commonly put the link in `text`, not `url`.
    assertEquals(share({ title: "Page", text: "https://example.com/b" }), {
        title: "Page",
        body: "https://example.com/b",
    });
});

Deno.test("share: text that repeats the URL does not duplicate it", () => {
    assertEquals(
        share({
            text: "Look at this https://example.com/c",
            url: "https://example.com/c",
        }),
        { title: null, body: "https://example.com/c\n\nLook at this" },
    );
});

Deno.test("share: text without a URL is kept as the body", () => {
    assertEquals(share({ text: "a thought\nsecond line" }), {
        title: null,
        body: "a thought\nsecond line",
    });
});

Deno.test("share: nothing to record yields no note", () => {
    assertEquals(share({}), null);
    assertEquals(share({ title: "  ", text: " ", url: "" }), null);
});

Deno.test("share: an over-long page title is cut to the note title limit", () => {
    const note = share({ title: "x".repeat(DOCUMENT_TITLE_MAX_LENGTH + 5) });
    assertEquals(note?.title?.length, DOCUMENT_TITLE_MAX_LENGTH);
    // Never leaves half of a surrogate pair behind.
    const emoji = share({
        title: "x".repeat(DOCUMENT_TITLE_MAX_LENGTH - 1) + "😀",
    });
    assertEquals(emoji?.title, "x".repeat(DOCUMENT_TITLE_MAX_LENGTH - 1));
});

Deno.test("share: a stashed note is taken once", () => {
    const note = { title: "T", body: "https://example.com" };
    stashSharedNote(note);
    assertEquals(takeSharedNote(), note);
    assertEquals(takeSharedNote(), null);
});

Deno.test("share: only well-formed values pass as a shared note", () => {
    assertEquals(isSharedNote({ title: null, body: "b" }), true);
    assertEquals(isSharedNote({ title: "t", body: "" }), true);
    assertEquals(isSharedNote({ title: 1, body: "b" }), false);
    assertEquals(isSharedNote({ body: "b" }), false);
    assertEquals(isSharedNote(null), false);
});
