import { assertEquals } from "@std/assert";
import { clipPreviewHeight } from "./note-preview-clip.ts";

function lines(count: number, pitch = 22): { top: number; bottom: number }[] {
    return Array.from({ length: count }, (_, index) => ({
        top: index * pitch,
        bottom: (index + 1) * pitch,
    }));
}

Deno.test("clip ends at the last whole line and reports the hidden content", () => {
    assertEquals(clipPreviewHeight(lines(9), 110, 198, 22), {
        height: 110,
        hasMore: true,
    });
});

Deno.test("clip keeps the natural height when every line fits", () => {
    assertEquals(clipPreviewHeight(lines(4), 110, 88, 22), {
        height: 88,
        hasMore: false,
    });
});

Deno.test("mixed task and paragraph boxes clip between lines, never through one", () => {
    const mixed = [
        { top: 0, bottom: 22 },
        { top: 22, bottom: 44 },
        { top: 44, bottom: 66 },
        { top: 66, bottom: 88 },
        { top: 88, bottom: 110 },
    ];
    // 80px would cut the 66–88 line; the clip stops at 66 instead.
    assertEquals(clipPreviewHeight(mixed, 80, 110, 22), {
        height: 66,
        hasMore: true,
    });
});

Deno.test("duplicate line fragments do not move the clip boundary", () => {
    const fragments = [
        { top: 0, bottom: 22 },
        { top: 0, bottom: 22 },
        { top: 22, bottom: 44 },
        { top: 22, bottom: 44 },
    ];
    assertEquals(clipPreviewHeight(fragments, 66, 44, 22), {
        height: 44,
        hasMore: false,
    });
});

Deno.test("text fragments inset inside their line boxes still fit without a fade", () => {
    // Text rects are glyph boxes (20px) inside 22px line boxes, so the last
    // fragment ends 1px above the content height even though nothing is hidden.
    const glyphs = [
        { top: 1, bottom: 21 },
        { top: 23, bottom: 43 },
    ];
    assertEquals(clipPreviewHeight(glyphs, 110, 44, 22), {
        height: 44,
        hasMore: false,
    });
});

Deno.test("overflowing glyph fragments retain their full line boxes", () => {
    const glyphs = Array.from({ length: 6 }, (_, index) => ({
        top: index * 22 + 3,
        bottom: (index + 1) * 22 - 3,
    }));
    assertEquals(clipPreviewHeight(glyphs, 110, 132, 22), {
        height: 110,
        hasMore: true,
    });
    assertEquals(clipPreviewHeight(glyphs, 80, 132, 22), {
        height: 66,
        hasMore: true,
    });
});

Deno.test("content without line boxes falls back to the content height", () => {
    assertEquals(clipPreviewHeight([], 66, 44, 22), {
        height: 44,
        hasMore: false,
    });
    assertEquals(clipPreviewHeight([], 66, 0, 22), {
        height: 0,
        hasMore: false,
    });
});
