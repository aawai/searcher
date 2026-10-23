import { assertEquals } from "@std/assert";
import {
    consumeSearchFocusRequest,
    requestSearchFocus,
} from "./search-focus.ts";

Deno.test("search focus request is taken exactly once", () => {
    assertEquals(consumeSearchFocusRequest(), false);
    requestSearchFocus();
    assertEquals(consumeSearchFocusRequest(), true);
    assertEquals(consumeSearchFocusRequest(), false);
});
