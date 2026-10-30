import { assertEquals } from "@std/assert";
import { summarizeJunit, triageAdvice } from "./junit-summary.ts";

const failed = (name: string, time: number) =>
    `<testcase name="${name}" classname="./a.test.ts" time="${time}">` +
    `<failure message="x">TimeoutError</failure></testcase>`;
const passed = (name: string, time: number) =>
    `<testcase name="${name}" classname="./a.test.ts" time="${time}"></testcase>`;

Deno.test("only failed cases that lasted a full timeout count as timeout-like", () => {
    const xml = `<testsuites>${passed("ok", 31)}${failed("quick", 0.3)}` +
        `${failed("waited", 30.02)}${failed("waited-too", 31.5)}</testsuites>`;
    const summary = summarizeJunit(xml, null);
    assertEquals([summary.failed, summary.timeoutLike], [3, 2]);
    assertEquals(Math.round(summary.timeoutLikeSeconds * 100) / 100, 61.52);
    // A triage timeout moves the threshold with it.
    assertEquals(summarizeJunit(failed("t", 5.1), 5000).timeoutLike, 1);
});

Deno.test("advice appears only for untimed runs with many timeout-like failures", () => {
    const many = {
        failed: 9,
        timeoutLike: 7,
        timeoutLikeSeconds: 210,
    };
    assertEquals(triageAdvice(many, 5000), null);
    assertEquals(triageAdvice({ ...many, timeoutLike: 4 }, null), null);
    assertEquals(
        triageAdvice(many, null)?.includes("--timeout 5000"),
        true,
    );
});
