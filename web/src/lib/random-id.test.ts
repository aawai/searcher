import { assertEquals, assertMatch, assertNotEquals } from "@std/assert";
import { createRandomId } from "./random-id.ts";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

Deno.test("createRandomId: uses crypto.randomUUID when available", () => {
    const id = createRandomId({
        randomUUID: () => "11111111-2222-4333-8444-555555555555",
        getRandomValues: () => {
            throw new Error("should not call getRandomValues");
        },
    });
    assertEquals(id, "11111111-2222-4333-8444-555555555555");
});

Deno.test("createRandomId: falls back to getRandomValues when randomUUID is missing", () => {
    const fallbackCrypto = {
        getRandomValues: <T extends ArrayBufferView>(array: T): T =>
            globalThis.crypto.getRandomValues(array),
    };
    const first = createRandomId(fallbackCrypto);
    const second = createRandomId(fallbackCrypto);

    assertMatch(first, UUID_V4_PATTERN);
    assertMatch(second, UUID_V4_PATTERN);
    assertNotEquals(first, second);
});
