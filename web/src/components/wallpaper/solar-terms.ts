import type { BotanicalSpecies } from "@shared/wallpaper.ts";

export type ConcreteBotanicalSpecies = Exclude<BotanicalSpecies, "auto">;
export type PhenologyStage = "budding" | "lush" | "turning" | "frost";

export interface SolarTermInfo {
    readonly term: string;
    readonly season: "spring" | "summer" | "autumn" | "winter";
    readonly isSnowSeason: boolean;
    readonly termIndex: number;
    readonly phenologyStage: PhenologyStage;
}

export const SOLAR_TERMS_BY_MMDD: ReadonlyArray<{
    readonly mmdd: number;
    readonly term: string;
    readonly season: "spring" | "summer" | "autumn" | "winter";
}> = [
    { mmdd: 105, term: "小寒", season: "winter" },
    { mmdd: 120, term: "大寒", season: "winter" },
    { mmdd: 204, term: "立春", season: "spring" },
    { mmdd: 219, term: "雨水", season: "spring" },
    { mmdd: 306, term: "惊蛰", season: "spring" },
    { mmdd: 321, term: "春分", season: "spring" },
    { mmdd: 405, term: "清明", season: "spring" },
    { mmdd: 420, term: "谷雨", season: "spring" },
    { mmdd: 506, term: "立夏", season: "summer" },
    { mmdd: 521, term: "小满", season: "summer" },
    { mmdd: 606, term: "芒种", season: "summer" },
    { mmdd: 621, term: "夏至", season: "summer" },
    { mmdd: 707, term: "小暑", season: "summer" },
    { mmdd: 723, term: "大暑", season: "summer" },
    { mmdd: 807, term: "立秋", season: "autumn" },
    { mmdd: 823, term: "处暑", season: "autumn" },
    { mmdd: 907, term: "白露", season: "autumn" },
    { mmdd: 923, term: "秋分", season: "autumn" },
    { mmdd: 1008, term: "寒露", season: "autumn" },
    { mmdd: 1023, term: "霜降", season: "autumn" },
    { mmdd: 1107, term: "立冬", season: "winter" },
    { mmdd: 1122, term: "小雪", season: "winter" },
    { mmdd: 1207, term: "大雪", season: "winter" },
    { mmdd: 1222, term: "冬至", season: "winter" },
];

export function resolveSolarTerm(dateKey: string): SolarTermInfo {
    const match = dateKey.match(/^\d{4}-(\d{2})-(\d{2})$/);
    const mmdd = match ? Number(match[1]) * 100 + Number(match[2]) : 1122;
    let chosenIdx = SOLAR_TERMS_BY_MMDD.length - 1;
    for (let i = 0; i < SOLAR_TERMS_BY_MMDD.length; i++) {
        if (mmdd >= SOLAR_TERMS_BY_MMDD[i].mmdd) chosenIdx = i;
    }
    const chosen = SOLAR_TERMS_BY_MMDD[chosenIdx];
    const isSnowSeason = mmdd >= 1122 || mmdd < 219;
    let phenologyStage: PhenologyStage;
    if (chosenIdx >= 2 && chosenIdx <= 4) {
        phenologyStage = "budding";
    } else if (chosenIdx >= 5 && chosenIdx <= 13) {
        phenologyStage = "lush";
    } else if (chosenIdx >= 14 && chosenIdx <= 18) {
        phenologyStage = "turning";
    } else {
        phenologyStage = "frost";
    }
    return {
        term: chosen.term,
        season: chosen.season,
        isSnowSeason,
        termIndex: chosenIdx,
        phenologyStage,
    };
}

const SEASONAL_SPECIES_POOLS: Readonly<
    Record<SolarTermInfo["season"], readonly ConcreteBotanicalSpecies[]>
> = {
    spring: ["fern", "eucalyptus"],
    summer: ["eucalyptus", "fern"],
    autumn: ["ginkgo", "maple"],
    winter: ["plum", "eucalyptus"],
};

function hashDateKey(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function resolveBotanicalSpecies(
    species: BotanicalSpecies,
    dateKey: string,
): ConcreteBotanicalSpecies {
    if (species !== "auto") return species;
    const { season } = resolveSolarTerm(dateKey);
    const pool = SEASONAL_SPECIES_POOLS[season];
    return pool[hashDateKey(dateKey) % pool.length];
}

export function formatLocalDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
