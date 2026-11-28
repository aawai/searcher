import type { BotanicalSpecies } from "@shared/wallpaper.ts";
import {
    type BackdropPolarity,
    type MastheadBands,
    oklchToSrgb,
    resolveMastheadBackdrop,
    srgbToOklch,
} from "../../design-system/wallpaper-accent.ts";
import type { BotanicalResonanceKind } from "./botanical-resonance.ts";

export type ConcreteBotanicalSpecies = Exclude<BotanicalSpecies, "auto">;

type Rgb = readonly [number, number, number];
type TintRole = "ink" | "accent" | "sub";

interface Point2D {
    x: number;
    y: number;
}

interface BranchSample {
    x: number;
    y: number;
    lx: number;
    ly: number;
    angle: number;
    u: number;
    localFlex: number;
}

interface WorldSample {
    x: number;
    y: number;
    angle: number;
    dAngle: number;
}

interface BranchParentRef {
    branch: BranchData;
    idx: number;
}

interface BranchData {
    points: BranchSample[];
    widthStart: number;
    widthEnd: number;
    t0: number;
    t1: number;
    phase: number;
    waveLag?: number;
    ghost: boolean;
    midground?: boolean;
    brushStyle?: "standard" | "iron-plum" | "orchid-blade";
    twistU?: number;
    bambooNodes?: readonly number[];
    snowCushions?: boolean;
    parentRef: BranchParentRef | null;
    frameId: number;
    worldCache: WorldSample[] | null;
}

interface RockStroke {
    points: Point2D[];
    mossDots: Array<
        { x: number; y: number; rx: number; ry: number; rot: number }
    >;
    t0: number;
    t1: number;
}

interface BaseOrnament {
    branch: BranchData;
    idx: number;
    ghost: boolean;
    midground?: boolean;
    t0: number;
    t1: number;
    phase: number;
    angleOffset: number;
    tint: TintRole;
    profile: boolean;
    push: number;
    vel: number;
}

interface GinkgoOrnament extends BaseOrnament {
    kind: "ginkgo";
    size: number;
    notch: number;
    stemLen: number;
}

interface EucalyptusOrnament extends BaseOrnament {
    kind: "eucalyptus";
    rx: number;
    ry: number;
    stemLen: number;
}

interface PlumOrnament extends BaseOrnament {
    kind: "plumBlossom" | "plumBud";
    size: number;
    rotation: number;
    pose?: "frontal" | "side" | "upward" | "back";
}

interface FernPinnaOrnament extends BaseOrnament {
    kind: "fernPinna";
    side: -1 | 1;
    len: number;
    width: number;
    curve: number;
    inkWeight: number;
    whip: number;
    feibai: boolean;
}

interface OrchidBlossomOrnament extends BaseOrnament {
    kind: "orchidBlossom";
    size: number;
    rotation: number;
}

interface BambooLeafOrnament extends BaseOrnament {
    kind: "bambooLeaf";
    len: number;
    width: number;
    curve: number;
    feibai: boolean;
}

interface MapleLeafOrnament extends BaseOrnament {
    kind: "mapleLeaf";
    size: number;
    stemLen: number;
    rotation: number;
}

type BotanicalOrnament =
    | GinkgoOrnament
    | EucalyptusOrnament
    | PlumOrnament
    | FernPinnaOrnament
    | OrchidBlossomOrnament
    | BambooLeafOrnament
    | MapleLeafOrnament;

interface Drifter {
    species: ConcreteBotanicalSpecies;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rot: number;
    vrot: number;
    phase: number;
    size: number;
    tint: TintRole;
    born: number;
    life: number;
}

export interface FireflySeed {
    x: number;
    y: number;
    phase: number;
    speed: number;
}

export type BotanicalVisitorAnchor =
    | {
        kind: "sparrow";
        branch: BranchData;
        idx: number;
        fireflies: readonly FireflySeed[];
    }
    | {
        kind: "ladybug";
        branch: BranchData;
        idx: number;
        angleOffset: number;
        leafSize: number;
        fireflies: readonly FireflySeed[];
    }
    | {
        kind: "butterfly";
        branch: BranchData;
        idx: number;
        fireflies: readonly FireflySeed[];
    }
    | {
        kind: "dragonfly";
        branch: BranchData;
        idx: number;
        fireflies: readonly FireflySeed[];
    }
    | {
        kind: "dew-or-firefly";
        branch: BranchData;
        idx: number;
        tipOffsetX: number;
        tipOffsetY: number;
        fireflies: readonly FireflySeed[];
    };

export interface BotanicalRewardAnchor {
    kind: ConcreteBotanicalSpecies;
    branch: BranchData;
    idx: number;
    budIndices: readonly number[];
}

export interface BotanicalRuntimeState {
    breezeImpulseStartSec: number;
    breezeImpulseStrength: number;
    awakened: boolean;
    awakenStartSec: number;
    haloPulseStartSec: number;
    visitorMode: "perched" | "departing" | "returning";
    visitorStateStartSec: number;
    visitorX: number;
    visitorY: number;
    visitorVx: number;
    visitorVy: number;
    dewState: "hanging" | "falling" | "ripple" | "regrowing";
    dewStateStartSec: number;
    dewFallDist: number;
    dewImpactX: number;
    dewImpactY: number;
    fireflyBoostStartSec: number;
    gustStartSec: number;
    gustDurationSec: number;
    gustStrength: number;
    nextGustSec: number;
    lastInteractionSec: number;
}

export function createBotanicalRuntimeState(): BotanicalRuntimeState {
    return {
        breezeImpulseStartSec: -999,
        breezeImpulseStrength: 0,
        awakened: false,
        awakenStartSec: -999,
        haloPulseStartSec: -999,
        visitorMode: "perched",
        visitorStateStartSec: -999,
        visitorX: 0,
        visitorY: 0,
        visitorVx: 0,
        visitorVy: 0,
        dewState: "hanging",
        dewStateStartSec: -999,
        dewFallDist: 0,
        dewImpactX: 0,
        dewImpactY: 0,
        fireflyBoostStartSec: -999,
        gustStartSec: -999,
        gustDurationSec: 4.8,
        gustStrength: 0,
        nextGustSec: -999,
        lastInteractionSec: -999,
    };
}

export function triggerBotanicalGust(
    runtime: BotanicalRuntimeState,
    timeSec: number,
    strength = 0.88,
    durationSec = 4.6,
): void {
    runtime.gustStartSec = timeSec;
    runtime.gustDurationSec = durationSec;
    runtime.gustStrength = strength;
    runtime.nextGustSec = timeSec + durationSec + 13.5;
}

export function isBotanicalSceneActive(params: {
    runtime?: BotanicalRuntimeState;
    rawProgress: number;
    timeSec: number;
    scene: BotanicalScene | null;
    drifters: readonly Drifter[];
    reducedMotion: boolean;
    embedded: boolean;
}): boolean {
    const {
        runtime,
        rawProgress,
        timeSec,
        scene,
        drifters,
        reducedMotion,
        embedded,
    } = params;
    if (embedded || reducedMotion) return false;
    if (rawProgress < 1) return true;
    if (drifters.length > 0) return true;
    if (
        scene &&
        scene.ornaments.some((o) =>
            Math.abs(o.push) > 0.0025 || Math.abs(o.vel) > 0.0025
        )
    ) {
        return true;
    }
    if (!runtime) return false;
    if (
        timeSec >= runtime.gustStartSec &&
        timeSec <= runtime.gustStartSec + runtime.gustDurationSec
    ) {
        return true;
    }
    if (
        timeSec >= runtime.breezeImpulseStartSec &&
        timeSec <= runtime.breezeImpulseStartSec + 2.6
    ) {
        return true;
    }
    if (
        runtime.awakened &&
        timeSec >= runtime.awakenStartSec &&
        timeSec <= runtime.awakenStartSec + 1.9
    ) {
        return true;
    }
    if (
        timeSec >= runtime.haloPulseStartSec &&
        timeSec <= runtime.haloPulseStartSec + 1.45
    ) {
        return true;
    }
    if (
        timeSec >= runtime.fireflyBoostStartSec &&
        timeSec <= runtime.fireflyBoostStartSec + 1.85
    ) {
        return true;
    }
    if (
        timeSec >= runtime.lastInteractionSec &&
        timeSec <= runtime.lastInteractionSec + 2.2
    ) {
        return true;
    }
    if (runtime.visitorMode !== "perched") return true;
    if (runtime.dewState !== "hanging") return true;
    return false;
}

export function nextBotanicalWakeDelayMs(
    runtime: BotanicalRuntimeState | undefined,
    timeSec: number,
): number {
    if (!runtime) return 14_000;
    const candidates: number[] = [];
    if (runtime.nextGustSec > timeSec) {
        candidates.push((runtime.nextGustSec - timeSec) * 1000);
    }
    if (runtime.dewState === "hanging" && runtime.dewStateStartSec > -100) {
        const dewDropAt = runtime.dewStateStartSec + 26.1;
        if (dewDropAt > timeSec) {
            candidates.push((dewDropAt - timeSec) * 1000);
        }
    }
    if (candidates.length === 0) return 12_000;
    return Math.round(clamp(Math.min(...candidates), 250, 18_000));
}

export type BotanicalArchetype = 0 | 1 | 2;

export const BOTANICAL_ARCHETYPE_NAMES: Readonly<
    Record<ConcreteBotanicalSpecies, readonly [string, string, string]>
> = {
    plum: ["横斜疏影", "昂霄双干", "临水倒挂"],
    orchid: ["坡石幽兰", "悬崖垂兰", "临风劲兰"],
    bamboo: ["双竿贯顶", "风竹斜拂", "晴篁疏影"],
    ginkgo: ["斜柯金扇", "高枝垂荫", "交枝掩映"],
    maple: ["高崖横柯", "霜林双枝", "飞崖探秋"],
    eucalyptus: ["丛枝清露", "修枝独秀", "双株交映"],
    fern: ["兰竹三叠", "坡石双清", "临涧舒卷"],
};

export function resolveBotanicalArchetype(
    species: ConcreteBotanicalSpecies,
    dateKey: string,
    override?: BotanicalArchetype,
): BotanicalArchetype {
    if (override === 0 || override === 1 || override === 2) return override;
    return (hashString(`${dateKey}:${species}:archetype`) %
        3) as BotanicalArchetype;
}

export interface BotanicalScene {
    species: ConcreteBotanicalSpecies;
    side: "left" | "right";
    archetype: BotanicalArchetype;
    visitorPresent: boolean;
    branches: BranchData[];
    ornaments: BotanicalOrnament[];
    rocks: RockStroke[];
    scale: number;
    visitorAnchor: BotanicalVisitorAnchor | null;
    rewardAnchor: BotanicalRewardAnchor | null;
}

export interface BotanicalViewportMetrics {
    sceneWidth: number;
    sceneHeight: number;
    renderScale: number;
}

/**
 * Resolves the virtual coordinate space for botanical scene generation.
 * Embedded previews render a full desktop-proportioned scene (1440px wide)
 * scaled down to fit the preview container without cropping or distortion.
 */
export function resolveBotanicalViewport(
    width: number,
    height: number,
    embedded: boolean,
): BotanicalViewportMetrics {
    if (!embedded || width <= 0 || height <= 0) {
        return { sceneWidth: width, sceneHeight: height, renderScale: 1 };
    }
    const sceneWidth = 1440;
    const sceneHeight = Math.max(1, Math.round(sceneWidth * (height / width)));
    return {
        sceneWidth,
        sceneHeight,
        renderScale: width / sceneWidth,
    };
}

export type BotanicalPhotoStyle = "xuan" | "silk-wash" | "gongbi-line";

export interface BotanicalPalette {
    isDark: boolean;
    overPhoto: boolean;
    photoStyle: BotanicalPhotoStyle;
    solidSurface: boolean;
    stroke: (tint: TintRole, alpha?: number) => string;
    vein: (tint: TintRole, alpha?: number) => string;
    fill: (tint: TintRole, alpha?: number) => string;
    wash: (tint: TintRole, alpha?: number) => string;
    waterline: (tint: TintRole, alpha?: number) => string;
    inkGrade: (
        grade: "jiao" | "nong" | "zhong" | "dan" | "qing",
        alpha?: number,
    ) => string;
    cinnabar: (alpha?: number) => string;
    goldDust: (alpha?: number) => string;
    highlight: (alpha?: number) => string;
}

export interface BotanicalDockInsets {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
}

export interface BotanicalPointerState {
    x: number;
    y: number;
    vx: number;
    vy: number;
    lastT: number;
    lastRustleSpawn: number;
}

export interface BotanicalRenderParams {
    ctx: CanvasRenderingContext2D;
    scene: BotanicalScene;
    width: number;
    height: number;
    timeSec: number;
    dt: number;
    rawProgress: number;
    reducedMotion: boolean;
    windCalm: number;
    searchFocused: boolean;
    embedded: boolean;
    palette: BotanicalPalette;
    pointer: BotanicalPointerState;
    drifters: Drifter[];
    lastDriftSpawn: number;
    frameSeq: number;
    runtime?: BotanicalRuntimeState;
    sceneSide?: "left" | "right";
    dateKey?: string;
    localHour?: number;
    dockInsets?: BotanicalDockInsets;
    forceVisitor?: boolean;
}

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

export function resolveDiurnalWindScale(localHour?: number): number {
    if (localHour === undefined || !Number.isFinite(localHour)) return 1.0;
    const h = ((Math.floor(localHour) % 24) + 24) % 24;
    if (h >= 5 && h <= 8) return 0.92;
    if (h >= 9 && h <= 16) return 1.0;
    if (h >= 17 && h <= 19) return 0.86;
    if (h >= 20 && h <= 21) return 0.74;
    return 0.58;
}

const SEASONAL_SPECIES_POOLS: Readonly<
    Record<SolarTermInfo["season"], readonly ConcreteBotanicalSpecies[]>
> = {
    spring: ["orchid", "fern", "eucalyptus"],
    summer: ["bamboo", "fern", "eucalyptus"],
    autumn: ["ginkgo", "maple", "bamboo"],
    winter: ["plum", "bamboo", "eucalyptus"],
};

// Seasonal species pools are used by resolveBotanicalSpecies.

function hashString(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

function easeOutQuart(t: number): number {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 4);
}

function _easeInOutQuad(t: number): number {
    const x = clamp(t, 0, 1);
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
    return [
        Math.round(lerp(a[0], b[0], t)),
        Math.round(lerp(a[1], b[1], t)),
        Math.round(lerp(a[2], b[2], t)),
    ];
}

function rgba(rgb: Rgb, a: number): string {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clamp(a, 0, 1).toFixed(4)})`;
}

function splitTopLevelComma(inner: string): [string, string] | null {
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        else if (ch === "," && depth === 0) {
            return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
        }
    }
    return null;
}

function parseCssColorToRgb(
    value: string,
    fallback: Rgb,
    isDark = false,
): Rgb {
    const trimmed = value.trim();
    if (/^light-dark\(/i.test(trimmed) && trimmed.endsWith(")")) {
        const inner = trimmed.slice(trimmed.indexOf("(") + 1, -1);
        const parts = splitTopLevelComma(inner);
        if (parts) {
            return parseCssColorToRgb(
                isDark ? parts[1] : parts[0],
                fallback,
                isDark,
            );
        }
    }
    if (trimmed.startsWith("#")) {
        const hex = trimmed.slice(1);
        if (hex.length === 6) {
            const n = parseInt(hex, 16);
            if (Number.isFinite(n)) {
                return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
            }
        } else if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            if (
                Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)
            ) {
                return [r, g, b];
            }
        }
    }
    const rgbMatch = trimmed.match(
        /rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i,
    );
    if (rgbMatch) {
        return [
            clamp(Math.round(Number(rgbMatch[1])), 0, 255),
            clamp(Math.round(Number(rgbMatch[2])), 0, 255),
            clamp(Math.round(Number(rgbMatch[3])), 0, 255),
        ];
    }
    const oklchMatch = trimmed.match(
        /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.-]+)(?:deg)?/i,
    );
    if (oklchMatch) {
        const rawL = Number(oklchMatch[1]);
        const L = oklchMatch[2] === "%" ? rawL / 100 : rawL;
        const C = Number(oklchMatch[3]);
        const H = ((Number(oklchMatch[4]) % 360) + 360) % 360;
        if (Number.isFinite(L) && Number.isFinite(C) && Number.isFinite(H)) {
            return oklchToSrgb(clamp(L, 0, 1), Math.max(0, C), H);
        }
    }
    const oklabMatch = trimmed.match(
        /^oklab\(\s*([\d.]+)(%?)\s+([\d.-]+)\s+([\d.-]+)/i,
    );
    if (oklabMatch) {
        const rawL = Number(oklabMatch[1]);
        const L = oklabMatch[2] === "%" ? rawL / 100 : rawL;
        const a = Number(oklabMatch[3]);
        const b = Number(oklabMatch[4]);
        if (Number.isFinite(L) && Number.isFinite(a) && Number.isFinite(b)) {
            const C = Math.hypot(a, b);
            const H = C < 1e-6
                ? 0
                : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
            return oklchToSrgb(clamp(L, 0, 1), C, H);
        }
    }
    const srgbMatch = trimmed.match(
        /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i,
    );
    if (srgbMatch) {
        const r = clamp(Math.round(Number(srgbMatch[1]) * 255), 0, 255);
        const g = clamp(Math.round(Number(srgbMatch[2]) * 255), 0, 255);
        const b = clamp(Math.round(Number(srgbMatch[3]) * 255), 0, 255);
        if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
            return [r, g, b];
        }
    }
    return fallback;
}

export function formatLocalDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export function resolveBotanicalSpecies(
    species: BotanicalSpecies,
    dateKey: string,
): ConcreteBotanicalSpecies {
    if (species !== "auto") return species;
    const { season } = resolveSolarTerm(dateKey);
    const pool = SEASONAL_SPECIES_POOLS[season];
    return pool[hashString(dateKey) % pool.length];
}

function blendOklabRgb(
    intrinsicRgb: Rgb,
    themeRgb: Rgb,
    themeWeight: number,
    minC: number,
    maxC: number,
    targetL: number,
): Rgb {
    const [, c1, h1] = srgbToOklch(
        intrinsicRgb[0],
        intrinsicRgb[1],
        intrinsicRgb[2],
    );
    const [, c2, h2] = srgbToOklch(themeRgb[0], themeRgb[1], themeRgb[2]);
    const r1 = (h1 * Math.PI) / 180;
    const r2 = (h2 * Math.PI) / 180;
    const w = clamp(themeWeight, 0, 1);
    const a = c1 * Math.cos(r1) * (1 - w) + c2 * Math.cos(r2) * w;
    const b = c1 * Math.sin(r1) * (1 - w) + c2 * Math.sin(r2) * w;
    const c = clamp(Math.hypot(a, b), minC, maxC);
    const h = Math.hypot(a, b) < 1e-6
        ? h1
        : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    return oklchToSrgb(clamp(targetL, 0.2, 0.92), c, h);
}

export interface BotanicalBackdropAdaptation {
    readonly isDark: boolean;
    readonly photoSpread: number;
    readonly photoStyle: BotanicalPhotoStyle;
    readonly solidSurface: boolean;
}

export function resolveBotanicalBackdropAdaptation(input: {
    overPhoto: boolean;
    scheme: "light" | "dark";
    sceneSide: "left" | "right";
    backdropBands?: MastheadBands | null;
    fallbackPolarity?: BackdropPolarity;
    solidSurface?: boolean;
}): BotanicalBackdropAdaptation {
    const solidSurface = Boolean(input.solidSurface);
    if (!input.overPhoto) {
        return {
            isDark: input.scheme === "dark",
            photoSpread: 0,
            photoStyle: "xuan",
            solidSurface,
        };
    }
    const band = input.backdropBands?.[input.sceneSide] ?? null;
    if (
        band && Number.isFinite(band.lightness) && Number.isFinite(band.spread)
    ) {
        const { polarity } = resolveMastheadBackdrop({
            scheme: input.scheme,
            band,
        });
        return {
            isDark: polarity === "dark",
            photoSpread: band.spread,
            photoStyle: band.spread > 0.16 ? "gongbi-line" : "silk-wash",
            solidSurface,
        };
    }
    const isDark = input.fallbackPolarity
        ? input.fallbackPolarity === "dark"
        : input.scheme === "dark";
    return {
        isDark,
        photoSpread: 0,
        photoStyle: "silk-wash",
        solidSurface,
    };
}

export interface BotanicalPaletteOptions {
    photoSpread?: number;
    solidSurface?: boolean;
}

export function buildBotanicalPalette(
    isDark: boolean,
    accentCss: string,
    foregroundCss: string,
    overPhoto = false,
    localHour?: number,
    species?: ConcreteBotanicalSpecies,
    options?: BotanicalPaletteOptions,
): BotanicalPalette {
    const fallbackAccent: Rgb = isDark ? [93, 169, 255] : [10, 102, 194];
    const fallbackInk: Rgb = isDark ? [232, 234, 240] : [28, 30, 34];
    const rawAccRgb = parseCssColorToRgb(accentCss, fallbackAccent, isDark);
    const [rawL, rawC, rawH] = srgbToOklch(
        rawAccRgb[0],
        rawAccRgb[1],
        rawAccRgb[2],
    );
    const isNeutralAccent = rawC < 0.022;
    const accL = isDark ? clamp(rawL, 0.66, 0.80) : clamp(rawL, 0.45, 0.62);
    const accC = isNeutralAccent ? 0.016 : clamp(rawC * 0.94, 0.035, 0.185);
    const accH = isNeutralAccent ? 56 : rawH;
    let accRgb = oklchToSrgb(accL, accC, accH);

    // Oriental mineral companion pigment (warm/cool complementary shift in OKLCH)
    const isWarmHue = accH < 105 || accH > 315;
    let subH: number;
    let subC: number;
    let subL: number;
    if (isNeutralAccent) {
        subH = 62;
        subC = 0.024;
        subL = isDark ? 0.70 : 0.56;
    } else if (isWarmHue) {
        // Warm pigments (cinnabar/ochre/amber) pair with mineral ochre-gold or muted celadon
        subH = accH >= 315 ? (accH + 34) % 360 : (accH - 26 + 360) % 360;
        subC = clamp(accC * 0.64, 0.025, 0.115);
        subL = isDark
            ? clamp(accL - 0.04, 0.62, 0.78)
            : clamp(accL + 0.05, 0.48, 0.66);
    } else {
        // Cool pigments (azurite/malachite/violet) pair with warm ochre/gamboge
        subH = (accH + 34) % 360;
        subC = clamp(accC * 0.58, 0.025, 0.105);
        subL = isDark
            ? clamp(accL + 0.02, 0.64, 0.80)
            : clamp(accL + 0.04, 0.48, 0.65);
    }
    let subRgb = oklchToSrgb(subL, subC, subH);

    // 植物博物本色基因融合：保留品种自然生命色相并与系统强调色雅致共生
    if (species) {
        if (isNeutralAccent) {
            const neutralHueMap: Record<
                ConcreteBotanicalSpecies,
                [number, number]
            > = {
                plum: [18, 138],
                ginkgo: [80, 118],
                eucalyptus: [164, 195],
                maple: [29, 72],
                orchid: [350, 126],
                bamboo: [142, 138],
                fern: [134, 88],
            };
            const [ah, sh] = neutralHueMap[species];
            accRgb = oklchToSrgb(accL, 0.024, ah);
            subRgb = oklchToSrgb(subL, 0.024, sh);
        } else if (species === "plum") {
            // 暖/绯/金珀色域保持原味，青/蓝/绿冷色域则保护为宋画「宫粉胭脂梅 × 绿萼青玉」
            if (accH > 88 && accH < 312) {
                const plumL = isDark ? 0.71 : 0.54;
                const calyxL = isDark ? 0.74 : 0.58;
                accRgb = blendOklabRgb(
                    oklchToSrgb(plumL, 0.145, 18),
                    accRgb,
                    0.18,
                    0.075,
                    0.138,
                    plumL,
                );
                subRgb = blendOklabRgb(
                    oklchToSrgb(calyxL, 0.056, 145),
                    subRgb,
                    0.32,
                    0.032,
                    0.076,
                    calyxL,
                );
            }
        } else if (species === "ginkgo") {
            const goldL = isDark ? 0.77 : 0.62;
            const jadeL = isDark ? 0.72 : 0.56;
            accRgb = blendOklabRgb(
                oklchToSrgb(goldL, 0.138, 80),
                accRgb,
                0.26,
                0.095,
                0.145,
                goldL,
            );
            subRgb = blendOklabRgb(
                oklchToSrgb(jadeL, 0.075, 118),
                subRgb,
                0.28,
                0.045,
                0.095,
                jadeL,
            );
        } else if (species === "eucalyptus") {
            const celadonL = isDark ? 0.74 : 0.55;
            const mistL = isDark ? 0.72 : 0.58;
            accRgb = blendOklabRgb(
                oklchToSrgb(celadonL, 0.090, 164),
                accRgb,
                0.16,
                0.048,
                0.095,
                celadonL,
            );
            subRgb = blendOklabRgb(
                oklchToSrgb(mistL, 0.058, 195),
                subRgb,
                0.20,
                0.032,
                0.072,
                mistL,
            );
        } else if (species === "maple") {
            const crimsonL = isDark ? 0.68 : 0.52;
            const amberL = isDark ? 0.75 : 0.60;
            accRgb = blendOklabRgb(
                oklchToSrgb(crimsonL, 0.158, 29),
                accRgb,
                0.42,
                0.095,
                0.165,
                crimsonL,
            );
            subRgb = blendOklabRgb(
                oklchToSrgb(amberL, 0.108, 72),
                subRgb,
                0.32,
                0.055,
                0.120,
                amberL,
            );
        } else if (species === "orchid") {
            const jadeL = isDark ? 0.75 : 0.58;
            accRgb = blendOklabRgb(
                oklchToSrgb(accL, clamp(accC, 0.07, 0.16), 352),
                accRgb,
                0.82,
                0.055,
                0.165,
                accL,
            );
            subRgb = blendOklabRgb(
                oklchToSrgb(jadeL, 0.068, 126),
                subRgb,
                0.34,
                0.038,
                0.088,
                jadeL,
            );
        } else {
            // bamboo / fern: 苍竹石绿伴色与主题色温和呼应
            const bambooL = isDark ? 0.72 : 0.56;
            accRgb = blendOklabRgb(
                oklchToSrgb(accL, 0.082, species === "bamboo" ? 142 : 128),
                accRgb,
                0.65,
                0.045,
                0.155,
                accL,
            );
            subRgb = blendOklabRgb(
                oklchToSrgb(bambooL, 0.062, 142),
                subRgb,
                0.38,
                0.034,
                0.088,
                bambooL,
            );
        }
    }

    const baseInk = parseCssColorToRgb(foregroundCss, fallbackInk, isDark);
    const [inkBaseL] = srgbToOklch(baseInk[0], baseInk[1], baseInk[2]);

    // Five shades of ink: deep pine-soot foreground vs cool distant mountain ink
    const inkStrokeRgb = isDark
        ? oklchToSrgb(clamp(inkBaseL * 0.97, 0.84, 0.93), 0.014, 245)
        : oklchToSrgb(clamp(inkBaseL * 0.92, 0.13, 0.21), 0.012, 52);
    let inkWashRgb = isDark
        ? oklchToSrgb(clamp(inkBaseL * 0.84, 0.70, 0.82), 0.018, 240)
        : oklchToSrgb(clamp(inkBaseL * 1.35, 0.28, 0.40), 0.015, 238);

    if (localHour !== undefined && Number.isFinite(localHour)) {
        const h = ((Math.floor(localHour) % 24) + 24) % 24;
        if (h >= 17 && h <= 19) {
            const duskOchre: Rgb = isDark ? [196, 152, 118] : [188, 134, 88];
            subRgb = mixRgb(subRgb, duskOchre, 0.08);
            inkWashRgb = mixRgb(inkWashRgb, duskOchre, 0.06);
        } else if (h >= 5 && h <= 8) {
            const dawnMist: Rgb = isDark ? [154, 178, 208] : [142, 170, 198];
            subRgb = mixRgb(subRgb, dawnMist, 0.06);
            inkWashRgb = mixRgb(inkWashRgb, dawnMist, 0.05);
        }
    }

    const cinnabarRgb = mixRgb(
        isDark ? oklchToSrgb(0.60, 0.172, 27) : oklchToSrgb(0.49, 0.182, 27),
        accRgb,
        0.18,
    );
    const goldDustRgb = mixRgb(
        isDark ? oklchToSrgb(0.83, 0.085, 84) : oklchToSrgb(0.62, 0.095, 80),
        subRgb,
        0.20,
    );

    const highlightRgb: Rgb = isDark ? [18, 19, 22] : [250, 248, 243];
    const photoSpread = options?.photoSpread ?? 0;
    const solidSurface = Boolean(options?.solidSurface);
    const photoStyle: BotanicalPhotoStyle = !overPhoto
        ? "xuan"
        : photoSpread > 0.16
        ? "gongbi-line"
        : "silk-wash";
    const isGongbi = photoStyle === "gongbi-line";
    const harmony = isDark && overPhoto ? 0.52 : overPhoto ? 0.86 : 1;
    const washAtten = isGongbi ? 0.30 : 1;
    const lineBoost = isGongbi ? 1.18 : 1;

    const strokeA = clamp((isDark ? 0.78 : 0.88) * harmony * lineBoost, 0, 1);
    const veinA = clamp((isDark ? 0.30 : 0.36) * harmony * lineBoost, 0, 1);
    const fillA = (isDark ? 0.13 : 0.145) * harmony * washAtten;
    const accA = clamp((isDark ? 0.84 : 0.80) * harmony * lineBoost, 0, 1);
    const accFill = (isDark ? 0.32 : 0.28) * harmony * washAtten;
    const subA = clamp((isDark ? 0.68 : 0.66) * harmony * lineBoost, 0, 1);
    const subFill = (isDark ? 0.24 : 0.22) * harmony * washAtten;

    const accWash = (isDark ? 0.44 : 0.42) * harmony * washAtten;
    const subWash = (isDark ? 0.33 : 0.30) * harmony * washAtten;
    const inkWash = (isDark ? 0.22 : 0.24) * harmony * washAtten;

    const gradeMap: Record<"jiao" | "nong" | "zhong" | "dan" | "qing", number> =
        {
            jiao: 0.96,
            nong: 0.82,
            zhong: 0.54,
            dan: 0.28,
            qing: 0.13,
        };

    return {
        isDark,
        overPhoto,
        photoStyle,
        solidSurface,
        stroke: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accA * a);
            if (tint === "sub") return rgba(subRgb, subA * a);
            return rgba(inkStrokeRgb, strokeA * a);
        },
        vein: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accA * 0.56 * a);
            if (tint === "sub") return rgba(subRgb, subA * 0.56 * a);
            return rgba(inkStrokeRgb, veinA * a);
        },
        fill: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accFill * a);
            if (tint === "sub") return rgba(subRgb, subFill * a);
            return rgba(inkWashRgb, fillA * a);
        },
        wash: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accWash * a);
            if (tint === "sub") return rgba(subRgb, subWash * a);
            return rgba(inkWashRgb, inkWash * a);
        },
        waterline: (tint, a = 1) => {
            if (tint === "accent") {
                return rgba(accRgb, clamp(accA * 0.72 * a, 0, 1));
            }
            if (tint === "sub") {
                return rgba(subRgb, clamp(subA * 0.68 * a, 0, 1));
            }
            return rgba(inkStrokeRgb, clamp(strokeA * 0.58 * a, 0, 1));
        },
        inkGrade: (grade, a = 1) => {
            const rgb = grade === "dan" || grade === "qing"
                ? inkWashRgb
                : inkStrokeRgb;
            return rgba(rgb, gradeMap[grade] * harmony * a);
        },
        cinnabar: (a = 1) => rgba(cinnabarRgb, harmony * a),
        goldDust: (a = 1) => rgba(goldDustRgb, harmony * a),
        highlight: (a = 1) => rgba(highlightRgb, 0.74 * a),
    };
}

function cubicPoint(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    t: number,
): Point2D {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    return {
        x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x +
            tt * t * p3.x,
        y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y +
            tt * t * p3.y,
    };
}

function cubicTangent(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    t: number,
): number {
    const u = 1 - t;
    const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) +
        3 * t * t * (p3.x - p2.x);
    const dy = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) +
        3 * t * t * (p3.y - p2.y);
    return Math.atan2(dy, dx);
}

function _strokeProgressive(
    ctx: CanvasRenderingContext2D,
    perim: number,
    progress: number,
): void {
    if (progress >= 0.995) {
        ctx.stroke();
        return;
    }
    const drawLen = Math.max(0.5, perim * clamp(progress, 0, 1));
    ctx.setLineDash([drawLen, perim + 16]);
    ctx.stroke();
    ctx.setLineDash([]);
}

interface SampleBranchOpts {
    steps?: number;
    widthStart: number;
    widthEnd: number;
    t0: number;
    t1: number;
    flexSpan?: number;
    phase?: number;
    waveLag?: number;
    ghost?: boolean;
    midground?: boolean;
    brushStyle?: "standard" | "iron-plum" | "orchid-blade";
    twistU?: number;
    bambooNodes?: readonly number[];
    snowCushions?: boolean;
    wobble?: number;
    parentRef?: BranchParentRef | null;
}

function sampleBranch(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    opts: SampleBranchOpts,
    rng: () => number,
): BranchData {
    const steps = opts.steps ?? 36;
    const points: BranchSample[] = [];
    const wobble = opts.wobble ?? 0;
    const phaseW = rng() * 6.28;
    for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const pt = cubicPoint(p0, p1, p2, p3, u);
        const ang = cubicTangent(p0, p1, p2, p3, u);
        const env = Math.sin(u * Math.PI);
        const ironKick = opts.brushStyle === "iron-plum"
            ? Math.sin(u * Math.PI * 3.6 + phaseW * 0.7) * 1.45 * env
            : 0;
        const off = wobble
            ? Math.sin(u * Math.PI * 2.8 + phaseW) * wobble * env + ironKick
            : ironKick;
        const rx = pt.x - Math.sin(ang) * off;
        const ry = pt.y + Math.cos(ang) * off;
        points.push({
            x: rx,
            y: ry,
            lx: rx - p0.x,
            ly: ry - p0.y,
            angle: ang,
            u,
            localFlex: Math.pow(u, 1.55) * (opts.flexSpan ?? 1.0),
        });
    }
    return {
        points,
        widthStart: opts.widthStart,
        widthEnd: opts.widthEnd,
        t0: opts.t0,
        t1: opts.t1,
        phase: opts.phase ?? 0,
        waveLag: opts.waveLag,
        ghost: Boolean(opts.ghost),
        midground: Boolean(opts.midground),
        brushStyle: opts.brushStyle ?? "standard",
        twistU: opts.twistU,
        bambooNodes: opts.bambooNodes,
        snowCushions: opts.snowCushions,
        parentRef: opts.parentRef ?? null,
        frameId: -1,
        worldCache: null,
    };
}

export interface GenerateBotanicalSceneOptions {
    sceneSide?: "left" | "right";
    archetype?: BotanicalArchetype;
}

export function generateBotanicalScene(
    species: ConcreteBotanicalSpecies,
    w: number,
    h: number,
    dateKey: string,
    embedded = false,
    dockInsets?: BotanicalDockInsets,
    options?: GenerateBotanicalSceneOptions,
): BotanicalScene {
    const isNarrow = !embedded && w < 720;
    const isWide = embedded || w >= 1024;
    const archetype: BotanicalArchetype = !isNarrow && !embedded
        ? resolveBotanicalArchetype(species, dateKey, options?.archetype)
        : 0;
    const targetSide: "left" | "right" =
        !embedded && options?.sceneSide === "left" && w >= 768
            ? "left"
            : "right";
    const rng = mulberry32(
        hashString(`${dateKey}:${species}:v7:a${archetype}`),
    );
    const rand = (lo: number, hi: number) => lo + rng() * (hi - lo);
    const solar = resolveSolarTerm(dateKey);
    const S = isNarrow
        ? clamp(Math.min(w / 500, h / 860), 0.62, 0.82)
        : clamp(Math.min(w / 1440, h / 900), 0.56, 1.18);

    const branches: BranchData[] = [];
    const ornaments: BotanicalOrnament[] = [];
    const rocks: RockStroke[] = [];
    const dockTop = dockInsets?.top ?? 0;
    const dockRight = targetSide === "left"
        ? (dockInsets?.left ?? 0)
        : (dockInsets?.right ?? 0);
    const dockBottom = dockInsets?.bottom ?? 0;
    const topShift = !embedded && !isNarrow ? dockTop * 0.75 : 0;
    const narrowRootY = h - Math.max(92, h * 0.115) - dockBottom;
    const rootX = isNarrow ? w + 10 * S : w + 16 * S - dockRight * 0.4;
    const rootY = isNarrow ? narrowRootY : h + 16 * S - dockBottom * 0.3;

    if (isWide || isNarrow) {
        const echoScale = isNarrow ? 0.9 : 1;
        const isWideMaple = !isNarrow && species === "maple";
        const tr0 = isNarrow
            ? { x: w + 8, y: rand(215, 235) * S }
            : isWideMaple
            ? { x: w - 180 * S, y: Math.max(48, 52 * S) + topShift }
            : { x: w + 10, y: rand(96, 118) * S + topShift };
        const tr3 = isNarrow
            ? {
                x: w - rand(130, 158) * S,
                y: tr0.y + rand(72, 92) * S,
            }
            : isWideMaple
            ? {
                x: w - rand(345, 385) * S,
                y: tr0.y + rand(95, 120) * S,
            }
            : {
                x: w - rand(180, 225) * S,
                y: tr0.y + rand(112, 142) * S,
            };
        const echo = sampleBranch(
            tr0,
            {
                x: tr0.x - (isNarrow ? 50 : 75) * S,
                y: tr0.y + (isNarrow ? 6 : 8) * S,
            },
            {
                x: tr3.x + (isNarrow ? 42 : 65) * S,
                y: tr3.y - (isNarrow ? 30 : 46) * S,
            },
            tr3,
            {
                steps: 26,
                widthStart: (isNarrow ? 1.05 : 1.3) * S,
                widthEnd: 0.42 * S,
                t0: 0.22,
                t1: 0.62,
                flexSpan: 0.95,
                phase: 2.6,
                ghost: true,
                wobble: 0.9 * S * echoScale,
            },
            rng,
        );
        branches.push(echo);

        if (species === "ginkgo") {
            const echoLeaves: ReadonlyArray<{
                u: number;
                ang: number;
                sz: number;
                tint: TintRole;
                profile: boolean;
            }> = [
                { u: 0.42, ang: 0.65, sz: 34, tint: "ink", profile: true },
                { u: 0.72, ang: -0.58, sz: 38, tint: "sub", profile: false },
                { u: 0.98, ang: 0.18, sz: 32, tint: "ink", profile: false },
            ];
            for (const lf of echoLeaves) {
                const idx = Math.round(lf.u * (echo.points.length - 1));
                ornaments.push({
                    kind: "ginkgo",
                    ghost: true,
                    branch: echo,
                    idx,
                    angleOffset: lf.ang,
                    size: lf.sz * S * echoScale,
                    notch: 0.22,
                    stemLen: 12 * S * echoScale,
                    tint: lf.tint,
                    profile: lf.profile,
                    t0: lerp(echo.t0, echo.t1, lf.u) + 0.04,
                    t1: lerp(echo.t0, echo.t1, lf.u) + 0.34,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            }
        } else if (species === "eucalyptus") {
            const us = [0.34, 0.56, 0.76, 0.95];
            us.forEach((u, i) => {
                const idx = Math.round(u * (echo.points.length - 1));
                const sz = lerp(23, 12, i / 3) * S * echoScale;
                for (const side of [-1, 1] as const) {
                    if (i === 3 && side === -1) continue;
                    ornaments.push({
                        kind: "eucalyptus",
                        ghost: true,
                        branch: echo,
                        idx,
                        angleOffset: i === 3 ? 0.08 : side * 0.85,
                        rx: sz,
                        ry: sz * (i === 1 ? 0.55 : 0.82),
                        stemLen: 5 * S * echoScale,
                        tint: i === 2 && side === 1 ? "sub" : "ink",
                        profile: i === 1 && side === -1,
                        t0: lerp(echo.t0, echo.t1, u) + 0.04,
                        t1: lerp(echo.t0, echo.t1, u) + 0.28,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                }
            });
        } else if (species === "plum") {
            const echoPlums: ReadonlyArray<{
                u: number;
                kind: "plumBlossom" | "plumBud";
                sz: number;
                ang: number;
                tint: TintRole;
            }> = [
                {
                    u: 0.44,
                    kind: "plumBlossom",
                    sz: 16,
                    ang: 0.65,
                    tint: "sub",
                },
                {
                    u: 0.74,
                    kind: "plumBlossom",
                    sz: 13,
                    ang: -0.55,
                    tint: "accent",
                },
                {
                    u: 0.96,
                    kind: "plumBud",
                    sz: 4.8,
                    ang: 0.15,
                    tint: "accent",
                },
            ];
            for (const sp of echoPlums) {
                const idx = Math.round(sp.u * (echo.points.length - 1));
                ornaments.push({
                    kind: sp.kind,
                    ghost: true,
                    branch: echo,
                    idx,
                    angleOffset: sp.ang,
                    size: sp.sz * S * echoScale,
                    rotation: rand(0, 6.28),
                    tint: sp.tint,
                    profile: false,
                    t0: lerp(echo.t0, echo.t1, sp.u) + 0.06,
                    t1: lerp(echo.t0, echo.t1, sp.u) + 0.34,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            }
        } else if (species === "fern") {
            const echoPairs = 5;
            for (let i = 1; i <= echoPairs; i++) {
                const rawT = i / echoPairs;
                const easedT = 1 - Math.pow(1 - rawT, 1.15);
                const u = lerp(0.24, 0.88, easedT);
                const idx = Math.round(u * (echo.points.length - 1));
                const env = Math.sin(Math.pow(u, 0.70) * Math.PI);
                const pl = 66 * S * echoScale * (0.28 + env * 0.78);
                const ts = lerp(echo.t0, echo.t1, u) + 0.02;
                for (const side of [-1, 1] as const) {
                    const jIdx = clamp(
                        idx + (side > 0 ? 0 : -1),
                        2,
                        echo.points.length - 2,
                    );
                    const actualLen = pl * (side > 0 ? 0.94 : 1.02);
                    ornaments.push({
                        kind: "fernPinna",
                        ghost: true,
                        branch: echo,
                        idx: jIdx,
                        side,
                        angleOffset: side * lerp(0.84, 0.34, u),
                        len: actualLen,
                        width: actualLen * 0.105,
                        curve: side * -0.18,
                        inkWeight: i % 2 === 0 ? 0.76 : 0.96,
                        whip: side * 0.07,
                        feibai: false,
                        tint: i === echoPairs ? "sub" : "ink",
                        profile: i === 2 && side === 1,
                        t0: ts,
                        t1: ts + 0.24,
                        phase: u * 3.5 + side * 0.3,
                        push: 0,
                        vel: 0,
                    });
                }
            }
            ornaments.push({
                kind: "fernPinna",
                ghost: true,
                branch: echo,
                idx: echo.points.length - 1,
                side: 1,
                angleOffset: 0.03,
                len: 42 * S * echoScale,
                width: 4.2 * S * echoScale,
                curve: -0.10,
                inkWeight: 0.92,
                whip: 0.06,
                feibai: false,
                tint: "sub",
                profile: false,
                t0: echo.t1 - 0.02,
                t1: echo.t1 + 0.22,
                phase: 4.2,
                push: 0,
                vel: 0,
            });
        } else if (species === "orchid") {
            const echoBlades: ReadonlyArray<{
                u: number;
                ang: number;
                len: number;
                tint: TintRole;
            }> = [
                { u: 0.42, ang: 0.45, len: 68, tint: "ink" },
                { u: 0.72, ang: -0.35, len: 74, tint: "sub" },
            ];
            for (const eb of echoBlades) {
                const idx = Math.round(eb.u * (echo.points.length - 1));
                ornaments.push({
                    kind: "fernPinna",
                    ghost: true,
                    branch: echo,
                    idx,
                    side: 1,
                    angleOffset: eb.ang,
                    len: eb.len * S * echoScale,
                    width: 6.2 * S * echoScale,
                    curve: -0.22,
                    inkWeight: 0.85,
                    whip: 0.08,
                    feibai: false,
                    tint: eb.tint,
                    profile: false,
                    t0: lerp(echo.t0, echo.t1, eb.u) + 0.04,
                    t1: lerp(echo.t0, echo.t1, eb.u) + 0.30,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            }
            ornaments.push({
                kind: "orchidBlossom",
                ghost: true,
                branch: echo,
                idx: echo.points.length - 1,
                angleOffset: 0.1,
                size: 14 * S * echoScale,
                rotation: rand(0, 6.28),
                tint: "sub",
                profile: false,
                t0: echo.t1,
                t1: echo.t1 + 0.28,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        } else if (species === "bamboo") {
            const echoNodes = [0.35, 0.65, 0.94];
            echoNodes.forEach((u, ni) => {
                const idx = Math.round(u * (echo.points.length - 1));
                for (let li = 0; li < 2; li++) {
                    ornaments.push({
                        kind: "bambooLeaf",
                        ghost: true,
                        branch: echo,
                        idx,
                        angleOffset: (li === 0 ? 0.55 : -0.45) + ni * 0.08,
                        len: (38 - li * 8) * S * echoScale,
                        width: 5.5 * S * echoScale,
                        curve: li === 0 ? 0.16 : -0.14,
                        feibai: false,
                        tint: ni === 2 && li === 0 ? "sub" : "ink",
                        profile: false,
                        t0: lerp(echo.t0, echo.t1, u) + 0.04,
                        t1: lerp(echo.t0, echo.t1, u) + 0.28,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                }
            });
        } else if (species === "maple") {
            const echoMaples: ReadonlyArray<{
                u: number;
                ang: number;
                sz: number;
                tint: TintRole;
            }> = [
                { u: 0.45, ang: 0.55, sz: 20, tint: "ink" },
                { u: 0.78, ang: -0.42, sz: 24, tint: "sub" },
                { u: 0.98, ang: 0.15, sz: 18, tint: "accent" },
            ];
            for (const em of echoMaples) {
                const idx = Math.round(em.u * (echo.points.length - 1));
                ornaments.push({
                    kind: "mapleLeaf",
                    ghost: true,
                    branch: echo,
                    idx,
                    angleOffset: em.ang,
                    size: em.sz * S * echoScale,
                    stemLen: 10 * S * echoScale,
                    rotation: rand(-0.4, 0.4),
                    tint: em.tint,
                    profile: false,
                    t0: lerp(echo.t0, echo.t1, em.u) + 0.05,
                    t1: lerp(echo.t0, echo.t1, em.u) + 0.32,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            }
        }
    }

    if (species === "ginkgo") {
        const ginkgoLeafScale = isNarrow ? 0.84 : 1;
        const g0 = isNarrow
            ? { x: rootX - 6 * S, y: rootY - 26 * S }
            : { x: rootX - 10 * S, y: rootY - 70 * S };
        const g3 = isNarrow
            ? {
                x: w - rand(105, 138) * S,
                y: rootY - rand(195, 225) * S,
            }
            : {
                x: w - rand(160, 215) * S,
                y: h - rand(460, 525) * S,
            };
        const ghost = sampleBranch(
            g0,
            {
                x: g0.x - (isNarrow ? 28 : 45) * S,
                y: g0.y - (isNarrow ? 105 : 195) * S,
            },
            {
                x: g3.x + (isNarrow ? 42 : 68) * S,
                y: g3.y + (isNarrow ? 65 : 115) * S,
            },
            g3,
            {
                steps: 28,
                widthStart: (isNarrow ? 1.1 : 1.25) * S,
                widthEnd: 0.45 * S,
                t0: 0.08,
                t1: 0.52,
                flexSpan: 1.05,
                phase: 1.8,
                ghost: true,
                wobble: 1.3 * S * ginkgoLeafScale,
            },
            rng,
        );
        branches.push(ghost);
        [0.52, 0.78, 1.0].forEach((u, i) => {
            const idx = Math.round(u * (ghost.points.length - 1));
            ornaments.push({
                kind: "ginkgo",
                ghost: true,
                branch: ghost,
                idx,
                angleOffset: i % 2 === 0 ? -0.62 : 0.52,
                size: rand(35, 43) * S * ginkgoLeafScale,
                notch: rand(0.18, 0.28),
                stemLen: rand(12, 18) * S * ginkgoLeafScale,
                tint: i === 2 ? "sub" : "ink",
                profile: i === 1,
                t0: lerp(ghost.t0, ghost.t1, u) + 0.05,
                t1: lerp(ghost.t0, ghost.t1, u) + 0.34,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });

        const mainLen = (isNarrow
            ? 250
            : archetype === 1
            ? 635
            : archetype === 2
            ? 545
            : 590) * S;
        const p0 = isNarrow ? { x: rootX - rand(10, 22) * S, y: rootY } : {
            x: rootX -
                rand(
                        archetype === 2 ? 78 : 52,
                        archetype === 2 ? 120 : 95,
                    ) * S,
            y: rootY,
        };
        const p3 = isNarrow
            ? {
                x: w - rand(225, 260) * S,
                y: rootY - rand(195, 225) * S,
            }
            : {
                x: w -
                    rand(
                            archetype === 1 ? 265 : 300,
                            archetype === 1 ? 335 : 375,
                        ) * S,
                y: h - mainLen * rand(0.75, 0.85),
            };
        const p1 = {
            x: p0.x - (isNarrow ? rand(24, 48) : rand(42, 84)) * S,
            y: p0.y - mainLen * 0.34,
        };
        const p2 = {
            x: p3.x + (isNarrow ? rand(48, 78) : rand(84, 136)) * S,
            y: p3.y + mainLen * 0.26,
        };

        const main = sampleBranch(
            p0,
            p1,
            p2,
            p3,
            {
                steps: 40,
                widthStart: (isNarrow ? 3.8 : 6.6) * S,
                widthEnd: 0.70 * S,
                t0: 0.0,
                t1: 0.46,
                flexSpan: 0.95,
                phase: 0,
                wobble: 1.4 * S * ginkgoLeafScale,
            },
            rng,
        );
        branches.push(main);

        const subs = isNarrow
            ? [
                { u: 0.28, dir: -1, len: 128 * S, lift: 68 * S },
                { u: 0.48, dir: 1, len: 106 * S, lift: 72 * S },
                { u: 0.66, dir: -1, len: 96 * S, lift: 52 * S },
                { u: 0.82, dir: 1, len: 72 * S, lift: 44 * S },
            ]
            : [
                { u: 0.28, dir: -1, len: 215 * S, lift: 115 * S },
                { u: 0.48, dir: 1, len: 180 * S, lift: 120 * S },
                { u: 0.66, dir: -1, len: 168 * S, lift: 85 * S },
                { u: 0.82, dir: 1, len: 118 * S, lift: 72 * S },
            ];
        const isLateAutumnGinkgo = solar.termIndex >= 18 ||
            solar.termIndex <= 1;
        const isEarlyAutumnGinkgo = solar.termIndex >= 14 &&
            solar.termIndex <= 17;
        const subTints:
            readonly (readonly [TintRole, TintRole, TintRole, TintRole])[] =
                isLateAutumnGinkgo
                    ? [
                        ["accent", "sub", "accent", "ink"],
                        ["sub", "accent", "accent", "sub"],
                        ["accent", "ink", "accent", "sub"],
                        ["sub", "accent", "ink", "accent"],
                    ]
                    : isEarlyAutumnGinkgo
                    ? [
                        ["accent", "ink", "sub", "ink"],
                        ["sub", "ink", "accent", "ink"],
                        ["ink", "sub", "accent", "ink"],
                        ["sub", "accent", "ink", "sub"],
                    ]
                    : [
                        ["ink", "ink", "sub", "ink"],
                        ["sub", "ink", "ink", "ink"],
                        ["ink", "ink", "accent", "ink"],
                        ["ink", "sub", "ink", "ink"],
                    ];

        subs.forEach((cfg, si) => {
            const bi = Math.round(cfg.u * (main.points.length - 1));
            const anc = main.points[bi];
            const ang = anc.angle + cfg.dir * rand(0.42, 0.66);
            const sp0 = { x: anc.x, y: anc.y };
            const sp3 = {
                x: anc.x + Math.cos(ang) * cfg.len,
                y: anc.y + Math.sin(ang) * cfg.len - cfg.lift * 0.25,
            };
            const sp1 = {
                x: lerp(sp0.x, sp3.x, 0.36) + cfg.dir * 13 * S,
                y: lerp(sp0.y, sp3.y, 0.36) - 18 * S,
            };
            const sp2 = {
                x: lerp(sp0.x, sp3.x, 0.72),
                y: lerp(sp0.y, sp3.y, 0.72) - 10 * S,
            };
            const ts = lerp(main.t0, main.t1, cfg.u);
            const sub = sampleBranch(
                sp0,
                sp1,
                sp2,
                sp3,
                {
                    steps: 24,
                    widthStart: (isNarrow ? 1.65 : 2.35) * S,
                    widthEnd: 0.52 * S,
                    t0: ts,
                    t1: ts + 0.24,
                    flexSpan: 0.55,
                    phase: 0.7 + si * 0.8,
                    wobble: 1.0 * S,
                    parentRef: { branch: main, idx: bi },
                },
                rng,
            );
            branches.push(sub);

            const tSet = subTints[si];
            const clusters = [
                {
                    u: 0.54,
                    leaves: [
                        {
                            ang: cfg.dir * 0.76,
                            sz: 42,
                            tint: tSet[0],
                            profile: false,
                        },
                        {
                            ang: cfg.dir * 0.34,
                            sz: 34,
                            tint: tSet[1],
                            profile: true,
                        },
                        ...(si === 1 || si === 2
                            ? [{
                                ang: cfg.dir * 0.12,
                                sz: 27,
                                tint: tSet[2],
                                profile: false,
                            }]
                            : []),
                    ],
                },
                {
                    u: 0.96,
                    leaves: [
                        { ang: -0.22, sz: 46, tint: tSet[2], profile: false },
                        {
                            ang: 0.42,
                            sz: 37,
                            tint: tSet[3],
                            profile: si % 2 === 0,
                        },
                        ...(si === 0 || si === 1
                            ? [{
                                ang: 0.08,
                                sz: 30,
                                tint: tSet[0],
                                profile: true,
                            }]
                            : []),
                    ],
                },
            ];
            for (const cl of clusters) {
                const lIdx = Math.round(cl.u * (sub.points.length - 1));
                const lt = lerp(sub.t0, sub.t1, cl.u) + 0.03;
                cl.leaves.forEach((lf, li) => {
                    ornaments.push({
                        kind: "ginkgo",
                        ghost: false,
                        branch: sub,
                        idx: lIdx,
                        angleOffset: lf.ang + rand(-0.08, 0.08),
                        size: lf.sz * rand(0.92, 1.08) * S * ginkgoLeafScale,
                        notch: rand(0.18, 0.28),
                        stemLen: rand(12, 19) * S * ginkgoLeafScale,
                        tint: lf.tint,
                        profile: lf.profile,
                        t0: lt + li * 0.05,
                        t1: lt + 0.36 + li * 0.05,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                });
            }
        });

        // 银杏短枝簇生（主干中段加厚画眼，桌面端向上抽一枝探空瘦梢）
        if (!isNarrow) {
            const spurIdx = Math.round(0.62 * (main.points.length - 1));
            const spurT = lerp(main.t0, main.t1, 0.62) + 0.05;
            const spurLeafTints: readonly TintRole[] = isLateAutumnGinkgo
                ? ["accent", "sub", "accent"]
                : isEarlyAutumnGinkgo
                ? ["sub", "accent", "ink"]
                : ["ink", "sub", "ink"];
            [-0.72, -0.34, 0.36].forEach((ang, li) => {
                ornaments.push({
                    kind: "ginkgo",
                    ghost: false,
                    branch: main,
                    idx: spurIdx,
                    angleOffset: ang,
                    size: (32 + li * 4) * S,
                    notch: 0.22,
                    stemLen: (13 + li * 2) * S,
                    tint: spurLeafTints[li],
                    profile: li === 1,
                    t0: spurT + li * 0.04,
                    t1: spurT + 0.34 + li * 0.04,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });

            const skyIdx = Math.round(0.76 * (main.points.length - 1));
            const skyAnc = main.points[skyIdx];
            const skyEnd = {
                x: skyAnc.x - 95 * S,
                y: Math.max(54, skyAnc.y - 165 * S),
            };
            const skyTwig = sampleBranch(
                { x: skyAnc.x, y: skyAnc.y },
                {
                    x: lerp(skyAnc.x, skyEnd.x, 0.42) + 12 * S,
                    y: lerp(skyAnc.y, skyEnd.y, 0.42) - 18 * S,
                },
                {
                    x: lerp(skyAnc.x, skyEnd.x, 0.78) - 8 * S,
                    y: lerp(skyAnc.y, skyEnd.y, 0.78),
                },
                skyEnd,
                {
                    steps: 18,
                    widthStart: 1.25 * S,
                    widthEnd: 0.32 * S,
                    t0: lerp(main.t0, main.t1, 0.76),
                    t1: lerp(main.t0, main.t1, 0.76) + 0.22,
                    flexSpan: 0.65,
                    phase: 3.1,
                    wobble: 0.9 * S,
                    parentRef: { branch: main, idx: skyIdx },
                },
                rng,
            );
            branches.push(skyTwig);
            [
                {
                    u: 0.90,
                    ang: -0.38,
                    sz: 34,
                    tint: "sub" as TintRole,
                    p: true,
                },
                {
                    u: 1.0,
                    ang: 0.14,
                    sz: 40,
                    tint: isLateAutumnGinkgo
                        ? "accent" as TintRole
                        : "sub" as TintRole,
                    p: false,
                },
            ].forEach((sl, li) => {
                ornaments.push({
                    kind: "ginkgo",
                    ghost: false,
                    branch: skyTwig,
                    idx: Math.round(sl.u * (skyTwig.points.length - 1)),
                    angleOffset: sl.ang,
                    size: sl.sz * S,
                    notch: 0.22,
                    stemLen: 14 * S,
                    tint: sl.tint,
                    profile: sl.p,
                    t0: skyTwig.t1 - 0.02 + li * 0.04,
                    t1: skyTwig.t1 + 0.28 + li * 0.04,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });
        }

        const topLeaves: ReadonlyArray<{
            u: number;
            ang: number;
            sz: number;
            tint: TintRole;
            profile: boolean;
        }> = [
            {
                u: 0.93,
                ang: -0.50,
                sz: 40,
                tint: isLateAutumnGinkgo ? "sub" : "ink",
                profile: true,
            },
            { u: 1.00, ang: 0.08, sz: 45, tint: "accent", profile: false },
        ];
        topLeaves.forEach((ls, li) => {
            const lIdx = Math.round(ls.u * (main.points.length - 1));
            ornaments.push({
                kind: "ginkgo",
                ghost: false,
                branch: main,
                idx: lIdx,
                angleOffset: ls.ang,
                size: ls.sz * S * ginkgoLeafScale,
                notch: rand(0.18, 0.28),
                stemLen: rand(13, 19) * S * ginkgoLeafScale,
                tint: ls.tint,
                profile: ls.profile,
                t0: main.t1 - 0.04 + li * 0.06,
                t1: main.t1 + 0.34 + li * 0.06,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });
    } else if (species === "eucalyptus") {
        const eucLeafScale = isNarrow ? 0.86 : 1;
        const configs = isNarrow
            ? [
                {
                    ghost: true,
                    len: 255,
                    rx: 4,
                    tx: 135,
                    ty: 0.86,
                    count: 6,
                    t0: 0.12,
                },
                {
                    ghost: false,
                    len: 310,
                    rx: 14,
                    tx: 255,
                    ty: 0.72,
                    count: 8,
                    t0: 0.00,
                },
            ]
            : [
                {
                    ghost: true,
                    len: 460,
                    rx: 14,
                    tx: 130,
                    ty: 0.92,
                    count: 8,
                    t0: 0.10,
                },
                {
                    ghost: false,
                    len: archetype === 1 ? 680 : archetype === 2 ? 600 : 645,
                    rx: archetype === 1 ? 68 : archetype === 2 ? 124 : 98,
                    tx: archetype === 1 ? 410 : archetype === 2 ? 475 : 445,
                    ty: archetype === 1 ? 0.78 : archetype === 2 ? 0.66 : 0.72,
                    count: 10,
                    t0: 0.00,
                },
                {
                    ghost: false,
                    len: 500,
                    rx: 26,
                    tx: 225,
                    ty: 0.88,
                    count: 8,
                    t0: 0.14,
                },
            ];

        configs.forEach((cfg, ci) => {
            const len = cfg.len * S;
            const p0 = {
                x: rootX - cfg.rx * S,
                y: isNarrow ? rootY + 6 * S : rootY + 12 * S,
            };
            const p3 = {
                x: w - cfg.tx * S * rand(0.95, 1.05),
                y: (isNarrow ? rootY : h) - len * cfg.ty,
            };
            const p1 = {
                x: p0.x - (isNarrow ? rand(28, 48) : rand(45, 80)) * S,
                y: p0.y - len * 0.45,
            };
            const p2 = {
                x: p3.x + (isNarrow ? rand(75, 110) : rand(125, 180)) * S,
                y: p3.y - (isNarrow ? rand(10, 24) : rand(16, 42)) * S,
            };

            const stem = sampleBranch(
                p0,
                p1,
                p2,
                p3,
                {
                    steps: 44,
                    widthStart: (cfg.ghost ? 1.25 : isNarrow ? 2.15 : 2.75) * S,
                    widthEnd: 0.48 * S,
                    t0: cfg.t0,
                    t1: cfg.t0 + 0.52,
                    flexSpan: 1.12,
                    phase: ci * 1.4,
                    ghost: cfg.ghost,
                    wobble: 1.1 * S * eucLeafScale,
                },
                rng,
            );
            branches.push(stem);

            for (let i = 1; i <= cfg.count; i++) {
                const rawT = i / cfg.count;
                const easedT = 1 - Math.pow(1 - rawT, 1.32);
                const u = lerp(0.18, 0.94, easedT);
                const idx = Math.round(u * (stem.points.length - 1));
                const env = Math.sin(u * Math.PI * 0.82 + 0.25);
                const sz = lerp(29, 12.5, Math.pow(u, 1.15)) * S *
                    eucLeafScale *
                    (0.86 + env * 0.24);

                for (const side of [-1, 1] as const) {
                    if (i === 1 && side === 1) continue;
                    const jIdx = clamp(
                        idx + (side > 0 ? 0 : -2),
                        2,
                        stem.points.length - 1,
                    );
                    const ts = lerp(stem.t0, stem.t1, u) + 0.03;
                    const tint: TintRole =
                        (i === cfg.count - 1 && side === 1) ||
                            (ci === 1 && i === 4 && side === -1)
                            ? "accent"
                            : i % 3 === 0 && side === 1
                            ? "sub"
                            : "ink";
                    const isProfile = (i + (side > 0 ? 1 : 0)) % 3 === 0;
                    ornaments.push({
                        kind: "eucalyptus",
                        ghost: cfg.ghost,
                        branch: stem,
                        idx: jIdx,
                        angleOffset: side * rand(0.68, 1.08),
                        rx: sz * rand(0.90, 1.10),
                        ry: sz *
                            (isProfile ? rand(0.42, 0.54) : rand(0.78, 0.96)),
                        stemLen: rand(5, 9) * S * eucLeafScale,
                        tint,
                        profile: isProfile,
                        t0: ts,
                        t1: ts + 0.30,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                }
            }
            ornaments.push({
                kind: "eucalyptus",
                ghost: cfg.ghost,
                branch: stem,
                idx: stem.points.length - 1,
                angleOffset: rand(-0.1, 0.1),
                rx: 12 * S * eucLeafScale,
                ry: 9 * S * eucLeafScale,
                stemLen: 3 * S * eucLeafScale,
                tint: "accent",
                profile: false,
                t0: stem.t1,
                t1: stem.t1 + 0.28,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });
    } else if (species === "plum") {
        const plumScale = isNarrow ? 0.86 : 1;
        const g0 = isNarrow
            ? { x: rootX - 6 * S, y: rootY - 30 * S }
            : { x: rootX - 10 * S, y: rootY - 95 * S };
        const g3 = isNarrow
            ? {
                x: w - rand(120, 150) * S,
                y: rootY - rand(195, 225) * S,
            }
            : {
                x: w - rand(195, 250) * S,
                y: h - rand(460, 525) * S,
            };
        const ghost = sampleBranch(
            g0,
            {
                x: lerp(g0.x, g3.x, 0.35) + 22 * S * plumScale,
                y: lerp(g0.y, g3.y, 0.35) - 28 * S * plumScale,
            },
            {
                x: lerp(g0.x, g3.x, 0.70) - 18 * S * plumScale,
                y: lerp(g0.y, g3.y, 0.70) + 16 * S * plumScale,
            },
            g3,
            {
                steps: 26,
                widthStart: 1.55 * S * plumScale,
                widthEnd: 0.45 * S,
                t0: 0.10,
                t1: 0.54,
                flexSpan: 0.85,
                phase: 2.0,
                ghost: true,
                wobble: 1.5 * S * plumScale,
            },
            rng,
        );
        branches.push(ghost);
        [0.60, 0.84, 0.98].forEach((u, i) => {
            const idx = Math.round(u * (ghost.points.length - 1));
            const isBud = i === 2;
            ornaments.push({
                kind: isBud ? "plumBud" : "plumBlossom",
                ghost: true,
                branch: ghost,
                idx,
                angleOffset: i % 2 === 0 ? -0.6 : 0.6,
                size: (isBud ? 4.8 : rand(14, 18)) * S * plumScale,
                rotation: rand(0, 6.28),
                tint: "accent",
                profile: false,
                t0: lerp(ghost.t0, ghost.t1, u) + 0.08,
                t1: lerp(ghost.t0, ghost.t1, u) + 0.36,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });

        const p0 = isNarrow ? { x: rootX - rand(8, 20) * S, y: rootY } : {
            x: rootX - rand(40, 72) * S,
            y: archetype === 2 ? h * 0.24 : rootY - rand(6, 26) * S,
        };
        const mid1 = isNarrow
            ? {
                x: w - rand(110, 132) * S,
                y: rootY - rand(72, 92) * S,
            }
            : {
                x: w - rand(195, 232) * S,
                y: archetype === 2 ? h * 0.34 : h -
                    rand(
                            archetype === 1 ? 195 : 165,
                            archetype === 1 ? 235 : 200,
                        ) * S,
            };
        const mid2 = isNarrow
            ? {
                x: w - rand(180, 208) * S,
                y: rootY - rand(148, 174) * S,
            }
            : {
                x: w - rand(285, 332) * S,
                y: archetype === 2 ? h * 0.48 : h -
                    rand(
                            archetype === 1 ? 355 : 320,
                            archetype === 1 ? 405 : 360,
                        ) * S,
            };
        const tip = isNarrow
            ? {
                x: w - rand(278, 312) * S,
                y: rootY - rand(182, 210) * S,
            }
            : {
                x: w -
                    rand(
                            archetype === 1 ? 465 : 515,
                            archetype === 1 ? 525 : 575,
                        ) * S,
                y: archetype === 2 ? h * 0.56 : h -
                    rand(
                            archetype === 1 ? 410 : 365,
                            archetype === 1 ? 455 : 405,
                        ) * S,
            };

        const seg1 = sampleBranch(
            p0,
            {
                x: lerp(p0.x, mid1.x, 0.4) + 14 * S,
                y: lerp(p0.y, mid1.y, 0.4) - 18 * S,
            },
            {
                x: lerp(p0.x, mid1.x, 0.8) - 8 * S,
                y: lerp(p0.y, mid1.y, 0.8) + 10 * S,
            },
            mid1,
            {
                steps: 20,
                widthStart: (isNarrow ? 5.4 : 8.8) * S,
                widthEnd: (isNarrow ? 3.2 : 5.0) * S,
                t0: 0.0,
                t1: 0.21,
                flexSpan: 0.18,
                phase: 0,
                brushStyle: "iron-plum",
                wobble: 1.2 * S,
            },
            rng,
        );
        const seg2 = sampleBranch(
            mid1,
            {
                x: lerp(mid1.x, mid2.x, 0.35) + 18 * S,
                y: lerp(mid1.y, mid2.y, 0.35) - 24 * S,
            },
            {
                x: lerp(mid1.x, mid2.x, 0.78) - 12 * S,
                y: lerp(mid1.y, mid2.y, 0.78) + 8 * S,
            },
            mid2,
            {
                steps: 22,
                widthStart: (isNarrow ? 3.2 : 5.0) * S,
                widthEnd: (isNarrow ? 1.75 : 2.5) * S,
                t0: 0.20,
                t1: 0.40,
                flexSpan: 0.35,
                phase: 0.3,
                brushStyle: "iron-plum",
                wobble: 1.4 * S,
                parentRef: { branch: seg1, idx: seg1.points.length - 1 },
            },
            rng,
        );
        const seg3 = sampleBranch(
            mid2,
            {
                x: lerp(mid2.x, tip.x, 0.35) - 12 * S,
                y: lerp(mid2.y, tip.y, 0.35) - 24 * S,
            },
            {
                x: lerp(mid2.x, tip.x, 0.76) + 18 * S,
                y: lerp(mid2.y, tip.y, 0.76) - 8 * S,
            },
            tip,
            {
                steps: 22,
                widthStart: (isNarrow ? 1.75 : 2.5) * S,
                widthEnd: (isNarrow ? 0.56 : 0.65) * S,
                t0: 0.39,
                t1: 0.56,
                flexSpan: 0.42,
                phase: 0.6,
                brushStyle: "iron-plum",
                wobble: 1.2 * S,
                parentRef: { branch: seg2, idx: seg2.points.length - 1 },
            },
            rng,
        );
        branches.push(seg1, seg2, seg3);

        [
            { parent: seg1, u: 0.94, ang: -0.75, len: 22 * S },
            { parent: seg2, u: 0.96, ang: -0.92, len: 18 * S },
            { parent: seg3, u: 0.36, ang: -2.95, len: 16 * S },
        ].forEach((sp, si) => {
            const pIdx = Math.round(sp.u * (sp.parent.points.length - 1));
            const anc = sp.parent.points[pIdx];
            const tp3 = {
                x: anc.x + Math.cos(sp.ang) * sp.len,
                y: anc.y + Math.sin(sp.ang) * sp.len,
            };
            const ts = lerp(sp.parent.t0, sp.parent.t1, sp.u);
            branches.push(sampleBranch(
                { x: anc.x, y: anc.y },
                { x: lerp(anc.x, tp3.x, 0.4), y: lerp(anc.y, tp3.y, 0.4) },
                { x: lerp(anc.x, tp3.x, 0.7), y: lerp(anc.y, tp3.y, 0.7) },
                tp3,
                {
                    steps: 8,
                    widthStart: 1.3 * S,
                    widthEnd: 0.32 * S,
                    t0: ts,
                    t1: ts + 0.12,
                    flexSpan: 0.1,
                    phase: 1.1 + si,
                    parentRef: { branch: sp.parent, idx: pIdx },
                },
                rng,
            ));
        });

        const twigs = isNarrow
            ? [
                { parent: seg1, u: 0.78, ang: -1.92, len: 112 * S },
                { parent: seg2, u: 0.52, ang: -1.36, len: 100 * S },
                { parent: seg2, u: 0.92, ang: -2.28, len: 82 * S },
                { parent: seg3, u: 0.58, ang: -1.58, len: 62 * S },
            ]
            : [
                { parent: seg1, u: 0.78, ang: -1.68, len: 195 * S },
                { parent: seg2, u: 0.52, ang: -1.26, len: 185 * S },
                { parent: seg2, u: 0.92, ang: -2.62, len: 135 * S },
                { parent: seg3, u: 0.52, ang: -2.74, len: 108 * S },
            ];
        twigs.forEach((tw, ti) => {
            const pIdx = Math.round(tw.u * (tw.parent.points.length - 1));
            const anc = tw.parent.points[pIdx];
            const ang = tw.ang + rand(-0.12, 0.12);
            const tp0 = { x: anc.x, y: anc.y };
            const rawEndY = anc.y + Math.sin(ang) * tw.len;
            const tp3 = {
                x: anc.x + Math.cos(ang) * tw.len,
                y: !isNarrow && ti >= 2 ? Math.max(435 * S, rawEndY) : rawEndY,
            };
            const rawCp1Y = lerp(tp0.y, tp3.y, 0.38) -
                rand(10, 20) * S * plumScale;
            const rawCp2Y = lerp(tp0.y, tp3.y, 0.74) -
                rand(6, 14) * S * plumScale;
            const tp1 = {
                x: lerp(tp0.x, tp3.x, 0.38) + rand(-14, 14) * S * plumScale,
                y: !isNarrow && ti >= 2 ? Math.max(435 * S, rawCp1Y) : rawCp1Y,
            };
            const tp2 = {
                x: lerp(tp0.x, tp3.x, 0.74) + rand(-10, 10) * S * plumScale,
                y: !isNarrow && ti >= 2 ? Math.max(435 * S, rawCp2Y) : rawCp2Y,
            };
            const ts = lerp(tw.parent.t0, tw.parent.t1, tw.u);
            const twig = sampleBranch(
                tp0,
                tp1,
                tp2,
                tp3,
                {
                    steps: 20,
                    widthStart: 1.4 * S,
                    widthEnd: 0.48 * S,
                    t0: ts,
                    t1: ts + 0.24,
                    flexSpan: 0.52,
                    phase: 0.7 + ti * 0.8,
                    wobble: 1.0 * S * plumScale,
                    parentRef: { branch: tw.parent, idx: pIdx },
                },
                rng,
            );
            branches.push(twig);

            const spots: ReadonlyArray<{
                u: number;
                kind: "plumBlossom" | "plumBud";
                sz: number;
                tint: TintRole;
                profile: boolean;
            }> = ti % 2 === 0
                ? [
                    {
                        u: 0.46,
                        kind: "plumBlossom",
                        sz: 22,
                        tint: "accent",
                        profile: false,
                    },
                    {
                        u: 0.74,
                        kind: "plumBlossom",
                        sz: 13.5,
                        tint: "sub",
                        profile: true,
                    },
                    {
                        u: 0.96,
                        kind: "plumBud",
                        sz: 5.0,
                        tint: "accent",
                        profile: false,
                    },
                ]
                : [
                    {
                        u: 0.38,
                        kind: "plumBud",
                        sz: 5.4,
                        tint: "accent",
                        profile: false,
                    },
                    {
                        u: 0.66,
                        kind: "plumBlossom",
                        sz: 16,
                        tint: "accent",
                        profile: false,
                    },
                    {
                        u: 0.86,
                        kind: "plumBud",
                        sz: 4.5,
                        tint: "sub",
                        profile: false,
                    },
                    {
                        u: 0.97,
                        kind: "plumBud",
                        sz: 3.8,
                        tint: "accent",
                        profile: false,
                    },
                ];

            spots.forEach((sp, si) => {
                const sIdx = Math.round(sp.u * (twig.points.length - 1));
                const tS = lerp(twig.t0, twig.t1, sp.u) + 0.06;
                const earlyWinterBud =
                    (solar.termIndex >= 21 || solar.termIndex === 0) &&
                    sp.kind === "plumBlossom" && (ti + si) % 3 === 0;
                const lateWinterBloom = solar.termIndex >= 1 &&
                    solar.termIndex <= 3 &&
                    sp.kind === "plumBud" && si === 0;
                const resolvedKind = earlyWinterBud
                    ? "plumBud"
                    : lateWinterBloom
                    ? "plumBlossom"
                    : sp.kind;
                const poses = ["frontal", "side", "upward", "back"] as const;
                ornaments.push({
                    kind: resolvedKind,
                    ghost: false,
                    branch: twig,
                    idx: sIdx,
                    angleOffset: (si % 2 === 0 ? -1 : 1) * rand(0.42, 0.90),
                    size: (resolvedKind === "plumBud"
                        ? 4.8
                        : Math.max(13, sp.sz)) *
                        rand(0.94, 1.06) * S * plumScale,
                    rotation: rand(0, 6.28),
                    tint: sp.tint,
                    profile: sp.profile,
                    pose: poses[(ti + si) % poses.length],
                    t0: tS,
                    t1: tS + 0.34,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });
        });

        const mainPlums: ReadonlyArray<{
            branch: BranchData;
            u: number;
            kind: "plumBlossom" | "plumBud";
            sz: number;
            tint: TintRole;
            profile: boolean;
            pose?: PlumOrnament["pose"];
            midground?: boolean;
        }> = [
            // 主景画眼繁簇（密不透风）：在 seg2 折转处排布大小错落、正侧仰背俱全的重叠梅花
            {
                branch: seg2,
                u: 0.46,
                kind: "plumBlossom",
                sz: 15,
                tint: "sub",
                profile: true,
                pose: "side",
                midground: true,
            },
            {
                branch: seg2,
                u: 0.62,
                kind: "plumBlossom",
                sz: 26,
                tint: "accent",
                profile: false,
                pose: "frontal",
            },
            {
                branch: seg2,
                u: 0.72,
                kind: "plumBlossom",
                sz: 20,
                tint: "accent",
                profile: false,
                pose: "upward",
            },
            {
                branch: seg2,
                u: 0.80,
                kind: "plumBlossom",
                sz: 13.5,
                tint: "sub",
                profile: true,
                pose: "back",
                midground: true,
            },
            {
                branch: seg3,
                u: 0.40,
                kind: "plumBud",
                sz: 5.2,
                tint: "accent",
                profile: false,
            },
            {
                branch: seg3,
                u: 0.80,
                kind: "plumBlossom",
                sz: 15,
                tint: "sub",
                profile: true,
                pose: "side",
            },
            {
                branch: seg3,
                u: 0.98,
                kind: "plumBud",
                sz: 4.4,
                tint: "accent",
                profile: false,
            },
        ];
        mainPlums.forEach((sp, si) => {
            const sIdx = Math.round(sp.u * (sp.branch.points.length - 1));
            const tS = lerp(sp.branch.t0, sp.branch.t1, sp.u) + 0.06;
            const earlyWinterBud =
                (solar.termIndex >= 21 || solar.termIndex === 0) &&
                sp.kind === "plumBlossom" && si % 3 === 0;
            const lateWinterBloom = solar.termIndex >= 1 &&
                solar.termIndex <= 3 &&
                sp.kind === "plumBud" && si === 4;
            const resolvedKind = earlyWinterBud
                ? "plumBud"
                : lateWinterBloom
                ? "plumBlossom"
                : sp.kind;
            ornaments.push({
                kind: resolvedKind,
                ghost: false,
                midground: sp.midground,
                branch: sp.branch,
                idx: sIdx,
                angleOffset: si % 2 === 0 ? -0.55 : 0.65,
                size: (resolvedKind === "plumBud" ? 4.8 : Math.max(13, sp.sz)) *
                    S * plumScale,
                rotation: rand(0, 6.28),
                tint: sp.tint,
                profile: sp.profile,
                pose: sp.pose,
                t0: tS,
                t1: tS + 0.34,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });

        // 桌面端「疏可跑马」探空铁梢：分别沿搜索框右侧高空与搜索框下方留白横逸，100% 避让搜索框
        if (!isNarrow) {
            const skyPlums = [
                {
                    parent: seg2,
                    u: 0.78,
                    endX: w - 345 * S,
                    endY: Math.max(85, h - 605 * S),
                    tSpan: 0.22,
                    minRightSide: true,
                },
                {
                    parent: seg3,
                    u: 0.76,
                    endX: tip.x - 145 * S,
                    endY: Math.max(438 * S, tip.y - 38 * S),
                    tSpan: 0.20,
                    minRightSide: false,
                },
            ];
            skyPlums.forEach((sp, si) => {
                const pIdx = Math.round(sp.u * (sp.parent.points.length - 1));
                const anc = sp.parent.points[pIdx];
                const endPt = { x: sp.endX, y: sp.endY };
                const ts = lerp(sp.parent.t0, sp.parent.t1, sp.u);
                const cp1X = sp.minRightSide
                    ? Math.max(w - 365 * S, lerp(anc.x, endPt.x, 0.38) + 8 * S)
                    : lerp(anc.x, endPt.x, 0.38) - 18 * S;
                const cp2X = sp.minRightSide
                    ? Math.max(w - 365 * S, lerp(anc.x, endPt.x, 0.72) - 4 * S)
                    : lerp(anc.x, endPt.x, 0.72) + 10 * S;
                const cp1Y = sp.minRightSide
                    ? lerp(anc.y, endPt.y, 0.38) - 18 * S
                    : Math.max(434 * S, lerp(anc.y, endPt.y, 0.38) - 14 * S);
                const cp2Y = sp.minRightSide
                    ? lerp(anc.y, endPt.y, 0.72) - 8 * S
                    : Math.max(434 * S, lerp(anc.y, endPt.y, 0.72) - 6 * S);
                const skyTwig = sampleBranch(
                    { x: anc.x, y: anc.y },
                    { x: cp1X, y: cp1Y },
                    { x: cp2X, y: cp2Y },
                    endPt,
                    {
                        steps: 18,
                        widthStart: 1.15 * S,
                        widthEnd: 0.26 * S,
                        t0: ts,
                        t1: ts + sp.tSpan,
                        flexSpan: 0.62,
                        phase: 1.8 + si,
                        wobble: 0.8 * S,
                        parentRef: { branch: sp.parent, idx: pIdx },
                    },
                    rng,
                );
                branches.push(skyTwig);
                [0.88, 0.99].forEach((bu, bi) => {
                    ornaments.push({
                        kind: "plumBud",
                        ghost: false,
                        branch: skyTwig,
                        idx: Math.round(bu * (skyTwig.points.length - 1)),
                        angleOffset: bi === 0 ? -0.45 : 0.12,
                        size: (4.6 - bi * 0.6) * S,
                        rotation: rand(0, 6.28),
                        tint: "accent",
                        profile: false,
                        t0: skyTwig.t1 - 0.02 + bi * 0.04,
                        t1: skyTwig.t1 + 0.26 + bi * 0.04,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                });
            });
        }
    } else if (species === "fern") {
        const fernScale = isNarrow ? 0.85 : 1;
        interface FernFrondConfig {
            ghost: boolean;
            role: "ghost" | "companion" | "hero";
            len: number;
            rx: number;
            tx: number;
            ty: number;
            pairs: number;
            pinnaBase: number;
            tipLen: number;
            t0: number;
            t1Span: number;
            c1x: number;
            c1y: number;
            c2x: number;
            c2y: number;
        }
        const configs: FernFrondConfig[] = isNarrow
            ? [
                {
                    ghost: true,
                    role: "ghost",
                    len: 265,
                    rx: 4,
                    tx: 118,
                    ty: 0.88,
                    pairs: 4,
                    pinnaBase: 54,
                    tipLen: 36,
                    t0: 0.10,
                    t1Span: 0.52,
                    c1x: 16,
                    c1y: 0.58,
                    c2x: 68,
                    c2y: 24,
                },
                {
                    ghost: false,
                    role: "hero",
                    len: 318,
                    rx: 18,
                    tx: 278,
                    ty: 0.66,
                    pairs: 6,
                    pinnaBase: 76,
                    tipLen: 54,
                    t0: 0.00,
                    t1Span: 0.54,
                    c1x: 24,
                    c1y: 0.56,
                    c2x: 96,
                    c2y: 34,
                },
            ]
            : [
                {
                    ghost: true,
                    role: "ghost",
                    len: 500,
                    rx: 8,
                    tx: 105,
                    ty: 0.93,
                    pairs: 4,
                    pinnaBase: 86,
                    tipLen: 56,
                    t0: 0.08,
                    t1Span: 0.52,
                    c1x: 16,
                    c1y: 0.60,
                    c2x: 78,
                    c2y: 32,
                },
                {
                    ghost: false,
                    role: "companion",
                    len: 555,
                    rx: 34,
                    tx: 190,
                    ty: 0.90,
                    pairs: 5,
                    pinnaBase: 102,
                    tipLen: 74,
                    t0: 0.10,
                    t1Span: 0.52,
                    c1x: 16,
                    c1y: 0.62,
                    c2x: 88,
                    c2y: 34,
                },
                {
                    ghost: false,
                    role: "hero",
                    len: archetype === 1 ? 670 : archetype === 2 ? 610 : 640,
                    rx: archetype === 1 ? 82 : archetype === 2 ? 112 : 96,
                    tx: archetype === 1 ? 445 : archetype === 2 ? 515 : 482,
                    ty: archetype === 1 ? 0.71 : archetype === 2 ? 0.61 : 0.66,
                    pairs: 6,
                    pinnaBase: 142,
                    tipLen: 94,
                    t0: 0.00,
                    t1Span: 0.54,
                    c1x: 42,
                    c1y: 0.58,
                    c2x: 182,
                    c2y: 62,
                },
            ];

        configs.forEach((cfg, ci) => {
            const len = cfg.len * S;
            const p0 = {
                x: rootX - cfg.rx * S,
                y: isNarrow ? rootY + 4 * S : rootY + 14 * S,
            };
            const p3 = {
                x: w - cfg.tx * S * rand(0.97, 1.03),
                y: (isNarrow ? rootY : h) - len * cfg.ty,
            };
            const p1 = {
                x: p0.x - cfg.c1x * S,
                y: p0.y - len * cfg.c1y,
            };
            const p2 = {
                x: p3.x + cfg.c2x * S,
                y: p3.y - cfg.c2y * S,
            };

            const frond = sampleBranch(
                p0,
                p1,
                p2,
                p3,
                {
                    steps: 46,
                    widthStart: (cfg.ghost ? 1.12 : 1.78) * S,
                    widthEnd: 0.40 * S,
                    t0: cfg.t0,
                    t1: cfg.t0 + cfg.t1Span,
                    flexSpan: 1.16,
                    phase: ci * 1.4,
                    waveLag: 1.9,
                    ghost: cfg.ghost,
                    wobble: 0.68 * S * fernScale,
                },
                rng,
            );
            branches.push(frond);

            const isHero = cfg.role === "hero";
            for (let i = 1; i <= cfg.pairs; i++) {
                const rawT = i / cfg.pairs;
                const easedT = 1 - Math.pow(1 - rawT, 1.15);
                const u = lerp(0.28, 0.90, easedT);
                const idx = Math.round(u * (frond.points.length - 1));
                const env = Math.sin(Math.pow(u, 0.68) * Math.PI);
                const pinnaLenBase = cfg.pinnaBase * S * (0.28 + env * 0.80);
                const ts = lerp(frond.t0, frond.t1, u) + 0.02;

                for (const side of [-1, 1] as const) {
                    const jIdx = clamp(
                        idx + (side > 0 ? 0 : -1),
                        2,
                        frond.points.length - 2,
                    );
                    const isUpperSide = side > 0;
                    const sideScale = isUpperSide ? 0.86 : 1.06;
                    const actualLen = pinnaLenBase * sideScale *
                        rand(0.94, 1.06);

                    // Five-shades-of-ink tonal contrast + restrained accent/sub highlights
                    const isFolded = !cfg.ghost &&
                        ((isHero && ((i === 2 && side === -1) ||
                            (i === 4 && side === 1) ||
                            (i === 5 && side === -1))) ||
                            (cfg.role === "companion" &&
                                ((i === 2 && side === 1) ||
                                    (i === 4 && side === -1))));
                    const isAccent = !cfg.ghost && isUpperSide &&
                        ((isHero && (i === 4 || i === 6)) ||
                            (cfg.role === "companion" && i === 4));
                    const isSub = !cfg.ghost && !isAccent &&
                        ((isHero && side === -1 && i === 5) ||
                            (cfg.role === "companion" && isUpperSide &&
                                i === 3));
                    const tint: TintRole = isAccent
                        ? "accent"
                        : isSub
                        ? "sub"
                        : "ink";

                    const inkWeight = cfg.role === "companion"
                        ? rand(0.68, 0.92)
                        : (i + (side > 0 ? 0 : 1)) % 2 === 0
                        ? rand(1.06, 1.24)
                        : rand(0.72, 0.88);

                    const angleSweep = lerp(0.84, 0.30, u) *
                        (isUpperSide ? 0.92 : 1.06);

                    ornaments.push({
                        kind: "fernPinna",
                        ghost: cfg.ghost,
                        branch: frond,
                        idx: jIdx,
                        side,
                        angleOffset: side * angleSweep,
                        len: actualLen,
                        width: actualLen * (isFolded ? 0.115 : 0.105),
                        curve: side * (-0.19 - (isUpperSide ? 0 : 0.05)),
                        inkWeight,
                        whip: side * (0.06 + (i % 2) * 0.04),
                        feibai: !cfg.ghost && !isFolded && actualLen >= 62 * S,
                        tint,
                        profile: isFolded,
                        t0: ts,
                        t1: ts + 0.26,
                        phase: u * 4.2 + side * 0.35 + ci * 0.7,
                        push: 0,
                        vel: 0,
                    });
                }
            }

            ornaments.push({
                kind: "fernPinna",
                ghost: cfg.ghost,
                branch: frond,
                idx: frond.points.length - 1,
                side: 1,
                angleOffset: 0.03,
                len: cfg.tipLen * S * fernScale,
                width: cfg.tipLen * 0.095 * S * fernScale,
                curve: -0.11,
                inkWeight: isHero ? 1.05 : 0.90,
                whip: 0.08,
                feibai: false,
                tint: cfg.ghost ? "sub" : "accent",
                profile: false,
                t0: frond.t1 - 0.04,
                t1: frond.t1 + 0.24,
                phase: ci + 2.4,
                push: 0,
                vel: 0,
            });
        });
        if (!isNarrow) {
            const fBaseX = rootX - 18 * S;
            const fBaseY = h + 8 * S;
            rocks.push(
                {
                    points: [
                        { x: fBaseX + 26 * S, y: fBaseY },
                        { x: fBaseX - 165 * S, y: fBaseY },
                        { x: fBaseX - 132 * S, y: fBaseY - 38 * S },
                        { x: fBaseX - 72 * S, y: fBaseY - 56 * S },
                        { x: fBaseX - 18 * S, y: fBaseY - 40 * S },
                        { x: fBaseX + 26 * S, y: fBaseY - 22 * S },
                    ],
                    mossDots: [
                        {
                            x: fBaseX - 122 * S,
                            y: fBaseY - 36 * S,
                            rx: 4.2 * S,
                            ry: 1.9 * S,
                            rot: -0.25,
                        },
                        {
                            x: fBaseX - 74 * S,
                            y: fBaseY - 54 * S,
                            rx: 3.6 * S,
                            ry: 1.6 * S,
                            rot: -0.1,
                        },
                        {
                            x: fBaseX - 62 * S,
                            y: fBaseY - 49 * S,
                            rx: 2.5 * S,
                            ry: 1.2 * S,
                            rot: 0.15,
                        },
                    ],
                    t0: 0.0,
                    t1: 0.28,
                },
            );
        }
    } else if (species === "orchid") {
        // Spring orchid: 2-tier slope rocks & moss clump + calligraphic twisted leaves + arched scape
        const orchidScale = isNarrow ? 0.86 : 1;
        const rBaseX = isNarrow ? w - 8 * S : rootX - 18 * S;
        const rBaseY = isNarrow ? rootY + 6 * S : h + 8 * S;
        if (isNarrow) {
            rocks.push(
                {
                    points: [
                        { x: rBaseX + 14 * S, y: rBaseY },
                        { x: rBaseX - 110 * S, y: rBaseY },
                        { x: rBaseX - 84 * S, y: rBaseY - 26 * S },
                        { x: rBaseX - 36 * S, y: rBaseY - 40 * S },
                        { x: rBaseX + 14 * S, y: rBaseY - 20 * S },
                    ],
                    mossDots: [
                        {
                            x: rBaseX - 78 * S,
                            y: rBaseY - 24 * S,
                            rx: 3.4 * S,
                            ry: 1.5 * S,
                            rot: -0.2,
                        },
                        {
                            x: rBaseX - 42 * S,
                            y: rBaseY - 36 * S,
                            rx: 2.8 * S,
                            ry: 1.3 * S,
                            rot: 0.1,
                        },
                        {
                            x: rBaseX - 31 * S,
                            y: rBaseY - 32 * S,
                            rx: 2.0 * S,
                            ry: 1.0 * S,
                            rot: 0.25,
                        },
                    ],
                    t0: 0.0,
                    t1: 0.28,
                },
                {
                    points: [
                        { x: rBaseX - 65 * S, y: rBaseY },
                        { x: rBaseX - 148 * S, y: rBaseY },
                        { x: rBaseX - 126 * S, y: rBaseY - 18 * S },
                        { x: rBaseX - 82 * S, y: rBaseY - 22 * S },
                        { x: rBaseX - 65 * S, y: rBaseY - 10 * S },
                    ],
                    mossDots: [
                        {
                            x: rBaseX - 118 * S,
                            y: rBaseY - 16 * S,
                            rx: 2.4 * S,
                            ry: 1.1 * S,
                            rot: -0.15,
                        },
                    ],
                    t0: 0.04,
                    t1: 0.30,
                },
            );
        } else {
            rocks.push(
                {
                    points: [
                        { x: rBaseX + 28 * S, y: rBaseY },
                        { x: rBaseX - 195 * S, y: rBaseY },
                        { x: rBaseX - 158 * S, y: rBaseY - 42 * S },
                        { x: rBaseX - 96 * S, y: rBaseY - 68 * S },
                        { x: rBaseX - 28 * S, y: rBaseY - 52 * S },
                        { x: rBaseX + 28 * S, y: rBaseY - 28 * S },
                    ],
                    mossDots: [
                        {
                            x: rBaseX - 146 * S,
                            y: rBaseY - 39 * S,
                            rx: 4.8 * S,
                            ry: 2.1 * S,
                            rot: -0.25,
                        },
                        {
                            x: rBaseX - 98 * S,
                            y: rBaseY - 64 * S,
                            rx: 4.2 * S,
                            ry: 1.8 * S,
                            rot: -0.1,
                        },
                        {
                            x: rBaseX - 84 * S,
                            y: rBaseY - 58 * S,
                            rx: 3.1 * S,
                            ry: 1.4 * S,
                            rot: 0.15,
                        },
                        {
                            x: rBaseX - 38 * S,
                            y: rBaseY - 48 * S,
                            rx: 3.4 * S,
                            ry: 1.5 * S,
                            rot: 0.2,
                        },
                    ],
                    t0: 0.0,
                    t1: 0.28,
                },
                {
                    points: [
                        { x: rBaseX - 120 * S, y: rBaseY },
                        { x: rBaseX - 275 * S, y: rBaseY },
                        { x: rBaseX - 235 * S, y: rBaseY - 28 * S },
                        { x: rBaseX - 168 * S, y: rBaseY - 42 * S },
                        { x: rBaseX - 120 * S, y: rBaseY - 18 * S },
                    ],
                    mossDots: [
                        {
                            x: rBaseX - 222 * S,
                            y: rBaseY - 26 * S,
                            rx: 3.6 * S,
                            ry: 1.6 * S,
                            rot: -0.2,
                        },
                        {
                            x: rBaseX - 176 * S,
                            y: rBaseY - 38 * S,
                            rx: 2.8 * S,
                            ry: 1.3 * S,
                            rot: 0.1,
                        },
                    ],
                    t0: 0.05,
                    t1: 0.32,
                },
            );
        }

        const bladeCfgs = isNarrow
            ? [
                {
                    ghost: true,
                    midground: false,
                    rx: 12,
                    tx: 105,
                    len: 175,
                    c1x: 18,
                    c2x: 44,
                    curve: -0.22,
                    w: 6.4,
                    twistU: 0.56,
                },
                {
                    ghost: false,
                    midground: false,
                    rx: 18,
                    tx: 235,
                    len: 215,
                    c1x: 24,
                    c2x: 84,
                    curve: -0.26,
                    w: 7.4,
                    twistU: 0.52,
                },
                {
                    ghost: false,
                    midground: false,
                    rx: 52,
                    tx: 315,
                    len: 235,
                    c1x: 42,
                    c2x: 112,
                    curve: -0.18,
                    w: 7.8,
                    twistU: 0.60,
                },
                {
                    ghost: false,
                    midground: true,
                    rx: 86,
                    tx: 165,
                    len: 165,
                    c1x: 16,
                    c2x: 52,
                    curve: 0.14,
                    w: 6.2,
                    twistU: 0.48,
                },
            ]
            : [
                {
                    ghost: true,
                    midground: false,
                    rx: 18,
                    tx: 135,
                    len: 410,
                    c1x: 22,
                    c2x: 78,
                    curve: -0.22,
                    w: 9.2,
                    twistU: 0.58,
                },
                {
                    ghost: false,
                    midground: true,
                    rx: 38,
                    tx: 325,
                    len: 495,
                    c1x: 34,
                    c2x: 158,
                    curve: -0.26,
                    w: 10.6,
                    twistU: 0.52,
                },
                {
                    ghost: false,
                    midground: false,
                    rx: 88,
                    tx: 520,
                    len: 545,
                    c1x: 68,
                    c2x: 212,
                    curve: -0.18,
                    w: 12.2,
                    twistU: 0.60,
                },
                {
                    ghost: false,
                    midground: false,
                    rx: 134,
                    tx: 390,
                    len: 405,
                    c1x: 42,
                    c2x: 142,
                    curve: -0.14,
                    w: 10.0,
                    twistU: 0.46,
                },
                {
                    ghost: false,
                    midground: false,
                    rx: 60,
                    tx: 210,
                    len: 365,
                    c1x: 22,
                    c2x: 84,
                    curve: 0.15,
                    w: 9.2,
                    twistU: 0.64,
                },
                // 桌面端新增一叶低垂破边细叶丰富「凤眼」穿插
                {
                    ghost: false,
                    midground: false,
                    rx: 152,
                    tx: 615,
                    len: 340,
                    c1x: 88,
                    c2x: 165,
                    curve: 0.22,
                    w: 8.6,
                    twistU: 0.44,
                },
            ];
        bladeCfgs.forEach((cfg, bi) => {
            const len = cfg.len * S * orchidScale;
            const p0 = {
                x: rootX - cfg.rx * S,
                y: isNarrow ? rootY + 2 * S : rootY - 12 * S,
            };
            const p3 = {
                x: w - cfg.tx * S,
                y: (isNarrow ? rootY : h) - len * (isNarrow ? 0.84 : 0.72),
            };
            const leafBranch = sampleBranch(
                p0,
                { x: p0.x - cfg.c1x * S, y: p0.y - len * 0.54 },
                {
                    x: p3.x + cfg.c2x * S,
                    y: p3.y - 26 * S * (cfg.curve < 0 ? 1 : -0.5),
                },
                p3,
                {
                    steps: 36,
                    widthStart: cfg.w * 0.92 * S,
                    widthEnd: 0.35 * S,
                    t0: cfg.ghost ? 0.10 : bi * 0.04,
                    t1: 0.48 + bi * 0.04,
                    flexSpan: 1.15,
                    phase: bi * 1.1,
                    waveLag: 1.6,
                    ghost: cfg.ghost,
                    midground: cfg.midground,
                    brushStyle: "orchid-blade",
                    twistU: cfg.twistU,
                    wobble: 0.8 * S,
                },
                rng,
            );
            branches.push(leafBranch);
        });

        // Graceful arched flower scape
        const scapeP0 = {
            x: rootX - (isNarrow ? 42 : 76) * S,
            y: isNarrow ? rootY + 2 * S : rootY - 10 * S,
        };
        const scapeP3 = isNarrow ? { x: w - 265 * S, y: rootY - 215 * S } : {
            x: w - (archetype === 1 ? 375 : archetype === 2 ? 465 : 425) * S,
            y: h - (archetype === 1 ? 525 : archetype === 2 ? 445 : 485) * S,
        };
        const scape = sampleBranch(
            scapeP0,
            {
                x: scapeP0.x - (isNarrow ? 26 : 44) * S,
                y: scapeP0.y - (isNarrow ? 125 : 265) * S,
            },
            {
                x: scapeP3.x + (isNarrow ? 55 : 95) * S,
                y: scapeP3.y - (isNarrow ? 18 : 34) * S,
            },
            scapeP3,
            {
                steps: 36,
                widthStart: 1.55 * S,
                widthEnd: 0.45 * S,
                t0: 0.08,
                t1: 0.54,
                flexSpan: 1.08,
                phase: 2.1,
                wobble: 0.7 * S,
            },
            rng,
        );
        branches.push(scape);
        const orchidSpots = solar.termIndex >= 4 && solar.termIndex <= 8
            ? [
                { u: 0.46, ang: -0.48, sz: 21, tint: "sub" as TintRole },
                { u: 0.64, ang: 0.42, sz: 25, tint: "accent" as TintRole },
                { u: 0.82, ang: -0.32, sz: 23, tint: "sub" as TintRole },
                { u: 0.97, ang: 0.14, sz: 19, tint: "accent" as TintRole },
            ]
            : [
                { u: 0.56, ang: -0.45, sz: 22, tint: "sub" as TintRole },
                { u: 0.78, ang: 0.42, sz: 25, tint: "accent" as TintRole },
                { u: 0.96, ang: -0.15, sz: 20, tint: "accent" as TintRole },
            ];
        orchidSpots.forEach((fl, fi) => {
            const idx = Math.round(fl.u * (scape.points.length - 1));
            const ts = lerp(scape.t0, scape.t1, fl.u) + 0.06;
            ornaments.push({
                kind: "orchidBlossom",
                ghost: false,
                branch: scape,
                idx,
                angleOffset: fl.ang,
                size: fl.sz * S * orchidScale,
                rotation: rand(-0.35, 0.35),
                tint: fl.tint,
                profile: fi === orchidSpots.length - 1,
                t0: ts,
                t1: ts + 0.32,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });
        // 花葶顶端含苞兰蕾与中段主花形成主次呼应
        ornaments.push({
            kind: "orchidBlossom",
            ghost: false,
            branch: scape,
            idx: scape.points.length - 1,
            angleOffset: 0.06,
            size: 12 * S * orchidScale,
            rotation: -0.18,
            tint: "accent",
            profile: true,
            t0: scape.t1 - 0.02,
            t1: scape.t1 + 0.28,
            phase: rand(0, 6.28),
            push: 0,
            vel: 0,
        });
    } else if (species === "bamboo") {
        // Summer bamboo: segmented upright culms piercing top edge on wide desktop ("竹不见梢")
        const bambooScale = isNarrow ? 0.85 : 1;
        const pierceTop = !isNarrow && !embedded;
        const culms = isNarrow
            ? [
                {
                    ghost: true,
                    midground: false,
                    rx: 14,
                    tx: 108,
                    topY: rootY - 215 * S,
                    w0: 1.85,
                    nodes: [0.28, 0.58, 0.86],
                    t0: 0.12,
                },
                {
                    ghost: false,
                    midground: false,
                    rx: 54,
                    tx: 185,
                    topY: rootY - 245 * S,
                    w0: 3.8,
                    nodes: [0.22, 0.46, 0.70, 0.90],
                    t0: 0.0,
                },
                {
                    ghost: false,
                    midground: false,
                    rx: 96,
                    tx: 272,
                    topY: rootY - 210 * S,
                    w0: 2.8,
                    nodes: [0.26, 0.54, 0.82],
                    t0: 0.08,
                },
            ]
            : [
                {
                    ghost: true,
                    midground: false,
                    rx: 22,
                    tx: 165,
                    topY: pierceTop ? h - 540 * S : Math.max(54, h - 460 * S),
                    w0: 2.3,
                    nodes: [0.24, 0.48, 0.72, 0.92],
                    t0: 0.12,
                },
                {
                    ghost: false,
                    midground: false,
                    rx: archetype === 1 ? 84 : archetype === 2 ? 124 : 108,
                    tx: pierceTop
                        ? (archetype === 1 ? 335 : archetype === 2 ? 260 : 295)
                        : 265,
                    topY: pierceTop ? -26 * S : 52,
                    w0: 5.6,
                    nodes: [0.16, 0.34, 0.52, 0.70, 0.86],
                    t0: 0.0,
                },
                {
                    ghost: false,
                    midground: true,
                    rx: archetype === 1 ? 155 : archetype === 2 ? 215 : 190,
                    tx: pierceTop
                        ? (archetype === 1 ? 390 : archetype === 2 ? 325 : 365)
                        : 345,
                    topY: pierceTop ? -10 * S : Math.max(60, h - 520 * S),
                    w0: 3.8,
                    nodes: [0.20, 0.42, 0.66, 0.86],
                    t0: 0.08,
                },
            ];

        culms.forEach((cfg, ci) => {
            const p0 = {
                x: rootX - cfg.rx * S,
                y: isNarrow ? rootY + 2 * S : rootY + 12 * S,
            };
            const p3 = {
                x: w - cfg.tx * S,
                y: cfg.topY,
            };
            const culm = sampleBranch(
                p0,
                {
                    x: lerp(p0.x, p3.x, 0.32) - 8 * S,
                    y: lerp(p0.y, p3.y, 0.35),
                },
                {
                    x: lerp(p0.x, p3.x, 0.68) + 10 * S,
                    y: lerp(p0.y, p3.y, 0.68),
                },
                p3,
                {
                    steps: 42,
                    widthStart: cfg.w0 * S,
                    widthEnd: cfg.w0 * 0.40 * S,
                    t0: cfg.t0,
                    t1: cfg.t0 + 0.44,
                    flexSpan: 0.65,
                    phase: ci * 1.1,
                    ghost: cfg.ghost,
                    midground: cfg.midground,
                    bambooNodes: cfg.nodes,
                },
                rng,
            );
            branches.push(culm);

            cfg.nodes.forEach((nu, ni) => {
                if (ni === 0 && !cfg.ghost) return;
                const pIdx = Math.round(nu * (culm.points.length - 1));
                const anc = culm.points[pIdx];
                const dir = (ni + ci) % 2 === 0 ? -1 : 1;
                const twigAng = anc.angle + dir * rand(0.55, 0.82);
                const twigLen = (isNarrow ? 64 : 122) * S * (1 - nu * 0.22);
                const tp3 = {
                    x: anc.x + Math.cos(twigAng) * twigLen,
                    y: anc.y + Math.sin(twigAng) * twigLen,
                };
                const ts = lerp(culm.t0, culm.t1, nu);
                const twig = sampleBranch(
                    { x: anc.x, y: anc.y },
                    {
                        x: lerp(anc.x, tp3.x, 0.4),
                        y: lerp(anc.y, tp3.y, 0.4) - 6 * S,
                    },
                    {
                        x: lerp(anc.x, tp3.x, 0.75),
                        y: lerp(anc.y, tp3.y, 0.75) + 4 * S,
                    },
                    tp3,
                    {
                        steps: 14,
                        widthStart: 1.05 * S,
                        widthEnd: 0.35 * S,
                        t0: ts,
                        t1: ts + 0.18,
                        flexSpan: 0.48,
                        phase: ni * 0.9 + ci,
                        ghost: cfg.ghost,
                        midground: cfg.midground,
                        parentRef: { branch: culm, idx: pIdx },
                    },
                    rng,
                );
                branches.push(twig);

                // 惊风撇竹 · 个介错节叠叶：错落着生于 0.52 / 0.76 / 1.0 小节，顺风向左下披拂（不对称）
                const leafCluster = cfg.ghost
                    ? [
                        {
                            uSpot: 0.72,
                            ang: -0.32,
                            len: 44,
                            curve: 0.14,
                            tint: "ink" as TintRole,
                        },
                        {
                            uSpot: 1.0,
                            ang: 0.28,
                            len: 38,
                            curve: -0.10,
                            tint: ni === cfg.nodes.length - 1
                                ? "sub" as TintRole
                                : "ink" as TintRole,
                        },
                    ]
                    : cfg.midground
                    ? [
                        {
                            uSpot: 0.58,
                            ang: -0.46,
                            len: 42,
                            curve: 0.15,
                            tint: "ink" as TintRole,
                        },
                        {
                            uSpot: 0.82,
                            ang: -0.06,
                            len: 56,
                            curve: 0.10,
                            tint: "ink" as TintRole,
                        },
                        {
                            uSpot: 1.0,
                            ang: 0.22,
                            len: 48,
                            curve: 0.08,
                            tint: ni % 2 === 0
                                ? "sub" as TintRole
                                : "ink" as TintRole,
                        },
                        {
                            uSpot: 1.0,
                            ang: 0.44,
                            len: 38,
                            curve: 0.14,
                            tint: "ink" as TintRole,
                        },
                    ]
                    : [
                        {
                            uSpot: 0.52,
                            ang: -0.56,
                            len: 40,
                            curve: -0.14,
                            tint: "ink" as TintRole,
                        },
                        {
                            uSpot: 0.76,
                            ang: -0.10,
                            len: 74,
                            curve: 0.12,
                            tint: "ink" as TintRole,
                        },
                        {
                            uSpot: 0.76,
                            ang: 0.24,
                            len: 58,
                            curve: 0.16,
                            tint: ni % 2 === 0
                                ? "sub" as TintRole
                                : "ink" as TintRole,
                        },
                        {
                            uSpot: 1.0,
                            ang: 0.06,
                            len: 52,
                            curve: 0.11,
                            tint: (ni === cfg.nodes.length - 1)
                                ? "accent" as TintRole
                                : "ink" as TintRole,
                        },
                        {
                            uSpot: 1.0,
                            ang: 0.34,
                            len: 48,
                            curve: 0.18,
                            tint: "ink" as TintRole,
                        },
                        ...(ni % 2 === 1
                            ? [{
                                uSpot: 0.52,
                                ang: 0.22,
                                len: 38,
                                curve: 0.09,
                                tint: "ink" as TintRole,
                            }]
                            : []),
                    ];
                leafCluster.forEach((lf, li) => {
                    const spotIdx = Math.round(
                        lf.uSpot * (twig.points.length - 1),
                    );
                    ornaments.push({
                        kind: "bambooLeaf",
                        ghost: cfg.ghost,
                        midground: cfg.midground,
                        branch: twig,
                        idx: spotIdx,
                        angleOffset: lf.ang + rand(-0.06, 0.06),
                        len: lf.len * S * bambooScale,
                        width: 6.4 * S * bambooScale,
                        curve: lf.curve,
                        feibai: !cfg.ghost && !cfg.midground && li === 1,
                        tint: lf.tint,
                        profile: false,
                        t0: twig.t1 - 0.04 + li * 0.03,
                        t1: twig.t1 + 0.22 + li * 0.03,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                });
            });
        });
    } else if (species === "maple") {
        // Autumn maple: 桌面端高崖横柯零穿插避让搜索框 / 窄屏保持侧生古干
        const mapleScale = isNarrow ? 0.84 : 1;
        const mainP0 = isNarrow ? { x: rootX - 6 * S, y: rootY - 12 * S } : {
            x: rootX + 18 * S,
            y: (embedded ? Math.max(56, 92 * S) : Math.max(68 * S, h * 0.085)) +
                topShift,
        };
        const mainP3 = isNarrow ? { x: w - 265 * S, y: rootY - 195 * S } : {
            x: w -
                rand(archetype === 1 ? 335 : 380, archetype === 1 ? 380 : 425) *
                    S,
            y: embedded
                ? 275 * S
                : h * (archetype === 1 ? 0.27 : archetype === 2 ? 0.35 : 0.31),
        };
        const main = sampleBranch(
            mainP0,
            isNarrow
                ? { x: mainP0.x - 55 * S, y: mainP0.y - 95 * S }
                : { x: mainP0.x - 140 * S, y: mainP0.y + 24 * S },
            isNarrow
                ? { x: mainP3.x + 85 * S, y: mainP3.y + 24 * S }
                : { x: mainP3.x + 125 * S, y: mainP3.y - 36 * S },
            mainP3,
            {
                steps: 42,
                widthStart: (isNarrow ? 4.8 : 8.2) * S,
                widthEnd: 0.66 * S,
                t0: 0.0,
                t1: 0.48,
                flexSpan: 0.72,
                phase: 0.4,
                wobble: 1.8 * S,
            },
            rng,
        );
        branches.push(main);

        const subCfgs = isNarrow
            ? [
                { u: 0.34, ang: -1.95, len: 108 * S },
                { u: 0.62, ang: -1.42, len: 92 * S },
                { u: 0.82, ang: -2.45, len: 74 * S },
            ]
            : [
                { u: 0.26, ang: 2.02, len: 225 * S },
                { u: 0.56, ang: -2.82, len: 185 * S },
                { u: 0.84, ang: 1.72, len: 165 * S },
            ];
        subCfgs.forEach((sc, si) => {
            const pIdx = Math.round(sc.u * (main.points.length - 1));
            const anc = main.points[pIdx];
            const sp3 = {
                x: anc.x + Math.cos(sc.ang) * sc.len,
                y: isNarrow
                    ? anc.y + Math.sin(sc.ang) * sc.len
                    : Math.max(54, anc.y + Math.sin(sc.ang) * sc.len),
            };
            const ts = lerp(main.t0, main.t1, sc.u);
            const sub = sampleBranch(
                { x: anc.x, y: anc.y },
                {
                    x: lerp(anc.x, sp3.x, 0.38) - 10 * S,
                    y: Math.max(
                        54,
                        lerp(anc.y, sp3.y, 0.38) - (isNarrow ? 12 : 4) * S,
                    ),
                },
                {
                    x: lerp(anc.x, sp3.x, 0.72) + 8 * S,
                    y: Math.max(
                        54,
                        lerp(anc.y, sp3.y, 0.72) + 6 * S,
                    ),
                },
                sp3,
                {
                    steps: 20,
                    widthStart: (isNarrow ? 1.85 : 2.55) * S,
                    widthEnd: 0.5 * S,
                    t0: ts,
                    t1: ts + 0.22,
                    flexSpan: 0.54,
                    phase: si * 1.1,
                    wobble: 1.1 * S,
                    parentRef: { branch: main, idx: pIdx },
                },
                rng,
            );
            branches.push(sub);

            const leafOffsets = [
                { u: 0.36, ang: -0.62, sz: 24, rot: -0.25, profile: true },
                { u: 0.56, ang: 0.38, sz: 31, rot: 0.18, profile: false },
                { u: 0.84, ang: -0.42, sz: 28, rot: -0.14, profile: false },
                {
                    u: 0.97,
                    ang: 0.22,
                    sz: 35,
                    rot: 0.22,
                    profile: si % 2 === 1,
                },
            ];
            leafOffsets.forEach((lf, li) => {
                const lIdx = Math.round(lf.u * (sub.points.length - 1));
                const lt = lerp(sub.t0, sub.t1, lf.u) + 0.03;
                const mapleTint: TintRole = solar.phenologyStage === "frost"
                    ? ((si + li) % 4 === 0
                        ? "ink"
                        : (si + li) % 3 === 0
                        ? "sub"
                        : "accent")
                    : (si + li) % 3 === 0
                    ? "accent"
                    : (si + li) % 2 === 0
                    ? "sub"
                    : "ink";
                ornaments.push({
                    kind: "mapleLeaf",
                    ghost: false,
                    branch: sub,
                    idx: lIdx,
                    angleOffset: lf.ang + rand(-0.12, 0.12),
                    size: lf.sz * rand(0.90, 1.12) * S * mapleScale,
                    stemLen: rand(10, 14) * S * mapleScale,
                    rotation: lf.rot + rand(-0.2, 0.2),
                    tint: mapleTint,
                    profile: lf.profile,
                    t0: lt,
                    t1: lt + 0.32,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });
        });

        [0.44, 0.68, 0.88, 1.0].forEach((u, mi) => {
            const mIdx = Math.round(u * (main.points.length - 1));
            ornaments.push({
                kind: "mapleLeaf",
                ghost: false,
                branch: main,
                idx: mIdx,
                angleOffset: mi % 2 === 0 ? -0.52 : 0.24,
                size: (mi === 3 ? 38 : mi === 1 ? 32 : 26) * S * mapleScale,
                stemLen: 12 * S * mapleScale,
                rotation: rand(-0.3, 0.3),
                tint: mi === 3 || mi === 0
                    ? "accent"
                    : mi === 1
                    ? "ink"
                    : "sub",
                profile: mi === 1,
                t0: main.t1 - 0.08 + mi * 0.04,
                t1: main.t1 + 0.26 + mi * 0.04,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });

        // Wide midground companion maple bough for layered canopy depth (kept clear of search zone)
        if (!isNarrow) {
            const midP0 = { x: rootX + 12 * S, y: mainP0.y + 135 * S };
            const midP3 = {
                x: w - rand(240, 280) * S,
                y: mainP0.y + 285 * S,
            };
            const midMaple = sampleBranch(
                midP0,
                { x: midP0.x - 105 * S, y: midP0.y + 36 * S },
                { x: midP3.x + 110 * S, y: midP3.y - 42 * S },
                midP3,
                {
                    steps: 28,
                    widthStart: 3.2 * S,
                    widthEnd: 0.55 * S,
                    t0: 0.14,
                    t1: 0.56,
                    flexSpan: 0.82,
                    phase: 1.7,
                    midground: true,
                    wobble: 1.2 * S,
                },
                rng,
            );
            branches.push(midMaple);
            [0.48, 0.74, 0.96].forEach((mu, mi) => {
                const mIdx = Math.round(mu * (midMaple.points.length - 1));
                ornaments.push({
                    kind: "mapleLeaf",
                    ghost: false,
                    midground: true,
                    branch: midMaple,
                    idx: mIdx,
                    angleOffset: mi === 1 ? 0.42 : -0.48,
                    size: rand(24, 32) * S,
                    stemLen: 10 * S,
                    rotation: rand(-0.3, 0.3),
                    tint: mi === 2 ? "accent" : "sub",
                    profile: mi === 0,
                    t0: lerp(midMaple.t0, midMaple.t1, mu) + 0.04,
                    t1: lerp(midMaple.t0, midMaple.t1, mu) + 0.32,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });

            // 红枫主干中上段繁叶画眼簇（红黄墨三色层叠）+ 高空探空独叶细梢
            const focalIdx = Math.round(0.42 * (main.points.length - 1));
            const focalT = lerp(main.t0, main.t1, 0.42) + 0.04;
            [
                { ang: -0.78, sz: 34, tint: "accent" as TintRole, mid: false },
                { ang: -0.22, sz: 28, tint: "sub" as TintRole, mid: true },
                { ang: 0.52, sz: 30, tint: "ink" as TintRole, mid: false },
            ].forEach((fl, li) => {
                ornaments.push({
                    kind: "mapleLeaf",
                    ghost: false,
                    midground: fl.mid,
                    branch: main,
                    idx: focalIdx,
                    angleOffset: fl.ang,
                    size: fl.sz * S,
                    stemLen: 11 * S,
                    rotation: rand(-0.28, 0.28),
                    tint: fl.tint,
                    profile: li === 1,
                    t0: focalT + li * 0.04,
                    t1: focalT + 0.30 + li * 0.04,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });

            const skyIdx = Math.round(0.88 * (main.points.length - 1));
            const skyAnc = main.points[skyIdx];
            const skyEnd = {
                x: skyAnc.x - 135 * S,
                y: Math.max(60, skyAnc.y - 52 * S),
            };
            const skyMaple = sampleBranch(
                { x: skyAnc.x, y: skyAnc.y },
                {
                    x: lerp(skyAnc.x, skyEnd.x, 0.4) - 10 * S,
                    y: Math.max(54, lerp(skyAnc.y, skyEnd.y, 0.4) - 14 * S),
                },
                {
                    x: lerp(skyAnc.x, skyEnd.x, 0.78) + 8 * S,
                    y: Math.max(54, lerp(skyAnc.y, skyEnd.y, 0.78)),
                },
                skyEnd,
                {
                    steps: 18,
                    widthStart: 1.15 * S,
                    widthEnd: 0.30 * S,
                    t0: lerp(main.t0, main.t1, 0.88),
                    t1: lerp(main.t0, main.t1, 0.88) + 0.22,
                    flexSpan: 0.72,
                    phase: 2.5,
                    wobble: 0.8 * S,
                    parentRef: { branch: main, idx: skyIdx },
                },
                rng,
            );
            branches.push(skyMaple);
            ornaments.push({
                kind: "mapleLeaf",
                ghost: false,
                branch: skyMaple,
                idx: skyMaple.points.length - 1,
                angleOffset: -0.18,
                size: 36 * S,
                stemLen: 13 * S,
                rotation: 0.24,
                tint: "accent",
                profile: false,
                t0: skyMaple.t1 - 0.02,
                t1: skyMaple.t1 + 0.28,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        }
    }

    if (species === "plum" && solar.isSnowSeason) {
        for (const b of branches) {
            if (!b.ghost && b.widthStart >= 1.4 * S) {
                b.snowCushions = true;
            }
        }
    }

    // Dual-envelope workspace clearance around central search bar & inline AI / app plate on wide desktop
    if (!isNarrow && !embedded) {
        applyWorkspaceClearance(branches, w, h, S);
    }

    if (embedded) {
        return {
            species,
            side: "right",
            archetype,
            visitorPresent: false,
            branches,
            ornaments,
            rocks,
            scale: S,
            visitorAnchor: null,
            rewardAnchor: null,
        };
    }

    // Post-generation anchors for micro-ecology visitors & reward blooms
    // (sampled after all branch/ornament geometry to preserve deterministic layout).
    const fgBranches = branches.filter((b) => !b.ghost);
    const fireflies: FireflySeed[] = [
        {
            x: w - (isNarrow ? 105 : 220) * S,
            y: h - (isNarrow ? 150 : 280) * S,
            phase: rand(0, 6.28),
            speed: 0.42,
        },
        {
            x: w - (isNarrow ? 175 : 350) * S,
            y: h - (isNarrow ? 210 : 390) * S,
            phase: rand(0, 6.28),
            speed: 0.33,
        },
    ];

    let visitorAnchor: BotanicalVisitorAnchor | null = null;
    let rewardAnchor: BotanicalRewardAnchor | null = null;

    if (species === "plum") {
        const perchBranch = fgBranches[1] ?? fgBranches[0] ?? branches[0];
        const perchIdx = Math.max(
            2,
            Math.round((perchBranch.points.length - 1) * 0.42),
        );
        visitorAnchor = {
            kind: "sparrow",
            branch: perchBranch,
            idx: perchIdx,
            fireflies,
        };
        const budIndices: number[] = [];
        for (let i = 0; i < ornaments.length && budIndices.length < 2; i++) {
            const orn = ornaments[i];
            if (!orn.ghost && orn.kind === "plumBud") {
                budIndices.push(i);
            }
        }
        const tipBranch = fgBranches[2] ?? fgBranches[0] ?? branches[0];
        rewardAnchor = {
            kind: "plum",
            branch: tipBranch,
            idx: Math.max(1, tipBranch.points.length - 1),
            budIndices,
        };
    } else if (species === "ginkgo") {
        const leafOrn = ornaments.find((o) =>
            o.kind === "ginkgo" && !o.ghost && !o.profile
        ) ?? ornaments.find((o) =>
            o.kind === "ginkgo" && !o.ghost
        );
        const perchBranch = leafOrn?.branch ?? fgBranches[0] ?? branches[0];
        const perchIdx = leafOrn?.idx ??
            Math.max(1, Math.round((perchBranch.points.length - 1) * 0.72));
        visitorAnchor = {
            kind: "ladybug",
            branch: perchBranch,
            idx: perchIdx,
            angleOffset: leafOrn?.angleOffset ?? 0.2,
            leafSize: leafOrn && leafOrn.kind === "ginkgo"
                ? leafOrn.size + leafOrn.stemLen
                : 46 * S,
            fireflies,
        };
        const mainBranch = fgBranches[0] ?? branches[0];
        rewardAnchor = {
            kind: "ginkgo",
            branch: mainBranch,
            idx: Math.max(1, mainBranch.points.length - 1),
            budIndices: [],
        };
    } else if (species === "fern") {
        const heroOrn = ornaments.find((o) =>
            o.kind === "fernPinna" && !o.ghost && !o.profile && o.len >= 50 * S
        ) ?? ornaments.find((o) =>
            o.kind === "fernPinna" && !o.ghost
        );
        const perchBranch = heroOrn?.branch ??
            fgBranches[fgBranches.length - 1] ??
            branches[0];
        const perchIdx = heroOrn?.idx ??
            Math.max(1, Math.round((perchBranch.points.length - 1) * 0.65));
        const ang = (perchBranch.points[perchIdx]?.angle ?? -1.2) +
            (heroOrn?.angleOffset ?? -0.5);
        const tipDist = heroOrn && heroOrn.kind === "fernPinna"
            ? heroOrn.len * 0.88
            : 64 * S;
        visitorAnchor = {
            kind: "dew-or-firefly",
            branch: perchBranch,
            idx: perchIdx,
            tipOffsetX: Math.cos(ang) * tipDist,
            tipOffsetY: Math.sin(ang) * tipDist,
            fireflies,
        };
        const heroBranch = fgBranches[fgBranches.length - 1] ?? branches[0];
        rewardAnchor = {
            kind: "fern",
            branch: heroBranch,
            idx: Math.max(1, heroBranch.points.length - 1),
            budIndices: [],
        };
    } else if (species === "eucalyptus") {
        const eucOrn = ornaments.find((o) =>
            o.kind === "eucalyptus" && !o.ghost && !o.profile
        ) ?? ornaments.find((o) =>
            o.kind === "eucalyptus" && !o.ghost
        );
        const perchBranch = eucOrn?.branch ?? fgBranches[0] ?? branches[0];
        const perchIdx = eucOrn?.idx ??
            Math.max(1, Math.round((perchBranch.points.length - 1) * 0.65));
        const ang = (perchBranch.points[perchIdx]?.angle ?? -1.4) +
            (eucOrn?.angleOffset ?? 0.7);
        const tipDist = eucOrn && eucOrn.kind === "eucalyptus"
            ? eucOrn.rx * 1.5 + eucOrn.stemLen
            : 32 * S;
        visitorAnchor = {
            kind: "dew-or-firefly",
            branch: perchBranch,
            idx: perchIdx,
            tipOffsetX: Math.cos(ang) * tipDist,
            tipOffsetY: Math.sin(ang) * tipDist,
            fireflies,
        };
        const mainBranch = fgBranches[0] ?? branches[0];
        rewardAnchor = {
            kind: "eucalyptus",
            branch: mainBranch,
            idx: Math.max(1, mainBranch.points.length - 1),
            budIndices: [],
        };
    } else if (species === "orchid") {
        const scapeBranch = fgBranches[fgBranches.length - 1] ?? branches[0];
        const perchIdx = Math.max(
            2,
            Math.round((scapeBranch.points.length - 1) * 0.62),
        );
        visitorAnchor = {
            kind: "butterfly",
            branch: scapeBranch,
            idx: perchIdx,
            fireflies,
        };
        rewardAnchor = {
            kind: "orchid",
            branch: scapeBranch,
            idx: Math.max(1, scapeBranch.points.length - 1),
            budIndices: [],
        };
    } else if (species === "bamboo") {
        const twigBranch = fgBranches.find((b) => b.parentRef !== null) ??
            fgBranches[0] ?? branches[0];
        visitorAnchor = {
            kind: "dragonfly",
            branch: twigBranch,
            idx: Math.max(1, twigBranch.points.length - 1),
            fireflies,
        };
        const mainCulm = fgBranches.find((b) => !b.parentRef) ??
            fgBranches[0] ??
            branches[0];
        rewardAnchor = {
            kind: "bamboo",
            branch: mainCulm,
            idx: Math.max(1, mainCulm.points.length - 1),
            budIndices: [],
        };
    } else {
        const perchBranch = fgBranches[0] ?? branches[0];
        const perchIdx = Math.max(
            2,
            Math.round((perchBranch.points.length - 1) * 0.45),
        );
        visitorAnchor = {
            kind: "sparrow",
            branch: perchBranch,
            idx: perchIdx,
            fireflies,
        };
        rewardAnchor = {
            kind: "maple",
            branch: perchBranch,
            idx: Math.max(1, perchBranch.points.length - 1),
            budIndices: [],
        };
    }

    const visitorPresent =
        (hashString(`${dateKey}:${species}:serendipity`) % 100) < 45;
    const builtScene: BotanicalScene = {
        species,
        side: "right",
        archetype,
        visitorPresent,
        branches,
        ornaments,
        rocks,
        scale: S,
        visitorAnchor,
        rewardAnchor,
    };
    if (targetSide === "left") {
        mirrorSceneGeometryToLeft(builtScene, w);
    }
    return builtScene;
}

function mirrorSceneGeometryToLeft(scene: BotanicalScene, width: number): void {
    scene.side = "left";
    for (const b of scene.branches) {
        for (const pt of b.points) {
            pt.x = width - pt.x;
            pt.lx = -pt.lx;
            const rawA = Math.PI - pt.angle;
            pt.angle = Math.atan2(Math.sin(rawA), Math.cos(rawA));
        }
        b.frameId = -1;
        b.worldCache = null;
    }
    for (const r of scene.rocks) {
        for (const pt of r.points) {
            pt.x = width - pt.x;
        }
        for (const m of r.mossDots) {
            m.x = width - m.x;
            m.rot = -m.rot;
        }
    }
    for (const o of scene.ornaments) {
        o.angleOffset = -o.angleOffset;
        if (o.kind === "fernPinna") {
            o.side = o.side === 1 ? -1 : 1;
            o.curve = -o.curve;
            o.whip = -o.whip;
        } else if (o.kind === "bambooLeaf") {
            o.curve = -o.curve;
        } else if (
            o.kind === "plumBlossom" || o.kind === "plumBud" ||
            o.kind === "orchidBlossom" || o.kind === "mapleLeaf"
        ) {
            o.rotation = -o.rotation;
        }
    }
    if (scene.visitorAnchor) {
        for (const ff of scene.visitorAnchor.fireflies) {
            (ff as { x: number }).x = width - ff.x;
        }
        if (scene.visitorAnchor.kind === "ladybug") {
            (scene.visitorAnchor as { angleOffset: number }).angleOffset =
                -scene.visitorAnchor.angleOffset;
        } else if (scene.visitorAnchor.kind === "dew-or-firefly") {
            (scene.visitorAnchor as { tipOffsetX: number }).tipOffsetX = -scene
                .visitorAnchor.tipOffsetX;
        }
    }
}

function applyWorkspaceClearance(
    branches: BranchData[],
    w: number,
    h: number,
    scale: number,
): void {
    const searchCx = w * 0.50;
    const searchCy = h * 0.405;
    const searchRx = Math.max(356 * scale, Math.min(370, w * 0.255));
    const searchRy = 106 * scale;

    const plateCx = w * 0.50;
    const plateCy = h * 0.56;
    const plateRx = Math.min(340 * scale, w * 0.24);
    const plateRy = 128 * scale;

    const pushPointOut = (pt: BranchSample) => {
        const dxA = (pt.x - searchCx) / searchRx;
        const dyA = (pt.y - searchCy) / searchRy;
        const d2A = dxA * dxA + dyA * dyA;
        if (d2A < 1.0) {
            if (d2A > 1e-4) {
                const invA = 1 / Math.hypot(dxA, dyA);
                pt.x = searchCx + dxA * invA * searchRx +
                    dxA * invA * 18 * scale * (1 - d2A);
                pt.y = searchCy + dyA * invA * searchRy +
                    dyA * invA * 10 * scale * (1 - d2A);
            } else {
                pt.x = searchCx + searchRx + 18 * scale;
            }
        }
        const dxB = (pt.x - plateCx) / plateRx;
        const dyB = (pt.y - plateCy) / plateRy;
        const d2B = dxB * dxB + dyB * dyB;
        if (d2B < 1.0 && d2B > 1e-4) {
            const pushB = (1 - d2B) * 26 * scale;
            const invB = 1 / Math.hypot(dxB, dyB);
            pt.x += dxB * invB * pushB;
            pt.y += dyB * invB * pushB * 0.4;
        }
    };

    const refreshBranchMetrics = (b: BranchData) => {
        if (b.points.length < 2) return;
        const p0 = b.points[0];
        for (let i = 0; i < b.points.length; i++) {
            b.points[i].lx = b.points[i].x - p0.x;
            b.points[i].ly = b.points[i].y - p0.y;
            const prev = b.points[Math.max(0, i - 1)];
            const next = b.points[Math.min(b.points.length - 1, i + 1)];
            b.points[i].angle = Math.atan2(next.y - prev.y, next.x - prev.x);
        }
    };

    for (const b of branches) {
        if (b.parentRef || b.ghost) continue;
        for (const pt of b.points) {
            pushPointOut(pt);
        }
        refreshBranchMetrics(b);
    }

    for (const b of branches) {
        if (!b.parentRef || b.ghost) continue;
        const anchor = b.parentRef.branch.points[b.parentRef.idx];
        if (anchor && b.points.length > 0) {
            const dx = anchor.x - b.points[0].x;
            const dy = anchor.y - b.points[0].y;
            if (Math.abs(dx) > 1e-3 || Math.abs(dy) > 1e-3) {
                for (const pt of b.points) {
                    pt.x += dx;
                    pt.y += dy;
                }
            }
        }
        for (let i = 1; i < b.points.length; i++) {
            pushPointOut(b.points[i]);
        }
        refreshBranchMetrics(b);
    }
}

function computeBranchWorldPoints(
    branch: BranchData,
    timeSec: number,
    reducedMotion: boolean,
    windCalm: number,
    scale: number,
    frameSeq: number,
    breezeImpulse = 0,
    runtime?: BotanicalRuntimeState,
): WorldSample[] {
    if (branch.frameId === frameSeq && branch.worldCache) {
        return branch.worldCache;
    }

    let baseDAngle = 0;
    let anchorX = branch.points[0].x;
    let anchorY = branch.points[0].y;

    if (branch.parentRef) {
        const pWorld = computeBranchWorldPoints(
            branch.parentRef.branch,
            timeSec,
            reducedMotion,
            windCalm,
            scale,
            frameSeq,
            breezeImpulse,
            runtime,
        );
        const pPt = pWorld[branch.parentRef.idx];
        baseDAngle = pPt.dAngle;
        anchorX = pPt.x;
        anchorY = pPt.y;
    }

    const cosA = Math.cos(baseDAngle);
    const sinA = Math.sin(baseDAngle);
    const waveLag = branch.waveLag ?? 0;

    let gustEnv = 0;
    let gustAge = 0;
    if (runtime && !reducedMotion) {
        if (
            timeSec >= runtime.gustStartSec &&
            timeSec <= runtime.gustStartSec + runtime.gustDurationSec
        ) {
            const uGust = (timeSec - runtime.gustStartSec) /
                Math.max(0.1, runtime.gustDurationSec);
            const s = Math.sin(uGust * Math.PI);
            gustEnv = s * s * runtime.gustStrength * windCalm;
            gustAge = timeSec - runtime.gustStartSec;
        }
    }

    const out: WorldSample[] = new Array(branch.points.length);
    for (let i = 0; i < branch.points.length; i++) {
        const pt = branch.points[i];
        const rx = anchorX + pt.lx * cosA - pt.ly * sinA;
        const ry = anchorY + pt.lx * sinA + pt.ly * cosA;
        let breeze = 0;
        if (!reducedMotion) {
            if (runtime) {
                const wavePhase = gustAge * 2.5 - rx * 0.0022 - pt.u * waveLag +
                    branch.phase;
                const gustWave = gustEnv > 0
                    ? (Math.sin(wavePhase) * 0.65 +
                        Math.sin(wavePhase * 1.68 + 0.9) * 0.35) * gustEnv
                    : 0;
                breeze = gustWave + breezeImpulse;
            } else {
                breeze =
                    (Math.sin(timeSec * 0.66 + branch.phase - pt.u * waveLag) *
                                0.65 +
                            Math.sin(
                                    timeSec * 1.40 +
                                        (branch.phase - pt.u * waveLag) * 1.7 +
                                        1.1,
                                ) *
                                0.35) *
                        windCalm +
                    breezeImpulse;
            }
        }
        const amp = 7.5 * scale * pt.localFlex;
        const ldx = breeze * amp;
        const ldy = Math.abs(breeze) * amp * 0.24;
        const ldAngle = breeze * 0.032 * pt.localFlex;
        out[i] = {
            x: rx + ldx,
            y: ry + ldy,
            angle: pt.angle + baseDAngle + ldAngle,
            dAngle: baseDAngle + ldAngle,
        };
    }

    branch.frameId = frameSeq;
    branch.worldCache = out;
    return out;
}

function drawRockBase(
    ctx: CanvasRenderingContext2D,
    rock: RockStroke,
    rawProgress: number,
    scale: number,
    pal: BotanicalPalette,
): void {
    const rp = easeOutCubic(
        clamp((rawProgress - rock.t0) / (rock.t1 - rock.t0), 0, 1),
    );
    if (rp <= 0.02 || rock.points.length < 3) return;
    const pts = rock.points;

    let minX = pts[0].x;
    let maxX = pts[0].x;
    let minY = pts[0].y;
    let maxY = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
        if (pts[i].x < minX) minX = pts[i].x;
        if (pts[i].x > maxX) maxX = pts[i].x;
        if (pts[i].y < minY) minY = pts[i].y;
        if (pts[i].y > maxY) maxY = pts[i].y;
    }

    const traceSmoothRock = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1];
            const curr = pts[i];
            ctx.quadraticCurveTo(
                prev.x,
                prev.y,
                (prev.x + curr.x) * 0.5,
                (prev.y + curr.y) * 0.5,
            );
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.closePath();
    };

    // 1. 浑厚没骨石体晕染（偏心径向渐变：有顶无脚，石根化入画布；复杂壁纸下大幅收敛防脏）
    ctx.save();
    if (pal.photoStyle !== "gongbi-line") {
        traceSmoothRock();
        const focalX = lerp(minX, maxX, 0.42);
        const focalY = lerp(minY, maxY, 0.22);
        const rockR = Math.max(8, (maxX - minX) * 0.85);
        const washGrad = ctx.createRadialGradient(
            focalX,
            focalY,
            Math.max(1, rockR * 0.08),
            focalX,
            lerp(minY, maxY, 0.48),
            rockR,
        );
        washGrad.addColorStop(
            0,
            pal.inkGrade("zhong", (pal.isDark ? 0.26 : 0.36) * rp),
        );
        washGrad.addColorStop(
            0.55,
            pal.wash("sub", (pal.isDark ? 0.16 : 0.24) * rp),
        );
        washGrad.addColorStop(1, pal.inkGrade("qing", 0));
        ctx.fillStyle = washGrad;
        ctx.fill();
    }

    // 2. 破墨内层石腹体量
    ctx.save();
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    ctx.translate(cx + 3.2 * scale, cy + 2.4 * scale);
    ctx.scale(0.84, 0.80);
    ctx.translate(-cx, -cy);
    traceSmoothRock();
    const innerGrad = ctx.createLinearGradient(
        cx,
        minY,
        cx,
        Math.max(minY + 4, maxY),
    );
    innerGrad.addColorStop(
        0,
        pal.inkGrade("nong", (pal.isDark ? 0.20 : 0.26) * rp),
    );
    innerGrad.addColorStop(1, pal.inkGrade("qing", 0));
    ctx.fillStyle = innerGrad;
    ctx.fill();
    ctx.restore();

    // 3. 圆融披麻/折带飞白弧皴（沿石脊平滑样条采样，两头鼠尾尖收，零几何硬折线）
    const ridgePtsRaw = pts.slice(1, Math.min(pts.length, 5));
    if (ridgePtsRaw.length >= 3) {
        const samples = 18;
        const spine: Point2D[] = [];
        for (let i = 0; i <= samples; i++) {
            const u = (i / samples) * rp;
            const segF = u * (ridgePtsRaw.length - 1);
            const idx = Math.min(ridgePtsRaw.length - 2, Math.floor(segF));
            const localT = segF - idx;
            const p0 = idx === 0 ? ridgePtsRaw[0] : {
                x: (ridgePtsRaw[idx - 1].x + ridgePtsRaw[idx].x) * 0.5,
                y: (ridgePtsRaw[idx - 1].y + ridgePtsRaw[idx].y) * 0.5,
            };
            const p1 = ridgePtsRaw[idx];
            const p2 = idx + 1 === ridgePtsRaw.length - 1
                ? ridgePtsRaw[idx + 1]
                : {
                    x: (ridgePtsRaw[idx].x + ridgePtsRaw[idx + 1].x) * 0.5,
                    y: (ridgePtsRaw[idx].y + ridgePtsRaw[idx + 1].y) * 0.5,
                };
            const omt = 1 - localT;
            spine.push({
                x: omt * omt * p0.x + 2 * omt * localT * p1.x +
                    localT * localT * p2.x,
                y: omt * omt * p0.y + 2 * omt * localT * p1.y +
                    localT * localT * p2.y,
            });
        }
        const upper: Point2D[] = [];
        const lower: Point2D[] = [];
        const slitUp: Point2D[] = [];
        const slitLo: Point2D[] = [];
        for (let i = 0; i < spine.length; i++) {
            const p = spine[i];
            const next = spine[Math.min(spine.length - 1, i + 1)];
            const prev = spine[Math.max(0, i - 1)];
            const tang = Math.atan2(next.y - prev.y, next.x - prev.x);
            const nx = -Math.sin(tang);
            const ny = Math.cos(tang);
            const env = Math.sin((i / (spine.length - 1)) * Math.PI);
            const hw = (0.28 + 2.15 * env) * scale;
            upper.push({ x: p.x + nx * hw * 0.45, y: p.y + ny * hw * 0.45 });
            lower.push({ x: p.x - nx * hw, y: p.y - ny * hw });
            if (i >= 4 && i <= 14) {
                const sEnv = Math.sin(((i - 4) / 10) * Math.PI);
                const sr = Math.max(0.18, 0.42 * sEnv * scale);
                slitUp.push({
                    x: p.x - nx * hw * 0.25 + nx * sr,
                    y: p.y - ny * hw * 0.25 + ny * sr,
                });
                slitLo.push({
                    x: p.x - nx * hw * 0.25 - nx * sr,
                    y: p.y - ny * hw * 0.25 - ny * sr,
                });
            }
        }
        ctx.beginPath();
        ctx.moveTo(upper[0].x, upper[0].y);
        for (let i = 1; i < upper.length; i++) {
            ctx.lineTo(upper[i].x, upper[i].y);
        }
        for (let i = lower.length - 1; i >= 0; i--) {
            ctx.lineTo(lower[i].x, lower[i].y);
        }
        ctx.closePath();
        if (slitUp.length >= 3) {
            ctx.moveTo(slitUp[0].x, slitUp[0].y);
            for (let i = 1; i < slitUp.length; i++) {
                ctx.lineTo(slitUp[i].x, slitUp[i].y);
            }
            for (let i = slitLo.length - 1; i >= 0; i--) {
                ctx.lineTo(slitLo[i].x, slitLo[i].y);
            }
            ctx.closePath();
        }
        ctx.fillStyle = pal.inkGrade("nong", (pal.isDark ? 0.38 : 0.62) * rp);
        ctx.fill("evenodd");
    }

    // 内部柔和弯曲的新月形淡墨石理弧影
    if (pts.length >= 5) {
        const c0 = {
            x: lerp(pts[2].x, pts[1].x, 0.35),
            y: lerp(pts[2].y, pts[1].y, 0.35) + 6 * scale,
        };
        const c1 = {
            x: lerp(pts[2].x, pts[0].x, 0.58),
            y: lerp(pts[2].y, pts[0].y, 0.52),
        };
        ctx.beginPath();
        ctx.moveTo(c0.x, c0.y);
        ctx.quadraticCurveTo(
            lerp(c0.x, c1.x, 0.5) - 5 * scale,
            lerp(c0.y, c1.y, 0.5) - 3 * scale,
            c1.x,
            c1.y,
        );
        ctx.quadraticCurveTo(
            lerp(c0.x, c1.x, 0.5) + 1.5 * scale,
            lerp(c0.y, c1.y, 0.5) + 2.5 * scale,
            c0.x,
            c0.y,
        );
        ctx.closePath();
        ctx.fillStyle = pal.inkGrade("zhong", (pal.isDark ? 0.22 : 0.34) * rp);
        ctx.fill();
    }

    // 4. 攒三聚五点苔：焦墨苔点与矿物赭绿点缀相生
    for (let mi = 0; mi < rock.mossDots.length; mi++) {
        const m = rock.mossDots[mi];
        ctx.beginPath();
        ctx.ellipse(m.x, m.y, m.rx, m.ry, m.rot, 0, Math.PI * 2);
        ctx.fillStyle = mi % 3 === 1
            ? pal.wash("sub", (pal.isDark ? 0.42 : 0.58) * rp)
            : pal.inkGrade("jiao", (pal.isDark ? 0.56 : 0.82) * rp);
        ctx.fill();
    }
    ctx.restore();
}

function strokeGongbiOutline(
    ctx: CanvasRenderingContext2D,
    tint: TintRole,
    pal: BotanicalPalette,
    alpha: number,
    width = 0.72,
): void {
    if (pal.photoStyle !== "gongbi-line") return;
    ctx.save();
    ctx.strokeStyle = pal.isDark
        ? pal.goldDust(0.76 * alpha)
        : pal.stroke(tint === "ink" ? "ink" : tint, 0.72 * alpha);
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
}

function strokeWaterline(
    ctx: CanvasRenderingContext2D,
    tint: TintRole,
    pal: BotanicalPalette,
    scale: number,
    alpha: number,
    span = 18,
): void {
    ctx.save();
    const gradSpan = Math.max(4, span * scale);
    const grad = ctx.createLinearGradient(
        0,
        0,
        gradSpan,
        gradSpan * 0.35,
    );
    grad.addColorStop(0, pal.waterline(tint, 0));
    grad.addColorStop(0.45, pal.waterline(tint, alpha * 0.45));
    grad.addColorStop(1, pal.waterline(tint, alpha));
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(0.36, 0.54 * scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
}

function drawTaperedBranch(
    ctx: CanvasRenderingContext2D,
    branch: BranchData,
    species: ConcreteBotanicalSpecies,
    rawProgress: number,
    timeSec: number,
    reducedMotion: boolean,
    windCalm: number,
    scale: number,
    frameSeq: number,
    pal: BotanicalPalette,
    breezeImpulse = 0,
    runtime?: BotanicalRuntimeState,
): void {
    const bp = easeOutCubic(
        clamp((rawProgress - branch.t0) / (branch.t1 - branch.t0), 0, 1),
    );
    if (bp <= 0.005) return;

    const pts = branch.points;
    const worldPts = computeBranchWorldPoints(
        branch,
        timeSec,
        reducedMotion,
        windCalm,
        scale,
        frameSeq,
        breezeImpulse,
        runtime,
    );
    const totalSegs = pts.length - 1;
    const maxFloat = bp * totalSegs;
    const maxIdx = Math.floor(maxFloat);
    const frac = maxFloat - maxIdx;
    const layerA = branch.ghost ? 0.15 : branch.midground ? 0.45 : 1.0;
    const isFern = species === "fern";
    const isOrchidBlade = branch.brushStyle === "orchid-blade";
    const isIronPlum = branch.brushStyle === "iron-plum";
    const widthBoost = isFern || isOrchidBlade
        ? (branch.ghost ? 0.92 : branch.midground ? 1.05 : 1.18)
        : (branch.ghost
            ? 1.0
            : branch.midground
            ? 1.15
            : branch.parentRef
            ? 1.25
            : 1.48);

    const calcHalfWidth = (u: number): number => {
        if (isOrchidBlade) {
            // Orchid blade:藏锋起笔 → 螳螂肚 → 腰眼窄折 → 长锋鼠尾
            const twistU = branch.twistU ?? 0.56;
            const belly = Math.sin(Math.pow(u, 0.72) * Math.PI);
            const twistPinch = 1 -
                0.76 * Math.exp(-Math.pow((u - twistU) / 0.075, 2));
            const tipTaper = u > 0.76 ? lerp(1, 0.14, (u - 0.76) / 0.24) : 1;
            return Math.max(
                0.22,
                branch.widthStart * (0.28 + 0.95 * belly) * twistPinch *
                    tipTaper * 0.5,
            );
        }
        if (branch.bambooNodes && branch.bambooNodes.length > 0) {
            // Bamboo culm: slender mid-internode, slight flare at node ends
            let nodeFlare = 1;
            for (const nu of branch.bambooNodes) {
                const dist = Math.abs(u - nu);
                if (dist < 0.045) {
                    nodeFlare = Math.max(
                        nodeFlare,
                        1 + 0.22 * (1 - dist / 0.045),
                    );
                }
            }
            return Math.max(
                0.25,
                lerp(branch.widthStart, branch.widthEnd, u) * widthBoost *
                    nodeFlare * 0.5,
            );
        }
        const cadenceAmp = isFern ? 0.09 : isIronPlum ? 0.30 : 0.24;
        const cadence = 1 +
            cadenceAmp * Math.sin(u * Math.PI * 4.5 + branch.phase * 2.1) *
                Math.sin(u * Math.PI);
        const tipTaper = u > 0.78 ? lerp(1, 0.20, (u - 0.78) / 0.22) : 1;
        return Math.max(
            0.25,
            lerp(branch.widthStart, branch.widthEnd, u) * widthBoost * cadence *
                tipTaper * 0.5,
        );
    };

    const spine: Array<
        { x: number; y: number; angle: number; hw: number; u: number }
    > = [];
    for (let i = 0; i <= maxIdx; i++) {
        const wp = worldPts[i];
        const u = i / totalSegs;
        spine.push({
            x: wp.x,
            y: wp.y,
            angle: wp.angle,
            hw: calcHalfWidth(u),
            u,
        });
    }
    if (maxIdx < totalSegs && frac > 0.01) {
        const pA = worldPts[maxIdx];
        const pB = worldPts[maxIdx + 1];
        const u = (maxIdx + frac) / totalSegs;
        spine.push({
            x: lerp(pA.x, pB.x, frac),
            y: lerp(pA.y, pB.y, frac),
            angle: lerp(pA.angle, pB.angle, frac),
            hw: calcHalfWidth(u),
            u,
        });
    }
    if (spine.length < 2) return;

    // Layer A: Soft wet-ink bleed on Xuan paper (skip for ghost/midground/segmented bamboo/gongbi-line)
    if (
        !branch.ghost && !branch.midground && !branch.bambooNodes &&
        pal.photoStyle !== "gongbi-line"
    ) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(spine[0].x, spine[0].y);
        for (let i = 1; i < spine.length; i++) {
            ctx.lineTo(spine[i].x, spine[i].y);
        }
        ctx.strokeStyle = pal.wash(
            "ink",
            isFern || isOrchidBlade ? 0.14 : 0.30,
        );
        ctx.lineWidth = Math.max(
            1.2,
            (branch.widthStart + branch.widthEnd) *
                    (isFern || isOrchidBlade ? 0.52 : 0.68) +
                (isFern || isOrchidBlade ? 1.0 : 2.1) * scale,
        );
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
    }

    // Segmented bamboo culms: draw each internode with crisp 3-4px breathing gap
    if (branch.bambooNodes && branch.bambooNodes.length > 0) {
        const sampleSpineAt = (targetU: number) => {
            if (targetU <= spine[0].u) return spine[0];
            const last = spine[spine.length - 1];
            if (targetU >= last.u) return last;
            for (let i = 0; i < spine.length - 1; i++) {
                const a = spine[i];
                const b = spine[i + 1];
                if (targetU >= a.u && targetU <= b.u) {
                    const span = Math.max(1e-6, b.u - a.u);
                    const t = (targetU - a.u) / span;
                    return {
                        x: lerp(a.x, b.x, t),
                        y: lerp(a.y, b.y, t),
                        angle: lerp(a.angle, b.angle, t),
                        hw: lerp(a.hw, b.hw, t),
                        u: targetU,
                    };
                }
            }
            return last;
        };

        const approxLen = Math.max(
            40,
            Math.hypot(
                spine[spine.length - 1].x - spine[0].x,
                spine[spine.length - 1].y - spine[0].y,
            ),
        );
        const halfGap = clamp((1.75 * scale) / approxLen, 0.0018, 0.0045);
        const maxU = spine[spine.length - 1].u;
        const breaks = [...branch.bambooNodes].sort((a, b) => a - b);
        const ranges: Array<[number, number]> = [];
        let prevU = 0;
        for (const nu of breaks) {
            if (nu - halfGap > prevU && prevU < maxU) {
                ranges.push([
                    prevU,
                    Math.min(maxU, Math.max(prevU, nu - halfGap)),
                ]);
            }
            prevU = Math.min(1, nu + halfGap);
        }
        if (prevU < maxU) {
            ranges.push([prevU, maxU]);
        }

        for (const [rStart, rEnd] of ranges) {
            if (rEnd - rStart < 0.004) continue;
            const segPts = [
                sampleSpineAt(rStart),
                ...spine.filter((p) => p.u > rStart && p.u < rEnd),
                sampleSpineAt(rEnd),
            ];
            if (segPts.length < 2) continue;
            const lEdge: Point2D[] = [];
            const rEdge: Point2D[] = [];
            for (const p of segPts) {
                const nx = -Math.sin(p.angle);
                const ny = Math.cos(p.angle);
                lEdge.push({ x: p.x + nx * p.hw, y: p.y + ny * p.hw });
                rEdge.push({ x: p.x - nx * p.hw, y: p.y - ny * p.hw });
            }
            const midP = segPts[Math.floor(segPts.length * 0.5)];
            const mNx = -Math.sin(midP.angle);
            const mNy = Math.cos(midP.angle);
            const gradSpan = Math.max(1.5, midP.hw);
            const culmGrad = ctx.createLinearGradient(
                midP.x + mNx * gradSpan,
                midP.y + mNy * gradSpan,
                midP.x - mNx * gradSpan,
                midP.y - mNy * gradSpan,
            );
            // 圆劲碧玉墨竹：背光焦墨 → 中腹重墨 → 受光清淡
            culmGrad.addColorStop(0, pal.inkGrade("jiao", 0.94 * layerA));
            culmGrad.addColorStop(0.55, pal.inkGrade("zhong", 0.70 * layerA));
            culmGrad.addColorStop(1, pal.inkGrade("dan", 0.44 * layerA));

            ctx.beginPath();
            ctx.moveTo(lEdge[0].x, lEdge[0].y);
            for (let i = 1; i < lEdge.length; i++) {
                ctx.lineTo(lEdge[i].x, lEdge[i].y);
            }
            for (let i = rEdge.length - 1; i >= 0; i--) {
                ctx.lineTo(rEdge[i].x, rEdge[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = culmGrad;
            ctx.fill();

            if (!branch.ghost && !branch.midground) {
                ctx.fillStyle = pal.wash("sub", 0.20 * layerA);
                ctx.fill();
            }
        }

        // Crisp "乙" / "八" bamboo joint ridges & node-sheath spurs
        for (const nu of breaks) {
            if (bp < nu + 0.03) continue;
            const np = sampleSpineAt(nu);
            const nx = -Math.sin(np.angle);
            const ny = Math.cos(np.angle);
            const ridgeW = np.hw * 1.42;
            ctx.beginPath();
            ctx.moveTo(np.x - nx * ridgeW, np.y - ny * ridgeW);
            ctx.quadraticCurveTo(
                np.x - Math.cos(np.angle) * 2.2 * scale,
                np.y - Math.sin(np.angle) * 2.2 * scale,
                np.x + nx * ridgeW,
                np.y + ny * ridgeW,
            );
            ctx.strokeStyle = pal.inkGrade("jiao", layerA);
            ctx.lineWidth = Math.max(0.95, 1.45 * scale);
            ctx.lineCap = "round";
            ctx.stroke();

            // Subtle upper node-sheath lip
            ctx.beginPath();
            ctx.moveTo(
                np.x - nx * ridgeW * 0.72 + Math.cos(np.angle) * 1.4 * scale,
                np.y - ny * ridgeW * 0.72 + Math.sin(np.angle) * 1.4 * scale,
            );
            ctx.lineTo(
                np.x + nx * ridgeW * 0.72 + Math.cos(np.angle) * 1.4 * scale,
                np.y + ny * ridgeW * 0.72 + Math.sin(np.angle) * 1.4 * scale,
            );
            ctx.strokeStyle = pal.inkGrade("nong", 0.52 * layerA);
            ctx.lineWidth = Math.max(0.6, 0.8 * scale);
            ctx.stroke();
        }
        return;
    }

    const leftEdge: Point2D[] = [];
    const rightEdge: Point2D[] = [];
    for (const p of spine) {
        const nx = -Math.sin(p.angle);
        const ny = Math.cos(p.angle);
        leftEdge.push({ x: p.x + nx * p.hw, y: p.y + ny * p.hw });
        rightEdge.push({ x: p.x - nx * p.hw, y: p.y - ny * p.hw });
    }

    // Layer B: Expressive sumi-ink trunk body + evenodd dry-brush feibai slits
    ctx.beginPath();
    ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
    for (let i = 1; i < leftEdge.length; i++) {
        ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
    }
    const tip = spine[spine.length - 1];
    ctx.arc(
        tip.x,
        tip.y,
        tip.hw,
        tip.angle + Math.PI * 0.5,
        tip.angle - Math.PI * 0.5,
        true,
    );
    for (let i = rightEdge.length - 1; i >= 0; i--) {
        ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
    }
    const start = spine[0];
    ctx.arc(
        start.x,
        start.y,
        start.hw,
        start.angle - Math.PI * 0.5,
        start.angle + Math.PI * 0.5,
        true,
    );
    ctx.closePath();

    // True non-destructive evenodd dry-brush flying-white (feibai) slits
    const allowFeibai = !isFern &&
        !branch.ghost &&
        !branch.midground &&
        spine.length > 8 &&
        (isOrchidBlade || branch.widthStart > 1.65 * scale);
    if (allowFeibai) {
        const slits = isOrchidBlade
            ? [{ u0: 0.22, u1: 0.48, off: 0.14 }]
            : branch.widthStart >= 4.2 * scale
            ? [
                { u0: 0.14, u1: 0.39, off: -0.26 },
                { u0: 0.42, u1: 0.72, off: 0.22 },
                { u0: 0.64, u1: 0.88, off: -0.14 },
            ]
            : [
                { u0: 0.18, u1: 0.44, off: -0.24 },
                { u0: 0.50, u1: 0.78, off: 0.20 },
            ];
        for (const sl of slits) {
            const seg = spine.filter((p) => p.u >= sl.u0 && p.u <= sl.u1);
            if (seg.length < 4) continue;
            const sUp: Point2D[] = [];
            const sLo: Point2D[] = [];
            for (let i = 0; i < seg.length; i++) {
                const p = seg[i];
                const env = Math.sin((i / (seg.length - 1)) * Math.PI);
                const nx = -Math.sin(p.angle);
                const ny = Math.cos(p.angle);
                const cx = p.x + nx * p.hw * sl.off;
                const cy = p.y + ny * p.hw * sl.off;
                const sr = Math.max(0.22, p.hw * 0.17 * env);
                sUp.push({ x: cx - nx * sr, y: cy - ny * sr });
                sLo.push({ x: cx + nx * sr, y: cy + ny * sr });
            }
            ctx.moveTo(sUp[0].x, sUp[0].y);
            for (let i = 1; i < sUp.length; i++) {
                ctx.lineTo(sUp[i].x, sUp[i].y);
            }
            for (let i = sLo.length - 1; i >= 0; i--) {
                ctx.lineTo(sLo[i].x, sLo[i].y);
            }
            ctx.closePath();
        }
    }

    const isWoodyHero = !isFern &&
        !isOrchidBlade &&
        !branch.ghost &&
        !branch.midground;
    ctx.fillStyle = isOrchidBlade
        ? pal.inkGrade(branch.ghost ? "qing" : "nong", layerA)
        : isWoodyHero
        ? pal.inkGrade("nong", 0.86 * layerA)
        : pal.stroke("ink", layerA);
    ctx.fill(allowFeibai ? "evenodd" : "nonzero");

    // 老辣古木：轻染苍古赭石皮色 + 背光侧破墨焦墨重脊
    if (isWoodyHero && branch.widthStart >= 3.8 * scale && spine.length > 5) {
        ctx.fillStyle = pal.wash("sub", 0.22 * layerA);
        ctx.fill(allowFeibai ? "evenodd" : "nonzero");

        const spineL: Point2D[] = [];
        const spineR: Point2D[] = [];
        for (const p of spine) {
            const nx = -Math.sin(p.angle);
            const ny = Math.cos(p.angle);
            const cx = p.x - nx * p.hw * 0.30;
            const cy = p.y - ny * p.hw * 0.30;
            const rHw = Math.max(0.25, p.hw * 0.42);
            spineL.push({ x: cx + nx * rHw, y: cy + ny * rHw });
            spineR.push({ x: cx - nx * rHw, y: cy - ny * rHw });
        }
        ctx.beginPath();
        ctx.moveTo(spineL[0].x, spineL[0].y);
        for (let i = 1; i < spineL.length; i++) {
            ctx.lineTo(spineL[i].x, spineL[i].y);
        }
        for (let i = spineR.length - 1; i >= 0; i--) {
            ctx.lineTo(spineR[i].x, spineR[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = pal.inkGrade("jiao", 0.94 * layerA);
        ctx.fill();
    }

    // 木本分枝「岐出顿节（上掖下托）」与腋芽苔点，消除圆头直线拼接感
    if (
        branch.parentRef !== null &&
        !branch.ghost &&
        !isFern &&
        !isOrchidBlade &&
        !branch.bambooNodes &&
        spine.length > 2
    ) {
        const s0 = spine[0];
        const nx = -Math.sin(s0.angle);
        const ny = Math.cos(s0.angle);
        const collarR = Math.max(1.2, s0.hw * 1.32);
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(
            s0.x,
            s0.y,
            collarR * 0.72,
            collarR * 1.05,
            s0.angle,
            0,
            Math.PI * 2,
        );
        ctx.fillStyle = pal.inkGrade("jiao", 0.78 * layerA);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(
            s0.x + nx * s0.hw * 1.15,
            s0.y + ny * s0.hw * 1.15,
            Math.max(0.75, 1.05 * scale),
            0,
            Math.PI * 2,
        );
        ctx.fillStyle = pal.inkGrade("jiao", 0.68 * layerA);
        ctx.fill();
        ctx.restore();
    }

    // Horizontal moss dots (taidian) along main branch turns
    if (
        !isFern &&
        !isOrchidBlade &&
        !branch.ghost &&
        !branch.midground &&
        branch.widthStart > 1.8 * scale &&
        spine.length > 6
    ) {
        const knotTargets = [0.24, 0.46, 0.68, 0.82];
        ctx.fillStyle = pal.inkGrade("jiao", 0.86);
        for (let k = 0; k < knotTargets.length; k++) {
            const targetU = knotTargets[k];
            if (bp < targetU + 0.05) continue;
            const idx = Math.min(
                spine.length - 1,
                Math.floor(targetU * totalSegs),
            );
            const kp = spine[idx];
            const side = (k + Math.round(branch.phase * 2)) % 2 === 0 ? 1 : -1;
            const nx = -Math.sin(kp.angle) * side;
            const ny = Math.cos(kp.angle) * side;
            ctx.beginPath();
            ctx.ellipse(
                kp.x + nx * kp.hw * 0.92,
                kp.y + ny * kp.hw * 0.92,
                Math.max(1.1, kp.hw * 0.68),
                Math.max(0.65, kp.hw * 0.36),
                kp.angle + 0.35 * side,
                0,
                Math.PI * 2,
            );
            ctx.fill();
        }
    }

    // Sculpted winter snow cushions on upper edge of plum branches
    if (branch.snowCushions && !branch.ghost && spine.length > 8) {
        ctx.save();
        for (let i = 3; i < spine.length - 5; i += 6) {
            const p0 = spine[i];
            const p1 = spine[i + 2];
            const p2 = spine[i + 3];
            const nx = -Math.sin(p1.angle);
            const ny = Math.cos(p1.angle);
            const sign = ny < 0 ? 1 : -1;
            const lift = p1.hw + 2.2 * scale;
            const ax = p0.x + nx * sign * p0.hw * 0.82;
            const ay = p0.y + ny * sign * p0.hw * 0.82;
            const bx = p2.x + nx * sign * p2.hw * 0.82;
            const by = p2.y + ny * sign * p2.hw * 0.82;
            const cx = p1.x + nx * sign * lift;
            const cy = p1.y + ny * sign * lift - 1.2 * scale;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.quadraticCurveTo(cx, cy, bx, by);
            ctx.quadraticCurveTo(p1.x, p1.y, ax, ay);
            ctx.closePath();
            ctx.fillStyle = pal.highlight(pal.isDark ? 0.48 : 0.90);
            ctx.fill();
            ctx.strokeStyle = pal.inkGrade("dan", 0.35);
            ctx.lineWidth = Math.max(0.45, 0.55 * scale);
            ctx.stroke();
        }
        ctx.restore();
    }

    if (
        !reducedMotion && !branch.ghost && !branch.midground && bp > 0.02 &&
        bp < 0.98
    ) {
        const tipFade = Math.sin(bp * Math.PI);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = pal.stroke("accent", 0.85 * tipFade);
        ctx.fill();
    }
}

function drawGinkgoLeaf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: GinkgoOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const stemP = easeOutCubic(clamp(p / 0.24, 0, 1));
    const washP = easeOutCubic(clamp((p - 0.14) / 0.58, 0, 1));
    const detailP = easeOutCubic(clamp((p - 0.45) / 0.55, 0, 1));
    if (stemP <= 0.01) return;

    const s = o.size;
    const stem = o.stemLen * stemP;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Calligraphic stem
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(stem * 0.5, -stem * 0.14, stem, 0);
    ctx.strokeStyle = pal.stroke("ink", 0.78 * layerA);
    ctx.lineWidth = o.ghost ? 0.65 : 1.05;
    ctx.lineCap = "round";
    ctx.stroke();

    if (washP <= 0.01) {
        ctx.restore();
        return;
    }
    ctx.translate(o.stemLen, 0);

    const spreadL = o.profile ? -0.54 : -0.92;
    const spreadR = o.profile ? 0.78 : 0.92;
    const lx = Math.cos(spreadL) * s;
    const ly = Math.sin(spreadL) * s;
    const rx = Math.cos(spreadR) * s;
    const ry = Math.sin(spreadR) * s;
    const midX = s * (1 - o.notch);
    const midY = o.profile ? s * 0.08 : 0;

    // 银杏真叶双裂扇缘（两侧略带微波裂）
    const traceFan = () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(lx * 0.5, ly * 0.42, lx, ly);
        ctx.bezierCurveTo(
            s * 0.96,
            ly * 0.94,
            s * 1.09,
            ly * 0.52,
            s * 0.99,
            ly * 0.34,
        );
        ctx.bezierCurveTo(
            s * 1.07,
            ly * 0.22,
            s * 1.04,
            ly * 0.08,
            midX,
            midY,
        );
        ctx.bezierCurveTo(
            s * 1.04,
            ry * 0.08,
            s * 1.07,
            ry * 0.22,
            s * 0.99,
            ry * 0.34,
        );
        ctx.bezierCurveTo(
            s * 1.09,
            ry * 0.52,
            s * 0.96,
            ry * 0.94,
            rx,
            ry,
        );
        ctx.quadraticCurveTo(rx * 0.5, ry * 0.42, 0, 0);
        ctx.closePath();
    };

    // Mokuhanga off-register under-wash
    if (!o.ghost) {
        ctx.save();
        ctx.translate(1.1, 0.8);
        traceFan();
        ctx.fillStyle = pal.fill(o.tint, 0.42 * washP * layerA);
        ctx.fill();
        ctx.restore();
    }

    // 撞水撞色主晕染
    const rOuter = Math.max(2, s * 1.15);
    const grad = ctx.createRadialGradient(
        s * 0.14,
        0,
        Math.max(1, s * 0.08),
        s * 0.2,
        0,
        rOuter,
    );
    grad.addColorStop(0, pal.wash(o.tint, 1.30 * washP * layerA));
    grad.addColorStop(0.55, pal.fill(o.tint, 1.10 * washP * layerA));
    grad.addColorStop(1, pal.fill(o.tint, 0.36 * washP * layerA));
    traceFan();
    ctx.fillStyle = grad;
    ctx.fill();

    // 叶柄向扇心撞水伴色晕染（金叶透苍翠 / 墨叶边缘泛微金）
    if (!o.ghost) {
        const companionTint: TintRole = o.tint === "ink" ? "sub" : "sub";
        const chargeGrad = ctx.createRadialGradient(
            o.tint === "ink" ? s * 0.84 : s * 0.12,
            0,
            0.5,
            o.tint === "ink" ? s * 0.74 : s * 0.24,
            0,
            Math.max(2, s * 0.72),
        );
        chargeGrad.addColorStop(
            0,
            pal.wash(
                companionTint,
                (o.tint === "ink" ? 0.44 : 0.65) * washP * layerA,
            ),
        );
        chargeGrad.addColorStop(1, pal.fill(companionTint, 0));
        traceFan();
        ctx.fillStyle = chargeGrad;
        ctx.fill();
    }

    if (!o.ghost && washP > 0.35) {
        strokeWaterline(ctx, o.tint, pal, 1, 0.66 * washP * layerA, s);
        traceFan();
        strokeGongbiOutline(ctx, o.tint, pal, washP * layerA, 0.72);
    }

    // Boneless side-brush splash 2: slightly offset overlapping brushstroke
    if (!o.ghost) {
        ctx.save();
        ctx.rotate(0.065 * Math.sin(o.phase * 2.1 + 0.7));
        ctx.scale(0.92, 0.94);
        traceFan();
        ctx.fillStyle = pal.wash(o.tint, 0.56 * washP * layerA);
        ctx.fill();
        ctx.restore();
    }

    // 9–11 条极细二叉放射扇脉
    if (detailP > 0.02) {
        const veins = o.profile ? 6 : 10;
        ctx.strokeStyle = pal.stroke("ink", 0.46 * detailP * layerA);
        ctx.lineCap = "round";
        for (let i = 0; i < veins; i++) {
            const frac = i / (veins - 1);
            const va = lerp(spreadL * 0.80, spreadR * 0.80, frac);
            const rLen = s *
                (0.54 + 0.30 * Math.abs(Math.sin(o.phase + i * 1.1))) * detailP;
            const mx = Math.cos(va + 0.03) * rLen * 0.52;
            const my = Math.sin(va + 0.03) * rLen * 0.52;
            ctx.beginPath();
            ctx.moveTo(1.5, 0);
            ctx.quadraticCurveTo(
                mx,
                my,
                Math.cos(va) * rLen,
                Math.sin(va) * rLen,
            );
            ctx.lineWidth = i % 2 === 0 ? 0.50 : 0.36;
            ctx.stroke();

            if (!o.ghost && i % 2 === 0 && rLen > 14) {
                const forkA = va + (frac < 0.5 ? -0.14 : 0.14);
                ctx.beginPath();
                ctx.moveTo(mx, my);
                ctx.lineTo(
                    Math.cos(forkA) * rLen * 0.94,
                    Math.sin(forkA) * rLen * 0.94,
                );
                ctx.lineWidth = 0.34;
                ctx.stroke();
            }
        }
    }
    ctx.restore();
}

function drawEucalyptusLeaf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: EucalyptusOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const stemP = easeOutCubic(clamp(p / 0.22, 0, 1));
    const washP = easeOutCubic(clamp((p - 0.14) / 0.56, 0, 1));
    const detailP = easeOutCubic(clamp((p - 0.42) / 0.58, 0, 1));
    if (stemP <= 0.01) return;

    const rx = o.rx;
    const ry = o.ry;
    const stem = o.stemLen * stemP;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(stem, 0);
    ctx.strokeStyle = pal.stroke("ink", 0.72 * layerA);
    ctx.lineWidth = o.ghost ? 0.65 : 0.95;
    ctx.lineCap = "round";
    ctx.stroke();

    if (washP <= 0.01) {
        ctx.restore();
        return;
    }
    ctx.translate(o.stemLen, 0);

    const traceLeaf = () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        if (o.profile) {
            ctx.bezierCurveTo(
                rx * 0.28,
                -ry * 1.38,
                rx * 1.32,
                -ry * 0.86,
                rx * 1.66,
                -ry * 0.18,
            );
            ctx.bezierCurveTo(rx * 1.24, ry * 0.44, rx * 0.35, ry * 0.50, 0, 0);
        } else {
            ctx.bezierCurveTo(
                rx * 0.12,
                -ry * 1.08,
                rx * 1.38,
                -ry * 1.04,
                rx * 1.68,
                0,
            );
            ctx.bezierCurveTo(rx * 1.38, ry * 1.04, rx * 0.12, ry * 1.08, 0, 0);
        }
        ctx.closePath();
    };

    // Mokuhanga watercolor wash with translucent edge + capillary waterline
    const cx = rx * 0.66;
    const cy = o.profile ? -ry * 0.24 : -ry * 0.08;
    const grad = ctx.createRadialGradient(
        cx,
        cy,
        Math.max(1, ry * 0.12),
        rx * 0.84,
        0,
        Math.max(2, rx * 1.12),
    );
    grad.addColorStop(0, pal.wash(o.tint, 1.34 * washP * layerA));
    grad.addColorStop(0.58, pal.fill(o.tint, 1.10 * washP * layerA));
    grad.addColorStop(1, pal.fill(o.tint, 0.32 * washP * layerA));
    traceLeaf();
    ctx.fillStyle = grad;
    ctx.fill();
    if (!o.ghost && washP > 0.35) {
        strokeWaterline(ctx, o.tint, pal, 1, 0.56 * washP * layerA, rx * 1.4);
        traceLeaf();
        strokeGongbiOutline(ctx, o.tint, pal, washP * layerA, 0.68);
    }

    if (!o.ghost) {
        const coreGrad = ctx.createRadialGradient(
            rx * 0.56,
            cy * 1.2,
            0.5,
            rx * 0.68,
            cy * 0.5,
            Math.max(2, rx * 0.72),
        );
        coreGrad.addColorStop(0, pal.wash(o.tint, 0.85 * washP * layerA));
        coreGrad.addColorStop(0.6, pal.fill(o.tint, 0.45 * washP * layerA));
        coreGrad.addColorStop(1, pal.fill(o.tint, 0));
        traceLeaf();
        ctx.fillStyle = coreGrad;
        ctx.fill();

        // 尤加利银霜云母粉白微晕与伴色侧翼轻染
        const frostGrad = ctx.createRadialGradient(
            rx * 0.82,
            cy * 0.4,
            0.5,
            rx * 0.90,
            0,
            Math.max(2, rx * 0.85),
        );
        frostGrad.addColorStop(
            0,
            pal.highlight((pal.isDark ? 0.10 : 0.26) * washP * layerA),
        );
        frostGrad.addColorStop(
            0.65,
            pal.wash(
                o.tint === "sub" ? "accent" : "sub",
                0.20 * washP * layerA,
            ),
        );
        frostGrad.addColorStop(1, pal.highlight(0));
        traceLeaf();
        ctx.fillStyle = frostGrad;
        ctx.fill();
    }

    // Crisp calligraphic midrib only
    if (detailP > 0.02) {
        ctx.strokeStyle = pal.stroke("ink", 0.58 * detailP * layerA);
        ctx.lineWidth = o.ghost ? 0.45 : 0.78;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(1, 0);
        if (o.profile) {
            ctx.quadraticCurveTo(
                rx * 0.72,
                -ry * 0.28,
                rx * 1.44 * detailP,
                -ry * 0.16 * detailP,
            );
        } else {
            ctx.lineTo(rx * 1.42 * detailP, 0);
        }
        ctx.stroke();
    }
    ctx.restore();
}

function drawPlumBlossom(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: PlumOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const washP = easeOutCubic(clamp(p / 0.65, 0, 1));
    const stP = easeOutCubic(clamp((p - 0.36) / 0.64, 0, 1));
    if (washP <= 0.01) return;

    const r = o.size;
    const pose = o.pose ?? (o.profile ? "side" : "frontal");
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.rotation + angle * 0.2);
    if (pose === "side") ctx.scale(1.0, 0.72);
    else if (pose === "upward") ctx.scale(0.86, 0.94);

    // 没骨撞粉倒卵微凹梅瓣（非椭圆）
    const petalCount = pose === "side" ? 4 : 5;
    for (let i = 0; i < petalCount; i++) {
        const baseA = pose === "side"
            ? -1.25 + (i / 3) * 2.5
            : (i / 5) * Math.PI * 2;
        const a = baseA + Math.sin(o.phase + i * 1.7) * 0.09;
        const pLen = r * (0.94 + (i % 3) * 0.06) * washP;
        const pW = pLen * (0.48 + (i % 2) * 0.05);

        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        // 基部狭楔，上缘圆润略带微凹
        ctx.bezierCurveTo(
            pLen * 0.28,
            -pW * 0.46,
            pLen * 0.72,
            -pW * 0.96,
            pLen * 0.96,
            -pW * 0.24,
        );
        ctx.quadraticCurveTo(pLen * 0.91, 0, pLen * 0.96, pW * 0.24);
        ctx.bezierCurveTo(
            pLen * 0.72,
            pW * 0.96,
            pLen * 0.28,
            pW * 0.46,
            0,
            0,
        );
        ctx.closePath();

        const grad = ctx.createRadialGradient(
            pLen * 0.16,
            0,
            Math.max(0.5, pLen * 0.04),
            pLen * 0.56,
            0,
            Math.max(2, pLen * 0.85),
        );
        grad.addColorStop(
            0,
            pal.highlight((pal.isDark ? 0.24 : 0.76) * washP * layerA),
        );
        grad.addColorStop(0.55, pal.wash(o.tint, 1.40 * washP * layerA));
        grad.addColorStop(1, pal.waterline(o.tint, 0.86 * washP * layerA));
        ctx.fillStyle = grad;
        ctx.fill();

        if (!o.ghost && (i === 0 || i === 2)) {
            ctx.fillStyle = pal.wash(
                o.tint === "accent" ? "sub" : "accent",
                0.24 * washP * layerA,
            );
            ctx.fill();
        }
        if (!o.ghost && washP > 0.45 && i % 2 === 0) {
            strokeWaterline(ctx, o.tint, pal, 1, 0.54 * washP * layerA, pLen);
        }
        if (!o.ghost && washP > 0.35) {
            strokeGongbiOutline(ctx, o.tint, pal, washP * layerA, 0.66);
        }
        ctx.restore();
    }

    if (stP > 0.04) {
        if (pose === "back") {
            // 背嫣：五出星芒状浓墨梅萼居中托起花蒂
            ctx.fillStyle = pal.inkGrade("jiao", 0.92 * stP * layerA);
            for (let k = 0; k < 5; k++) {
                const ka = (k / 5) * Math.PI * 2 + 0.3;
                ctx.beginPath();
                ctx.ellipse(
                    Math.cos(ka) * r * 0.19,
                    Math.sin(ka) * r * 0.19,
                    Math.max(1.2, r * 0.18 * stP),
                    Math.max(0.75, r * 0.08 * stP),
                    ka,
                    0,
                    Math.PI * 2,
                );
                ctx.fill();
            }
        } else {
            if (pose === "side" || pose === "upward") {
                // 侧/仰姿态：花托底部的 3 爪浓墨丁香梅萼
                ctx.fillStyle = pal.inkGrade("jiao", 0.90 * stP * layerA);
                for (let k = -1; k <= 1; k++) {
                    const ka = Math.PI * 0.5 + k * 0.42;
                    ctx.beginPath();
                    ctx.ellipse(
                        Math.cos(ka) * r * 0.14,
                        Math.sin(ka) * r * 0.14,
                        Math.max(1.0, r * 0.13 * stP),
                        Math.max(0.6, r * 0.07 * stP),
                        ka,
                        0,
                        Math.PI * 2,
                    );
                    ctx.fill();
                }
            }

            // 浓墨花心点与 11–15 根纤细攒簇游丝花蕊
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(1.1, r * 0.12 * stP), 0, Math.PI * 2);
            ctx.fillStyle = pal.inkGrade("jiao", 0.92 * stP * layerA);
            ctx.fill();

            const stamenCount = r >= 18 ? 15 : 11;
            for (let i = 0; i < stamenCount; i++) {
                const a = (i / stamenCount) * Math.PI * 2 +
                    Math.sin(o.phase + i) * 0.12;
                const len = r * (0.32 + ((i * 7) % 5) * 0.075) * stP;
                const ex = Math.cos(a) * len;
                const ey = Math.sin(a) * len;
                const cx = Math.cos(a + 0.16) * len * 0.56;
                const cy = Math.sin(a + 0.16) * len * 0.56;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(cx, cy, ex, ey);
                ctx.strokeStyle = pal.inkGrade("nong", 0.84 * stP * layerA);
                ctx.lineWidth = Math.max(0.30, 0.38 * (r / 18));
                ctx.lineCap = "round";
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(
                    ex,
                    ey,
                    Math.max(0.6, (r >= 18 ? 1.15 : 0.92) * stP),
                    0,
                    Math.PI * 2,
                );
                ctx.fillStyle = pal.goldDust(0.95 * stP * layerA);
                ctx.fill();
            }
        }
    }
    ctx.restore();
}

function drawPlumBud(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: PlumOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const washP = easeOutCubic(clamp(p / 0.72, 0, 1));
    if (washP <= 0.02) return;
    const r = o.size;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const grad = ctx.createRadialGradient(
        r * 0.6,
        0,
        Math.max(0.5, r * 0.12),
        r * 0.85,
        0,
        Math.max(2, r * 1.15),
    );
    grad.addColorStop(0, pal.wash(o.tint, 1.45 * washP * layerA));
    grad.addColorStop(0.65, pal.fill(o.tint, 1.15 * washP * layerA));
    grad.addColorStop(1, pal.fill(o.tint, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(r * 0.85, 0, r * 1.12, r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();

    // Crisp sumi-ink calyx cup
    ctx.beginPath();
    ctx.arc(r * 0.15, 0, r * 0.56, -0.92, 0.92);
    ctx.strokeStyle = pal.stroke("ink", 0.92 * washP * layerA);
    ctx.lineWidth = 1.25;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
}

function drawFernPinna(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: FernPinnaOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const strokeP = easeOutQuart(clamp(p / 0.72, 0, 1));
    const veinP = easeOutCubic(clamp((p - 0.24) / 0.65, 0, 1));
    if (strokeP <= 0.02) return;

    const len = o.len * strokeP;
    const w = o.width * 0.92;
    const midPt = (t: number): Point2D => {
        const foldKick = o.profile && t > 0.44
            ? Math.sin((t - 0.44) * Math.PI * 1.1) * len * 0.04 * o.side
            : 0;
        return {
            x: t * len,
            y: o.curve * len * Math.pow(t, 1.55) +
                o.whip * len * Math.sin(t * Math.PI) * t +
                foldKick,
        };
    };

    const samples = 26;
    const upper: Point2D[] = [];
    const lower: Point2D[] = [];
    const spine: Point2D[] = [];
    const widths: number[] = [];

    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const mp = midPt(t);
        const mpNext = midPt(Math.min(1, t + 0.02));
        const tang = Math.atan2(mpNext.y - mp.y, mpNext.x - mp.x);
        const nx = -Math.sin(tang);
        const ny = Math.cos(tang);

        let hw: number;
        if (o.profile) {
            if (t < 0.45) {
                const lt = t / 0.45;
                hw = w * (0.18 + 0.88 * Math.sin(lt * Math.PI * 0.72)) *
                    lerp(1, 0.18, Math.pow(lt, 2.2));
            } else {
                const rt = (t - 0.45) / 0.55;
                hw = w *
                    (0.18 + 0.42 * Math.sin(rt * Math.PI * 0.88)) *
                    Math.pow(1 - rt, 0.78);
            }
        } else {
            const belly = t < 0.30
                ? lerp(0.20, 1.05, Math.sin((t / 0.30) * Math.PI * 0.5))
                : 1.05 * Math.pow(1 - (t - 0.30) / 0.70, 1.38);
            hw = w * belly;
        }
        hw = Math.max(0.18, hw);

        const asym = o.profile && t > 0.45 ? 0.85 : 1.08;
        upper.push({ x: mp.x - nx * hw * asym, y: mp.y - ny * hw * asym });
        lower.push({ x: mp.x + nx * hw, y: mp.y + ny * hw });
        spine.push(mp);
        widths.push(hw);
    }

    const tipPt = spine[spine.length - 1];

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const iw = o.inkWeight;
    const grad = ctx.createLinearGradient(0, 0, Math.max(1, tipPt.x), tipPt.y);
    if (o.tint === "ink") {
        grad.addColorStop(0, pal.wash("ink", 1.24 * iw * strokeP * layerA));
        grad.addColorStop(0.55, pal.fill("ink", 1.05 * iw * strokeP * layerA));
        grad.addColorStop(1, pal.fill("ink", 0.12 * strokeP * layerA));
    } else {
        grad.addColorStop(0, pal.wash(o.tint, 1.26 * iw * strokeP * layerA));
        grad.addColorStop(
            0.55,
            pal.fill(o.tint, 1.08 * iw * strokeP * layerA),
        );
        grad.addColorStop(1, pal.fill(o.tint, 0.14 * strokeP * layerA));
    }

    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 1; i < upper.length; i++) {
        ctx.lineTo(upper[i].x, upper[i].y);
    }
    for (let i = lower.length - 2; i >= 0; i--) {
        ctx.lineTo(lower[i].x, lower[i].y);
    }
    ctx.closePath();

    // True transparent dry-brush flying-white (feibai) bristle slits via evenodd
    const useFeibai = o.feibai && !o.ghost && !o.profile && len >= 62 &&
        strokeP > 0.72;
    if (useFeibai) {
        const slits = [
            { t0: 0.36, t1: 0.78, off: 0.24, r: 0.13 },
            { t0: 0.44, t1: 0.70, off: -0.22, r: 0.10 },
        ];
        for (const sl of slits) {
            const i0 = Math.round(sl.t0 * samples);
            const i1 = Math.round(sl.t1 * samples);
            if (i1 - i0 < 4) continue;
            const sUp: Point2D[] = [];
            const sLo: Point2D[] = [];
            for (let i = i0; i <= i1; i++) {
                const u = (i - i0) / (i1 - i0);
                const env = Math.sin(u * Math.PI);
                const mp = spine[i];
                const mpN = spine[Math.min(samples, i + 1)];
                const tang = Math.atan2(mpN.y - mp.y, mpN.x - mp.x);
                const nx = -Math.sin(tang);
                const ny = Math.cos(tang);
                const hw = widths[i];
                const cx = mp.x + nx * hw * sl.off;
                const cy = mp.y + ny * hw * sl.off;
                const sr = Math.max(0.28, hw * sl.r * env);
                sUp.push({ x: cx - nx * sr, y: cy - ny * sr });
                sLo.push({ x: cx + nx * sr, y: cy + ny * sr });
            }
            ctx.moveTo(sUp[0].x, sUp[0].y);
            for (let k = 1; k < sUp.length; k++) {
                ctx.lineTo(sUp[k].x, sUp[k].y);
            }
            for (let k = sLo.length - 1; k >= 0; k--) {
                ctx.lineTo(sLo[k].x, sLo[k].y);
            }
            ctx.closePath();
        }
    }

    ctx.fillStyle = grad;
    ctx.fill(useFeibai ? "evenodd" : "nonzero");
    if (!o.ghost && strokeP > 0.35) {
        strokeGongbiOutline(ctx, o.tint, pal, strokeP * layerA, 0.58);
    }

    // Half-length calligraphic midrib fading into the boneless whip tip
    if (veinP > 0.02) {
        const vEnd = midPt(0.54 * veinP);
        const vCtrl = midPt(0.27 * veinP);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(vCtrl.x, vCtrl.y, vEnd.x, vEnd.y);
        ctx.strokeStyle = pal.stroke("ink", 0.52 * veinP * layerA);
        ctx.lineWidth = o.ghost ? 0.42 : 0.66;
        ctx.lineCap = "round";
        ctx.stroke();
    }
    ctx.restore();
}

function spawnDrifter(
    scene: BotanicalScene,
    drifters: Drifter[],
    timeSec: number,
    windCalm: number,
    frameSeq: number,
    fromOrn: BotanicalOrnament | null = null,
): void {
    if (!scene.ornaments.length) return;
    let cand = fromOrn;
    if (!cand) {
        const fgOrns = scene.ornaments.filter((o) => !o.ghost);
        const pool = fgOrns.length ? fgOrns : scene.ornaments;
        cand = pool[Math.floor(Math.random() * pool.length)];
    }
    const wp = computeBranchWorldPoints(
        cand.branch,
        timeSec,
        false,
        windCalm,
        scene.scale,
        frameSeq,
    )[cand.idx];
    const driftDir = scene.side === "left" ? 1 : -1;
    drifters.push({
        species: scene.species,
        x: wp.x,
        y: wp.y,
        vx: driftDir * (14 + Math.random() * 14),
        vy: 15 + Math.random() * 11,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.8,
        phase: Math.random() * Math.PI * 2,
        size: (7 + Math.random() * 5) * scene.scale,
        tint: Math.random() < 0.55 ? "accent" : "sub",
        born: timeSec,
        life: 6.5 + Math.random() * 3,
    });
}

function drawDrifters(
    ctx: CanvasRenderingContext2D,
    drifters: Drifter[],
    height: number,
    timeSec: number,
    dt: number,
    pal: BotanicalPalette,
): void {
    for (let i = drifters.length - 1; i >= 0; i--) {
        const d = drifters[i];
        const age = timeSec - d.born;
        if (age >= d.life || d.y > height + 40) {
            drifters.splice(i, 1);
            continue;
        }
        d.x += (d.vx + Math.sin(timeSec * 1.4 + d.phase) * 14) * dt;
        d.y += d.vy * dt;
        d.rot += d.vrot * dt;

        const fadeIn = clamp(age / 0.6, 0, 1);
        const fadeOut = clamp((d.life - age) / 1.4, 0, 1);
        const alpha = fadeIn * fadeOut * 0.8;
        const flipY = 0.38 + 0.62 * Math.abs(Math.cos(timeSec * 1.9 + d.phase));

        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.scale(1, flipY);

        if (d.species === "ginkgo") {
            const s = d.size * 1.15;
            ctx.beginPath();
            ctx.moveTo(-s * 0.35, 0);
            ctx.lineTo(s * 0.6, -s * 0.52);
            ctx.quadraticCurveTo(s * 0.85, 0, s * 0.6, s * 0.52);
            ctx.closePath();
        } else if (d.species === "plum") {
            ctx.beginPath();
            ctx.ellipse(0, 0, d.size * 0.62, d.size * 0.48, 0, 0, Math.PI * 2);
        } else if (d.species === "fern") {
            const s = d.size * 1.25;
            ctx.beginPath();
            ctx.moveTo(-s * 0.72, 0);
            ctx.bezierCurveTo(
                -s * 0.2,
                -s * 0.34,
                s * 0.38,
                -s * 0.22,
                s * 0.82,
                -s * 0.14,
            );
            ctx.bezierCurveTo(
                s * 0.36,
                s * 0.18,
                -s * 0.2,
                s * 0.28,
                -s * 0.72,
                0,
            );
            ctx.closePath();
        } else if (d.species === "orchid") {
            ctx.beginPath();
            ctx.ellipse(0, 0, d.size * 0.84, d.size * 0.36, 0, 0, Math.PI * 2);
        } else if (d.species === "bamboo") {
            const s = d.size * 1.25;
            ctx.beginPath();
            ctx.moveTo(-s * 0.85, 0);
            ctx.quadraticCurveTo(0, -s * 0.28, s * 0.85, 0);
            ctx.quadraticCurveTo(0, s * 0.28, -s * 0.85, 0);
            ctx.closePath();
        } else if (d.species === "maple") {
            const s = d.size * 0.95;
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.lineTo(s * 0.32, -s * 0.32);
            ctx.lineTo(s * 0.95, -s * 0.22);
            ctx.lineTo(s * 0.42, s * 0.24);
            ctx.lineTo(s * 0.56, s * 0.88);
            ctx.lineTo(0, s * 0.45);
            ctx.lineTo(-s * 0.56, s * 0.88);
            ctx.lineTo(-s * 0.42, s * 0.24);
            ctx.lineTo(-s * 0.95, -s * 0.22);
            ctx.lineTo(-s * 0.32, -s * 0.32);
            ctx.closePath();
        } else {
            ctx.beginPath();
            ctx.ellipse(0, 0, d.size * 0.88, d.size * 0.54, 0, 0, Math.PI * 2);
        }

        const rGrad = Math.max(2, d.size);
        const grad = ctx.createRadialGradient(0, 0, 0.5, 0, 0, rGrad);
        grad.addColorStop(0, pal.wash(d.tint, alpha * 1.3));
        grad.addColorStop(0.65, pal.fill(d.tint, alpha * 0.9));
        grad.addColorStop(1, pal.fill(d.tint, 0));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
    }
}

function drawOrchidBlossom(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: OrchidBlossomOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const washP = easeOutCubic(clamp(p / 0.7, 0, 1));
    const dotP = easeOutCubic(clamp((p - 0.38) / 0.62, 0, 1));
    if (washP <= 0.02) return;
    const r = o.size * washP;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.rotation + angle * 0.25);
    if (o.profile) ctx.scale(1, 0.78);

    // 雕塑感春兰五瓣（三主副瓣修长收尖微扭 + 两捧瓣合抱鼻头）
    const petalAngles = [-1.57, -0.45, 0.45, -2.55, 2.55];
    for (let i = 0; i < petalAngles.length; i++) {
        const pa = petalAngles[i];
        const isInner = i >= 3;
        const plen = r * (isInner ? 0.76 : 1.08);
        const pw = plen * (isInner ? 0.28 : 0.21);
        ctx.save();
        ctx.rotate(pa);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(
            plen * 0.34,
            -pw,
            plen * 0.78,
            -pw * 0.55,
            plen,
            isInner ? 0 : (i === 1 ? -pw * 0.25 : pw * 0.18),
        );
        ctx.bezierCurveTo(plen * 0.78, pw * 0.55, plen * 0.34, pw, 0, 0);
        ctx.closePath();
        const grad = ctx.createRadialGradient(
            plen * 0.24,
            0,
            0.5,
            plen * 0.52,
            0,
            Math.max(2, plen * 0.75),
        );
        grad.addColorStop(0, pal.wash("sub", 0.72 * washP * layerA));
        grad.addColorStop(0.45, pal.wash(o.tint, 1.28 * washP * layerA));
        grad.addColorStop(1, pal.fill(o.tint, 0.36 * washP * layerA));
        ctx.fillStyle = grad;
        ctx.fill();
        if (!o.ghost && washP > 0.35) {
            strokeGongbiOutline(ctx, o.tint, pal, washP * layerA, 0.64);
        }
        ctx.restore();
    }

    // 卷曲唇瓣与朱砂点舌（三点朱砂）
    if (dotP > 0.02) {
        ctx.beginPath();
        ctx.ellipse(0, r * 0.28, r * 0.22, r * 0.30, 0, 0, Math.PI * 2);
        ctx.fillStyle = pal.wash("accent", 1.18 * dotP * layerA);
        ctx.fill();

        ctx.fillStyle = pal.inkGrade("jiao", 0.90 * dotP * layerA);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.8, r * 0.09 * dotP), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = pal.cinnabar(0.92 * dotP * layerA);
        ctx.beginPath();
        ctx.arc(
            -r * 0.07,
            r * 0.25,
            Math.max(0.55, r * 0.052 * dotP),
            0,
            Math.PI * 2,
        );
        ctx.arc(
            r * 0.07,
            r * 0.29,
            Math.max(0.55, r * 0.052 * dotP),
            0,
            Math.PI * 2,
        );
        ctx.arc(
            0,
            r * 0.36,
            Math.max(0.48, r * 0.046 * dotP),
            0,
            Math.PI * 2,
        );
        ctx.fill();
    }
    ctx.restore();
}

function drawBambooLeaf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: BambooLeafOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const strokeP = easeOutQuart(clamp(p / 0.75, 0, 1));
    if (strokeP <= 0.02) return;
    const len = o.len * strokeP;
    const w = o.width;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(
        len * 0.28,
        -w + o.curve * len * 0.3,
        len * 0.65,
        -w * 0.55 + o.curve * len * 0.7,
        len,
        o.curve * len,
    );
    ctx.bezierCurveTo(
        len * 0.62,
        w * 0.45 + o.curve * len * 0.7,
        len * 0.24,
        w * 0.85 + o.curve * len * 0.3,
        0,
        0,
    );
    ctx.closePath();

    // 潇洒枯笔飞白破锋丝口（evenodd）
    const useFeibai = o.feibai && !o.ghost && len >= 42 && strokeP > 0.7;
    if (useFeibai) {
        const s0 = 0.28;
        const s1 = 0.68;
        const steps = 6;
        const fUp: Point2D[] = [];
        const fLo: Point2D[] = [];
        for (let i = 0; i <= steps; i++) {
            const t = lerp(s0, s1, i / steps);
            const env = Math.sin((i / steps) * Math.PI);
            const cx = t * len;
            const cy = o.curve * len * Math.pow(t, 1.15) - w * 0.14;
            const sr = Math.max(0.22, w * 0.14 * env);
            fUp.push({ x: cx, y: cy - sr });
            fLo.push({ x: cx, y: cy + sr });
        }
        ctx.moveTo(fUp[0].x, fUp[0].y);
        for (let i = 1; i < fUp.length; i++) {
            ctx.lineTo(fUp[i].x, fUp[i].y);
        }
        for (let i = fLo.length - 1; i >= 0; i--) {
            ctx.lineTo(fLo[i].x, fLo[i].y);
        }
        ctx.closePath();
    }

    const grad = ctx.createLinearGradient(
        0,
        0,
        Math.max(1, len),
        o.curve * len,
    );
    if (o.tint === "ink") {
        grad.addColorStop(
            0,
            pal.inkGrade(
                o.midground ? "zhong" : "jiao",
                (o.midground ? 0.76 : 0.92) * strokeP * layerA,
            ),
        );
        grad.addColorStop(
            0.7,
            pal.inkGrade(
                o.midground ? "dan" : "nong",
                (o.midground ? 0.68 : 0.84) * strokeP * layerA,
            ),
        );
        grad.addColorStop(
            1,
            pal.inkGrade(
                "nong",
                (o.midground ? 0.48 : 0.72) * strokeP * layerA,
            ),
        );
    } else {
        grad.addColorStop(0, pal.wash(o.tint, 1.32 * strokeP * layerA));
        grad.addColorStop(0.65, pal.fill(o.tint, 1.12 * strokeP * layerA));
        grad.addColorStop(1, pal.fill(o.tint, 0.42 * strokeP * layerA));
    }
    ctx.fillStyle = grad;
    ctx.fill(useFeibai ? "evenodd" : "nonzero");
    if (!o.ghost && strokeP > 0.35) {
        strokeGongbiOutline(ctx, o.tint, pal, strokeP * layerA, 0.58);
    }
    if (!o.ghost && strokeP > 0.45) {
        strokeWaterline(ctx, o.tint, pal, 1, 0.46 * strokeP * layerA, len);
        strokeGongbiOutline(ctx, o.tint, pal, strokeP * layerA, 0.60);
    }

    // Crisp central vein
    ctx.beginPath();
    ctx.moveTo(1, 0);
    ctx.quadraticCurveTo(
        len * 0.45,
        o.curve * len * 0.42,
        len * 0.75,
        o.curve * len * 0.72,
    );
    ctx.strokeStyle = pal.vein(o.tint, 0.65 * strokeP * layerA);
    ctx.lineWidth = o.ghost ? 0.38 : 0.55;
    ctx.stroke();

    ctx.restore();
}

function drawMapleLeaf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: MapleLeafOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const stemP = easeOutCubic(clamp(p / 0.25, 0, 1));
    const washP = easeOutCubic(clamp((p - 0.12) / 0.62, 0, 1));
    if (stemP <= 0.02) return;
    const stem = o.stemLen * stemP;
    const s = o.size * Math.max(0.15, washP);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(stem, 0);
    ctx.strokeStyle = pal.stroke("ink", 0.72 * layerA);
    ctx.lineWidth = o.ghost ? 0.55 : 0.85;
    ctx.lineCap = "round";
    ctx.stroke();

    if (washP <= 0.05) {
        ctx.restore();
        return;
    }

    ctx.translate(stem, 0);
    ctx.rotate(o.rotation);
    if (o.profile) ctx.scale(1, 0.72);

    // 经典七裂鸡爪槭（5 主裂 + 2 微小基裂，裂尖修长锐美）
    const lobes = [-2.02, -1.42, -0.72, 0, 0.72, 1.42, 2.02];
    const lobeLens = [0.34, 0.62, 0.88, 1.04, 0.88, 0.62, 0.34];
    const traceMaple = () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let i = 0; i < lobes.length; i++) {
            const la = lobes[i];
            const ll = s * lobeLens[i];
            const tipX = Math.cos(la) * ll;
            const tipY = Math.sin(la) * ll;
            const prevA = i === 0 ? -2.28 : (lobes[i - 1] + la) * 0.5;
            const notchR = s * (i === 0 || i === 1 ? 0.19 : 0.32);
            const nx = Math.cos(prevA) * notchR;
            const ny = Math.sin(prevA) * notchR;
            const ctrlA = (prevA + la) * 0.5;
            ctx.quadraticCurveTo(
                Math.cos(ctrlA) * ll * 0.54,
                Math.sin(ctrlA) * ll * 0.54,
                nx,
                ny,
            );
            ctx.quadraticCurveTo(
                nx * 0.52 + tipX * 0.48,
                ny * 0.52 + tipY * 0.48,
                tipX,
                tipY,
            );
        }
        ctx.quadraticCurveTo(
            Math.cos(2.22) * s * 0.24,
            Math.sin(2.22) * s * 0.24,
            0,
            0,
        );
        ctx.closePath();
    };

    // Off-register Mokuhanga base print
    if (!o.ghost) {
        ctx.save();
        ctx.translate(1.0, 0.75);
        traceMaple();
        ctx.fillStyle = pal.fill(o.tint, 0.38 * washP * layerA);
        ctx.fill();
        ctx.restore();
    }

    const grad = ctx.createRadialGradient(
        s * 0.25,
        0,
        Math.max(0.5, s * 0.08),
        s * 0.45,
        0,
        Math.max(2, s * 1.05),
    );
    grad.addColorStop(0, pal.wash(o.tint, 1.32 * washP * layerA));
    grad.addColorStop(0.65, pal.fill(o.tint, 1.12 * washP * layerA));
    grad.addColorStop(1, pal.fill(o.tint, 0.34 * washP * layerA));
    traceMaple();
    ctx.fillStyle = grad;
    ctx.fill();

    // 掌心暖金赭撞色晕染，自然向深绯裂尖过渡
    if (!o.ghost) {
        const coreGrad = ctx.createRadialGradient(
            s * 0.14,
            0,
            0.5,
            s * 0.22,
            0,
            Math.max(2, s * 0.62),
        );
        coreGrad.addColorStop(0, pal.wash("sub", 0.78 * washP * layerA));
        coreGrad.addColorStop(1, pal.fill("sub", 0));
        traceMaple();
        ctx.fillStyle = coreGrad;
        ctx.fill();
    }

    if (!o.ghost && washP > 0.4) {
        strokeWaterline(ctx, o.tint, pal, 1, 0.56 * washP * layerA, s);
        traceMaple();
        strokeGongbiOutline(ctx, o.tint, pal, washP * layerA, 0.72);
    }

    // 放射掌脉与细微侧脉
    ctx.strokeStyle = pal.vein("ink", 0.56 * washP * layerA);
    ctx.lineCap = "round";
    for (let i = 0; i < lobes.length; i++) {
        const la = lobes[i];
        const ll = s * lobeLens[i] * 0.76;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(la) * ll, Math.sin(la) * ll);
        ctx.lineWidth = i >= 1 && i <= 5 ? 0.52 : 0.36;
        ctx.stroke();
    }
    ctx.restore();
}

function renderOrnamentItem(
    ctx: CanvasRenderingContext2D,
    o: BotanicalOrnament,
    wx: number,
    wy: number,
    angle: number,
    op: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    if (o.kind === "ginkgo") {
        drawGinkgoLeaf(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "eucalyptus") {
        drawEucalyptusLeaf(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "plumBlossom") {
        drawPlumBlossom(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "plumBud") {
        drawPlumBud(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "fernPinna") {
        drawFernPinna(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "orchidBlossom") {
        drawOrchidBlossom(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "bambooLeaf") {
        drawBambooLeaf(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "mapleLeaf") {
        drawMapleLeaf(ctx, wx, wy, angle, o, op, pal, layerA);
    }
}

export function triggerBotanicalResonance(
    runtime: BotanicalRuntimeState,
    kind: BotanicalResonanceKind,
    timeSec: number,
    scene: BotanicalScene | null,
    drifters: Drifter[],
    windCalm: number,
    frameSeq: number,
): void {
    switch (kind) {
        case "quick-capture": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 1.15;
            runtime.fireflyBoostStartSec = timeSec;
            if (scene && drifters.length < 4) {
                spawnDrifter(
                    scene,
                    drifters,
                    timeSec,
                    windCalm,
                    frameSeq,
                    null,
                );
            }
            if (runtime.visitorMode === "perched") {
                runtime.visitorMode = "departing";
                runtime.visitorStateStartSec = timeSec;
                runtime.visitorVx = -74;
                runtime.visitorVy = -62;
            }
            if (runtime.dewState === "hanging") {
                runtime.dewState = "falling";
                runtime.dewStateStartSec = timeSec;
                runtime.dewFallDist = 0;
            }
            break;
        }
        case "task-completed": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 0.72;
            runtime.fireflyBoostStartSec = timeSec;
            if (runtime.dewState === "hanging") {
                runtime.dewState = "falling";
                runtime.dewStateStartSec = timeSec;
                runtime.dewFallDist = 0;
            }
            break;
        }
        case "tasks-cleared": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 1.35;
            runtime.awakened = true;
            runtime.awakenStartSec = timeSec;
            runtime.haloPulseStartSec = timeSec;
            runtime.fireflyBoostStartSec = timeSec;
            break;
        }
        case "theme-ripple": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 0.9;
            break;
        }
        case "search-submit": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 0.8;
            runtime.fireflyBoostStartSec = timeSec;
            if (runtime.visitorMode === "perched") {
                runtime.visitorMode = "departing";
                runtime.visitorStateStartSec = timeSec;
                runtime.visitorVx = -70;
                runtime.visitorVy = -58;
            }
            if (runtime.dewState === "hanging") {
                runtime.dewState = "falling";
                runtime.dewStateStartSec = timeSec;
                runtime.dewFallDist = 0;
            }
            break;
        }
        case "ai-thinking": {
            runtime.gustDurationSec = 0;
            runtime.breezeImpulseStrength = 0;
            break;
        }
        case "ai-complete": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 0.42;
            runtime.haloPulseStartSec = timeSec;
            runtime.fireflyBoostStartSec = timeSec;
            break;
        }
    }
}

function drawSparrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    alpha: number,
    pal: BotanicalPalette,
    flapping: boolean,
    timeSec: number,
    reducedMotion: boolean,
    facingRight = false,
): void {
    if (alpha <= 0.02) return;
    const s = scale;
    // Occasional gentle head glance instead of perpetual mechanical bobbing
    const glancePhase = timeSec % 9.5;
    const headTilt = reducedMotion || flapping || glancePhase > 1.4
        ? 0
        : Math.sin((glancePhase / 1.4) * Math.PI) * 0.14;
    const tailAngle = reducedMotion || flapping ? -0.36 : -0.39;

    ctx.save();
    ctx.translate(x, y);
    if (facingRight) ctx.scale(-1, 1);

    if (!flapping) {
        ctx.strokeStyle = pal.inkGrade("jiao", 0.85 * alpha);
        ctx.lineWidth = Math.max(0.7, 0.9 * s);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-2 * s, -4 * s);
        ctx.lineTo(-3 * s, 0.5 * s);
        ctx.moveTo(2.5 * s, -4 * s);
        ctx.lineTo(2 * s, 0.5 * s);
        ctx.stroke();
    }

    // Stroke 1: Crisp upturned Xieyi tail brush
    ctx.save();
    ctx.translate(7 * s, -7 * s);
    ctx.rotate(tailAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(7 * s, -2.5 * s, 14 * s, -3.2 * s);
    ctx.lineTo(12 * s, 1.4 * s);
    ctx.closePath();
    ctx.fillStyle = pal.inkGrade("nong", 0.86 * alpha);
    ctx.fill();
    ctx.restore();

    // Stroke 2: Boneless pale-ink belly wash
    const bellyGrad = ctx.createRadialGradient(
        -2 * s,
        -9 * s,
        0.5,
        0,
        -8 * s,
        11 * s,
    );
    bellyGrad.addColorStop(0, pal.wash("ink", 1.15 * alpha));
    bellyGrad.addColorStop(0.7, pal.fill("ink", 0.9 * alpha));
    bellyGrad.addColorStop(1, pal.fill("ink", 0.25 * alpha));
    ctx.beginPath();
    ctx.ellipse(0, -8 * s, 8.8 * s, 6.2 * s, -0.22, 0, Math.PI * 2);
    ctx.fillStyle = bellyGrad;
    ctx.fill();

    // Warm ochre/accent throat dab
    ctx.beginPath();
    ctx.ellipse(-5 * s, -9.5 * s, 4.2 * s, 3.4 * s, -0.1, 0, Math.PI * 2);
    ctx.fillStyle = pal.wash("accent", 0.38 * alpha);
    ctx.fill();

    // Stroke 3: Head, beak & negative-space bright eye
    ctx.save();
    ctx.translate(-6.2 * s, -13.5 * s);
    ctx.rotate(headTilt);
    ctx.beginPath();
    ctx.arc(0, 0, 4.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = pal.inkGrade("jiao", 0.88 * alpha);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(1.0 * s, 0.9 * s, 2.2 * s, 1.5 * s, 0.1, 0, Math.PI * 2);
    ctx.fillStyle = pal.highlight(0.75 * alpha);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4.0 * s, -0.7 * s);
    ctx.lineTo(-8.0 * s, 0.4 * s);
    ctx.lineTo(-4.0 * s, 1.4 * s);
    ctx.closePath();
    ctx.fillStyle = pal.inkGrade("jiao", 0.92 * alpha);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-1.6 * s, -0.7 * s, Math.max(0.9, 1.05 * s), 0, Math.PI * 2);
    ctx.fillStyle = pal.highlight(0.95 * alpha);
    ctx.fill();
    ctx.restore();

    // Stroke 4: Folded or flapping Xieyi wings
    if (flapping) {
        const flap = Math.sin(timeSec * 34) * 0.65;
        for (const side of [-1, 1] as const) {
            ctx.save();
            ctx.translate(-1 * s, -11 * s);
            ctx.rotate(-0.4 + flap * side);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(6 * s, -14 * s, 14.5 * s, -8 * s);
            ctx.quadraticCurveTo(7 * s, -2 * s, 0, 0);
            ctx.fillStyle = pal.inkGrade("nong", 0.82 * alpha);
            ctx.fill();
            ctx.restore();
        }
    } else {
        ctx.beginPath();
        ctx.moveTo(-2 * s, -11.5 * s);
        ctx.quadraticCurveTo(5 * s, -12.8 * s, 10 * s, -6.5 * s);
        ctx.quadraticCurveTo(3 * s, -5.5 * s, -2 * s, -11.5 * s);
        ctx.fillStyle = pal.inkGrade("jiao", 0.86 * alpha);
        ctx.fill();
    }

    ctx.restore();
}

function drawLadybug(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    scale: number,
    alpha: number,
    pal: BotanicalPalette,
    flying: boolean,
    timeSec: number,
    reducedMotion: boolean,
): void {
    if (alpha <= 0.02) return;
    const s = scale;
    const antTwitch = reducedMotion ? 0 : Math.sin(timeSec * 4.5) * 0.14;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Subtle open translucent wings when flying
    if (flying) {
        const wingFlap = Math.sin(timeSec * 42) * 0.25;
        for (const side of [-1, 1] as const) {
            ctx.save();
            ctx.rotate(side * (0.65 + wingFlap));
            ctx.beginPath();
            ctx.ellipse(3.5 * s, 0, 4.5 * s, 1.8 * s, 0, 0, Math.PI * 2);
            ctx.fillStyle = pal.highlight(0.45 * alpha);
            ctx.fill();
            ctx.restore();
        }
    }

    // Accent/vermilion shell
    const shellGrad = ctx.createRadialGradient(
        -0.5 * s,
        -0.5 * s,
        0.3,
        0,
        0,
        4.6 * s,
    );
    shellGrad.addColorStop(0, pal.wash("accent", 1.35 * alpha));
    shellGrad.addColorStop(1, pal.stroke("accent", 0.92 * alpha));
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.2 * s, 3.3 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = shellGrad;
    ctx.fill();
    ctx.strokeStyle = pal.stroke("ink", 0.72 * alpha);
    ctx.lineWidth = Math.max(0.55, 0.7 * s);
    ctx.stroke();

    // Pronotum (head cap) with white eye-spots & fine legs
    ctx.beginPath();
    ctx.arc(-3.5 * s, 0, 1.65 * s, 0, Math.PI * 2);
    ctx.fillStyle = pal.inkGrade("jiao", 0.92 * alpha);
    ctx.fill();
    ctx.fillStyle = pal.highlight(0.88 * alpha);
    ctx.beginPath();
    ctx.arc(-3.3 * s, -0.7 * s, Math.max(0.35, 0.48 * s), 0, Math.PI * 2);
    ctx.arc(-3.3 * s, 0.7 * s, Math.max(0.35, 0.48 * s), 0, Math.PI * 2);
    ctx.fill();

    // Fine gripping legs
    ctx.strokeStyle = pal.inkGrade("nong", 0.65 * alpha);
    ctx.lineWidth = Math.max(0.4, 0.5 * s);
    ctx.beginPath();
    ctx.moveTo(-1.2 * s, -2.8 * s);
    ctx.lineTo(-2.4 * s, -4.4 * s);
    ctx.moveTo(1.2 * s, -2.8 * s);
    ctx.lineTo(1.8 * s, -4.4 * s);
    ctx.moveTo(-1.2 * s, 2.8 * s);
    ctx.lineTo(-2.4 * s, 4.4 * s);
    ctx.moveTo(1.2 * s, 2.8 * s);
    ctx.lineTo(1.8 * s, 4.4 * s);
    ctx.stroke();

    // Antennae
    ctx.strokeStyle = pal.stroke("ink", 0.8 * alpha);
    ctx.lineWidth = Math.max(0.45, 0.55 * s);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-4.8 * s, -0.5 * s);
    ctx.lineTo(-6.8 * s, (-1.6 + antTwitch) * s);
    ctx.moveTo(-4.8 * s, 0.5 * s);
    ctx.lineTo(-6.8 * s, (1.6 - antTwitch) * s);
    ctx.stroke();

    // Center suture & spots
    ctx.beginPath();
    ctx.moveTo(-2.2 * s, 0);
    ctx.lineTo(4.0 * s, 0);
    ctx.stroke();

    ctx.fillStyle = pal.stroke("ink", 0.9 * alpha);
    const spots: readonly [number, number, number][] = [
        [-0.4, -1.4, 0.65],
        [1.6, -1.1, 0.55],
        [0.4, 1.3, 0.65],
        [2.1, 0.9, 0.5],
    ];
    for (const [sx, sy, sr] of spots) {
        ctx.beginPath();
        ctx.arc(sx * s, sy * s, Math.max(0.45, sr * s), 0, Math.PI * 2);
        ctx.fill();
    }

    // Specular highlight dot
    ctx.beginPath();
    ctx.arc(-0.8 * s, -1.1 * s, Math.max(0.4, 0.65 * s), 0, Math.PI * 2);
    ctx.fillStyle = pal.highlight(0.85 * alpha);
    ctx.fill();

    ctx.restore();
}

function drawDewdropAndRipple(
    ctx: CanvasRenderingContext2D,
    tipX: number,
    tipY: number,
    runtime: BotanicalRuntimeState,
    timeSec: number,
    dt: number,
    scale: number,
    pal: BotanicalPalette,
    reducedMotion: boolean,
): void {
    if (reducedMotion) {
        // Static crystal dewdrop at leaf tip
        ctx.save();
        ctx.translate(tipX, tipY + 2 * scale);
        ctx.beginPath();
        ctx.moveTo(0, -3.5 * scale);
        ctx.bezierCurveTo(
            2.5 * scale,
            -0.5 * scale,
            2.6 * scale,
            3.2 * scale,
            0,
            3.6 * scale,
        );
        ctx.bezierCurveTo(
            -2.6 * scale,
            3.2 * scale,
            -2.5 * scale,
            -0.5 * scale,
            0,
            -3.5 * scale,
        );
        ctx.fillStyle = pal.highlight(0.85);
        ctx.fill();
        ctx.strokeStyle = pal.stroke("accent", 0.65);
        ctx.lineWidth = Math.max(0.55, 0.75 * scale);
        ctx.stroke();
        ctx.restore();
        return;
    }

    if (runtime.dewState === "hanging") {
        if (runtime.dewStateStartSec < -100) {
            runtime.dewStateStartSec = timeSec;
        }
        if (timeSec - runtime.dewStateStartSec > 26) {
            runtime.dewState = "falling";
            runtime.dewStateStartSec = timeSec;
            runtime.dewFallDist = 0;
        }
    }

    if (runtime.dewState === "falling") {
        const fallAge = timeSec - runtime.dewStateStartSec;
        runtime.dewFallDist = 0.5 * 360 * scale * fallAge * fallAge;
        const dropY = tipY + 2 * scale + runtime.dewFallDist;
        const maxFall = 95 * scale;
        if (runtime.dewFallDist >= maxFall) {
            runtime.dewState = "ripple";
            runtime.dewStateStartSec = timeSec;
            runtime.dewImpactX = tipX;
            runtime.dewImpactY = tipY + maxFall;
        } else {
            ctx.save();
            ctx.translate(tipX, dropY);
            ctx.beginPath();
            ctx.ellipse(0, 0, 1.8 * scale, 2.8 * scale, 0, 0, Math.PI * 2);
            ctx.fillStyle = pal.highlight(0.88);
            ctx.fill();
            ctx.strokeStyle = pal.stroke("accent", 0.7);
            ctx.lineWidth = Math.max(0.55, 0.75 * scale);
            ctx.stroke();
            ctx.restore();
            return;
        }
    }

    if (runtime.dewState === "ripple") {
        const rAge = timeSec - runtime.dewStateStartSec;
        const dur = 1.6;
        if (rAge >= dur) {
            runtime.dewState = "regrowing";
            runtime.dewStateStartSec = timeSec;
        } else {
            const p = rAge / dur;
            for (let k = 0; k < 2; k++) {
                const kp = clamp((p - k * 0.22) / (1 - k * 0.22), 0, 1);
                if (kp <= 0) continue;
                const rx = (4 + easeOutCubic(kp) * 26) * scale;
                const ry = rx * 0.3;
                const a = (1 - kp) * 0.58;
                ctx.beginPath();
                ctx.ellipse(
                    runtime.dewImpactX,
                    runtime.dewImpactY,
                    rx,
                    ry,
                    0,
                    0,
                    Math.PI * 2,
                );
                ctx.strokeStyle = k === 0
                    ? pal.stroke("ink", a)
                    : pal.stroke("accent", a * 0.85);
                ctx.lineWidth = Math.max(0.5, (1.1 - kp * 0.6) * scale);
                ctx.stroke();
            }
            return;
        }
    }

    let growScale = 1;
    if (runtime.dewState === "regrowing") {
        const gAge = timeSec - runtime.dewStateStartSec;
        if (gAge >= 6.0) {
            runtime.dewState = "hanging";
            runtime.dewStateStartSec = timeSec;
            growScale = 1;
        } else {
            growScale = easeOutCubic(clamp(gAge / 6.0, 0.05, 1));
        }
    }

    const tremble = Math.sin(timeSec * 3.2) * 0.35 * scale * dt * 60 * 0.016;
    const ds = scale * growScale;
    ctx.save();
    ctx.translate(tipX + tremble, tipY + 2 * ds);
    ctx.beginPath();
    ctx.moveTo(0, -3.2 * ds);
    ctx.bezierCurveTo(2.4 * ds, -0.4 * ds, 2.5 * ds, 3.0 * ds, 0, 3.4 * ds);
    ctx.bezierCurveTo(-2.5 * ds, 3.0 * ds, -2.4 * ds, -0.4 * ds, 0, -3.2 * ds);
    ctx.fillStyle = pal.highlight(0.86 * growScale);
    ctx.fill();
    ctx.strokeStyle = pal.stroke("accent", 0.68 * growScale);
    ctx.lineWidth = Math.max(0.5, 0.72 * ds);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-0.7 * ds, 0.8 * ds, Math.max(0.35, 0.7 * ds), 0, Math.PI * 2);
    ctx.fillStyle = pal.highlight(0.95 * growScale);
    ctx.fill();
    ctx.restore();
}

function drawFireflies(
    ctx: CanvasRenderingContext2D,
    seeds: readonly FireflySeed[],
    runtime: BotanicalRuntimeState,
    timeSec: number,
    scale: number,
    pal: BotanicalPalette,
    pointer: BotanicalPointerState,
    reducedMotion: boolean,
): void {
    const boostAge = timeSec - runtime.fireflyBoostStartSec;
    const boost = !reducedMotion && boostAge >= 0 && boostAge < 1.8
        ? 1 + Math.sin((boostAge / 1.8) * Math.PI) * 0.65
        : 1;

    for (const f of seeds) {
        const driftX = reducedMotion
            ? 0
            : Math.sin(timeSec * f.speed + f.phase) * 22 * scale;
        const driftY = reducedMotion
            ? 0
            : Math.cos(timeSec * f.speed * 0.82 + f.phase * 1.3) * 16 * scale;
        let fx = f.x + driftX;
        let fy = f.y + driftY;

        if (!reducedMotion && pointer.x > -1000) {
            const dx = fx - pointer.x;
            const dy = fy - pointer.y;
            const dist = Math.hypot(dx, dy);
            const repulseR = 110 * scale;
            if (dist > 1 && dist < repulseR) {
                const push = ((repulseR - dist) / repulseR) * 28 * scale;
                fx += (dx / dist) * push;
                fy += (dy / dist) * push;
            }
        }

        const breath = reducedMotion ? 0.75 : 0.42 +
            0.58 *
                (0.5 +
                    0.5 *
                        Math.sin(
                            timeSec * f.speed * Math.PI * 2 + f.phase,
                        ));
        const glowR = Math.max(4, 16 * scale * breath * boost);

        const glow = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, glowR);
        glow.addColorStop(
            0,
            pal.wash("accent", clamp(0.85 * breath * boost, 0, 1)),
        );
        glow.addColorStop(
            0.4,
            pal.fill("accent", clamp(0.45 * breath * boost, 0, 1)),
        );
        glow.addColorStop(1, pal.fill("accent", 0));

        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(fx, fy, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(fx, fy, Math.max(0.8, 1.5 * scale), 0, Math.PI * 2);
        ctx.fillStyle = pal.highlight(clamp(0.95 * breath, 0.3, 1));
        ctx.fill();
    }
}

function drawButterfly(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    alpha: number,
    pal: BotanicalPalette,
    flying: boolean,
    timeSec: number,
    reducedMotion: boolean,
    facingRight = false,
): void {
    if (alpha <= 0.02) return;
    const s = scale;
    const flap = reducedMotion
        ? 0.85
        : flying
        ? 0.25 + 0.75 * Math.abs(Math.sin(timeSec * 24))
        : 0.76 + 0.24 * Math.sin(timeSec * 1.4);

    ctx.save();
    ctx.translate(x, y);
    if (facingRight) ctx.scale(-1, 1);
    ctx.rotate(-0.35);

    for (const side of [-1, 1] as const) {
        ctx.save();
        ctx.scale(1, side * flap);

        // Forewing (宽大前翅)
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(
            -3.5 * s,
            -12.5 * s,
            9.5 * s,
            -13.5 * s,
            8.2 * s,
            -2.2 * s,
        );
        ctx.bezierCurveTo(6.2 * s, 1.2 * s, 1.2 * s, 1.2 * s, 0, 0);
        ctx.fillStyle = pal.wash("sub", 0.92 * alpha);
        ctx.fill();
        strokeWaterline(ctx, "sub", pal, s, 0.52 * alpha, 8);

        // Hindwing with swallowtail curve (带燕尾弧度的后翅)
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(
            -5.2 * s,
            -5.5 * s,
            -7.8 * s,
            -9.5 * s,
            -4.5 * s,
            -1.0 * s,
        );
        ctx.bezierCurveTo(-3.2 * s, 1.5 * s, -0.5 * s, 1.0 * s, 0, 0);
        ctx.fillStyle = pal.fill("accent", 0.72 * alpha);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(4.2 * s, -5.2 * s, Math.max(0.8, 1.35 * s), 0, Math.PI * 2);
        ctx.fillStyle = pal.stroke("accent", 0.85 * alpha);
        ctx.fill();
        ctx.restore();
    }

    // Slender body & curved antennae
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.5 * s, 0.85 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.inkGrade("jiao", 0.9 * alpha);
    ctx.fill();
    ctx.strokeStyle = pal.inkGrade("nong", 0.72 * alpha);
    ctx.lineWidth = Math.max(0.4, 0.55 * s);
    ctx.beginPath();
    ctx.moveTo(4.0 * s, 0);
    ctx.quadraticCurveTo(6.8 * s, -1.8 * s, 8.2 * s, -2.5 * s);
    ctx.moveTo(4.0 * s, 0);
    ctx.quadraticCurveTo(6.8 * s, 1.8 * s, 8.2 * s, 2.5 * s);
    ctx.stroke();
    ctx.restore();
}

function drawDragonfly(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    alpha: number,
    pal: BotanicalPalette,
    flying: boolean,
    timeSec: number,
    reducedMotion: boolean,
    facingRight = false,
): void {
    if (alpha <= 0.02) return;
    const s = scale;
    const wingBuzz = reducedMotion
        ? 0
        : flying
        ? Math.sin(timeSec * 45) * 0.28
        : Math.sin(timeSec * 2.1) * 0.04;

    ctx.save();
    ctx.translate(x, y);
    if (facingRight) ctx.scale(-1, 1);
    ctx.rotate(-0.48);

    // 4 translucent veined gossamer wings
    for (const side of [-1, 1] as const) {
        for (const pair of [0, 1] as const) {
            ctx.save();
            ctx.translate(-1 * s + pair * 2 * s, 0);
            ctx.rotate(side * (1.15 - pair * 0.25 + wingBuzz));
            ctx.beginPath();
            ctx.ellipse(6.5 * s, 0, 7.0 * s, 1.45 * s, 0, 0, Math.PI * 2);
            ctx.fillStyle = pal.highlight(0.48 * alpha);
            ctx.fill();
            ctx.strokeStyle = pal.inkGrade("zhong", 0.45 * alpha);
            ctx.lineWidth = Math.max(0.4, 0.52 * s);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(1.2 * s, 0);
            ctx.lineTo(11.5 * s, 0);
            ctx.strokeStyle = pal.inkGrade("dan", 0.42 * alpha);
            ctx.lineWidth = Math.max(0.3, 0.38 * s);
            ctx.stroke();
            ctx.restore();
        }
    }

    // Slender segmented crimson/accent abdomen with ink node rings
    ctx.beginPath();
    ctx.moveTo(-4 * s, 0);
    ctx.lineTo(14.5 * s, 0);
    ctx.strokeStyle = pal.stroke("accent", 0.92 * alpha);
    ctx.lineWidth = Math.max(1.0, 1.6 * s);
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.fillStyle = pal.inkGrade("jiao", 0.72 * alpha);
    for (const segX of [2, 5.5, 9, 12.2]) {
        ctx.beginPath();
        ctx.arc(segX * s, 0, Math.max(0.45, 0.6 * s), 0, Math.PI * 2);
        ctx.fill();
    }

    // Dumbbell compound eyes
    ctx.fillStyle = pal.inkGrade("jiao", 0.94 * alpha);
    ctx.beginPath();
    ctx.arc(-4.6 * s, -0.95 * s, Math.max(0.85, 1.2 * s), 0, Math.PI * 2);
    ctx.arc(-4.6 * s, 0.95 * s, Math.max(0.85, 1.2 * s), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

type SealStrokeOp =
    | readonly ["M", number, number]
    | readonly ["L", number, number]
    | readonly ["Q", number, number, number, number];

type SealGlyph = readonly (readonly SealStrokeOp[])[];

// 二十四节气全字库汉印小篆矢量印谱（27 个唯一汉字，归一化印格 [-1, 1] × [-1, 1]）
const SEAL_GLYPH_STROKES: Readonly<Record<string, SealGlyph>> = {
    "小": [
        [["M", 0, -0.82], ["L", 0, 0.85]],
        [["M", -0.34, -0.42], ["Q", -0.45, 0.15, -0.68, 0.56]],
        [["M", 0.34, -0.42], ["Q", 0.45, 0.15, 0.68, 0.56]],
    ],
    "寒": [
        [["M", 0, -0.88], ["L", 0, -0.66]],
        [["M", -0.74, -0.38], ["Q", -0.74, -0.68, 0, -0.68], [
            "Q",
            0.74,
            -0.68,
            0.74,
            -0.38,
        ]],
        [["M", -0.52, -0.34], ["L", 0.52, -0.34]],
        [["M", -0.54, -0.06], ["L", 0.54, -0.06]],
        [["M", -0.24, -0.50], ["L", -0.24, 0.18]],
        [["M", 0.24, -0.50], ["L", 0.24, 0.18]],
        [["M", -0.76, 0.18], ["L", 0.76, 0.18]],
        [["M", -0.18, 0.18], ["Q", -0.48, 0.46, -0.74, 0.66]],
        [["M", 0.18, 0.18], ["Q", 0.48, 0.46, 0.74, 0.66]],
        [["M", -0.26, 0.48], ["L", 0.26, 0.56]],
        [["M", -0.24, 0.74], ["L", 0.24, 0.84]],
    ],
    "大": [
        [["M", 0, -0.84], ["L", 0, 0.35]],
        [["M", -0.76, -0.32], ["Q", 0, -0.42, 0.76, -0.32]],
        [["M", 0, -0.32], ["Q", -0.38, 0.30, -0.72, 0.84]],
        [["M", 0, -0.32], ["Q", 0.38, 0.30, 0.72, 0.84]],
    ],
    "立": [
        [["M", 0, -0.84], ["L", 0, -0.44]],
        [["M", -0.68, -0.44], ["L", 0.68, -0.44]],
        [["M", -0.36, -0.32], ["Q", -0.24, 0.22, -0.18, 0.66]],
        [["M", 0.36, -0.32], ["Q", 0.24, 0.22, 0.18, 0.66]],
        [["M", -0.78, 0.68], ["L", 0.78, 0.68]],
    ],
    "春": [
        [["M", 0, -0.90], ["L", 0, -0.18]],
        [["M", -0.62, -0.74], ["L", 0.62, -0.74]],
        [["M", -0.48, -0.46], ["L", 0.48, -0.46]],
        [["M", -0.74, -0.18], ["L", 0.74, -0.18]],
        [["M", 0, -0.18], ["Q", -0.42, 0.14, -0.76, 0.42]],
        [["M", 0, -0.18], ["Q", 0.42, 0.14, 0.76, 0.42]],
        [["M", -0.36, 0.30], ["L", 0.36, 0.30], ["L", 0.36, 0.86], [
            "L",
            -0.36,
            0.86,
        ], ["L", -0.36, 0.30]],
        [["M", -0.36, 0.58], ["L", 0.36, 0.58]],
    ],
    "雨": [
        [["M", -0.74, -0.78], ["L", 0.74, -0.78]],
        [["M", -0.72, -0.44], ["Q", -0.72, -0.62, 0, -0.62], [
            "Q",
            0.72,
            -0.62,
            0.72,
            -0.44,
        ]],
        [["M", -0.72, -0.44], ["L", -0.72, 0.78]],
        [["M", 0.72, -0.44], ["L", 0.72, 0.78]],
        [["M", 0, -0.78], ["L", 0, 0.78]],
        [["M", -0.40, -0.22], ["L", -0.34, 0.04]],
        [["M", -0.40, 0.28], ["L", -0.34, 0.54]],
        [["M", 0.40, -0.22], ["L", 0.34, 0.04]],
        [["M", 0.40, 0.28], ["L", 0.34, 0.54]],
    ],
    "水": [
        [["M", 0, -0.86], ["Q", 0.10, 0, -0.02, 0.86]],
        [["M", -0.62, -0.58], ["Q", -0.32, -0.24, -0.58, 0.12], [
            "Q",
            -0.34,
            0.42,
            -0.64,
            0.76,
        ]],
        [["M", 0.62, -0.58], ["Q", 0.32, -0.24, 0.58, 0.12], [
            "Q",
            0.34,
            0.42,
            0.64,
            0.76,
        ]],
    ],
    "惊": [
        [["M", -0.56, -0.78], ["L", -0.56, 0.82]],
        [["M", -0.76, -0.28], ["Q", -0.76, -0.02, -0.64, 0.18]],
        [["M", -0.34, -0.32], ["L", -0.24, -0.04]],
        [["M", 0.24, -0.82], ["L", 0.24, -0.62]],
        [["M", -0.18, -0.62], ["L", 0.72, -0.62]],
        [["M", 0, -0.38], ["L", 0.56, -0.38], ["L", 0.56, -0.06], [
            "L",
            0,
            -0.06,
        ], ["L", 0, -0.38]],
        [["M", 0.28, 0.14], ["L", 0.28, 0.82]],
        [["M", -0.12, 0.28], ["Q", 0.28, 0.12, 0.68, 0.28]],
        [["M", -0.06, 0.50], ["Q", -0.16, 0.68, -0.24, 0.80]],
        [["M", 0.58, 0.48], ["Q", 0.68, 0.66, 0.76, 0.78]],
    ],
    "蛰": [
        [["M", -0.68, -0.58], ["L", -0.08, -0.58]],
        [["M", -0.38, -0.86], ["L", -0.38, 0.04]],
        [["M", -0.72, -0.22], ["L", -0.06, -0.34]],
        [["M", 0.26, -0.84], ["L", 0.26, -0.04]],
        [["M", 0.02, -0.56], ["Q", 0.58, -0.64, 0.66, -0.32], [
            "Q",
            0.70,
            -0.02,
            0.52,
            0.04,
        ]],
        [["M", -0.44, 0.22], ["L", 0.44, 0.22], ["L", 0.44, 0.54], [
            "L",
            -0.44,
            0.54,
        ], ["L", -0.44, 0.22]],
        [["M", 0, 0.04], ["L", 0, 0.80]],
        [["M", -0.62, 0.84], ["L", 0.62, 0.72]],
        [["M", 0.46, 0.62], ["L", 0.72, 0.88]],
    ],
    "分": [
        [["M", -0.18, -0.82], ["Q", -0.46, -0.44, -0.76, -0.14]],
        [["M", 0.18, -0.82], ["Q", 0.46, -0.44, 0.76, -0.14]],
        [["M", -0.54, 0.02], ["L", 0.56, 0.02], ["Q", 0.56, 0.58, 0.36, 0.82]],
        [["M", -0.06, 0.02], ["Q", -0.22, 0.48, -0.62, 0.82]],
    ],
    "清": [
        [["M", -0.64, -0.74], ["Q", -0.48, -0.30, -0.68, 0.04], [
            "Q",
            -0.46,
            0.40,
            -0.66,
            0.78,
        ]],
        [["M", -0.40, -0.34], ["L", -0.40, 0.42]],
        [["M", 0.26, -0.84], ["L", 0.26, -0.12]],
        [["M", -0.14, -0.64], ["L", 0.68, -0.64]],
        [["M", -0.08, -0.40], ["L", 0.62, -0.40]],
        [["M", -0.20, -0.14], ["L", 0.74, -0.14]],
        [["M", -0.04, 0.06], ["L", 0.58, 0.06], ["L", 0.58, 0.82]],
        [["M", -0.04, 0.06], ["L", -0.04, 0.82]],
        [["M", -0.04, 0.34], ["L", 0.58, 0.34]],
        [["M", -0.04, 0.58], ["L", 0.58, 0.58]],
    ],
    "明": [
        [["M", -0.74, -0.58], ["L", -0.16, -0.58], ["L", -0.16, 0.56], [
            "L",
            -0.74,
            0.56,
        ], ["L", -0.74, -0.58]],
        [["M", -0.74, 0], ["L", -0.16, 0]],
        [["M", 0.12, -0.74], ["L", 0.72, -0.74], ["L", 0.72, 0.82]],
        [["M", 0.12, -0.74], ["Q", 0.12, 0.28, -0.02, 0.82]],
        [["M", 0.12, -0.24], ["L", 0.72, -0.24]],
        [["M", 0.10, 0.22], ["L", 0.72, 0.22]],
    ],
    "谷": [
        [["M", -0.22, -0.82], ["Q", -0.46, -0.54, -0.72, -0.32]],
        [["M", 0.22, -0.82], ["Q", 0.46, -0.54, 0.72, -0.32]],
        [["M", 0, -0.54], ["Q", -0.38, -0.18, -0.76, 0.12]],
        [["M", 0, -0.54], ["Q", 0.38, -0.18, 0.76, 0.12]],
        [["M", -0.44, 0.26], ["L", 0.44, 0.26], ["L", 0.44, 0.82], [
            "L",
            -0.44,
            0.82,
        ], ["L", -0.44, 0.26]],
    ],
    "夏": [
        [["M", -0.72, -0.80], ["L", 0.72, -0.80]],
        [["M", 0, -0.80], ["L", -0.12, -0.56]],
        [["M", -0.46, -0.56], ["L", 0.46, -0.56], ["L", 0.46, 0.18], [
            "L",
            -0.46,
            0.18,
        ], ["L", -0.46, -0.56]],
        [["M", -0.46, -0.32], ["L", 0.46, -0.32]],
        [["M", -0.46, -0.08], ["L", 0.46, -0.08]],
        [["M", -0.18, 0.18], ["Q", -0.42, 0.50, -0.68, 0.78]],
        [["M", -0.16, 0.40], ["L", 0.48, 0.40], ["Q", 0.18, 0.64, -0.48, 0.84]],
        [["M", 0.04, 0.46], ["Q", 0.36, 0.66, 0.72, 0.84]],
    ],
    "满": [
        [["M", -0.66, -0.74], ["Q", -0.50, -0.30, -0.68, 0.04], [
            "Q",
            -0.48,
            0.40,
            -0.66,
            0.78,
        ]],
        [["M", -0.42, -0.34], ["L", -0.42, 0.42]],
        [["M", -0.18, -0.64], ["L", 0.72, -0.64]],
        [["M", 0.06, -0.84], ["L", 0.06, -0.46]],
        [["M", 0.48, -0.84], ["L", 0.48, -0.46]],
        [["M", -0.14, -0.36], ["L", 0.70, -0.36]],
        [["M", 0.26, -0.36], ["L", 0.26, 0.78]],
        [["M", -0.14, -0.04], ["L", 0.68, -0.04], ["L", 0.68, 0.80]],
        [["M", -0.14, -0.04], ["L", -0.14, 0.80]],
        [["M", -0.02, 0.28], ["Q", 0.12, 0.48, 0.02, 0.64]],
        [["M", 0.52, 0.28], ["Q", 0.40, 0.48, 0.50, 0.64]],
    ],
    "芒": [
        [["M", -0.72, -0.58], ["L", 0.72, -0.58]],
        [["M", -0.34, -0.84], ["L", -0.34, -0.38]],
        [["M", 0.34, -0.84], ["L", 0.34, -0.38]],
        [["M", 0, -0.36], ["L", 0, -0.06]],
        [["M", -0.68, -0.06], ["L", 0.68, -0.06]],
        [["M", -0.48, -0.06], ["L", -0.48, 0.76], ["L", 0.62, 0.76]],
    ],
    "种": [
        [["M", -0.22, -0.78], ["Q", -0.46, -0.64, -0.72, -0.56]],
        [["M", -0.74, -0.26], ["L", -0.16, -0.26]],
        [["M", -0.44, -0.62], ["L", -0.44, 0.82]],
        [["M", -0.44, -0.26], ["Q", -0.58, 0.14, -0.76, 0.44]],
        [["M", -0.44, -0.16], ["L", -0.18, 0.16]],
        [["M", 0.02, -0.38], ["L", 0.72, -0.38], ["L", 0.72, 0.24], [
            "L",
            0.02,
            0.24,
        ], ["L", 0.02, -0.38]],
        [["M", 0.37, -0.84], ["L", 0.37, 0.84]],
    ],
    "至": [
        [["M", -0.72, -0.76], ["L", 0.72, -0.76]],
        [["M", 0, -0.76], ["Q", -0.24, -0.32, -0.50, -0.08], [
            "L",
            0.44,
            -0.14,
        ]],
        [["M", 0.28, -0.34], ["L", 0.64, 0.04]],
        [["M", -0.56, 0.28], ["L", 0.56, 0.28]],
        [["M", 0, 0.04], ["L", 0, 0.78]],
        [["M", -0.76, 0.78], ["L", 0.76, 0.78]],
    ],
    "暑": [
        [["M", -0.48, -0.82], ["L", 0.48, -0.82], ["L", 0.48, -0.36], [
            "L",
            -0.48,
            -0.36,
        ], ["L", -0.48, -0.82]],
        [["M", -0.48, -0.59], ["L", 0.48, -0.59]],
        [["M", -0.52, -0.12], ["L", 0.52, -0.12]],
        [["M", 0, -0.30], ["L", 0, 0.14]],
        [["M", -0.72, 0.14], ["L", 0.72, 0.14]],
        [["M", 0.48, -0.22], ["Q", -0.12, 0.20, -0.72, 0.46]],
        [["M", -0.34, 0.34], ["L", 0.44, 0.34], ["L", 0.44, 0.84], [
            "L",
            -0.34,
            0.84,
        ], ["L", -0.34, 0.34]],
        [["M", -0.34, 0.59], ["L", 0.44, 0.59]],
    ],
    "秋": [
        [["M", -0.22, -0.78], ["Q", -0.46, -0.64, -0.72, -0.56]],
        [["M", -0.74, -0.26], ["L", -0.16, -0.26]],
        [["M", -0.44, -0.62], ["L", -0.44, 0.82]],
        [["M", -0.44, -0.26], ["Q", -0.58, 0.14, -0.76, 0.44]],
        [["M", -0.44, -0.16], ["L", -0.18, 0.16]],
        [["M", 0.36, -0.82], ["Q", 0.36, 0.20, -0.06, 0.82]],
        [["M", 0.36, 0.06], ["Q", 0.52, 0.48, 0.78, 0.82]],
        [["M", 0.04, -0.34], ["L", 0.16, -0.04]],
        [["M", 0.68, -0.38], ["L", 0.52, -0.06]],
    ],
    "处": [
        [["M", -0.22, -0.82], ["Q", -0.44, -0.38, -0.70, -0.04]],
        [["M", -0.34, -0.48], ["L", 0.22, -0.48], [
            "Q",
            0.04,
            0.24,
            -0.74,
            0.78,
        ]],
        [["M", -0.52, -0.12], ["Q", 0.10, 0.38, 0.76, 0.78]],
        [["M", 0.38, -0.78], ["L", 0.38, 0.48]],
        [["M", 0.38, -0.14], ["L", 0.72, 0.16]],
    ],
    "白": [
        [["M", 0.06, -0.84], ["L", -0.16, -0.44]],
        [["M", -0.54, -0.44], ["L", 0.54, -0.44], ["L", 0.54, 0.78], [
            "L",
            -0.54,
            0.78,
        ], ["L", -0.54, -0.44]],
        [["M", -0.54, 0.16], ["L", 0.54, 0.16]],
    ],
    "露": [
        [["M", -0.72, -0.82], ["L", 0.72, -0.82]],
        [["M", -0.70, -0.52], ["Q", -0.70, -0.68, 0, -0.68], [
            "Q",
            0.70,
            -0.68,
            0.70,
            -0.52,
        ]],
        [["M", 0, -0.82], ["L", 0, -0.26]],
        [["M", -0.42, -0.46], ["L", -0.34, -0.32]],
        [["M", 0.42, -0.46], ["L", 0.34, -0.32]],
        [["M", -0.64, -0.12], ["L", -0.14, -0.12], ["L", -0.14, 0.24], [
            "L",
            -0.64,
            0.24,
        ], ["L", -0.64, -0.12]],
        [["M", -0.38, 0.24], ["L", -0.38, 0.76]],
        [["M", -0.68, 0.78], ["L", -0.08, 0.64]],
        [["M", 0.24, -0.18], ["Q", 0.10, 0.08, -0.02, 0.24]],
        [["M", 0.24, -0.04], ["L", 0.64, -0.04], [
            "Q",
            0.38,
            0.32,
            -0.04,
            0.50,
        ]],
        [["M", 0.12, 0.08], ["Q", 0.42, 0.32, 0.74, 0.48]],
        [["M", 0.06, 0.56], ["L", 0.64, 0.56], ["L", 0.64, 0.84], [
            "L",
            0.06,
            0.84,
        ], ["L", 0.06, 0.56]],
    ],
    "霜": [
        [["M", -0.72, -0.82], ["L", 0.72, -0.82]],
        [["M", -0.70, -0.52], ["Q", -0.70, -0.68, 0, -0.68], [
            "Q",
            0.70,
            -0.68,
            0.70,
            -0.52,
        ]],
        [["M", 0, -0.82], ["L", 0, -0.26]],
        [["M", -0.42, -0.46], ["L", -0.34, -0.32]],
        [["M", 0.42, -0.46], ["L", 0.34, -0.32]],
        [["M", -0.72, 0.06], ["L", -0.08, 0.06]],
        [["M", -0.38, -0.16], ["L", -0.38, 0.84]],
        [["M", -0.38, 0.06], ["Q", -0.56, 0.42, -0.74, 0.64]],
        [["M", -0.38, 0.18], ["L", -0.10, 0.42]],
        [["M", 0.08, -0.08], ["L", 0.66, -0.08], ["L", 0.66, 0.82], [
            "L",
            0.08,
            0.82,
        ], ["L", 0.08, -0.08]],
        [["M", 0.08, 0.22], ["L", 0.66, 0.22]],
        [["M", 0.08, 0.52], ["L", 0.66, 0.52]],
    ],
    "降": [
        [["M", -0.70, -0.78], ["L", -0.36, -0.78], ["L", -0.50, -0.42], [
            "Q",
            -0.28,
            -0.16,
            -0.46,
            0.08,
        ]],
        [["M", -0.70, -0.78], ["L", -0.70, 0.82]],
        [["M", 0.12, -0.82], ["Q", -0.04, -0.54, -0.22, -0.34]],
        [["M", 0.12, -0.64], ["L", 0.62, -0.64], [
            "Q",
            0.32,
            -0.26,
            -0.22,
            0.02,
        ]],
        [["M", 0.02, -0.50], ["Q", 0.38, -0.24, 0.76, -0.02]],
        [["M", -0.10, 0.24], ["L", 0.66, 0.24]],
        [["M", -0.18, 0.52], ["L", 0.72, 0.52]],
        [["M", 0.34, 0.06], ["L", 0.34, 0.84]],
    ],
    "冬": [
        [["M", -0.08, -0.84], ["Q", -0.36, -0.46, -0.68, -0.16]],
        [["M", -0.18, -0.62], ["L", 0.44, -0.62], [
            "Q",
            0.16,
            -0.10,
            -0.72,
            0.30,
        ]],
        [["M", -0.36, -0.36], ["Q", 0.14, 0.02, 0.74, 0.28]],
        [["M", -0.14, 0.34], ["L", 0.18, 0.48]],
        [["M", -0.18, 0.64], ["L", 0.22, 0.82]],
    ],
    "雪": [
        [["M", -0.72, -0.80], ["L", 0.72, -0.80]],
        [["M", -0.70, -0.48], ["Q", -0.70, -0.64, 0, -0.64], [
            "Q",
            0.70,
            -0.64,
            0.70,
            -0.48,
        ]],
        [["M", 0, -0.80], ["L", 0, -0.16]],
        [["M", -0.42, -0.40], ["L", -0.34, -0.24]],
        [["M", 0.42, -0.40], ["L", 0.34, -0.24]],
        [["M", -0.52, 0.08], ["L", 0.54, 0.08], ["L", 0.54, 0.78], [
            "L",
            -0.52,
            0.78,
        ]],
        [["M", -0.48, 0.42], ["L", 0.54, 0.42]],
    ],
};

export function hasSealVectorGlyph(term: string): boolean {
    const chars = Array.from(term);
    return chars.length > 0 &&
        chars.every((ch) => Object.hasOwn(SEAL_GLYPH_STROKES, ch));
}

function drawSealGlyph(
    ctx: CanvasRenderingContext2D,
    char: string,
    cx: number,
    cy: number,
    halfW: number,
    halfH: number,
): boolean {
    const strokes = SEAL_GLYPH_STROKES[char];
    if (!strokes) return false;
    ctx.beginPath();
    for (const stroke of strokes) {
        for (const op of stroke) {
            if (op[0] === "M") {
                ctx.moveTo(cx + op[1] * halfW, cy + op[2] * halfH);
            } else if (op[0] === "L") {
                ctx.lineTo(cx + op[1] * halfW, cy + op[2] * halfH);
            } else {
                ctx.quadraticCurveTo(
                    cx + op[1] * halfW,
                    cy + op[2] * halfH,
                    cx + op[3] * halfW,
                    cy + op[4] * halfH,
                );
            }
        }
    }
    ctx.stroke();
    return true;
}

function drawSolarTermSeal(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number,
    term: string,
    season: SolarTermInfo["season"],
    sceneSide: "left" | "right",
    pal: BotanicalPalette,
    alpha: number,
    dockInsets?: BotanicalDockInsets,
): void {
    if (alpha <= 0.02 || !term) return;
    const s = scale;
    const isNarrow = width < 720;
    const wBox = 18 * s;
    const hBox = 35 * s;
    const insetLeft = dockInsets?.left ?? 0;
    const insetRight = dockInsets?.right ?? 0;
    const insetBottom = dockInsets?.bottom ?? 0;
    const x = sceneSide === "left"
        ? 30 * s + insetLeft
        : width - 30 * s - insetRight;
    const y = (isNarrow ? height - 118 * s : height - 46 * s) - insetBottom;
    const sealAlpha = (pal.overPhoto ? 0.42 : 0.62) * alpha;
    const isIntaglio = season === "autumn" || season === "winter";
    const hw = wBox / 2;
    const hh = hBox / 2;

    // 手工金石残破印石轮廓（带微切角与天然击边缺口）
    const stoneOutline: readonly Point2D[] = [
        { x: -hw + 2.2 * s, y: -hh },
        { x: -hw * 0.25, y: -hh + 0.35 * s },
        { x: hw * 0.42, y: -hh },
        { x: hw - 1.8 * s, y: -hh + 0.4 * s },
        { x: hw, y: -hh + 2.1 * s },
        { x: hw - 0.35 * s, y: -hh * 0.15 },
        { x: hw, y: hh * 0.48 },
        { x: hw - 1.6 * s, y: hh },
        { x: hw * 0.18, y: hh - 0.3 * s },
        { x: -hw + 2.0 * s, y: hh },
        { x: -hw, y: hh - 2.2 * s },
        { x: -hw + 0.3 * s, y: -hh * 0.35 },
    ];

    const traceStonePoly = () => {
        ctx.moveTo(stoneOutline[0].x, stoneOutline[0].y);
        for (let i = 1; i < stoneOutline.length; i++) {
            ctx.lineTo(stoneOutline[i].x, stoneOutline[i].y);
        }
        ctx.closePath();
    };

    ctx.save();
    ctx.translate(x, y);

    if (isIntaglio) {
        // 秋冬白文阴刻：醇厚朱砂印泥石面 + 不规则金石崩碴砂眼（evenodd）
        ctx.beginPath();
        traceStonePoly();
        const chips: readonly (readonly Point2D[])[] = [
            [
                { x: -hw * 0.72, y: -hh * 0.76 },
                { x: -hw * 0.54, y: -hh * 0.72 },
                { x: -hw * 0.62, y: -hh * 0.62 },
            ],
            [
                { x: hw * 0.48, y: hh * 0.68 },
                { x: hw * 0.66, y: hh * 0.63 },
                { x: hw * 0.60, y: hh * 0.75 },
                { x: hw * 0.46, y: hh * 0.74 },
            ],
            [
                { x: -hw * 0.58, y: hh * 0.36 },
                { x: -hw * 0.44, y: hh * 0.39 },
                { x: -hw * 0.52, y: hh * 0.48 },
            ],
        ];
        for (const poly of chips) {
            ctx.moveTo(poly[0].x, poly[0].y);
            for (let pi = 1; pi < poly.length; pi++) {
                ctx.lineTo(poly[pi].x, poly[pi].y);
            }
            ctx.closePath();
        }
        ctx.fillStyle = pal.cinnabar(sealAlpha * 0.90);
        ctx.fill("evenodd");
    } else {
        // 春夏朱文阳刻：淡印泥底晕 + 三段击边断口朱砂边框（零虚线）
        ctx.beginPath();
        traceStonePoly();
        ctx.fillStyle = pal.cinnabar(sealAlpha * 0.09);
        ctx.fill();

        ctx.strokeStyle = pal.cinnabar(sealAlpha);
        ctx.lineWidth = Math.max(0.85, 1.15 * s);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // 边框段 1：顶边至右上侧
        ctx.beginPath();
        ctx.moveTo(-hw + 1.8 * s, -hh);
        ctx.lineTo(hw - 1.8 * s, -hh + 0.3 * s);
        ctx.lineTo(hw, -hh + 2.1 * s);
        ctx.lineTo(hw - 0.3 * s, -hh * 0.08);
        ctx.stroke();

        // 边框段 2：右下侧至底边
        ctx.beginPath();
        ctx.moveTo(hw, hh * 0.16);
        ctx.lineTo(hw, hh - 2.0 * s);
        ctx.lineTo(hw - 1.6 * s, hh);
        ctx.lineTo(-hw * 0.25, hh - 0.25 * s);
        ctx.stroke();

        // 边框段 3：左下角至左上侧
        ctx.beginPath();
        ctx.moveTo(-hw * 0.52, hh);
        ctx.lineTo(-hw, hh - 2.0 * s);
        ctx.lineTo(-hw + 0.28 * s, -hh + 2.8 * s);
        ctx.stroke();
    }

    // 实色笺谱模式下在闲章外围点缀博物铜版四角准星细丝，呼应窗口内系统插画语言
    if (pal.solidSurface && !pal.overPhoto) {
        const tickOff = 3.2 * s;
        const tickLen = 3.0 * s;
        ctx.strokeStyle = pal.inkGrade("zhong", 0.36 * alpha);
        ctx.lineWidth = Math.max(0.45, 0.55 * s);
        ctx.beginPath();
        ctx.moveTo(-hw - tickOff, -hh - tickOff + tickLen);
        ctx.lineTo(-hw - tickOff, -hh - tickOff);
        ctx.lineTo(-hw - tickOff + tickLen, -hh - tickOff);
        ctx.moveTo(hw + tickOff - tickLen, hh + tickOff);
        ctx.lineTo(hw + tickOff, hh + tickOff);
        ctx.lineTo(hw + tickOff, hh + tickOff - tickLen);
        ctx.stroke();
    }

    const chars = Array.from(term).slice(0, 2);
    const glyphColor = isIntaglio
        ? pal.highlight(pal.isDark ? 0.90 * alpha : 0.95 * alpha)
        : pal.cinnabar(Math.min(1, sealAlpha * 1.35));
    ctx.strokeStyle = glyphColor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const glyphW = hw * 0.54;
    const glyphH = hh * 0.34;
    const centers = chars.length === 2 ? [-hh * 0.44, hh * 0.44] : [0];
    for (let i = 0; i < chars.length; i++) {
        const strokes = SEAL_GLYPH_STROKES[chars[i]];
        const strokeWeightScale = strokes && strokes.length >= 9 ? 0.88 : 1.0;
        ctx.lineWidth = Math.max(
            0.70,
            (isIntaglio ? 1.02 : 0.96) * s * strokeWeightScale,
        );
        const drawn = drawSealGlyph(
            ctx,
            chars[i],
            0,
            centers[i],
            glyphW,
            glyphH,
        );
        if (!drawn && typeof ctx.fillText === "function") {
            ctx.fillStyle = glyphColor;
            ctx.font = `${Math.max(8, Math.round(9.5 * s))}px serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(chars[i], 0, centers[i]);
        }
    }
    ctx.restore();
}

function drawRewardBloom(
    ctx: CanvasRenderingContext2D,
    scene: BotanicalScene,
    reward: BotanicalRewardAnchor,
    runtime: BotanicalRuntimeState,
    timeSec: number,
    reducedMotion: boolean,
    windCalm: number,
    frameSeq: number,
    breezeImpulse: number,
    pal: BotanicalPalette,
): void {
    const bloomP = reducedMotion
        ? 1
        : easeOutCubic(clamp((timeSec - runtime.awakenStartSec) / 1.8, 0, 1));
    if (bloomP <= 0.02) return;

    const tipPt = computeBranchWorldPoints(
        reward.branch,
        timeSec,
        reducedMotion,
        windCalm,
        scene.scale,
        frameSeq,
        breezeImpulse,
        runtime,
    )[reward.idx];
    const s = scene.scale;

    // Subtle expanding halo pulse when tasks are cleared
    const haloAge = timeSec - runtime.haloPulseStartSec;
    if (!reducedMotion && haloAge >= 0 && haloAge < 1.4) {
        const hp = haloAge / 1.4;
        const hr = (10 + easeOutCubic(hp) * 48) * s;
        ctx.beginPath();
        ctx.arc(tipPt.x, tipPt.y, hr, 0, Math.PI * 2);
        ctx.strokeStyle = pal.stroke("accent", (1 - hp) * 0.42);
        ctx.lineWidth = Math.max(0.6, (1.4 - hp) * s);
        ctx.stroke();
    }

    if (reward.kind === "plum") {
        // Buds bloom into five-petal accent blossoms
        for (const budIdx of reward.budIndices) {
            const bud = scene.ornaments[budIdx];
            if (!bud || bud.kind !== "plumBud") continue;
            const wp = computeBranchWorldPoints(
                bud.branch,
                timeSec,
                reducedMotion,
                windCalm,
                s,
                frameSeq,
                breezeImpulse,
                runtime,
            )[bud.idx];
            const blossom: PlumOrnament = {
                ...bud,
                kind: "plumBlossom",
                size: Math.max(bud.size * 2.8, 14 * s) * bloomP,
                tint: "accent",
            };
            drawPlumBlossom(
                ctx,
                wp.x,
                wp.y,
                wp.angle + bud.angleOffset,
                blossom,
                bloomP,
                pal,
                1.0,
            );
        }
    } else if (reward.kind === "ginkgo") {
        for (const angOff of [-0.42, 0.36]) {
            const shoot: GinkgoOrnament = {
                kind: "ginkgo",
                branch: reward.branch,
                idx: reward.idx,
                ghost: false,
                t0: 0,
                t1: 1,
                phase: 1.2,
                angleOffset: angOff,
                tint: "accent",
                profile: angOff > 0,
                push: 0,
                vel: 0,
                size: 26 * s * bloomP,
                notch: 0.22,
                stemLen: 10 * s,
            };
            drawGinkgoLeaf(
                ctx,
                tipPt.x,
                tipPt.y,
                tipPt.angle + angOff,
                shoot,
                bloomP,
                pal,
                1.0,
            );
        }
    } else if (reward.kind === "eucalyptus") {
        const rays = 14;
        const rLen = 16 * s * bloomP;
        ctx.save();
        ctx.translate(tipPt.x, tipPt.y);
        for (let i = 0; i < rays; i++) {
            const a = (i / rays) * Math.PI * 2 + 0.2;
            const ex = Math.cos(a) * rLen;
            const ey = Math.sin(a) * rLen;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = pal.stroke("accent", 0.72 * bloomP);
            ctx.lineWidth = Math.max(0.55, 0.75 * s);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(ex, ey, Math.max(0.9, 1.4 * s * bloomP), 0, Math.PI * 2);
            ctx.fillStyle = pal.stroke("accent", 0.9 * bloomP);
            ctx.fill();
        }
        ctx.restore();
    } else if (reward.kind === "fern") {
        // Fern spiral fiddlehead crozier at hero tip
        ctx.save();
        ctx.translate(tipPt.x, tipPt.y);
        ctx.rotate(tipPt.angle);
        const r = 10 * s * bloomP;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(
            14 * s * bloomP,
            -2 * s * bloomP,
            18 * s * bloomP,
            -16 * s * bloomP,
            8 * s * bloomP,
            -16 * s * bloomP,
        );
        ctx.bezierCurveTo(
            2 * s * bloomP,
            -16 * s * bloomP,
            2 * s * bloomP,
            -8 * s * bloomP,
            8 * s * bloomP,
            -9 * s * bloomP,
        );
        ctx.strokeStyle = pal.stroke("accent", 0.88 * bloomP);
        ctx.lineWidth = Math.max(1.0, 1.65 * s);
        ctx.lineCap = "round";
        ctx.stroke();
        const glow = ctx.createRadialGradient(
            8 * s * bloomP,
            -11 * s * bloomP,
            0.5,
            8 * s * bloomP,
            -11 * s * bloomP,
            Math.max(2, r * 1.4),
        );
        glow.addColorStop(0, pal.wash("accent", 0.45 * bloomP));
        glow.addColorStop(1, pal.fill("accent", 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(
            8 * s * bloomP,
            -11 * s * bloomP,
            Math.max(2, r * 1.4),
            0,
            Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
    } else if (reward.kind === "orchid") {
        const bloom: OrchidBlossomOrnament = {
            kind: "orchidBlossom",
            branch: reward.branch,
            idx: reward.idx,
            ghost: false,
            t0: 0,
            t1: 1,
            phase: 0.4,
            angleOffset: -0.2,
            tint: "accent",
            profile: false,
            push: 0,
            vel: 0,
            size: 26 * s * bloomP,
            rotation: -0.25,
        };
        drawOrchidBlossom(
            ctx,
            tipPt.x,
            tipPt.y,
            tipPt.angle,
            bloom,
            bloomP,
            pal,
            1.0,
        );
    } else if (reward.kind === "bamboo") {
        for (const angOff of [-0.46, 0.06, 0.52]) {
            const shoot: BambooLeafOrnament = {
                kind: "bambooLeaf",
                branch: reward.branch,
                idx: reward.idx,
                ghost: false,
                t0: 0,
                t1: 1,
                phase: 0.7,
                angleOffset: angOff,
                tint: "accent",
                profile: false,
                push: 0,
                vel: 0,
                len: 52 * s * bloomP,
                width: 5.8 * s,
                curve: angOff * 0.2,
                feibai: false,
            };
            drawBambooLeaf(
                ctx,
                tipPt.x,
                tipPt.y,
                tipPt.angle + angOff,
                shoot,
                bloomP,
                pal,
                1.0,
            );
        }
    } else if (reward.kind === "maple") {
        const leaf: MapleLeafOrnament = {
            kind: "mapleLeaf",
            branch: reward.branch,
            idx: reward.idx,
            ghost: false,
            t0: 0,
            t1: 1,
            phase: 0.5,
            angleOffset: 0.1,
            tint: "accent",
            profile: false,
            push: 0,
            vel: 0,
            size: 36 * s * bloomP,
            stemLen: 12 * s,
            rotation: 0.15,
        };
        drawMapleLeaf(
            ctx,
            tipPt.x,
            tipPt.y,
            tipPt.angle + 0.15,
            leaf,
            bloomP,
            pal,
            1.0,
        );
    }
}

function drawAtmosphericStage(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number,
    pal: BotanicalPalette,
    rawProgress: number,
    embedded: boolean,
    sceneSide: "left" | "right" = "right",
): void {
    if (pal.overPhoto || pal.solidSurface || rawProgress <= 0.06) return;
    const stageFade = easeOutCubic(clamp((rawProgress - 0.06) / 0.58, 0, 1)) *
        (embedded ? 0.68 : 1);
    if (stageFade <= 0.01) return;

    const isNarrow = !embedded && width < 720;
    const sideX = (rightOffset: number) =>
        sceneSide === "left" ? rightOffset : width - rightOffset;

    // 宋元折枝「计白当黑 · 无痕烘染」：去除具象远山与月轮轮廓，在生长侧与中轴外肩铺设无边气韵微晕，供毛玻璃折射温润植物玉色
    const bokashiZones = [
        {
            x: sideX((isNarrow ? 88 : 165) * scale),
            y: (isNarrow ? 132 : 112) * scale,
            rx: (isNarrow ? 190 : 420) * scale,
            ry: (isNarrow ? 120 : 240) * scale,
            lightInkA: 0.028,
            lightPaperA: 0.24,
            darkAirA: 0.022,
            darkSubA: 0.010,
            useAccentWash: false,
        },
        {
            x: sideX((isNarrow ? 96 : 190) * scale),
            y: height - (isNarrow ? 120 : 145) * scale,
            rx: (isNarrow ? 195 : 440) * scale,
            ry: (isNarrow ? 125 : 250) * scale,
            lightInkA: 0.022,
            lightPaperA: 0.18,
            darkAirA: 0.016,
            darkSubA: 0.014,
            useAccentWash: false,
        },
        {
            x: sideX((isNarrow ? 148 : 455) * scale),
            y: height * 0.41,
            rx: (isNarrow ? 180 : 360) * scale,
            ry: (isNarrow ? 102 : 198) * scale,
            lightInkA: 0.012,
            lightPaperA: 0.14,
            darkAirA: 0.012,
            darkSubA: 0.018,
            useAccentWash: true,
        },
    ];

    for (const z of bokashiZones) {
        ctx.save();
        if (pal.isDark) {
            ctx.globalCompositeOperation = "screen";
        }
        ctx.translate(z.x, z.y);
        ctx.scale(1, z.ry / Math.max(1, z.rx));
        const g = ctx.createRadialGradient(
            0,
            0,
            1,
            0,
            0,
            Math.max(2, z.rx),
        );
        if (z.useAccentWash) {
            g.addColorStop(
                0,
                pal.wash("accent", (pal.isDark ? 0.036 : 0.028) * stageFade),
            );
            g.addColorStop(
                0.52,
                pal.wash("sub", (pal.isDark ? 0.020 : 0.016) * stageFade),
            );
            g.addColorStop(1, pal.wash("sub", 0));
        } else if (pal.isDark) {
            g.addColorStop(
                0,
                `rgba(214,226,246,${(z.darkAirA * stageFade).toFixed(4)})`,
            );
            g.addColorStop(0.48, pal.wash("sub", z.darkSubA * stageFade));
            g.addColorStop(1, "rgba(214,226,246,0)");
        } else {
            g.addColorStop(0, pal.inkGrade("qing", z.lightInkA * stageFade));
            g.addColorStop(0.52, pal.highlight(z.lightPaperA * stageFade));
            g.addColorStop(1, pal.highlight(0));
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, z.rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

export function renderBotanicalFrame(params: BotanicalRenderParams): number {
    const {
        ctx,
        scene,
        width,
        height,
        timeSec,
        dt,
        rawProgress,
        reducedMotion,
        windCalm,
        searchFocused,
        embedded,
        palette,
        pointer: rawPointer,
        drifters,
        frameSeq,
        runtime,
        sceneSide = "right",
        dateKey = "2026-11-27",
        dockInsets,
    } = params;
    let nextDriftSpawn = params.lastDriftSpawn;

    const legacyMirrorLeft = !embedded && sceneSide === "left" &&
        width >= 768 && scene.side !== "left";
    const pointer: BotanicalPointerState = legacyMirrorLeft
        ? {
            ...rawPointer,
            x: rawPointer.x > -1000 ? width - rawPointer.x : rawPointer.x,
            vx: -rawPointer.vx,
        }
        : rawPointer;

    const impulseAge = runtime ? timeSec - runtime.breezeImpulseStartSec : -1;
    const breezeImpulse = !reducedMotion &&
            runtime &&
            impulseAge >= 0 &&
            impulseAge < 2.6
        ? Math.sin(impulseAge * 4.2) *
            Math.exp(-impulseAge * 1.65) *
            runtime.breezeImpulseStrength
        : 0;

    if (runtime && !reducedMotion && !embedded && rawProgress >= 1) {
        if (runtime.nextGustSec < -100) {
            runtime.nextGustSec = timeSec + 4.5;
        } else if (timeSec >= runtime.nextGustSec) {
            triggerBotanicalGust(runtime, timeSec, 0.85, 4.6);
        }
    }

    ctx.clearRect(0, 0, width, height);
    if (legacyMirrorLeft) {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
    }

    drawAtmosphericStage(
        ctx,
        width,
        height,
        scene.scale,
        palette,
        rawProgress,
        embedded,
        legacyMirrorLeft ? "right" : sceneSide,
    );

    // Precompute ornament world transforms & interactive physics once per frame
    const pSpeed = embedded ? 0 : Math.hypot(pointer.vx, pointer.vy);
    const activeOrns: Array<{
        o: BotanicalOrnament;
        wx: number;
        wy: number;
        angle: number;
        op: number;
    }> = [];

    for (const o of scene.ornaments) {
        const op = clamp((rawProgress - o.t0) / (o.t1 - o.t0), 0, 1);
        if (op <= 0.005) continue;

        const wp = computeBranchWorldPoints(
            o.branch,
            timeSec,
            reducedMotion,
            windCalm,
            scene.scale,
            frameSeq,
            breezeImpulse,
            runtime,
        )[o.idx];

        if (!reducedMotion && !o.ghost && !embedded) {
            if (pSpeed > 18) {
                const dist = Math.hypot(wp.x - pointer.x, wp.y - pointer.y);
                if (dist < 88) {
                    const influence = (1 - dist / 88) *
                        clamp(pointer.vx * 0.00055, -0.22, 0.22);
                    o.vel += influence * 14 * dt;
                    if (
                        rawProgress >= 1 &&
                        pSpeed > 260 &&
                        drifters.length < 3 &&
                        timeSec - pointer.lastRustleSpawn > 2.8
                    ) {
                        spawnDrifter(
                            scene,
                            drifters,
                            timeSec,
                            windCalm,
                            frameSeq,
                            o,
                        );
                        pointer.lastRustleSpawn = timeSec;
                    }
                }
            }
            o.vel += -o.push * 22 * dt;
            o.vel *= Math.pow(0.08, dt);
            o.push = clamp(o.push + o.vel * dt * 12, -0.32, 0.32);
        } else {
            o.push = 0;
            o.vel = 0;
        }

        const isGusting = Boolean(
            runtime &&
                timeSec >= runtime.gustStartSec &&
                timeSec <= runtime.gustStartSec + runtime.gustDurationSec,
        );
        const sway = reducedMotion
            ? 0
            : (isGusting || Math.abs(breezeImpulse) > 0.01
                ? Math.sin(timeSec * 1.85 + o.phase) * 0.042 * windCalm
                : 0) + o.push;
        activeOrns.push({
            o,
            wx: wp.x,
            wy: wp.y,
            angle: wp.angle + o.angleOffset + sway,
            op,
        });
    }

    // Layer 1: Distant ghost & midground echo branches & ornaments
    for (const b of scene.branches) {
        if (b.ghost) {
            drawTaperedBranch(
                ctx,
                b,
                scene.species,
                rawProgress,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                palette,
                breezeImpulse,
                runtime,
            );
        }
    }
    for (const item of activeOrns) {
        if (item.o.ghost) {
            renderOrnamentItem(
                ctx,
                item.o,
                item.wx,
                item.wy,
                item.angle,
                item.op,
                palette,
                0.15,
            );
        }
    }
    for (const b of scene.branches) {
        if (b.midground && !b.ghost) {
            drawTaperedBranch(
                ctx,
                b,
                scene.species,
                rawProgress,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                palette,
                breezeImpulse,
                runtime,
            );
        }
    }
    for (const item of activeOrns) {
        if (item.o.midground && !item.o.ghost) {
            renderOrnamentItem(
                ctx,
                item.o,
                item.wx,
                item.wy,
                item.angle,
                item.op,
                palette,
                0.45,
            );
        }
    }

    // Slope rocks & moss base (for orchid & fern)
    for (const rock of scene.rocks) {
        drawRockBase(ctx, rock, rawProgress, scene.scale, palette);
    }

    // Layer 2: Foreground calligraphic branches
    for (const b of scene.branches) {
        if (!b.ghost && !b.midground) {
            drawTaperedBranch(
                ctx,
                b,
                scene.species,
                rawProgress,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                palette,
                breezeImpulse,
                runtime,
            );
        }
    }

    // Layer 3: Foreground botanical ornaments
    for (const item of activeOrns) {
        if (!item.o.ghost && !item.o.midground) {
            if (
                palette.isDark &&
                !embedded &&
                !palette.overPhoto &&
                !palette.solidSurface &&
                item.o.tint === "accent"
            ) {
                const isFernPinna = item.o.kind === "fernPinna";
                const haloRadius = item.o.kind === "fernPinna"
                    ? Math.min(Math.max(item.o.len * 0.24, 10), 22)
                    : ("size" in item.o ? item.o.size : 24) * 1.75;
                const haloX = item.o.kind === "fernPinna"
                    ? item.wx + Math.cos(item.angle) * item.o.len * 0.28
                    : item.wx;
                const haloY = item.o.kind === "fernPinna"
                    ? item.wy + Math.sin(item.angle) * item.o.len * 0.28
                    : item.wy;
                const peakAlpha = isFernPinna ? 0.08 : 0.24;
                const glow = ctx.createRadialGradient(
                    haloX,
                    haloY,
                    0,
                    haloX,
                    haloY,
                    haloRadius,
                );
                glow.addColorStop(
                    0,
                    palette.wash("accent", peakAlpha * item.op),
                );
                glow.addColorStop(
                    0.34,
                    palette.wash("accent", peakAlpha * 0.42 * item.op),
                );
                glow.addColorStop(
                    0.68,
                    palette.wash("accent", peakAlpha * 0.10 * item.op),
                );
                glow.addColorStop(1, palette.wash("accent", 0));
                ctx.save();
                ctx.globalCompositeOperation = "screen";
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(haloX, haloY, haloRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            renderOrnamentItem(
                ctx,
                item.o,
                item.wx,
                item.wy,
                item.angle,
                item.op,
                palette,
                1.0,
            );
        }
    }

    // Layer 4: 泥金砂子与飞墨微尘（点亮主景花簇周边空间；繁底双勾模式收敛防脏）
    if (rawProgress > 0.72 && palette.photoStyle !== "gongbi-line") {
        const speckFade = easeOutCubic(
            clamp((rawProgress - 0.72) / 0.28, 0, 1),
        );
        const fgBranches = scene.branches.filter((b) =>
            !b.ghost && (scene.species !== "fern" || b.points.length >= 40)
        );
        for (let bi = 0; bi < Math.min(2, fgBranches.length); bi++) {
            const b = fgBranches[bi];
            const pts = computeBranchWorldPoints(
                b,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                breezeImpulse,
                runtime,
            );
            if (pts.length < 3) continue;
            const anchorIdx = Math.floor(pts.length * (bi === 0 ? 0.84 : 0.68));
            const anchor = pts[anchorIdx];
            const speckCount = bi === 0 ? 3 : 2;
            for (let k = 0; k < speckCount; k++) {
                const seedAngle = b.phase * 3.1 + k * 1.38 + bi * 1.4;
                const dist = (12 + k * 15) * scene.scale;
                const sx = anchor.x + Math.cos(seedAngle) * dist;
                const sy = anchor.y + Math.sin(seedAngle) * dist * 0.78;
                const sr = (scene.species === "fern"
                    ? (0.65 + ((k + bi) % 3) * 0.35)
                    : (0.60 + ((k + bi) % 4) * 0.28)) * scene.scale;
                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                if (palette.isDark) {
                    ctx.fillStyle = k % 3 === 1
                        ? palette.waterline("accent", 0.38 * speckFade)
                        : palette.goldDust(
                            (0.36 + (k % 3) * 0.16) * speckFade,
                        );
                } else {
                    ctx.fillStyle = k % 3 === 0
                        ? palette.goldDust(0.38 * speckFade)
                        : k % 3 === 1
                        ? palette.waterline("accent", 0.36 * speckFade)
                        : palette.inkGrade("nong", 0.28 * speckFade);
                }
                ctx.fill();
            }
        }
    }

    if (!embedded) {
        pointer.vx *= 0.82;
        pointer.vy *= 0.82;
    }

    // Layer 5: 3D-tumbling drifters
    if (!reducedMotion && !embedded && rawProgress >= 1) {
        if (
            !searchFocused &&
            timeSec - nextDriftSpawn > 7.5 &&
            drifters.length < 2
        ) {
            spawnDrifter(scene, drifters, timeSec, windCalm, frameSeq);
            nextDriftSpawn = timeSec;
        }
        drawDrifters(ctx, drifters, height, timeSec, dt, palette);
    }

    // Layer 6: Micro-ecology visitors (serendipity ~45% or awakened) & tasks-cleared reward blooms
    if (!embedded && runtime && rawProgress > 0.78) {
        const visFade = easeOutCubic(clamp((rawProgress - 0.78) / 0.22, 0, 1));
        const showVisitor = params.forceVisitor ??
            (scene.visitorPresent || Boolean(runtime.awakened));
        const facingRight = scene.side === "left" && !legacyMirrorLeft;
        const flyDir = facingRight ? 1 : -1;
        if (scene.visitorAnchor) {
            const va = scene.visitorAnchor;
            const anchorPt = computeBranchWorldPoints(
                va.branch,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                breezeImpulse,
                runtime,
            )[va.idx];

            if (va.kind === "sparrow" && showVisitor) {
                if (runtime.visitorMode === "perched") {
                    if (
                        !reducedMotion &&
                        pSpeed > 30 &&
                        Math.hypot(
                                anchorPt.x - pointer.x,
                                anchorPt.y - pointer.y,
                            ) < 96 * scene.scale
                    ) {
                        runtime.visitorMode = "departing";
                        runtime.visitorStateStartSec = timeSec;
                        runtime.visitorX = anchorPt.x;
                        runtime.visitorY = anchorPt.y;
                        runtime.visitorVx = 74 * flyDir;
                        runtime.visitorVy = -62;
                    } else {
                        runtime.visitorX = anchorPt.x;
                        runtime.visitorY = anchorPt.y;
                        drawSparrow(
                            ctx,
                            anchorPt.x,
                            anchorPt.y,
                            scene.scale,
                            visFade,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                            facingRight,
                        );
                    }
                } else if (runtime.visitorMode === "departing") {
                    const dAge = timeSec - runtime.visitorStateStartSec;
                    if (dAge > 2.4) {
                        runtime.visitorMode = "returning";
                        runtime.visitorStateStartSec = timeSec;
                    } else {
                        // Accelerating flap into upward parabolic glide arc
                        const lift = dAge < 0.45 ? -48 * dt : -14 * dt;
                        runtime.visitorVx += 18 * flyDir * dt;
                        runtime.visitorVy += lift;
                        runtime.visitorX += runtime.visitorVx * scene.scale *
                            dt;
                        runtime.visitorY += runtime.visitorVy * scene.scale *
                            dt;
                        const flyAlpha = clamp(1 - dAge / 2.2, 0, 1) * visFade;
                        drawSparrow(
                            ctx,
                            runtime.visitorX,
                            runtime.visitorY,
                            scene.scale,
                            flyAlpha,
                            palette,
                            dAge < 0.55 || Math.floor(dAge * 5) % 2 === 0,
                            timeSec,
                            reducedMotion,
                            facingRight,
                        );
                    }
                } else {
                    const rAge = timeSec - runtime.visitorStateStartSec;
                    if (rAge > 18) {
                        runtime.visitorMode = "perched";
                    } else if (rAge > 16.5) {
                        const retAlpha = clamp((rAge - 16.5) / 1.5, 0, 1) *
                            visFade;
                        drawSparrow(
                            ctx,
                            anchorPt.x,
                            anchorPt.y,
                            scene.scale,
                            retAlpha,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                            facingRight,
                        );
                    }
                }
            } else if (va.kind === "ladybug" && showVisitor) {
                const lx = anchorPt.x +
                    Math.cos(anchorPt.angle + va.angleOffset) * va.leafSize *
                        0.72;
                const ly = anchorPt.y +
                    Math.sin(anchorPt.angle + va.angleOffset) * va.leafSize *
                        0.72;
                if (runtime.visitorMode === "perched") {
                    if (
                        !reducedMotion &&
                        pSpeed > 25 &&
                        Math.hypot(lx - pointer.x, ly - pointer.y) <
                            88 * scene.scale
                    ) {
                        runtime.visitorMode = "departing";
                        runtime.visitorStateStartSec = timeSec;
                        runtime.visitorX = lx;
                        runtime.visitorY = ly;
                        runtime.visitorVx = 52 * flyDir;
                        runtime.visitorVy = -46;
                    } else {
                        drawLadybug(
                            ctx,
                            lx,
                            ly,
                            anchorPt.angle + va.angleOffset,
                            scene.scale,
                            visFade,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                        );
                    }
                } else if (runtime.visitorMode === "departing") {
                    const dAge = timeSec - runtime.visitorStateStartSec;
                    if (dAge > 2.2) {
                        runtime.visitorMode = "returning";
                        runtime.visitorStateStartSec = timeSec;
                    } else {
                        runtime.visitorVy -= 14 * dt;
                        runtime.visitorX += (runtime.visitorVx +
                            Math.sin(dAge * 5) * 28) * scene.scale * dt;
                        runtime.visitorY += runtime.visitorVy * scene.scale *
                            dt;
                        drawLadybug(
                            ctx,
                            runtime.visitorX,
                            runtime.visitorY,
                            -0.6,
                            scene.scale,
                            clamp(1 - dAge / 2.0, 0, 1) * visFade,
                            palette,
                            true,
                            timeSec,
                            reducedMotion,
                        );
                    }
                } else {
                    const rAge = timeSec - runtime.visitorStateStartSec;
                    if (rAge > 16) {
                        runtime.visitorMode = "perched";
                    } else if (rAge > 14.5) {
                        drawLadybug(
                            ctx,
                            lx,
                            ly,
                            anchorPt.angle + va.angleOffset,
                            scene.scale,
                            clamp((rAge - 14.5) / 1.5, 0, 1) * visFade,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                        );
                    }
                }
            } else if (
                (va.kind === "butterfly" || va.kind === "dragonfly") &&
                showVisitor
            ) {
                const drawInsect = va.kind === "butterfly"
                    ? drawButterfly
                    : drawDragonfly;
                if (runtime.visitorMode === "perched") {
                    if (
                        !reducedMotion &&
                        pSpeed > 25 &&
                        Math.hypot(
                                anchorPt.x - pointer.x,
                                anchorPt.y - pointer.y,
                            ) < 92 * scene.scale
                    ) {
                        runtime.visitorMode = "departing";
                        runtime.visitorStateStartSec = timeSec;
                        runtime.visitorX = anchorPt.x;
                        runtime.visitorY = anchorPt.y;
                        runtime.visitorVx = 64 * flyDir;
                        runtime.visitorVy = -54;
                    } else {
                        drawInsect(
                            ctx,
                            anchorPt.x,
                            anchorPt.y,
                            scene.scale,
                            visFade,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                            facingRight,
                        );
                    }
                } else if (runtime.visitorMode === "departing") {
                    const dAge = timeSec - runtime.visitorStateStartSec;
                    if (dAge > 2.2) {
                        runtime.visitorMode = "returning";
                        runtime.visitorStateStartSec = timeSec;
                    } else {
                        runtime.visitorVy -= 16 * dt;
                        runtime.visitorX += (runtime.visitorVx +
                            Math.sin(dAge * 5) * 32) * scene.scale * dt;
                        runtime.visitorY += runtime.visitorVy * scene.scale *
                            dt;
                        drawInsect(
                            ctx,
                            runtime.visitorX,
                            runtime.visitorY,
                            scene.scale,
                            clamp(1 - dAge / 2.0, 0, 1) * visFade,
                            palette,
                            true,
                            timeSec,
                            reducedMotion,
                            facingRight,
                        );
                    }
                } else {
                    const rAge = timeSec - runtime.visitorStateStartSec;
                    if (rAge > 16) {
                        runtime.visitorMode = "perched";
                    } else if (rAge > 14.5) {
                        drawInsect(
                            ctx,
                            anchorPt.x,
                            anchorPt.y,
                            scene.scale,
                            clamp((rAge - 14.5) / 1.5, 0, 1) * visFade,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                            facingRight,
                        );
                    }
                }
            } else if (va.kind === "dew-or-firefly") {
                const tipX = anchorPt.x + va.tipOffsetX;
                const tipY = anchorPt.y + va.tipOffsetY;
                if (!palette.isDark) {
                    if (
                        !reducedMotion &&
                        runtime.dewState === "hanging" &&
                        pSpeed > 25 &&
                        Math.hypot(tipX - pointer.x, tipY - pointer.y) <
                            84 * scene.scale
                    ) {
                        runtime.dewState = "falling";
                        runtime.dewStateStartSec = timeSec;
                        runtime.dewFallDist = 0;
                    }
                    drawDewdropAndRipple(
                        ctx,
                        tipX,
                        tipY,
                        runtime,
                        timeSec,
                        dt,
                        scene.scale,
                        palette,
                        reducedMotion,
                    );
                }
            }

            if (palette.isDark) {
                drawFireflies(
                    ctx,
                    va.fireflies,
                    runtime,
                    timeSec,
                    scene.scale,
                    palette,
                    pointer,
                    reducedMotion,
                );
            }
        }

        if (runtime.awakened && scene.rewardAnchor) {
            drawRewardBloom(
                ctx,
                scene,
                scene.rewardAnchor,
                runtime,
                timeSec,
                reducedMotion,
                windCalm,
                frameSeq,
                breezeImpulse,
                palette,
            );
        }
    }

    if (legacyMirrorLeft) {
        ctx.restore();
    }

    if (!embedded && rawProgress > 0.85) {
        const sealFade = easeOutCubic(clamp((rawProgress - 0.85) / 0.15, 0, 1));
        const { term, season } = resolveSolarTerm(dateKey);
        drawSolarTermSeal(
            ctx,
            width,
            height,
            scene.scale,
            term,
            season,
            scene.side === "left" || legacyMirrorLeft ? "left" : "right",
            palette,
            sealFade,
            dockInsets,
        );
    }

    return nextDriftSpawn;
}
