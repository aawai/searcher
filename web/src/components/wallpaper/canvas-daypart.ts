/** The default canvas tone follows the local time of day when the page loads. */

export type Daypart = "morning" | "day" | "night";

/** 早 05:00–10:59 · 午 11:00–17:59 · 夜 18:00–04:59, local time. */
export function daypartOf(date: Date): Daypart {
    const hour = date.getHours();
    if (hour >= 5 && hour < 11) return "morning";
    if (hour >= 11 && hour < 18) return "day";
    return "night";
}
