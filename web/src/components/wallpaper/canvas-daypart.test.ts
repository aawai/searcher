import { assertEquals } from "@std/assert";
import { daypartOf } from "./canvas-daypart.ts";

const at = (hour: number, minute = 0) => new Date(2026, 9, 24, hour, minute);

Deno.test("daypart boundaries: 早 05–10, 午 11–17, 夜 18–04", () => {
    const cases: [number, number, string][] = [
        [4, 59, "night"],
        [5, 0, "morning"],
        [10, 59, "morning"],
        [11, 0, "day"],
        [17, 59, "day"],
        [18, 0, "night"],
        [0, 0, "night"],
    ];
    for (const [hour, minute, part] of cases) {
        assertEquals(daypartOf(at(hour, minute)), part, `${hour}:${minute}`);
    }
});
