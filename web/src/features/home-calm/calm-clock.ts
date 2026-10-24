/** Local-time helpers for the home calm layer. */

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"] as const;
const pad = (value: number) => String(value).padStart(2, "0");

/** “10月24日 星期六” */
export function formatCalmDate(date: Date): string {
    return `${date.getMonth() + 1}月${date.getDate()}日 星期${
        WEEKDAYS[date.getDay()]
    }`;
}

/** 24-hour “09:05”. */
export function formatCalmTime(date: Date): string {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Machine-readable `datetime` for the rendered `<time>`. */
export function calmDateTimeAttribute(date: Date, withTime: boolean): string {
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${
        pad(date.getDate())
    }`;
    return withTime ? `${day}T${formatCalmTime(date)}` : day;
}

/**
 * Milliseconds until the displayed text can next change: the next local minute
 * while the time shows, otherwise the next local midnight (DST-safe).
 */
export function msUntilNextTick(now: Date, unit: "minute" | "day"): number {
    const next = unit === "minute"
        ? new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            now.getHours(),
            now.getMinutes() + 1,
        )
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return next.getTime() - now.getTime();
}
