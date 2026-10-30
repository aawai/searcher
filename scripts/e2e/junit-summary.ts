/** Failed cases that lasted about one Playwright timeout waited on a locator that never came. */
export interface JunitSummary {
    failed: number;
    /** Failed cases whose duration reached the implicit timeout. */
    timeoutLike: number;
    /** Their summed seconds; steps nest in their test, so this is an upper bound. */
    timeoutLikeSeconds: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Summarizes a Deno JUnit report without an XML dependency; attributes are machine-written. */
export function summarizeJunit(
    xml: string,
    timeoutMs: number | null,
): JunitSummary {
    // Slightly under the timeout: the case ends right after the wait expires.
    const threshold = ((timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000) * 0.9;
    const summary: JunitSummary = {
        failed: 0,
        timeoutLike: 0,
        timeoutLikeSeconds: 0,
    };
    for (
        const match of xml.matchAll(
            /<testcase\b[^>]*?\btime="([\d.]+)"[^>]*>([\s\S]*?)<\/testcase>/g,
        )
    ) {
        if (!/<(failure|error)\b/.test(match[2])) continue;
        summary.failed++;
        const seconds = Number(match[1]);
        if (seconds >= threshold) {
            summary.timeoutLike++;
            summary.timeoutLikeSeconds += seconds;
        }
    }
    return summary;
}

/** A warning when most failures are timeouts of an untimed run, else null. */
export function triageAdvice(
    summary: JunitSummary,
    timeoutMs: number | null,
): string | null {
    if (timeoutMs !== null || summary.timeoutLike < 5) return null;
    return `${summary.timeoutLike} of ${summary.failed} failed cases lasted a ` +
        `full ${DEFAULT_TIMEOUT_MS / 1000}s timeout (~${
            Math.round(summary.timeoutLikeSeconds)
        }s waiting). ` +
        "They are usually one shared cause (helper, selector, renamed DOM): " +
        "group the errors by call log, fix the cause, rerun the affected files, " +
        "and triage with --timeout 5000 next time.";
}
