import { assertEquals } from "@std/assert";
import {
    calmDateTimeAttribute,
    formatCalmDate,
    formatCalmTime,
    msUntilNextTick,
} from "./calm-clock.ts";

const at = (hour: number, minute = 0, second = 0, ms = 0) =>
    new Date(2026, 9, 24, hour, minute, second, ms);

Deno.test("calm date and time text are fixed-format and zero-padded", () => {
    assertEquals(formatCalmDate(at(9, 5)), "10月24日 星期六");
    assertEquals(formatCalmDate(new Date(2026, 0, 4)), "1月4日 星期日");
    assertEquals(formatCalmTime(at(9, 5)), "09:05");
    assertEquals(formatCalmTime(at(23, 59)), "23:59");
    assertEquals(calmDateTimeAttribute(at(9, 5), false), "2026-10-24");
    assertEquals(calmDateTimeAttribute(at(9, 5), true), "2026-10-24T09:05");
});

Deno.test("the next tick lands exactly on the next minute or local midnight", () => {
    assertEquals(msUntilNextTick(at(9, 5, 30, 250), "minute"), 29_750);
    assertEquals(msUntilNextTick(at(9, 5, 0, 0), "minute"), 60_000);
    // 23:59:59.500 rolls the date in half a second.
    assertEquals(msUntilNextTick(at(23, 59, 59, 500), "day"), 500);
    assertEquals(msUntilNextTick(at(23, 59, 59, 500), "minute"), 500);
    const nextDay = new Date(
        at(12).getTime() + msUntilNextTick(at(12), "day"),
    );
    assertEquals(
        [nextDay.getDate(), nextDay.getHours(), nextDay.getMinutes()],
        [25, 0, 0],
    );
});
